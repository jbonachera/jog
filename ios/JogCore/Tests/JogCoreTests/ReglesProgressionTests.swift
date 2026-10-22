import Foundation
import Testing
@testable import JogCore

// Tests de règles de l'onglet Progression, écrits à la main (et non tirés de l'oracle) à partir de la spec :
// docs/design/04-metriques.md (« Comparateur », « Coefficient paceHrK », « Ratio de progressivité », « Tendances »,
// « Notations », « Charge »), docs/design/03-ecrans.md (P1 à P5, C1 à C3, H1), D-004, D-015, D-019
// (docs/design/decisions.md). Données synthétiques, construites dans chaque test.

// MARK: - Construction de données synthétiques

private let J: DateCivile = "2026-10-21"
private let globauxDefaut = ParamsGlobaux(refHr: 164, paceHrK: 1.1, ctlDays: 42, atlDays: 7, subtPctLo: 20, subtPctHi: 25)
private let datesDefaut = ParamsDates(
    hrMax: 188, hrRest: 46, z1: 68, z2: 78, z3: 85, z4: 92, lt2Hr: 172, lt2Pace: 238, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)
/// Paramètres datés constants : les seuils ne changent pas dans ces tests.
private let parametres: ParamsAuJour = { _ in datesDefaut }

private func decoder<T: Decodable>(_ type: T.Type, _ objet: [String: Any]) throws -> T {
    try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: objet))
}

/// Une séance telle que la Vue la porte, avec des valeurs par défaut (footing de 30 min, 8 km, FC 140).
private func seance(_ date: DateCivile, _ type: String, _ champs: [String: Any] = [:]) throws -> SeanceVue {
    var objet: [String: Any] = [
        "cleSource": "test:\(type):\(date)", "date": date, "debutUtc": 0, "nom": NSNull(), "marquage": "aucun",
        "duree_min": 30, "km": 8, "fcMoy": 140, "allureMoy_skm": 330,
        "minutes": ["easy": 30, "mp": 0, "subt": 0, "hard": 0], "charge": 30, "mp_min": 0, "repetitions": [],
        "format": NSNull(), "recup_s": NSNull(), "ef": NSNull(), "fcPic": NSNull(), "decouplage": NSNull(),
        "lignesDroites": false, "distanceRef_km": NSNull(), "temps_s": NSNull(), "type": type,
    ]
    for (cle, valeur) in champs { objet[cle] = valeur }
    return try decoder(SeanceVue.self, objet)
}

/// Une répétition au format de la Vue (allure en s/km, FC de fin en bpm).
private func repetition(allure: Double, fcFin: Double, duree: Double = 360) -> [String: Any] {
    ["n": 1, "debut_s": 0, "duree_s": duree, "allure_skm": allure, "fcFin": fcFin]
}

/// Activité d'une journée de l'historique (km, minutes totales, minutes faciles et sous-seuil).
private struct Activite {
    let km: Double
    let min: Double
    let easy: Double
    let subt: Double
}

