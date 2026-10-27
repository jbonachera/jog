// Synchronisation HealthKit, partie pure (migration-ios, « Source », « Stockage » et « Calcul »). Transforme les
// changements d'une source de séances en activités sans flux, par lots bornés, et tient la trace de ce qui est écarté
// ou refusé. Aucun import de HealthKit : la source est un protocole (`SourceSeances`), implémenté dans l'app par
// `LecteurHealthKit` et, dans les tests, par un faux.
//
// Règles (migration-ios) :
// - une séance dont la lecture échoue (erreur transitoire) n'est pas perdue : les lots réussis sont persistés, l'erreur
//   remonte, et l'ancre n'avance pas ;
// - une séance écartée par le filtre de source, ou refusée par l'adaptateur (erreur permanente), est journalisée et
//   l'ancre avance ;
// - une relecture complète (ancre absente ou illisible) retire du moteur les activités HealthKit qui ne sont plus là.
import Foundation

/// Une séance qui n'entre pas dans les données (durée nulle, dates incohérentes, série illisible). Elle est journalisée
/// sans bloquer le lot.
public struct EchecSynchro: Codable, Sendable, Equatable {
    public var cleSource: String
    public var detail: String

    public init(cleSource: String, detail: String) {
        self.cleSource = cleSource
        self.detail = detail
    }
}

/// Résultat de l'adaptation d'un lot de séances brutes.
public struct AdaptationSeances: Sendable, Equatable {
    /// Activités complètes (avec flux), dans l'ordre du lot. Le moteur en retire le flux au stockage.
    public var activites: [ActivitePivot]
    /// Séances écartées par le filtre (source ou type).
    public var ignorees: [Ignoree]
    /// Séances refusées par l'adaptateur.
    public var echecs: [EchecSynchro]

    public init(activites: [ActivitePivot] = [], ignorees: [Ignoree] = [], echecs: [EchecSynchro] = []) {
        self.activites = activites
        self.ignorees = ignorees
        self.echecs = echecs
    }
}

/// Taille d'un lot de séances adaptées puis persistées. Bornée : la mémoire ne dépend pas de l'historique (le flux de
/// chaque séance du lot est en mémoire, puis relâché).
public let TAILLE_LOT_SYNCHRO = 6

/// Adapte un lot de séances brutes, avec un décalage d'appareil fixe. Une séance refusée n'arrête pas le lot.
public func adapterLot(_ seances: [SeanceBrute], decalageAppareil_min: Int) -> AdaptationSeances {
    adapterLot(seances, decalageAppareil: { _ in decalageAppareil_min })
}

/// Adapte un lot de séances brutes. Une séance refusée n'arrête pas le lot : elle va dans `echecs`.
public func adapterLot(_ seances: [SeanceBrute], decalageAppareil: (Date) -> Int) -> AdaptationSeances {
    var resultat = AdaptationSeances()
    for seance in seances {
        if let ignoree = raisonIgnoreeHealthKit(seance) {
            resultat.ignorees.append(ignoree)
            continue
        }
        do {
            if let activite = try adapterSeance(seance, decalageAppareil: decalageAppareil) {
                resultat.activites.append(activite)
            }
        } catch {
            resultat.echecs.append(EchecSynchro(cleSource: "hk:" + seance.id, detail: String(describing: error)))
        }
    }
    return resultat
}

// MARK: - Source

/// Ce qu'une source signale depuis une ancre : les séances à lire, les écartées, les supprimées, la nouvelle ancre.
public struct ChangementsSeances: Sendable, Equatable {
    /// Identifiants des séances ajoutées ou modifiées, dont le filtre de source a laissé passer la séance.
    public var aLire: [UUID]
    /// Séances écartées par le filtre de source, avant toute lecture de leurs séries.
    public var ecartees: [Ignoree]
    /// Clés source (« hk:UUID ») des séances supprimées.
    public var supprimees: Set<String>
    /// Nouvelle ancre, opaque.
    public var ancre: Data

    public init(aLire: [UUID], ecartees: [Ignoree], supprimees: Set<String>, ancre: Data) {
        self.aLire = aLire
        self.ecartees = ecartees
        self.supprimees = supprimees
        self.ancre = ancre
    }
}

