import Foundation
import Testing
@testable import JogCore

// Lot 6 de la récupération (D-023 ; docs/implementation/recuperation.md, lot 6 ; docs/design/05-decision-volume.md,
// « Règle du verdict », « Critères d'acceptation ») : le 8ᵉ signal, Récupération, dans la décision. Tests écrits à la main,
// aux frontières publiques `decider` et `calculerRecuperation`. Le motif `situationSaine` vient de DecisionReglesSpecTests.swift.

private let JOUR_J = "2026-10-21"
private let VEILLE = "2026-10-20"

private func jourDOctobre(_ jour: Int) -> DateCivile {
    jour < 10 ? "2026-10-0\(jour)" : "2026-10-\(jour)"
}

private func seance(
    _ cle: String, _ date: DateCivile, _ type: TypeSeance,
    fcMoy: Double? = nil, repetitions: [Repetition] = [], decouplage: Decouplage? = nil
) -> Seance {
    Seance(intrinseque: SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 0, nom: nil, marquage: .aucun, duree_min: 60, km: 10,
        fcMoy: fcMoy, allureMoy_skm: nil, minutes: Minutes(easy: 60, mp: 0, subt: 0, hard: 0), charge: 60,
        mp_min: 0, segmentsMp: [], repetitions: repetitions, format: nil, recup_s: nil, ef: nil, fcPic: nil,
        decouplage: decouplage, lignesDroites: false, distanceRef_km: nil, temps_s: nil
    ), type: type)
}

private func semaineEntree(_ lundi: DateCivile, _ statut: StatutSemaine, _ km: Double) -> SemaineEntree {
    SemaineEntree(lundi: lundi, statut: statut, km: km)
}

/// Situation saine (copie de DecisionReglesSpecTests) : tous les signaux sont au vert à la veille (2026-10-20), sans
/// Récupération. Chaque test y ajoute ou y modifie la Récupération, ou un seul autre signal.
private func situationSaine(premierJour: DateCivile = "2026-09-01") -> EntreesDecision {
    var seances: [Seance] = []
    for i in 0..<9 {
        let repetition = Repetition(n: 1, debut_s: 0, duree_s: 600, allure_skm: 240, fcFin: 160)
        seances.append(seance("ss\(i)", jourDOctobre(3 + i), .sousSeuil, repetitions: [repetition]))
    }
    for i in 0..<3 {
        seances.append(seance("ft\(i)", jourDOctobre(12 + 2 * i), .footing, fcMoy: 130))
    }
    seances.append(seance(
        "sl", jourDOctobre(18), .sortieLongue,
        decouplage: Decouplage(valeur: 3.0, retenu_min: 0, total_min: 0, avecMp: false)
    ))
    let parametres = parametresDefaut()
    return EntreesDecision(
        J: JOUR_J,
        premierJour: premierJour,
        serieCharge: [PointCharge(date: VEILLE, ctl: 50, atl: 53, tsb: -3)],
        ratio: [PointRatio(date: VEILLE, s7: 70, chronic: 70, r: 1)],
        joursKm: [],
        semaines: [
            semaineEntree("2026-09-28", .terminee, 96),
            semaineEntree("2026-10-05", .terminee, 96),
            semaineEntree("2026-10-12", .terminee, 96),
            semaineEntree("2026-10-19", .enCours, 11.2),
        ],
        palier: Palier(semaines: 3, reference_km: 96),
        seances: seances,
        globaux: parametres.globaux,
        parametres: parametres
    )
}

/// Remplace les footings de la situation : `conformes` footings à 130 bpm, `nonConformes` à 150 bpm.
private func avecFootings(_ entree: EntreesDecision, conformes: Int, nonConformes: Int) -> EntreesDecision {
    var resultat = entree
    resultat.seances = entree.seances.filter { $0.type != .footing }
    for i in 0..<(conformes + nonConformes) {
        let fcMoy = i < conformes ? 130.0 : 150.0
        resultat.seances.append(seance("ft\(i)", jourDOctobre(8 + i % 10), .footing, fcMoy: fcMoy))
    }
    return resultat
}

/// La nuit datée de `retour` jours avant la veille (0 = la veille, A).
private func nuitRecup(_ retour: Int, vfc: Double? = nil, fc: Double? = nil) throws -> NuitResumee {
    NuitResumee(
        date: try ajouterJours(VEILLE, -retour), debutUtc_ms: 0, finUtc_ms: 0, coucher_min: 300, sommeil_min: 420,
        leger_min: 420, profond_min: 0, paradoxal_min: 0, eveille_min: 0,
        vfcLn: vfc.map { Foundation.log($0) }, fcSommeil: fc, respiration: nil
    )
}