/// Une Vue de test : historique du 1er juin à J−1, avec les activités données (les autres jours sont vides).
private func vue(
    premierJour: DateCivile = "2026-06-01",
    seances: [SeanceVue] = [],
    activites: [DateCivile: Activite] = [:],
    semaines: [SemaineVue] = [],
    ratio: SerieRatioVue? = nil
) throws -> Vue {
    var dates: [DateCivile] = []
    var d = premierJour
    while d < J {
        dates.append(d)
        d = try ajouterJours(d, 1)
    }
    let parJour = dates.map { activites[$0] ?? Activite(km: 0, min: 0, easy: 0, subt: 0) }
    let zeros = [Double](repeating: 0, count: dates.count)
    let jours = JoursVue(
        date: dates,
        km: parJour.map(\.km),
        min: parJour.map(\.min),
        charge: zeros,
        minutes: MinutesColonnes(easy: parJour.map(\.easy), mp: zeros, subt: parJour.map(\.subt), hard: zeros),
        types: dates.map { _ in [] }
    )
    let compteur: [String: Any] = [
        "km": 0, "duree_min": 0, "nbSeances": 0, "ecart": NSNull(), "historiquePrecedent": false, "serie": [],
    ]
    let compteurs = Compteurs(
        annee: try decoder(VolumeAnnee.self, compteur.merging(["moyenneHebdo_km": 0]) { _, nouveau in nouveau }),
        jours30: try decoder(Volume.self, compteur),
        jours7: try decoder(Volume.self, compteur)
    )
    return Vue(
        formatVersion: 5, reglesVersion: "1.1.0", J: J, derniereSynchro: nil,
        parametresEnVigueur: ParametresEnVigueur(
            globaux: globauxDefaut, datesAJm1: datesDefaut, modifs: [], suggestionPaceHrK: nil,
            raisonAbsenceSuggestion: nil, suggestionHrMax: nil
        ),
        seances: seances, jours: jours, premierJour: premierJour, serieCharge: [],
        ratio: ratio ?? SerieRatioVue(date: [], s7: [], chronic: [], r: []),
        semaines: semaines, palier: Palier(semaines: 0, reference_km: 0), compteurs: compteurs,
        decision: Decision(verdict: .aucun, phrase: "", signaux: [], fourchette: nil, simulateur: nil)
    )
}

/// La mesure de la clé donnée dans le comparateur.
private func mesure(_ comparaison: Comparaison, _ cle: CleMesure) throws -> Mesure {
    try #require(comparaison.mesures.first { $0.cle == cle })
}

// MARK: - P1 · Comparateur : une formule par mesure (04, « Comparateur de périodes »)

@Test func comparateurKmEtSeancesSeRamenentALaSemaine() throws {
    // 04 : les volumes sont ramenés à la semaine : une période de 14 jours vaut 2 semaines.
    let v = try vue(
        seances: [
            try seance("2026-08-03", "footing"), try seance("2026-08-10", "footing"),
            try seance("2026-09-02", "footing"), try seance("2026-09-04", "footing"),
            try seance("2026-09-08", "footing"), try seance("2026-09-12", "footing"),
        ],
        activites: [
            "2026-08-03": Activite(km: 10, min: 60, easy: 60, subt: 0),
            "2026-08-10": Activite(km: 20, min: 60, easy: 60, subt: 0),
            "2026-09-02": Activite(km: 42, min: 120, easy: 120, subt: 0),
        ]
    )
    let c = try comparer(v, PeriodeDates(debut: "2026-08-01", fin: "2026-08-14"), PeriodeDates(debut: "2026-09-01", fin: "2026-09-14"), parametres)

    let km = try mesure(c, .km)
    #expect(km.a == 15) // 30 km sur 2 semaines
    #expect(km.b == 21) // 42 km sur 2 semaines
    #expect(km.ecartAffiche == 6)
    #expect(km.etat == .mieux) // plus haut est mieux

    let seances = try mesure(c, .seances)
    #expect(seances.a == 1)
    #expect(seances.b == 2)
    #expect(seances.etat == .neutre) // une mesure sans sens reste neutre
}

@Test func comparateurHeuresEtMinutesSSParSemaine() throws {
    // 04 : heures par semaine (minutes ÷ 60) ; minutes de sous-seuil par semaine. Une période vide n'a pas de moyenne.
    let v = try vue(
        activites: ["2026-08-03": Activite(km: 40, min: 420, easy: 360, subt: 60)]
    )
    let c = try comparer(v, PeriodeDates(debut: "2026-08-01", fin: "2026-08-14"), PeriodeDates(debut: "2026-09-01", fin: "2026-09-14"), parametres)

    let heures = try mesure(c, .heures)
    #expect(heures.a == 3.5) // 420 min ÷ 60 = 7 h, sur 2 semaines
    #expect(heures.b == 0)
    #expect(heures.etat == .moinsBien) // moins d'heures que la référence : moins bien

    let minutesSS = try mesure(c, .minutesSS)
    #expect(minutesSS.a == 30) // 60 min de sous-seuil sur 2 semaines
}

