import Testing
@testable import JogCore

// Tests de règles de la décision, écrits à la main (et non tirés de l'oracle). Ils citent la règle vérifiée :
// 05 (« Seuils du verdict », « Règle du verdict », « Fourchette »), D-007 (données insuffisantes), D-015 (arrondi avant
// comparaison). Données synthétiques écrites ici : une situation « saine », où tous les signaux sont au vert, que chaque
// test modifie. Les tests passent par `decider` et `simuler`, les points d'entrée publics.

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

/// Situation saine : tous les signaux sont au vert au veille (2026-10-20), avec 50 jours d'historique et un palier de 3 semaines
/// autour de 96 km. Chaque test la modifie pour placer un seul signal hors du vert.
private func situationSaine(premierJour: DateCivile = "2026-09-01") -> EntreesDecision {
    var seances: [Seance] = []
    // 9 séances sous-seuil (sans écart à FC égale) entre J−21 et J−1 : la réponse à l'effort est au vert.
    for i in 0..<9 {
        let repetition = Repetition(n: 1, debut_s: 0, duree_s: 600, allure_skm: 240, fcFin: 160)
        seances.append(seance("ss\(i)", jourDOctobre(3 + i), .sousSeuil, repetitions: [repetition]))
    }
    // 3 footings conformes (FC moyenne 130 ≤ plafond 140) entre J−14 et J−1.
    for i in 0..<3 {
        seances.append(seance("ft\(i)", jourDOctobre(12 + 2 * i), .footing, fcMoy: 130))
    }
    // Une sortie longue utilisable (découplage 3,0 %) à J−3.
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

/// Remplace les footings de la situation : `conformes` footings à 130 bpm, `nonConformes` à 150 bpm, entre J−13 et J−4.
private func avecFootings(_ entree: EntreesDecision, conformes: Int, nonConformes: Int) -> EntreesDecision {
    var resultat = entree
    resultat.seances = entree.seances.filter { $0.type != .footing }
    for i in 0..<(conformes + nonConformes) {
        let fcMoy = i < conformes ? 130.0 : 150.0
        resultat.seances.append(seance("ft\(i)", jourDOctobre(8 + i % 10), .footing, fcMoy: fcMoy))
    }
    return resultat
}

// MARK: - 05 : les trois verdicts

@Test func regle05AugmenterQuandTousLesSignauxSontAuVert() throws {
    // 05, « Règle du verdict » : sans signal à surveiller ni décisif insuffisant, le verdict est Augmenter.
    let decision = try decider(situationSaine())
    #expect(decision.verdict == .augmenter)
    #expect(decision.phrase == "Tous les signaux sont au vert : la charge actuelle est absorbée.")
    // 05, « Fourchette » : +5 % à +10 % de la dernière semaine terminée (palier atteint), arrondis au km.
    #expect(decision.fourchette?.min == 101)
    #expect(decision.fourchette?.max == 106)
    #expect(decision.fourchette?.sourceReference == .palier)
}

@Test func regle05MaintenirQuandUnSignalNonDecisifEstASurveiller() throws {
    // 05 : « Maintenir » si un signal est à surveiller. Footings à 89,47 % (17 sur 19) : affichés 89 %, sous le seuil de 90 %.
    let decision = try decider(avecFootings(situationSaine(), conformes: 17, nonConformes: 2))
    #expect(decision.verdict == .maintenir)
    #expect(decision.phrase.contains("Point à surveiller : Footings sous le plafond."))
}

@Test func regle05AlleverQuandUnSignalDecisifEstEnAlerte() throws {
    // 05 : « Alléger » si un signal décisif est en alerte. La fourchette d'Alléger vaut 75 à 90 % de la moyenne sur 30 jours
    // (chronic 70 km) : la dernière semaine terminée, qui atteint le palier, n'entre pas dans le calcul.
    var entree = situationSaine()
    entree.serieCharge = [PointCharge(date: VEILLE, ctl: 50, atl: 53, tsb: -26)]
    let decision = try decider(entree)
    #expect(decision.verdict == .alleger)
    #expect(decision.phrase == "À surveiller en priorité : Fraîcheur.")
    #expect(decision.fourchette?.min == 53)
    #expect(decision.fourchette?.max == 63)
    #expect(decision.fourchette?.sourceReference == .moyenne30j)
}

// MARK: - 05 et D-015 : les seuils, à la valeur affichée

@Test func d015UneProgressiviteAffichee130EstOkEtAffichee131EstASurveiller() throws {
    // D-015 : r = 1,3049 s'affiche 1,30 (bande OK, 05) ; r = 1,305 s'affiche 1,31 (à surveiller).
    var entree = situationSaine()
    entree.ratio = [PointRatio(date: VEILLE, s7: 70, chronic: 70, r: 1.3049)]
    #expect(try decider(entree).verdict == .augmenter)

    entree.ratio = [PointRatio(date: VEILLE, s7: 70, chronic: 70, r: 1.305)]
    let decision = try decider(entree)
    #expect(decision.verdict == .maintenir)
    #expect(decision.phrase.contains("Progressivité"))
}

@Test func regle05UneFraicheurDeMoins25EstOkEtMoins26EstEnAlerte() throws {
    // 05 : la fraîcheur est en alerte sous −25 ; −25 exactement reste dans la bande OK.
    var entree = situationSaine()
    entree.serieCharge = [PointCharge(date: VEILLE, ctl: 50, atl: 53, tsb: -25)]
    #expect(try decider(entree).verdict == .augmenter)
    entree.serieCharge = [PointCharge(date: VEILLE, ctl: 50, atl: 53, tsb: -26)]
    #expect(try decider(entree).verdict == .alleger)
}

@Test func d015DesFootingsA90PourCentSontOkMaisA89SontASurveiller() throws {
    // 05 : footings « surveiller sous 90 % » ; D-015 : 90 % (9 sur 10) est ok, 89,47 % s'affiche 89 % et doit être à surveiller.
    #expect(try decider(avecFootings(situationSaine(), conformes: 9, nonConformes: 1)).verdict == .augmenter)
    #expect(try decider(avecFootings(situationSaine(), conformes: 17, nonConformes: 2)).verdict == .maintenir)
}

// MARK: - D-007 : données insuffisantes

@Test func d007AucunVerdictAvant30JoursDHistorique() throws {
    // D-007 : sous 30 jours d'historique, la progressivité est insuffisante : pas de verdict, ni fourchette ni simulateur.
    let vingtNeuf = try decider(situationSaine(premierJour: "2026-09-22"))
    #expect(vingtNeuf.verdict == .aucun)
    #expect(vingtNeuf.fourchette == nil)
    #expect(vingtNeuf.simulateur == nil)
    #expect(vingtNeuf.phrase == "Il faut 30 jours d’historique pour comparer la semaine au mois (encore 1 jour).")

    // Au trentième jour (premier jour le 21 septembre, veille incluse), le verdict existe.
    #expect(try decider(situationSaine(premierJour: "2026-09-21")).verdict != .aucun)
}

@Test func d007MaintenirQuandSeulUnSignalDecisifEstInsuffisant() throws {
    // D-007 : « si un signal décisif est insuffisant, AUGMENTER devient MAINTENIR ». Sans sortie longue, le découplage
    // (décisif pour 05) est insuffisant ; aucun autre signal n'est défavorable.
    var entree = situationSaine()
    entree.seances = entree.seances.filter { $0.type != .sortieLongue }
    let decision = try decider(entree)
    #expect(decision.verdict == .maintenir)
    #expect(decision.phrase == "Aucun signal défavorable, mais pas assez de données pour conseiller une hausse : Découplage de la dernière sortie longue.")
}

@Test func d007UnSignalNonDecisifInsuffisantNAPasDEffetSurLeVerdict() throws {
    // D-007 : « un signal insuffisant non décisif reste sans effet » : le palier (non décisif) a moins de 2 semaines
    // terminées, le verdict reste Augmenter, et la phrase le dit.
    var entree = situationSaine()
    entree.semaines = [
        semaineEntree("2026-10-12", .terminee, 96),
        semaineEntree("2026-10-19", .enCours, 11.2),
    ]
    entree.palier = Palier(semaines: 0, reference_km: 0)
    let decision = try decider(entree)
    #expect(decision.verdict == .augmenter)
    #expect(decision.phrase == "Tous les signaux disponibles sont au vert : la charge actuelle est absorbée.")
}

@Test func regle05LaPhraseNeCiteQueDesSignauxDeLaListe() throws {
    // 05 : la phrase du verdict cite les signaux à surveiller et les décisifs insuffisants, et seulement ceux-là.
    var entree = avecFootings(situationSaine(), conformes: 17, nonConformes: 2)
    entree.seances = entree.seances.filter { $0.type != .sortieLongue }
    let decision = try decider(entree)

    for signal in decision.signaux {
        let doitEtreCite = signal.etat == .surveiller || signal.etat == .alerte
            || (signal.etat == .insuffisant && ["progressivite", "fraicheur", "reponse", "decouplage"].contains(signal.cle.rawValue))
        #expect(decision.phrase.contains(signal.nom) == doitEtreCite, "signal « \(signal.nom) »")
    }
}

// MARK: - 05, « Exemple » (maquette) : Augmenter, fourchette 100 à 105 km au 2026-10-20

@Test func maquetteAugmenterAvecFourchette100a105EstRetrouveeParSonNom() throws {
    // Cas doré « maquette » de decision.json : l'entrée de la maquette (J = 2026-10-20) donne Augmenter, fourchette 100 à 105 km.
    let fichier = try chargerCasOracle("decision")
    let cas = try #require(fichier.cas.first(where: { $0.nom == "maquette : Augmenter, fourchette de 100 à 105 km (05, « Exemple »)" }))
    let decision = try decider(try argDecode(cas.entree, EntreesDecision.self))
    #expect(decision.verdict == .augmenter)
    #expect(decision.fourchette?.min == 100)
    #expect(decision.fourchette?.max == 105)
    #expect(decision.fourchette?.sourceReference == .palier)
}

// MARK: - 05, « Simulateur » : simuler est pur

@Test func regle05SimulerPositionneLeVolumeEtNeDependPasDesAppelsPrecedents() throws {
    // 05 : le simulateur situe le volume par rapport à la fourchette ; la fonction est pure (mêmes entrées, même résultat).
    let simulateur = Simulateur(
        ctlJm1: 100, atlJm1: 100, chargeParKm: 9, km23j: 230, ctlDays: 42, atlDays: 7, min: 48, max: 152, defaut: 103
    )
    let fourchette = Fourchette(min: 100, max: 105, reference: 95, sourceReference: .palier)

    let dans = try simuler(105, simulateur, fourchette)
    #expect(dans.positionFourchette == .dans)
    #expect(dans.ecart_km == 0)
    #expect(dans.phrase == "Dans la fourchette proposée")

    let audessus = try simuler(106, simulateur, fourchette)
    #expect(audessus.positionFourchette == .auDessus)
    #expect(audessus.ecart_km == 1)
    #expect(audessus.phrase == "1 km au-dessus de la fourchette")

    let dessous = try simuler(99, simulateur, fourchette)
    #expect(dessous.positionFourchette == .dessous)
    #expect(dessous.ecart_km == 1)
    #expect(dessous.phrase == "1 km sous la fourchette")

    // Pureté : un résultat déjà obtenu ne change pas après d'autres appels.
    #expect(try simuler(106, simulateur, fourchette) == audessus)
}
