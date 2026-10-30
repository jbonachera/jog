// Semaines de l'accueil (S1 ; 03, S1 ; D-026 ; docs/implementation/refonte-accueil.md, lot 4). Fonction pure sur la Vue.
// Les totaux viennent de `vue.semaines` (aucun recalcul divergent) ; les séances viennent de `vue.seances`.
import Foundation

/// Une semaine de S1 : totaux de la Vue, séances de la semaine et séances marquées course (D-014).
public struct SemaineAccueil: Sendable, Equatable {
    public var lundi: DateCivile
    /// Vrai pour la semaine qui contient A (D-026), même sans séance et même si la Vue la compte comme terminée.
    public var enCours: Bool
    public var km: Double
    public var min: Double
    public var minutes: Minutes
    public var nbSeances: Int
    public var nbSousSeuil: Int
    /// Minutes de sous-seuil de la semaine (`minutes.subt`).
    public var minSS: Double
    public var partSS: Double?
    /// Clés sources des séances de la semaine, de la plus récente à la plus ancienne (date, puis heure de début).
    public var seances: [String]
    /// Clés sources des séances marquées course de la semaine.
    public var courses: [String]

    public init(
        lundi: DateCivile, enCours: Bool, km: Double, min: Double, minutes: Minutes, nbSeances: Int, nbSousSeuil: Int,
        minSS: Double, partSS: Double?, seances: [String], courses: [String]
    ) {
        self.lundi = lundi
        self.enCours = enCours
        self.km = km
        self.min = min
        self.minutes = minutes
        self.nbSeances = nbSeances
        self.nbSousSeuil = nbSousSeuil
        self.minSS = minSS
        self.partSS = partSS
        self.seances = seances
        self.courses = courses
    }
}

/// Les semaines de S1, une par lundi, de la semaine qui contient A (A = vue.J − 1, D-022) à celle de premierJour, sans
/// trou, la plus récente d'abord. Rend [] sans séance (premierJour absent).
public func semainesAccueil(_ vue: Vue) throws -> [SemaineAccueil] {
    guard let premier = vue.premierJour else { return [] }
    let aujourdhuiLundi = lundiDe(try numeroJour(try ajouterJours(vue.J, -1)))
    let premierLundi = lundiDe(try numeroJour(premier))

    var semainesVue: [NumeroJour: SemaineVue] = [:]
    for semaine in vue.semaines {
        semainesVue[try numeroJour(semaine.lundi)] = semaine
    }
    // `vue.seances` est trié par date puis heure de début : l'inverse donne du plus récent au plus ancien.
    var seancesParLundi: [NumeroJour: [SeanceVue]] = [:]
    for seance in vue.seances {
        seancesParLundi[lundiDe(try numeroJour(seance.date)), default: []].append(seance)
    }

    var resultat: [SemaineAccueil] = []
    var lundi = aujourdhuiLundi
    while lundi >= premierLundi {
        let seances = (seancesParLundi[lundi] ?? []).reversed()
        let semaine = semainesVue[lundi]
        resultat.append(SemaineAccueil(
            lundi: try dateDepuisNumero(lundi),
            enCours: lundi == aujourdhuiLundi,
            km: semaine?.km ?? 0,
            min: semaine?.min ?? 0,
            minutes: semaine?.minutes ?? Minutes(easy: 0, mp: 0, subt: 0, hard: 0),
            nbSeances: seances.count,
            nbSousSeuil: seances.filter { $0.type == .sousSeuil }.count,
            minSS: semaine?.minutes.subt ?? 0,
            partSS: semaine?.partSS,
            seances: seances.map(\.cleSource),
            courses: seances.filter { $0.marquage == .course }.map(\.cleSource)
        ))
        lundi -= 7
    }
    return resultat
}