@Test func comparateurPartSousSeuilEtFootingsSousPlafond() throws {
    // 04 : part du temps en sous-seuil = minutes SS ÷ minutes totales, en % ; footings ≤ plafond à la date du footing.
    let v = try vue(
        seances: [
            try seance("2026-08-03", "footing", ["fcMoy": 135]),
            try seance("2026-08-05", "footing", ["fcMoy": 140]),
            try seance("2026-08-07", "footing", ["fcMoy": 150]),
        ],
        activites: ["2026-08-03": Activite(km: 10, min: 400, easy: 300, subt: 100)]
    )
    let c = try comparer(v, PeriodeDates(debut: "2026-08-01", fin: "2026-08-14"), PeriodeDates(debut: "2026-09-01", fin: "2026-09-14"), parametres)

    let partSS = try mesure(c, .partSS)
    #expect(partSS.a == 25) // 100 ÷ 400 × 100

    // Deux footings sur trois sont ≤ 140 bpm (135 et 140, la borne comprise) : 2 ÷ 3 × 100.
    let footings = try mesure(c, .footings)
    #expect(footings.a != nil)
    #expect(abs((footings.a ?? 0) - 200.0 / 3.0) < 1e-9)
}

@Test func comparateurTestCinqKmPlusRapideEstMieuxEtAllureNommeLaFcDeReference() throws {
    // 04 : le meilleur test de 5 km est un temps, donc « plus rapide » : un temps plus court est mieux.
    // 03, P1 : la ligne d'allure porte la FC de référence (« allure à 164 bpm »).
    let v = try vue(seances: [
        try seance("2026-08-10", "course", ["distanceRef_km": 5, "temps_s": 1200]),
        try seance("2026-09-05", "test", ["distanceRef_km": 5, "temps_s": 1180]),
    ])
    let c = try comparer(v, PeriodeDates(debut: "2026-08-01", fin: "2026-08-14"), PeriodeDates(debut: "2026-09-01", fin: "2026-09-14"), parametres)

    let test5 = try mesure(c, .test5)
    #expect(test5.a == 1200)
    #expect(test5.b == 1180)
    #expect(test5.ecartAffiche == -20)
    #expect(test5.etat == .mieux)
    #expect(try mesure(c, .allure).nom == "allure à 164 bpm")
}

@Test func comparateurEcartQuiSAfficheNulEstEgalMemeSiLesValeursBrutesDiffèrent() throws {
    // D-015 : l'état se juge sur l'écart affiché. 10,01 et 10,04 km s'affichent 10,0 : l'écart est égal, même si
    // les valeurs brutes diffèrent de 0,03.
    let v = try vue(activites: [
        "2026-08-03": Activite(km: 10.01, min: 0, easy: 0, subt: 0),
        "2026-08-10": Activite(km: 10.04, min: 0, easy: 0, subt: 0),
    ])
    let c = try comparer(v, PeriodeDates(debut: "2026-08-01", fin: "2026-08-07"), PeriodeDates(debut: "2026-08-08", fin: "2026-08-14"), parametres)

    let km = try mesure(c, .km)
    #expect(km.ecart != 0)
    #expect(km.ecartAffiche == 0)
    #expect(km.etat == .egal)
}

// MARK: - P1 · Historique partiel et périodes invalides

@Test func historiquePartielQuandAEstPlusCourteDeSixJours() throws {
    // 03, P1 : « historique partiel » quand A est plus courte que B de plus de 6 jours.
    let v = try vue()
    let b = PeriodeDates(debut: "2026-08-15", fin: "2026-08-28") // 14 jours
    let courte = try comparer(v, PeriodeDates(debut: "2026-08-01", fin: "2026-08-07"), b, parametres) // 7 jours : écart de 7
    #expect(courte.historiquePartiel)
    let limite = try comparer(v, PeriodeDates(debut: "2026-08-01", fin: "2026-08-08"), b, parametres) // 8 jours : écart de 6
    #expect(!limite.historiquePartiel)
}