/// Source de séances : HealthKit dans l'app, un faux dans les tests.
public protocol SourceSeances: Sendable {
    /// Changements depuis `ancre` (nil pour tout). Ne lit pas les séries.
    func synchroniser(ancre: Data?) async throws -> ChangementsSeances
    /// Séance brute complète, ou nil si la source ne la connaît plus.
    func lireSeance(uuid: UUID) async throws -> SeanceBrute?
}

// MARK: - Règles de décision (pures)

/// Découpe en lots de `taille` éléments, dans l'ordre (le dernier peut être plus court).
public func decoupeEnLots<T>(_ elements: [T], taille: Int = TAILLE_LOT_SYNCHRO) -> [[T]] {
    precondition(taille > 0, "un lot a au moins un élément")
    return stride(from: 0, to: elements.count, by: taille).map {
        Array(elements[$0..<min($0 + taille, elements.count)])
    }
}

public enum DecisionAncre: Sendable, Equatable {
    case ecrire
    case conserver
}

/// Faut-il écrire la nouvelle ancre ? Non quand le résultat est vide et qu'aucune activité n'est stockée : HealthKit
/// renvoie alors du vide aussi quand l'accès est refusé, et une ancre écrite sur ce vide ferait perdre l'historique
/// d'un import ultérieur.
public func decisionAncre(activitesStockees: Int, resultatVide: Bool) -> DecisionAncre {
    activitesStockees == 0 && resultatVide ? .conserver : .ecrire
}

/// Clés « hk: » stockées qui ne figurent pas dans le lot : à retirer après une relecture complète.
public func clesHealthKitAbsentes(stockees: [String], dansLeLot: Set<String>) -> Set<String> {
    Set(stockees.filter { $0.hasPrefix("hk:") && !dansLeLot.contains($0) })
}

/// Clé source d'une séance HealthKit.
public func cleSourceHealthKit(_ uuid: UUID) -> String {
    "hk:" + uuid.uuidString
}

// MARK: - Synchroniseur

