// Lignes du volume de l'accueil (A2 ; 04, « Accueil › Volume » ; D-026 ; D-022 ; docs/implementation/refonte-accueil.md,
// lot 3). Fonctions pures sur la Vue. A = vue.J − 1 : aujourd'hui, la journée close la plus récente (D-022).
import Foundation

/// Phrases de référence d'A2 : « à jeudi soir, d'habitude 32–40 km » · « 30 j précédents 234 km, habituel 210–255 » ·
/// « 2025 à date 1 660 km · 42 km/sem · 117 séances ». Valeurs d'affichage, arrondies comme leur ligne (D-015).
public struct ReferencesVolume: Sendable, Equatable {
    /// 1 = lundi … 7 = dimanche.
    public var jourDeSemaine: Int
    public var bandeSemaine: ClosedRange<Double>?
    public var km30Precedents: Double?
    public var bande30: ClosedRange<Double>?
    public var anneeDerniere: Int
    public var kmAnDernierADate: Double?
    /// km ÷ jours écoulés de l'année × 7, arrondi à 1 km.
    public var kmParSemaineAnnee: Double
    public var seancesAnnee: Int

    public init(
        jourDeSemaine: Int, bandeSemaine: ClosedRange<Double>?, km30Precedents: Double?, bande30: ClosedRange<Double>?,
        anneeDerniere: Int, kmAnDernierADate: Double?, kmParSemaineAnnee: Double, seancesAnnee: Int
    ) {
        self.jourDeSemaine = jourDeSemaine
        self.bandeSemaine = bandeSemaine
        self.km30Precedents = km30Precedents
        self.bande30 = bande30
        self.anneeDerniere = anneeDerniere
        self.kmAnDernierADate = kmAnDernierADate
        self.kmParSemaineAnnee = kmParSemaineAnnee
        self.seancesAnnee = seancesAnnee
    }
}

/// Les trois lignes du volume (A2) et les références de leurs phrases.
public struct LignesVolume: Sendable, Equatable {
    public var semaine: LigneJauge
    public var trenteJours: LigneJauge
    public var annee: LigneJauge
    public var references: ReferencesVolume

    public init(semaine: LigneJauge, trenteJours: LigneJauge, annee: LigneJauge, references: ReferencesVolume) {
        self.semaine = semaine
        self.trenteJours = trenteJours
        self.annee = annee
        self.references = references
    }
}