@Test func periodeInvalideSiLaFinPrecedeLeDebut() throws {
    // Le comparateur ne calcule pas une période qui finit avant son début : ErreurPeriodeInvalide (ordre), période A.
    let v = try vue()
    do {
        _ = try comparer(v, PeriodeDates(debut: "2026-08-10", fin: "2026-08-01"), PeriodeDates(debut: "2026-09-01", fin: "2026-09-14"), parametres)
        Issue.record("ErreurPeriodeInvalide attendue")
    } catch let erreur as ErreurPeriodeInvalide {
        #expect(erreur.periode == .a)
        #expect(erreur.raison == .ordre)
    }
}

@Test func periodeInvalideSiUneDateNExistePas() throws {
    // Une date inexistante (30 février) rend la période B invalide : ErreurPeriodeInvalide (date).
    let v = try vue()
    do {
        _ = try comparer(v, PeriodeDates(debut: "2026-08-01", fin: "2026-08-14"), PeriodeDates(debut: "2026-02-30", fin: "2026-03-10"), parametres)
        Issue.record("ErreurPeriodeInvalide attendue")
    } catch let erreur as ErreurPeriodeInvalide {
        #expect(erreur.periode == .b)
        #expect(erreur.raison == .date)
    }
}

// MARK: - P2 · Tendances : lissage (04, « Tendances »)

@Test func lissageDesSemainesSurQuatrePointsEtTronqueAuDebut() throws {
    // 04 : moyenne glissante sur 4 semaines, point courant inclus. Au début, la fenêtre est tronquée.
    // Allures normalisées (FC de fin = FC de référence, donc pas de correction) : 260, 256, 252, 250, 248, 246.
    let lundis = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"]
    let allures = [260.0, 256, 252, 250, 248, 246]
    let seances = try zip(lundis, allures).map { lundi, allure in
        try seance(lundi, "sous-seuil", ["repetitions": [repetition(allure: allure, fcFin: 164)]])
    }
    let t = try tendances(vue(seances: seances))

    #expect(t.allure.points.count == 6)
    #expect(t.allure.points[2].lisse == 256) // (260 + 256 + 252) ÷ 3, fenêtre tronquée
    #expect(t.allure.points[3].lisse == 254.5) // (260 + 256 + 252 + 250) ÷ 4
    #expect(t.allure.points[5].lisse == 249) // (252 + 250 + 248 + 246) ÷ 4
    #expect(t.allure.derniere == 249)
    #expect(t.allure.ecart == -11)
    #expect(t.allure.bonSens == true) // une allure plus basse est mieux
}

@Test func lissageDuDecouplageSurTroisSortiesEtSensPlusBasEstMieux() throws {
    // 04 et D-005 : découplage lissé sur 3 sorties longues ; une valeur plus basse est mieux ; la forme losange
    // marque une sortie avec allure marathon.
    let valeurs: [(DateCivile, Double, Bool)] = [("2026-09-06", 6, false), ("2026-09-13", 4, true), ("2026-09-20", 3.2, false), ("2026-09-27", 2.9, false)]
    let seances = try valeurs.map { date, valeur, avecMp in
        try seance(date, "sortie-longue", ["decouplage": ["valeur": valeur, "retenu_min": 90, "total_min": 90, "avecMp": avecMp]])
    }
    let t = try tendances(vue(seances: seances))
    let points = t.decouplage.points

    #expect(points.count == 4)
    #expect(points[0].lisse == 6)
    #expect(points[1].lisse == 5) // (6 + 4) ÷ 2
    #expect(abs(points[2].lisse - 4.4) < 1e-9) // (6 + 4 + 3,2) ÷ 3
    #expect(abs(points[3].lisse - (4 + 3.2 + 2.9) / 3) < 1e-9)
    #expect(points[1].forme == .losange)
    #expect(points[0].forme == .rond)
    #expect(t.decouplage.bonSens == true)
}

// MARK: - D-004 : suggestion paceHrK absente sans données suffisantes

