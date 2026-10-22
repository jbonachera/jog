// Calcul de la Vue hors du fil principal (migration-ios, « Calcul » ; ADR 0006, 0007). Le moteur possède le stockage, la
// mémoire de ②a, les activités sans flux connues et la lecture des flux. Il recalcule en entier à chaque demande :
// seules les séances dont la clé de mémorisation change relisent leur flux.
import Foundation

public actor Moteur {
    /// Lecture d'un flux par identifiant de source. nil si l'activité n'a pas de flux.
    public typealias LectureFlux = @Sendable (String) async throws -> Flux?

    private let stockage: Stockage
    private let lireFlux: LectureFlux
    private var parametres: Parametres
    private var memoire: MemoireSeances
    /// Activités sans flux, connues depuis la dernière synchronisation. Non persistées (voir le journal de migration).
    private var activites: [PivotSansFlux] = []
    private var abonnes: [UUID: AsyncStream<Vue>.Continuation] = [:]
    /// Incrémenté à chaque changement d'entrée. Un calcul plus ancien que le dernier ne persiste pas sa Vue.
    private var generation = 0

    public init(stockage: Stockage, lireFlux: @escaping LectureFlux) {
        self.stockage = stockage
        self.lireFlux = lireFlux
        self.parametres = stockage.lireParametres()
        self.memoire = stockage.lireMemoire()
    }

    /// La dernière Vue persistée, pour un affichage instantané au lancement. nil avant le premier calcul.
    public func charger() -> Vue? {
        stockage.lireVue()
    }

    /// Recalcule la Vue en entier. Persiste la mémoire de ②a et la Vue, puis la diffuse à `vues()`.
    /// `J` est la journée en cours : elle n'entre dans aucun calcul (ADR 0007).
    public func recalculer(J: DateCivile, derniereSynchro: String?) async throws -> Vue {
        generation += 1
        let mienne = generation
        let parametresCourants = parametres
        var memoireLocale = memoire

        let intrinseques = try await seancesIntrinseques(
            activites: activites, lireFlux: lireFlux, parametres: parametresCourants, J: J, memoire: &memoireLocale
        )
        // Une clé qui ne sert plus (activité retirée, paramètre changé) est oubliée, pour que la mémoire ne grossisse pas.
        let utilisees = clesUtilisees(parametresCourants, J)
        memoireLocale.entrees = memoireLocale.entrees.filter { utilisees.contains($0.key) }

        let vue = try calculerVue(EntreeVue(
            intrinseques: intrinseques, parametres: parametresCourants, J: J, derniereSynchro: derniereSynchro
        ))

        // Entre les attentes, un autre appel ou une modification peut avoir changé les entrées : ce résultat n'est
        // alors ni persisté ni diffusé.
        if mienne == generation {
            if memoireLocale.entrees != memoire.entrees {
                try stockage.ecrireMemoire(memoireLocale)
                memoire = memoireLocale
            }
            try stockage.ecrireVue(vue)
            for abonne in abonnes.values {
                abonne.yield(vue)
            }
        }
        return vue
    }

    /// Remplace l'ensemble des paramètres (datés et globaux), persiste et invalide les calculs en cours.
    /// L'appelant recalcule ensuite : le moteur ne le fait pas à sa place.
    public func modifierParametres(_ nouveaux: Parametres) throws {
        try stockage.ecrireParametres(nouveaux)
        parametres = nouveaux
        generation += 1
    }

    /// Ajoute les activités sans flux, ou remplace celles qui ont la même clé source.
    public func ajouterOuMettreAJour(activites nouvelles: [PivotSansFlux]) {
        var positions: [String: Int] = [:]
        for (indice, activite) in activites.enumerated() {
            positions[activite.cleSource] = indice
        }
        for activite in nouvelles {
            if let indice = positions[activite.cleSource] {
                activites[indice] = activite
            } else {
                positions[activite.cleSource] = activites.count
                activites.append(activite)
            }
        }
        generation += 1
    }

    /// Flux de notifications : chaque Vue recalculée et persistée est diffusée à tous les abonnés.
    public func vues() -> AsyncStream<Vue> {
        let (flux, continuation) = AsyncStream.makeStream(of: Vue.self)
        let identifiant = UUID()
        abonnes[identifiant] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { await self?.retirer(identifiant) }
        }
        return flux
    }

    /// Efface toutes les données (D-016) et remet le moteur à zéro.
    public func supprimerTout() throws {
        try stockage.supprimerTout()
        parametres = parametresDefaut()
        memoire = MemoireSeances()
        activites = []
        generation += 1
    }

    /// Jour civil local de `maintenant` dans `fuseau` (AAAA-MM-JJ). Sans état : appelable hors de l'acteur.
    public nonisolated func jourCourant(maintenant: Date, fuseau: TimeZone) -> DateCivile {
        let calendrier = calendrierGregorien(fuseau)
        let composantes = calendrier.dateComponents([.year, .month, .day], from: maintenant)
        return "\(chiffresPad(composantes.year ?? 0, 4))-\(chiffresPad(composantes.month ?? 0, 2))-\(chiffresPad(composantes.day ?? 0, 2))"
    }

    /// Prochain minuit local strictement après `maintenant`, dans `fuseau`. L'app y programme un recalcul de J.
    public nonisolated func prochainChangementDeJour(après maintenant: Date, fuseau: TimeZone) -> Date {
        let calendrier = calendrierGregorien(fuseau)
        let minuit = DateComponents(hour: 0, minute: 0, second: 0)
        return calendrier.nextDate(after: maintenant, matching: minuit, matchingPolicy: .nextTime)
            ?? maintenant.addingTimeInterval(86_400)
    }

    private func retirer(_ identifiant: UUID) {
        abonnes[identifiant] = nil
    }

    /// Clés de mémorisation des séances qui entrent dans le calcul de `J` : celles de `seancesIntrinseques`.
    private func clesUtilisees(_ parametres: Parametres, _ J: DateCivile) -> Set<String> {
        guard let index = try? indexerParametres(parametres) else { return [] }
        var cles: Set<String> = []
        for activite in activites where activite.dateLocale < J {
            cles.insert(cleDeSeance(EmpreinteActivite(activite), index.auJour(activite.dateLocale)))
        }
        return cles
    }
}

private func calendrierGregorien(_ fuseau: TimeZone) -> Calendar {
    var calendrier = Calendar(identifier: .gregorian)
    calendrier.timeZone = fuseau
    return calendrier
}