/// Les lignes du volume de A2 au jour de la Vue (A = vue.J − 1, D-022).
/// - Semaine : km du lundi à A ; trait et norme sur les 8 semaines terminées précédentes, au même jour (D-026).
/// - 30 jours : km de A − 29 à A ; trait = km de A − 59 à A − 30 ; norme des fenêtres de 30 jours terminées entre
///   A − 365 et A − 1, chacune seulement si les 30 jours qui la précèdent existent.
/// - Année : km du 1er janvier à A ; trait = l'année précédente au même jour ; pas de norme.
/// Les écarts sont en % (04). Une semaine ou une fenêtre commencée avant le premier jour de la Vue n'entre pas.
public func lignesVolume(_ vue: Vue) throws -> LignesVolume {
    let aujourdhui = try ajouterJours(vue.J, -1)
    let a = try numeroJour(aujourdhui)
    let premier: NumeroJour? = try vue.premierJour.map { try numeroJour($0) }
    let kmParJour = try kmParNumeroJour(vue.jours)

    /// Km cumulés de du à au inclus.
    func km(_ du: NumeroJour, _ au: NumeroJour) -> Double {
        var total = 0.0
        var n = du
        while n <= au {
            total += kmParJour[n] ?? 0
            n += 1
        }
        return total
    }
    /// Vrai si une période commençant à ce jour a son historique : elle ne commence pas avant le premier jour.
    func aHistorique(_ debut: NumeroJour) -> Bool {
        premier.map { $0 <= debut } ?? false
    }

    let fenetre = ACCUEIL.joursFenetre30
    let aujourdhuiDeSemaine = try jourDeSemaine(aujourdhui)   // 0 = lundi … 6 = dimanche

    // Semaine : lundi → A, comparé aux lundi → même jour des semaines terminées précédentes.
    let lundi = a - aujourdhuiDeSemaine
    let valeurSemaine = km(lundi, a)
    var echantillonSemaine: [Double] = []
    for k in 1...ACCUEIL.semainesVolume {
        let lundiK = lundi - 7 * k
        guard aHistorique(lundiK) else { break }
        echantillonSemaine.append(km(lundiK, lundiK + aujourdhuiDeSemaine))
    }
    let normeSemaine = norme(echantillonSemaine, minimum: ACCUEIL.minEchantillonVolume)
    let semaine = ligneDeNorme(
        valeur: valeurSemaine, trait: normeSemaine.moyenneSiNorme, resultat: normeSemaine, precision: 0.1
    )

    // 30 jours : fenêtre courante A − 29 → A ; précédente A − 59 → A − 30 ; norme des fenêtres A − 365 → A − 1.
    let valeur30 = km(a - (fenetre - 1), a)
    let trait30: Double? = aHistorique(a - (2 * fenetre - 1)) ? km(a - (2 * fenetre - 1), a - fenetre) : nil
    var echantillon30: [Double] = []
    for d in (a - ACCUEIL.joursNorme30)...(a - 1) where aHistorique(d - (2 * fenetre - 1)) {
        echantillon30.append(km(d - (fenetre - 1), d))
    }
    let normeTrenteJours = norme(echantillon30, minimum: ACCUEIL.minEchantillonVolume)
    let trenteJours = ligneDeNorme(valeur: valeur30, trait: trait30, resultat: normeTrenteJours, precision: 1)

    // Année : 1er janvier → A ; même période l'année précédente (29 février : jusqu'au 28 février).
    let dc = try decomposerDate(aujourdhui)
    let debutAnnee = try numeroJour("\(dc.annee)-01-01")
    let valeurAnnee = km(debutAnnee, a)
    let anneeDerniere = dc.annee - 1
    let jourDerniere = dc.mois == 2 && dc.jour == 29 ? 28 : dc.jour
    let debutAnneeDerniere = try numeroJour("\(anneeDerniere)-01-01")
    let memeJourAnneeDerniere = try numeroJour(String(format: "%04ld-%02ld-%02ld", anneeDerniere, dc.mois, jourDerniere))
    let traitAnnee: Double? = aHistorique(debutAnneeDerniere) ? km(debutAnneeDerniere, memeJourAnneeDerniere) : nil
    let annee = ligneJauge(
        valeur: valeurAnnee, trait: traitAnnee, bande: nil, precision: 1, ecartEnPourcent: true
    )

    let references = ReferencesVolume(
        jourDeSemaine: aujourdhuiDeSemaine + 1,
        bandeSemaine: semaine.bande,
        km30Precedents: trenteJours.trait,
        bande30: trenteJours.bande,
        anneeDerniere: anneeDerniere,
        kmAnDernierADate: annee.trait,
        kmParSemaineAnnee: try arrondir(valeurAnnee / Double(a - debutAnnee + 1) * 7, 1),
        seancesAnnee: Int(vue.compteurs.annee.nbSeances)
    )
    return LignesVolume(semaine: semaine, trenteJours: trenteJours, annee: annee, references: references)
}

/// Une ligne à norme : la bande vient de la norme, ou la mention « en cours » si l'échantillon est trop petit.
/// Partagée par le volume (A2) et la carte de séance (S2).
func ligneDeNorme(
    valeur: Double?, trait: Double?, resultat: NormeOuEnCours, precision: Double, ecartEnPourcent: Bool = true,
    sens: SensHorsBande = .deuxCotes
) -> LigneJauge {
    var bande: ClosedRange<Double>?
    var mention: MentionEnCours?
    switch resultat {
    case let .norme(n): bande = n.bas...n.haut
    case let .enCours(n, sur): mention = MentionEnCours(n: n, sur: sur)
    }
    var ligne = ligneJauge(
        valeur: valeur, trait: trait, bande: bande, precision: precision, ecartEnPourcent: ecartEnPourcent, sens: sens
    )
    ligne.enCours = mention
    return ligne
}

private extension NormeOuEnCours {
    /// La moyenne de l'échantillon, si la norme est disponible.
    var moyenneSiNorme: Double? {
        if case let .norme(n) = self { return n.moyenne }
        return nil
    }
}

/// Km par numéro de jour, tirés des jours agrégés de la Vue. Un jour absent n'a pas de km (zéro).
private func kmParNumeroJour(_ jours: JoursVue) throws -> [NumeroJour: Double] {
    var parJour: [NumeroJour: Double] = [:]
    for (indice, date) in jours.date.enumerated() {
        parJour[try numeroJour(date)] = jours.km[indice]
    }
    return parJour
}