/// Lit les changements de la source, adapte les séances par lots, les range dans le moteur (avec leur intrinsèque),
/// puis recalcule la Vue si quelque chose a changé ou si la Vue stockée n'est plus celle du jour.
public actor Synchroniseur {
    private let source: any SourceSeances
    private let stockage: Stockage
    private let moteur: Moteur
    private let decalage: @Sendable (Date) -> Int

    /// Séances écartées par le filtre, par clé source. En mémoire seulement.
    public private(set) var ignorees: [String: Ignoree] = [:]
    /// Séances refusées par l'adaptateur ou dont la lecture a été rejetée, par clé source. En mémoire seulement.
    public private(set) var echecs: [String: EchecSynchro] = [:]

    public init(
        source: any SourceSeances,
        stockage: Stockage,
        moteur: Moteur,
        decalage: @escaping @Sendable (Date) -> Int = decalageAppareilMinutesDefaut
    ) {
        self.source = source
        self.stockage = stockage
        self.moteur = moteur
        self.decalage = decalage
    }

    /// Synchronise puis renvoie la Vue à jour. `progression` reçoit (traitées, total) pendant la lecture des séances.
    /// Lève si une lecture transitoire échoue (après persistance des lots réussis) : l'ancre n'avance pas.
    public func synchroniser(
        maintenant: Date = Date(),
        fuseau: TimeZone = .current,
        progression: @escaping @Sendable (Int, Int) async -> Void = { _, _ in }
    ) async throws -> Vue {
        // Des activités illisibles : on repart de zéro, donc sans ancre (relecture complète).
        let illisibles = try await moteur.activitesIllisibles()
        if illisibles {
            try stockage.ecrireAncre(nil)
        }
        let ancre = illisibles ? nil : try stockage.lireAncre()

        let changements = try await source.synchroniser(ancre: ancre)
        for ignoree in changements.ecartees {
            ignorees[ignoree.cleSource] = ignoree
        }
        var clesDuLot = Set(changements.ecartees.map(\.cleSource))
        try await moteur.retirer(cles: clesDuLot.union(changements.supprimees))

        let total = changements.aLire.count
        var traitees = 0
        await progression(0, total)
        for lot in decoupeEnLots(changements.aLire) {
            let (brutes, erreur) = try await lireLot(lot)
            let adaptation = adapterLot(brutes, decalageAppareil: decalage)
            for echec in adaptation.echecs { echecs[echec.cleSource] = echec }
            for ignoree in adaptation.ignorees { ignorees[ignoree.cleSource] = ignoree }

            if !adaptation.activites.isEmpty {
                try await moteur.ajouterOuMettreAJour(activites: adaptation.activites.map(PivotSansFlux.init))
                try await moteur.memoriser(adaptation.activites)
            }
            // Une séance qui devient écartée ou refusée sort du moteur, si elle y était (relecture ou modification).
            try await moteur.retirer(cles: Set(adaptation.ignorees.map(\.cleSource) + adaptation.echecs.map(\.cleSource)))
            clesDuLot.formUnion(adaptation.activites.map(\.cleSource))
            clesDuLot.formUnion(adaptation.ignorees.map(\.cleSource))
            clesDuLot.formUnion(adaptation.echecs.map(\.cleSource))

            traitees += lot.count
            await progression(traitees, total)
            // Les lots réussis sont persistés ; l'erreur transitoire remonte et l'ancre reste en place.
            if let erreur { throw erreur }
        }

        // Relecture complète : ce qui n'est plus dans HealthKit ne doit plus être dans le moteur.
        if ancre == nil {
            for cle in clesHealthKitAbsentes(stockees: try await moteur.clesActivites(), dansLeLot: clesDuLot) {
                try await moteur.retirer(cles: [cle])
            }
        }

        let resultatVide = changements.aLire.isEmpty && changements.ecartees.isEmpty && changements.supprimees.isEmpty
        let activitesStockees = try await moteur.nombreActivites()
        if decisionAncre(activitesStockees: activitesStockees, resultatVide: resultatVide) == .ecrire {
            try stockage.ecrireAncre(changements.ancre)
        }

        // Recalcul seulement si quelque chose a changé, ou si la Vue stockée n'est pas celle du jour (J) ou manque.
        let J = moteur.jourCourant(maintenant: maintenant, fuseau: fuseau)
        let stockee = await moteur.charger()
        if !illisibles, resultatVide, let stockee, stockee.J == J {
            return stockee
        }
        return try await moteur.recalculer(J: J, derniereSynchro: maintenant.formatted(Date.ISO8601FormatStyle()))
    }

    /// Lit un lot de séances en parallèle (au plus `TAILLE_LOT_SYNCHRO`). Rend les séances lues, dans l'ordre du lot, et
    /// la première erreur transitoire, s'il y en a une. Une annulation lève tout de suite.
    private func lireLot(_ identifiants: [UUID]) async throws -> (brutes: [SeanceBrute], erreur: Error?) {
        let issues = try await withThrowingTaskGroup(of: (Int, Result<SeanceBrute?, Error>).self) { groupe in
            for (indice, identifiant) in identifiants.enumerated() {
                let source = self.source
                groupe.addTask {
                    do {
                        return (indice, .success(try await source.lireSeance(uuid: identifiant)))
                    } catch {
                        return (indice, .failure(error))
                    }
                }
            }
            var issues = [Result<SeanceBrute?, Error>?](repeating: nil, count: identifiants.count)
            for try await (indice, issue) in groupe {
                issues[indice] = issue
            }
            return issues.compactMap { $0 }
        }
        if Task.isCancelled { throw CancellationError() }

        var brutes: [SeanceBrute] = []
        var erreur: Error?
        for issue in issues {
            switch issue {
            case .success(let brute?):
                brutes.append(brute)
            case .success(nil):
                // Supprimée entre-temps : rien à ranger, la prochaine synchro la donnera comme supprimée.
                break
            case .failure(let echec):
                if echec is CancellationError { throw echec }
                erreur = erreur ?? echec
            }
        }
        return (brutes, erreur)
    }
}