@Test func suggestionPaceHrKAbsenteQuandLesDonneesManquent() throws {
    // D-004 : il faut au moins 5 footings utilisables et 3 séances sous-seuil avec une répétition utilisable, sur les
    // 12 semaines qui finissent à J−1. Et hrR − hrE doit valoir au moins 10 bpm.
    let footings = try (0..<5).map { try seance("2026-08-\(String(format: "%02d", 3 + $0 * 2))", "footing") }
    let rep = ["repetitions": [repetition(allure: 260, fcFin: 170)]]
    let seances = try (0..<3).map { try seance("2026-09-\(String(format: "%02d", 1 + $0 * 3))", "sous-seuil", rep) }

    #expect(try suggestionPaceHrK(vue(seances: Array(footings.prefix(4)) + seances)) == nil) // 4 footings seulement
    #expect(try suggestionPaceHrK(vue(seances: footings + Array(seances.prefix(2)))) == nil) // 2 séances SS seulement
    let fcProche = try (0..<3).map { try seance("2026-09-\(String(format: "%02d", 1 + $0 * 3))", "sous-seuil", ["repetitions": [repetition(allure: 260, fcFin: 145)]]) }
    #expect(try suggestionPaceHrK(vue(seances: footings + fcProche)) == nil) // écart de FC de 5 bpm, sous 10
}

// MARK: - C1 · Progressivité (03, C1 ; 04 « Ratio de progressivité »)

/// Une série de ratios quotidiens du 1er jour à J−1 : `r` vaut nil tant que l'historique a moins de 30 jours.
private func serieRatio(jours: Int, premierDefini: Int) throws -> SerieRatioVue {
    var dates: [DateCivile] = []
    var r: [Double?] = []
    let premier = try ajouterJours(J, -jours)
    for i in 0..<jours {
        dates.append(try ajouterJours(premier, i))
        r.append(i >= premierDefini ? 1.0 : nil)
    }
    return SerieRatioVue(date: dates, s7: dates.map { _ in 70 }, chronic: dates.map { _ in 70 }, r: r)
}

@Test func progressiviteNeTracePasLes29PremiersJours() throws {
    // 03, C1 et MINIMUMS : le ratio n'existe qu'à partir du 30e jour d'historique. Les 29 premiers jours ne sont pas tracés.
    let v = try vue(premierJour: try ajouterJours(J, -60), ratio: try serieRatio(jours: 60, premierDefini: 29))
    let selection = try selectionProgressivite(v, .semaines16)

    #expect(selection.points.count == 31) // 60 jours − 29 jours non tracés
    let premierTrace = try ajouterJours(J, -31)
    let veille = try ajouterJours(J, -1)
    #expect(selection.points.first?.date == premierTrace)
    #expect(selection.derniere?.date == veille)
}

@Test func progressiviteFenetreDeSeizeSemainesEtDeDouzeMois() throws {
    // 03, C1 : la fenêtre « 16 semaines » couvre 112 jours qui finissent à J−1 ; « 12 mois » en couvre 365.
    let v = try vue(premierJour: try ajouterJours(J, -200), ratio: try serieRatio(jours: 200, premierDefini: 0))

    let seize = try selectionProgressivite(v, .semaines16)
    #expect(seize.jours == 112)
    #expect(seize.points.count == 112)
    let debut112 = try ajouterJours(J, -112)
    #expect(seize.points.first?.date == debut112)

    let douze = try selectionProgressivite(v, .mois12)
    #expect(douze.points.count == 200)
}

@Test func etatsDuRatioEtDuFootingJugesSurLaValeurArrondie() throws {
    // D-015 et 05 : 1,3004 s'affiche 1,30, donc OK (jusqu'à 1,3 inclus) ; 1,31 est à surveiller ; au-delà de 1,5, alerte.
    // 89,6 % s'affiche 90 %, donc OK ; 74,4 % s'affiche 74 %, donc alerte.
    #expect(try etatRatio(1.3004) == .ok)
    #expect(try etatRatio(1.31) == .surveiller)
    #expect(try etatRatio(1.51) == .alerte)
    #expect(try etatFootingsSelecteur(89.6) == .ok)
    #expect(try etatFootingsSelecteur(74.6) == .surveiller)
    #expect(try etatFootingsSelecteur(74.4) == .alerte)
}

// MARK: - H1 · Sélection de la période de l'historique (03, H1 ; 04)