/// La Vue de récupération à la veille, par `calculerRecuperation`. Norme : 60 nuits (retours 7 à 66) dont la VFC alterne
/// 40 et 60 ms et la FC 44 et 48 bpm, soit une norme VFC d'environ 40 à 59 ms et une FC de 44 à 48 bpm. Les 7 dernières nuits
/// valent `vfc7` et `fc7` (nil : aucune nuit). `normeComplete` à false ne garde que 13 nuits de norme (norme en cours).
private func recuperationVeille(vfc7: Double?, fc7: Double?, normeComplete: Bool = true) throws -> VueRecuperation {
    var nuits = try (7...(normeComplete ? 66 : 19)).map { k in
        try nuitRecup(k, vfc: k % 2 == 0 ? 40 : 60, fc: k % 2 == 0 ? 44 : 48)
    }
    if let vfc7, let fc7 {
        nuits += try (0..<7).map { k in try nuitRecup(k, vfc: vfc7, fc: fc7) }
    }
    return try #require(try calculerRecuperation(nuits, derniereSession: nil, aujourdhui: VEILLE))
}

/// Récupération dans la norme : VFC 48 ms (40 à 59), FC 46 bpm.
private func recuperationDansLaNorme() throws -> VueRecuperation {
    try recuperationVeille(vfc7: 48, fc7: 46)
}

/// Récupération sous la norme : VFC 35 ms, sous la borne basse ; FC 46 bpm, dans la norme.
private func recuperationSousLaNorme() throws -> VueRecuperation {
    try recuperationVeille(vfc7: 35, fc7: 46)
}

/// Récupération basse : VFC 35 ms sous la borne basse et FC 50 bpm au-dessus de la borne haute.
private func recuperationBasse() throws -> VueRecuperation {
    try recuperationVeille(vfc7: 35, fc7: 50)
}

// MARK: - 05, « Règle du verdict » : la Récupération est un signal non décisif (D-023)

@Test func recuperationSaineDansLaNormeDonneAugmenterAvecHuitSignauxAuVert() throws {
    // 05 « Règle du verdict » : Récupération dans la norme est OK ; sans signal à surveiller, le verdict reste Augmenter.
    var entree = situationSaine()
    entree.recuperation = try recuperationDansLaNorme()
    let decision = try decider(entree)

    #expect(decision.verdict == .augmenter)
    #expect(decision.phrase == "Tous les signaux sont au vert : la charge actuelle est absorbée.")
    #expect(decision.signaux.count == 8)
    let recuperation = try #require(decision.signaux.last)
    #expect(recuperation.cle == .recuperation)
    #expect(recuperation.nom == "Récupération")
    #expect(recuperation.etat == .ok)
    #expect(recuperation.valeur == 48)
    #expect(recuperation.valeurTexte == "VFC 48 ms")
    #expect(recuperation.explication == "VFC des 7 dernières nuits dans ta norme (40–59 ms).")
}

@Test func recuperationSousLaNormeDonneMaintenirAvecLaPhraseDeRecuperation() throws {
    // 05 : Récupération sous la norme est À surveiller ; elle retient à Maintenir, avec la phrase qui lui est propre.
    var entree = situationSaine()
    entree.recuperation = try recuperationSousLaNorme()
    let decision = try decider(entree)

    #expect(decision.verdict == .maintenir)
    #expect(decision.phrase == "Rien d’alarmant côté entraînement, mais la récupération est sous ta norme : mieux vaut consolider avant de monter.")
    #expect(decision.signaux.last?.etat == .surveiller)
}

@Test func recuperationBasseSeuleDonneMaintenirEtJamaisAlleger() throws {
    // 05 : « Récupération basse seule → Maintenir, jamais Alléger ». Récupération est en alerte, mais elle n'est pas décisive.
    var entree = situationSaine()
    entree.recuperation = try recuperationBasse()
    let decision = try decider(entree)

    #expect(decision.verdict == .maintenir)
    #expect(decision.verdict != .alleger)
    #expect(decision.phrase == "Rien d’alarmant côté entraînement, mais la récupération est basse : mieux vaut consolider avant de monter.")
    #expect(decision.signaux.last?.etat == .alerte)
}

