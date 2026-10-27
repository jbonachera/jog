// Synchronisation HealthKit vers le moteur (migration-ios, « Source », « Stockage » et « Calcul »). Lit l'ancre, lit les
// séances nouvelles et supprimées, les adapte, met à jour le moteur, n'écrit la nouvelle ancre qu'après succès, puis
// recalcule la Vue. Les séances écartées ou refusées vont dans un journal en mémoire, sans bloquer le lot.
import Foundation
import JogCore

/// État de la synchronisation, pour l'interface.
public enum EtatSynchro: Sendable, Equatable {
    case nonAutorise
    case importEnCours(traitees: Int, total: Int)
    case pret
    case erreur(String)
}

public actor Synchronisation {
    private let stockage: Stockage
    private let lecteur: LecteurHealthKit
    private let moteur: Moteur

    public private(set) var etat: EtatSynchro = .pret
    /// Séances écartées par le filtre, par clé source. En mémoire seulement : perdu au redémarrage.
    public private(set) var ignorees: [String: Ignoree] = [:]
    /// Séances refusées par l'adaptateur ou dont la lecture a échoué, par clé source. En mémoire seulement.
    public private(set) var echecs: [String: EchecSynchro] = [:]

    public init(stockage: Stockage, lecteur: LecteurHealthKit, moteur: Moteur) {
        self.stockage = stockage
        self.lecteur = lecteur
        self.moteur = moteur
    }

    /// Le `LectureFlux` du moteur : relit la séance dans HealthKit et renvoie son flux adapté.
    public static func lectureFlux(lecteur: LecteurHealthKit) -> Moteur.LectureFlux {
        { cleSource in
            guard cleSource.hasPrefix("hk:"), let uuid = UUID(uuidString: String(cleSource.dropFirst(3))) else {
                return nil
            }
            guard let seance = try await lecteur.lireSeance(uuid: uuid) else { return nil }
            return try adapterSeance(seance, decalageAppareil_min: decalageAppareilMinutes())?.flux
        }
    }

    /// Demande l'accès à HealthKit. Met l'état à `nonAutorise` si l'accès est refusé ou impossible.
    public func demanderAutorisation() async {
        do {
            try await lecteur.demanderAutorisation()
        } catch {
            etat = etatDErreur(error)
        }
    }

    /// Synchronise puis recalcule la Vue. `progression` reçoit (traitées, total) pendant l'import.
    public func synchroniserEtRecalculer(progression: @escaping @Sendable (Int, Int) -> Void) async throws -> Vue {
        etat = .importEnCours(traitees: 0, total: 0)
        do {
            let resultat = try await lecteur.synchroniser(ancre: stockage.lireAncre()) { [self] traitees, total in
                await self.progresser(traitees, total, progression)
            }

            for ignoree in resultat.ecartees {
                ignorees[ignoree.cleSource] = ignoree
            }
            for echec in resultat.echecs {
                echecs[echec.cleSource] = echec
            }
            let adaptation = adapterLot(resultat.nouvelles, decalageAppareil_min: decalageAppareilMinutes())
            for ignoree in adaptation.ignorees {
                ignorees[ignoree.cleSource] = ignoree
            }
            for echec in adaptation.echecs {
                echecs[echec.cleSource] = echec
            }

            if !adaptation.activites.isEmpty {
                try await moteur.ajouterOuMettreAJour(activites: adaptation.activites)
            }
            if !resultat.supprimees.isEmpty {
                try await moteur.retirer(cles: resultat.supprimees)
            }
            // L'ancre n'avance qu'une fois les activités écrites : un échec d'écriture relit le même lot la fois suivante.
            try stockage.ecrireAncre(resultat.ancre)

            let maintenant = Date()
            let vue = try await moteur.recalculer(
                J: moteur.jourCourant(maintenant: maintenant, fuseau: .current),
                derniereSynchro: maintenant.formatted(Date.ISO8601FormatStyle())
            )
            etat = .pret
            return vue
        } catch {
            etat = etatDErreur(error)
            throw error
        }
    }

    /// Branche la livraison en arrière-plan. `surNouvelleSeance` est appelée à chaque séance nouvelle : l'appelant y
    /// relance la synchronisation, pour que sa garde contre les synchronisations simultanées s'applique aussi.
    public func activerLivraisonEnArrierePlan(surNouvelleSeance: @escaping @Sendable () async -> Void) async throws {
        try await lecteur.activerLivraisonEnArrierePlan(surNouvelleSeance: surNouvelleSeance)
    }

    private func progresser(_ traitees: Int, _ total: Int, _ externe: @escaping @Sendable (Int, Int) -> Void) {
        etat = .importEnCours(traitees: traitees, total: total)
        externe(traitees, total)
    }

    private func etatDErreur(_ erreur: Error) -> EtatSynchro {
        if let erreurLecteur = erreur as? ErreurLecteur, erreurLecteur == .nonAutorise {
            return .nonAutorise
        }
        return .erreur(erreur.localizedDescription)
    }
}

/// Décalage du fuseau de l'appareil, en minutes. Sert quand une séance ne donne pas son fuseau (ADR 0007).
private func decalageAppareilMinutes() -> Int {
    TimeZone.current.secondsFromGMT() / 60
}