@Test func selectionHistoriqueDouzeVingtSixEtToutesSansSemaineFuture() throws {
    // 03, H1 : 12, 26 ou toutes les semaines de l'historique ; la semaine en cours est la dernière, jamais une future.
    let enCours = "2026-10-19" // lundi de la semaine de J (mercredi 21 octobre)
    let semaines: [SemaineVue] = try (0..<30).reversed().map { k in
        let lundi = try ajouterJours(enCours, -7 * k)
        return SemaineVue(
            lundi: lundi, statut: k == 0 ? .enCours : .terminee, km: 20, min: 120,
            minutes: Minutes(easy: 120, mp: 0, subt: 0, hard: 0), partSS: nil, nbSS: 0, charge: 0, monotonie: nil,
            contrainte: nil, conformiteFootings: nil, nbFootings: 0, nbFootingsConformes: 0, ratioDimanche: nil
        )
    }
    let v = try vue(semaines: semaines)

    let douze = try selectionHistorique(v, .douze)
    #expect(douze.semaines.count == 12)
    #expect(douze.semaines.last?.enCours == true)
    #expect(douze.aujourdhui.indiceSemaine == 11)
    #expect(douze.journal.first?.lundi == enCours)

    let vingtSix = try selectionHistorique(v, .vingtSix)
    #expect(vingtSix.semaines.count == 26)
    #expect(vingtSix.semaines.first?.lundi == semaines[4].lundi)

    let toutes = try selectionHistorique(v, .toutes)
    #expect(toutes.semaines.count == 30)
    #expect(toutes.semaines.allSatisfy { $0.lundi <= J })
    #expect(toutes.aujourdhui.jourDeSemaine == 2) // mercredi
}

// MARK: - D-019 : FC max observée

@Test func fcMaxObserveeRetientLePicLePlusHautDeLAnnee() throws {
    // D-019 : sur les séances de J−365 à J−1, le pic retenu est le plus haut (arrondi au bpm) ; la date est celle du pic.
    let v = try vue(seances: [
        try seance("2025-11-15", "footing", ["fcPic": 195]),
        try seance("2026-03-01", "footing", ["fcPic": 201.4]),
        try seance("2026-09-01", "footing", ["fcPic": 198]),
    ])
    let suggestion = try #require(try suggestionHrMax(v))
    #expect(suggestion.bpm == 201)
    #expect(suggestion.date == "2026-03-01")
    #expect(!suggestion.ecartSuspect) // 201 − 188 = 13, sous 15
}

@Test func fcMaxObserveeIgnoreLesSeancesAuDelaDUnAn() throws {
    // D-019 : la fenêtre commence à J−365 (incluse) : une séance plus ancienne, même plus haute, ne compte pas.
    let v = try vue(seances: [
        try seance("2025-10-20", "footing", ["fcPic": 230]), // J−366
        try seance("2025-10-21", "footing", ["fcPic": 196]), // J−365
    ])
    let suggestion = try #require(try suggestionHrMax(v))
    #expect(suggestion.bpm == 196)
    #expect(suggestion.date == "2025-10-21")
}

@Test func fcMaxObserveeEcartSuspectAuDelaDeQuinzeBpm() throws {
    // D-019 : l'écart est suspect quand le pic dépasse hrMax(J−1) de plus de 15 bpm (188 + 15 = 203).
    let a = try vue(seances: [try seance("2026-09-01", "footing", ["fcPic": 203])])
    #expect(try suggestionHrMax(a)?.ecartSuspect == false)
    let b = try vue(seances: [try seance("2026-09-01", "footing", ["fcPic": 204])])
    #expect(try suggestionHrMax(b)?.ecartSuspect == true)
}

@Test func fcMaxObserveeSuggereSeulementAuDelaDeLaMarge() throws {
    // D-019 : une suggestion n'est faite que si le pic atteint hrMax(J−1) + 3 bpm = 191.
    let sous = try vue(seances: [try seance("2026-09-01", "footing", ["fcPic": 190])])
    #expect(try suggestionHrMax(sous) == nil)
    let limite = try vue(seances: [try seance("2026-09-01", "footing", ["fcPic": 191])])
    #expect(try suggestionHrMax(limite)?.bpm == 191)
}