@Test func fraicheurEnAlerteEtRecuperationBasseDonnentAllegerSansCiterRecuperation() throws {
    // 05 : seule la Fraîcheur, décisive, déclenche Alléger. La Récupération basse n'est pas dans la liste des alertes.
    var entree = situationSaine()
    entree.serieCharge = [PointCharge(date: VEILLE, ctl: 50, atl: 53, tsb: -26)]
    entree.recuperation = try recuperationBasse()
    let decision = try decider(entree)

    #expect(decision.verdict == .alleger)
    #expect(decision.phrase == "À surveiller en priorité : Fraîcheur.")
}

@Test func footingsASurveillerEtRecuperationSousLaNormeCiteesDansLaPhraseStandard() throws {
    // 05 : deux signaux à surveiller. La phrase standard les cite dans l'ordre de la liste, Récupération en dernier.
    var entree = avecFootings(situationSaine(), conformes: 17, nonConformes: 2)
    entree.recuperation = try recuperationSousLaNorme()
    let decision = try decider(entree)

    #expect(decision.verdict == .maintenir)
    // L'énumération de la phrase écrit « X et Y » pour deux signaux, comme les autres phrases du verdict.
    #expect(decision.phrase == "Rien d’alarmant, mais mieux vaut consolider avant de monter. Points à surveiller : Footings sous le plafond et Récupération.")
}

@Test func normeEnCoursDonneAugmenterAvecLaPhraseDesSignauxDisponibles() throws {
    // 05 « Règle du verdict » : une Récupération insuffisante est sans effet ; la phrase d'Augmenter dit « disponibles ».
    var entree = situationSaine()
    entree.recuperation = try recuperationVeille(vfc7: 48, fc7: 46, normeComplete: false)
    let decision = try decider(entree)

    #expect(decision.verdict == .augmenter)
    #expect(decision.phrase == "Tous les signaux disponibles sont au vert : la charge actuelle est absorbée.")
    let recuperation = try #require(decision.signaux.last)
    #expect(recuperation.etat == .insuffisant)
    #expect(recuperation.valeur == nil)
    #expect(recuperation.valeurTexte == "–")
}

// MARK: - Golden et entrée sans Récupération : la liste garde 7 signaux

@Test func sansRecuperationLaListeGardeSeptSignauxEtLaMemeSortie() throws {
    // Sans nuits (`recuperation == nil`), il n'y a pas de 8ᵉ signal, et la décision est celle de l'entrée sans le champ.
    let sansChamp = try decider(situationSaine())
    var entree = situationSaine()
    entree.recuperation = nil
    let decision = try decider(entree)

    #expect(decision.signaux.count == 7)
    #expect(!decision.signaux.contains { $0.cle == .recuperation })
    #expect(decision == sansChamp)
    #expect(decision.verdict == .augmenter)
}

// MARK: - 05, « Règle du verdict » : progressivité insuffisante, et critère « chaque signal cité »

@Test func progressiviteInsuffisanteAvecRecuperationBasseNeDonneAucunVerdict() throws {
    // D-007 : sans historique suffisant, la progressivité est insuffisante : pas de verdict, quelle que soit la Récupération.
    var entree = situationSaine(premierJour: "2026-09-22")
    entree.recuperation = try recuperationBasse()
    let decision = try decider(entree)

    #expect(decision.verdict == .aucun)
    #expect(decision.fourchette == nil)
    #expect(decision.simulateur == nil)
    #expect(decision.phrase == "Il faut 30 jours d’historique pour comparer la semaine au mois (encore 1 jour).")
}

@Test func regle05LaPhraseCiteExactementLesSignauxDeLaListeYCompriseRecuperation() throws {
    // 05, « Critères d'acceptation » : chaque signal cité dans la phrase est dans la liste, et seulement ceux-là.
    // Footings à surveiller, Récupération basse, Découplage insuffisant (décisif) : trois signaux cités.
    var entree = avecFootings(situationSaine(), conformes: 17, nonConformes: 2)
    entree.seances = entree.seances.filter { $0.type != .sortieLongue }
    entree.recuperation = try recuperationBasse()
    let decision = try decider(entree)

    for signal in decision.signaux {
        let doitEtreCite = signal.etat == .surveiller || signal.etat == .alerte
            || (signal.etat == .insuffisant && ["progressivite", "fraicheur", "reponse", "decouplage"].contains(signal.cle.rawValue))
        #expect(decision.phrase.contains(signal.nom) == doitEtreCite, "signal « \(signal.nom) »")
    }
}
