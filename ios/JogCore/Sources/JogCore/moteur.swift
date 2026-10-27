// Calcul de la Vue hors du fil principal (migration-ios, « Calcul » ; ADR 0006, 0007). Le moteur possède le stockage, la
// mémoire de ②a, les activités sans flux connues et la lecture des flux. Il recalcule en entier à chaque demande :
// seules les séances dont la clé de mémorisation change relisent leur flux.
//
// Chargement paresseux : les fichiers ne sont lus qu'au premier usage réussi. Une lecture qui échoue (erreur d'accès,
// téléphone verrouillé) ne laisse jamais le moteur à « vide » : aucune écriture n'est faite à partir d'un état non lu.
import Foundation

/// Nombre de tentatives d'un calcul que des modifications rattrapent. Au-delà, `ErreurCalculPerime`.
private let TENTATIVES_CALCUL = 3

/// Le calcul a été dépassé par des modifications à chaque tentative : rien n'est persisté ni diffusé.
public struct ErreurCalculPerime: Error, Sendable, Equatable {
    public init() {}
}

public actor Moteur {
    /// Lecture d'un flux par identifiant de source. nil si l'activité n'a pas de flux.
    public typealias LectureFlux = @Sendable (String) async throws -> Flux?

    /// Entrées d'un calcul, copiées avant toute attente : un calcul ne voit jamais un état à moitié modifié.
    private struct Instantane: Sendable {
        let parametres: Parametres
        let marquages: [String: MarquageUtilisateur]
        let activites: [PivotSansFlux]
        let memoire: [String: SeanceIntrinseque]
    }

    private struct Calcul: Sendable {
        let vue: Vue
        let memoire: [String: SeanceIntrinseque]
        let ecartees: [EcartIntrinseque]
    }

    private let stockage: Stockage
    private let lireFlux: LectureFlux
    /// Vrai une fois les fichiers lus avec succès.
    private var charge = false
    private var parametres = parametresDefaut()
    private var memoire: [String: SeanceIntrinseque] = [:]
    /// Activités sans flux connues, persistées dans `activites.json` à chaque changement.
    private var activites: [PivotSansFlux] = []
    /// `activites.json` existe mais ne se lit pas : la synchronisation doit tout relire.
    private var activitesIllisiblesFichier = false
    /// Marquages saisis par l'athlète (D-020), par clé source. Persistés dans `marquages.json` à chaque changement.
    private var marquages: [String: MarquageUtilisateur] = [:]
    private var abonnes: [UUID: AsyncStream<Vue>.Continuation] = [:]
    /// Incrémenté à chaque modification des entrées. Un calcul plus ancien que le dernier ne persiste pas sa Vue.
    private var generation = 0
    /// Séances écartées du dernier calcul persisté, avec leur raison. En mémoire seulement.
    public private(set) var ecartees: [EcartIntrinseque] = []

    public init(stockage: Stockage, lireFlux: @escaping LectureFlux) {
        self.stockage = stockage
        self.lireFlux = lireFlux
    }

    /// La dernière Vue persistée, pour un affichage instantané au lancement. nil avant le premier calcul, ou si elle
    /// est illisible ou ne peut pas être lue.
    public func charger() -> Vue? {
        if case .valeur(let vue)? = try? stockage.lireVue() {
            return vue
        }
        return nil
    }

    /// Recalcule la Vue en entier. Persiste la mémoire de ②a et la Vue, puis la diffuse à `vues()`.
    /// `J` est la journée en cours : elle n'entre dans aucun calcul (ADR 0007). Une séance dont le flux manque ou dont
    /// la lecture échoue est écartée (`ecartees`), sans bloquer les autres.
    public func recalculer(J: DateCivile, derniereSynchro: String?) async throws -> Vue {
        try chargerSiBesoin()
        for _ in 0..<TENTATIVES_CALCUL {
            let mienne = generation
            let instantane = Instantane(parametres: parametres, marquages: marquages, activites: activites, memoire: memoire)
            let calcul = try await calculer(instantane, J: J, derniereSynchro: derniereSynchro)
            // Une modification pendant le calcul l'a rendu périmé : on le refait, sans rien persister.
            guard mienne == generation else { continue }
            try persister(calcul)
            return calcul.vue
        }
        throw ErreurCalculPerime()
    }

    /// Mémorise l'étape ②a des activités dont on vient de lire le flux (import par lots) : `recalculer` ne relit alors
    /// pas leur flux. Une séance qui ne se calcule pas n'est pas mémorisée : le recalcul la journalisera. Persiste
    /// `seances.json` une fois par appel.
    public func memoriser(_ pivots: [ActivitePivot]) throws {
        try chargerSiBesoin()
        let index = try indexerParametres(parametres)
        var ajoutees = false
        for pivot in pivots {
            let p = index.auJour(pivot.dateLocale)
            let marquage = marquages[pivot.cleSource]
            let cle = cleDeSeance(
                EmpreinteActivite(cleSource: pivot.cleSource, empreinteBrute: pivot.empreinteBrute, versionAdaptateur: pivot.versionAdaptateur),
                p, marquage: marquage
            )
            guard memoire[cle] == nil else { continue }
            guard let calculee = try? calculerSeanceIntrinseque(pivot, p, marquageUtilisateur: marquage) else { continue }
            memoire[cle] = calculee
            ajoutees = true
        }
        if ajoutees {
            try stockage.ecrireMemoire(memoire)
        }
    }

    /// Les paramètres stockés (datés et globaux, avec leur historique). Lit le stockage au premier usage. Sert à
    /// l'écran Paramètres, qui part de ce jeu avant d'y ajouter une modification (lot 5).
    public func lireParametres() throws -> Parametres {
        try chargerSiBesoin()
        return parametres
    }

    /// Remplace l'ensemble des paramètres (datés et globaux), persiste et invalide les calculs en cours.
    /// L'appelant recalcule ensuite : le moteur ne le fait pas à sa place.
    public func modifierParametres(_ nouveaux: Parametres) throws {
        try chargerSiBesoin()
        try stockage.ecrireParametres(nouveaux)
        parametres = nouveaux
        generation += 1
    }

    /// Marque la séance « Course » ou « Test » (D-020), ou retire le marquage saisi si `marquage` est nil : le marquage
    /// déduit du nom reprend alors effet. Persiste `marquages.json`. Ne recalcule pas : l'appelant appelle `recalculer`,
    /// et seule la séance dont la clé de mémorisation change relit son flux. Un marquage d'une clé absente des activités
    /// reste stocké, sans effet sur la Vue.
    public func marquer(cleSource: String, comme marquage: MarquageUtilisateur?) throws {
        try chargerSiBesoin()
        var resultat = marquages
        resultat[cleSource] = marquage
        guard resultat != marquages else { return }
        try stockage.ecrireMarquages(resultat)
        marquages = resultat
        generation += 1
    }

    /// Ajoute les activités sans flux, ou remplace celles qui ont la même clé source. Persiste la liste.
    public func ajouterOuMettreAJour(activites nouvelles: [PivotSansFlux]) throws {
        try chargerSiBesoin()
        var resultat = activites
        var positions: [String: Int] = [:]
        for (indice, activite) in resultat.enumerated() {
            positions[activite.cleSource] = indice
        }
        for activite in nouvelles {
            if let indice = positions[activite.cleSource] {
                resultat[indice] = activite
            } else {
                positions[activite.cleSource] = resultat.count
                resultat.append(activite)
            }
        }
        try stockage.ecrireActivites(resultat)
        activites = resultat
        activitesIllisiblesFichier = false
        generation += 1
    }

    /// Retire les activités de ces clés source (suppressions HealthKit, séances écartées). Persiste la liste. Sans effet
    /// si aucune ne correspond. Les mémoires de ②a orphelines sont oubliées au prochain calcul.
    public func retirer(cles: Set<String>) throws {
        try chargerSiBesoin()
        let restantes = activites.filter { !cles.contains($0.cleSource) }
        guard restantes.count != activites.count else { return }
        try stockage.ecrireActivites(restantes)
        activites = restantes
        generation += 1
    }

    /// `true` si `activites.json` existe mais ne se lit pas : la synchronisation repart d'une relecture complète.
    public func activitesIllisibles() throws -> Bool {
        try chargerSiBesoin()
        return activitesIllisiblesFichier
    }

    /// Clés source des activités stockées.
    public func clesActivites() throws -> [String] {
        try chargerSiBesoin()
        return activites.map(\.cleSource)
    }

    public func nombreActivites() throws -> Int {
        try chargerSiBesoin()
        return activites.count
    }

    /// Flux de notifications : chaque Vue recalculée et persistée est diffusée à tous les abonnés.
    public func vues() -> AsyncStream<Vue> {
        let (flux, continuation) = AsyncStream.makeStream(of: Vue.self)
        let identifiant = UUID()
        abonnes[identifiant] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { await self?.retirerAbonne(identifiant) }
        }
        return flux
    }

    /// Efface toutes les données (D-016) et remet le moteur à zéro.
    public func supprimerTout() throws {
        try stockage.supprimerTout()
        parametres = parametresDefaut()
        memoire = [:]
        activites = []
        activitesIllisiblesFichier = false
        marquages = [:]
        ecartees = []
        charge = true
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

    // MARK: - Chargement

    /// Lit les fichiers une fois, au premier usage réussi. Un fichier illisible est mis de côté (paramètres, marquages)
    /// ou ignoré (mémoire, cache) ; une erreur d'accès lève, et la lecture sera refaite à l'appel suivant.
    private func chargerSiBesoin() throws {
        guard !charge else { return }
        switch try stockage.lireParametres() {
        case .absent:
            parametres = parametresDefaut()
        case .valeur(let lus):
            parametres = lus
        case .illisible:
            stockage.mettreDeCote("parametres.json")
            parametres = parametresDefaut()
        }
        switch try stockage.lireMarquages() {
        case .absent:
            marquages = [:]
        case .valeur(let lus):
            marquages = lus
        case .illisible:
            stockage.mettreDeCote("marquages.json")
            marquages = [:]
        }
        switch try stockage.lireActivites() {
        case .absent:
            activites = []
            activitesIllisiblesFichier = false
        case .valeur(let lues):
            activites = lues
            activitesIllisiblesFichier = false
        case .illisible:
            activites = []
            activitesIllisiblesFichier = true
        }
        switch try stockage.lireMemoire() {
        case .valeur(let lue):
            memoire = lue
        case .absent, .illisible:
            // Simple cache : il se recalcule, et son fichier sera réécrit.
            memoire = [:]
        }
        charge = true
    }

    // MARK: - Calcul et persistance

    private func calculer(_ s: Instantane, J: DateCivile, derniereSynchro: String?) async throws -> Calcul {
        var memoireLocale = MemoireSeances(entrees: s.memoire)
        let intrinseques = try await seancesIntrinseques(
            activites: s.activites, lireFlux: lireFlux, parametres: s.parametres, J: J, memoire: &memoireLocale,
            marquages: s.marquages
        )
        // Une clé qui ne sert plus (activité retirée, paramètre ou marquage changé) est oubliée, pour que la mémoire ne
        // grossisse pas.
        let utilisees = clesUtilisees(s, J)
        memoireLocale.entrees = memoireLocale.entrees.filter { utilisees.contains($0.key) }

        let vue = try calculerVue(EntreeVue(
            intrinseques: intrinseques.seances, parametres: s.parametres, J: J, derniereSynchro: derniereSynchro
        ))
        return Calcul(vue: vue, memoire: memoireLocale.entrees, ecartees: intrinseques.ecartees)
    }

    /// Écrit la mémoire (si elle a changé) puis la Vue, et diffuse la Vue.
    private func persister(_ calcul: Calcul) throws {
        if calcul.memoire != memoire {
            try stockage.ecrireMemoire(calcul.memoire)
            memoire = calcul.memoire
        }
        try stockage.ecrireVue(calcul.vue)
        ecartees = calcul.ecartees
        for abonne in abonnes.values {
            abonne.yield(calcul.vue)
        }
    }

    private func retirerAbonne(_ identifiant: UUID) {
        abonnes[identifiant] = nil
    }

    /// Clés de mémorisation des séances qui entrent dans le calcul de `J` : celles de `seancesIntrinseques`.
    private func clesUtilisees(_ s: Instantane, _ J: DateCivile) -> Set<String> {
        guard let index = try? indexerParametres(s.parametres) else { return [] }
        var cles: Set<String> = []
        for activite in s.activites where activite.dateLocale < J {
            cles.insert(cleDeSeance(
                EmpreinteActivite(activite), index.auJour(activite.dateLocale), marquage: s.marquages[activite.cleSource]
            ))
        }
        return cles
    }
}

private func calendrierGregorien(_ fuseau: TimeZone) -> Calendar {
    var calendrier = Calendar(identifier: .gregorian)
    calendrier.timeZone = fuseau
    return calendrier
}
