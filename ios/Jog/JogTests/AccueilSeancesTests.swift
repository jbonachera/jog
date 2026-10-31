// Tests de ModeleSeances (app, dossier Accueil) : cartes de séance (S2) et en-têtes de semaine (S1), marquage (D-020).
// 03 S1 et S2, 04 « Carte de séance », D-025 (verdicts et bornes), D-026 (semaine en cours), D-015 (arrondi), point de
// décision 11 (phrase habituelle), 15 (mention de la course), 16 (année hors de l'année en cours). Fixtures construites par
// code, sans donnée réelle. Aujourd'hui (J) : 2026-10-30, donc A = 2026-10-29 (jeudi). Fuseau : Europe/Paris (CET).
import Foundation
import Testing
@testable import JogCore
@testable import Jog

private let aujourdhui: DateCivile = "2026-10-30"
private let paris = TimeZone(identifier: "Europe/Paris")!

/// Paramètres de test : plafond des footings à 140 bpm (easyCap).
private let parametres = ParamsDates(
    hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92, lt2Hr: 172, lt2Pace: 240, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)
private let parDefaut: ParamsAuJour = { _ in parametres }

/// Séance de la Vue. Les champs non renseignés restent absents, comme pour une séance sans mesure.
private func seance(
    _ cle: String, _ date: DateCivile, _ type: TypeSeance, debutUtc: Double = 0, km: Double = 10, dureeMin: Double = 58,
    allure: Double? = nil, fcMoy: Double? = nil, ef: Double? = nil, repetitions: [Repetition] = [], format: String? = nil,
    distance: Double? = nil, temps: Double? = nil, marquage: Marquage = .aucun
) -> SeanceVue {
    SeanceVue(seance: Seance(
        intrinseque: SeanceIntrinseque(
            cleSource: cle, date: date, debutUtc: debutUtc, nom: nil, marquage: marquage, duree_min: dureeMin, km: km,
            fcMoy: fcMoy, allureMoy_skm: allure, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: 0, mp_min: 0,
            segmentsMp: [], repetitions: repetitions, format: format, recup_s: nil, ef: ef, fcPic: nil, decouplage: nil,
            lignesDroites: false, distanceRef_km: distance, temps_s: temps
        ),
        type: type
    ))
}

/// Vue portant exactement ces séances (les autres champs viennent d'une Vue vide).
private func vueAvec(_ seances: [SeanceVue]) -> Vue {
    var vue = Vue.vide(J: aujourdhui)
    vue.seances = seances
    return vue
}

/// Carte affichée de la séance `cle`, jugée par le moteur (cartesSeances) puis mise en forme.
private func carte(_ cle: String, dans seances: [SeanceVue], fuseau: TimeZone = paris) throws -> ModeleSeances.Carte {
    let cartes = try cartesSeances(vueAvec(seances), parDefaut)
    let s = try #require(seances.first { $0.cleSource == cle })
    let c = try #require(cartes[cle])
    return ModeleSeances.carte(s, c, J: aujourdhui, fuseau: fuseau)
}

/// Quatre footings de la semaine précédente (FC 134 à 140, moyenne 137 ; EF 1,66 à 1,72, moyenne 1,69).
private var footingsDeReference: [SeanceVue] {
    [
        seance("f1", "2026-10-22", .footing, fcMoy: 134, ef: 1.66),
        seance("f2", "2026-10-23", .footing, fcMoy: 136, ef: 1.68),
        seance("f3", "2026-10-24", .footing, fcMoy: 138, ef: 1.70),
        seance("f4", "2026-10-25", .footing, fcMoy: 140, ef: 1.72),
    ]
}

/// Un instant de la journée, en millisecondes UTC (debutUtc), à partir d'un ISO 8601 en UTC.
private func instant(_ iso: String) throws -> Double {
    try #require(ModeleApercu.instantISO(iso)).timeIntervalSince1970 * 1000
}

/// Semaine de S1 construite par code (SemaineAccueil a un init public).
private func semaine(
    lundi: DateCivile = "2026-10-26", enCours: Bool = true, km: Double = 37.4, min: Double = 187,
    nbSeances: Int = 3, nbSousSeuil: Int = 1, minSS: Double = 40, partSS: Double? = 0.21,
    minutes: Minutes = Minutes(easy: 72, mp: 0, subt: 40, hard: 7), courses: [String] = []
) -> SemaineAccueil {
    SemaineAccueil(
        lundi: lundi, enCours: enCours, km: km, min: min, minutes: minutes, nbSeances: nbSeances,
        nbSousSeuil: nbSousSeuil, minSS: minSS, partSS: partSS, seances: [], courses: courses
    )
}

// MARK: - Titres (S2)

// 04, Carte de séance : le titre suit le type ; le sous-seuil reprend son format (5×8′), la course et le test leur distance.
@Test func lesTitresDeCarteSuiventLeTypeEtLeFormat() throws {
    let seances = [
        seance("ft", "2026-10-29", .footing),
        seance("ss", "2026-10-29", .sousSeuil, format: "5×8′"),
        seance("sl", "2026-10-29", .sortieLongue),
        seance("co", "2026-10-29", .course, distance: 10, temps: 2260, marquage: .course),
        seance("te", "2026-10-29", .test, distance: 5, temps: 1080, marquage: .test),
    ]
    #expect(try carte("ft", dans: seances).titre == "Footing")
    #expect(try carte("ss", dans: seances).titre == "Sous-seuil 5×8′")
    #expect(try carte("sl", dans: seances).titre == "Sortie longue")
    #expect(try carte("co", dans: seances).titre == "Course · 10 km")
    #expect(try carte("te", dans: seances).titre == "Test 5 km")
}

// MARK: - Quand (S2)

// 04, Carte de séance : « auj. 12:15 » pour la séance d'aujourd'hui (A), « mer. 28 · 18:05 » dans l'année, avec l'année au-delà.
@Test func laSeanceDAujourdhuiSAfficheAvecSonHeure() throws {
    let seances = [seance("ft", "2026-10-29", .footing, debutUtc: try instant("2026-10-29T11:15:00Z"))]
    #expect(try carte("ft", dans: seances).quand == "auj. 12:15")
}

// 04, Carte de séance : une séance de l'année s'écrit « jour semaine + quantième · heure » (heure de Paris, pas UTC).
@Test func uneSeanceDeLAnneeSAfficheSonJourEtSonHeureLocale() throws {
    let seances = [seance("ft", "2026-10-28", .footing, debutUtc: try instant("2026-10-28T17:05:00Z"))]
    #expect(try carte("ft", dans: seances).quand == "mer. 28 · 18:05")
    #expect(try carte("ft", dans: seances, fuseau: TimeZone(identifier: "UTC")!).quand == "mer. 28 · 17:05")
}

// 04, Carte de séance : une séance datée de plus d'un an (365 jours, ACCUEIL) porte son année.
@Test func uneSeanceDePlusDUnAnAfficheSonAnnee() throws {
    let seances = [seance("ft", "2025-10-20", .footing, debutUtc: try instant("2025-10-20T16:05:00Z"))]
    #expect(try carte("ft", dans: seances).quand == "lun. 20 oct. 2025 · 18:05")
}

// MARK: - Méta (S2)

// 04, Carte de séance : footing « km · durée · allure » ; durée en minutes sous l'heure, puis h mm.
@Test func lUnFootingAfficheKmDureeEtAllure() throws {
    let seances = [seance("ft", "2026-10-29", .footing, km: 10.2, dureeMin: 58, allure: 341)]
    #expect(try carte("ft", dans: seances).meta == "10,2 km · 58 min · 5:41/km")
}

// 04, Carte de séance : sous-seuil, l'allure est celle des répétitions (rép. 3:52/km), durée en h mm.
@Test func unSousSeuilAfficheLAllureDesRepetitions() throws {
    let repetitions = [
        Repetition(n: 1, debut_s: 0, duree_s: 480, allure_skm: 232, fcFin: 166),
        Repetition(n: 2, debut_s: 600, duree_s: 480, allure_skm: 232, fcFin: 167),
    ]
    let seances = [seance("ss", "2026-10-29", .sousSeuil, km: 14.8, dureeMin: 67, repetitions: repetitions, format: "2×8′")]
    #expect(try carte("ss", dans: seances).meta == "14,8 km · 1 h 07 · rép. 3:52/km")
}

// 04, Carte de séance : une course affiche son temps (h:mm:ss au-delà de l'heure) et son allure, sans kilométrage.
@Test func uneCourseAfficheSonTempsEtSonAllure() throws {
    let seances = [seance("co", "2026-10-29", .course, allure: 226, distance: 10, temps: 2260, marquage: .course)]
    #expect(try carte("co", dans: seances).meta == "37:40 · 3:46/km")
}

// MARK: - Couleur de type (S2)

// 08, rampe d'intensité : footing et footing en lignes droites en facile, sous-seuil en sous-seuil, sortie longue en
// allure marathon, course et test au-dessus du seuil.
@Test func chaqueTypeAUneCouleurDeZone() {
    #expect(ModeleSeances.zone(.footing) == .facile)
    #expect(ModeleSeances.zone(.footingLignesDroites) == .facile)
    #expect(ModeleSeances.zone(.sousSeuil) == .sousSeuil)
    #expect(ModeleSeances.zone(.sortieLongue) == .marathon)
    #expect(ModeleSeances.zone(.course) == .auDessus)
    #expect(ModeleSeances.zone(.test) == .auDessus)
}

// MARK: - Verdict (S2, D-025)

// 04, Carte de séance : un footing à la FC de plafond reste « Bien facile » (borne incluse), 5 bpm au-dessus « Un peu
// rapide », puis « Trop rapide ». Le ton suit le verdict (08 : la couleur ne porte pas seule l'état).
@Test func lesBornesDuVerdictDUnFootingSontTestees() throws {
    let bien = [seance("ft", "2026-10-29", .footing, fcMoy: 140)]
    let peuRapide = [seance("ft", "2026-10-29", .footing, fcMoy: 145)]
    let trop = [seance("ft", "2026-10-29", .footing, fcMoy: 146)]
    #expect(try carte("ft", dans: bien).verdict == "Bien facile")
    #expect(try carte("ft", dans: bien).ton == .bon)
    #expect(try carte("ft", dans: peuRapide).verdict == "Un peu rapide")
    #expect(try carte("ft", dans: peuRapide).ton == .attention)
    #expect(try carte("ft", dans: trop).verdict == "Trop rapide")
    #expect(try carte("ft", dans: trop).ton == .mauvais)
}

// 04, Carte de séance : une donnée absente donne un verdict neutre, jamais un OK par défaut (point de décision 2).
@Test func sansFcLeVerdictEstNeutre() throws {
    let seances = [seance("ft", "2026-10-29", .footing)]
    let c = try carte("ft", dans: seances)
    #expect(c.verdict == "FC absente")
    #expect(c.ton == .neutre)
}

// Les quatre verdicts du moteur ont chacun un ton (08) et leur texte, sans relancer le moteur.
@Test func leTonSuitLeVerdictDuMoteur() {
    #expect(ModeleSeances.verdict(.ok("Maîtrisée")).ton == .bon)
    #expect(ModeleSeances.verdict(.surveiller("Dérive en fin")).ton == .attention)
    #expect(ModeleSeances.verdict(.alerte("Trop rapide")).ton == .mauvais)
    #expect(ModeleSeances.verdict(.neutre("Sans VDOT")).ton == .neutre)
    #expect(ModeleSeances.verdict(.neutre("Sans VDOT")).texte == "Sans VDOT")
}

// MARK: - Jauges (S2, lot 12)

// 04, Carte de séance : deux jauges pour un footing, dans l'ordre FC moyenne puis efficacité. L'écart suit les décimales
// de la jauge (une efficacité s'écrit à deux décimales, « +0,03 »), et la FC à l'unité (« +1 »).
@Test func unFootingAMesDeuxJaugesFcEtEfficaciteAvecLeursEcarts() throws {
    let seances = footingsDeReference + [seance("ft", "2026-10-29", .footing, fcMoy: 138, ef: 1.72)]
    let c = try carte("ft", dans: seances)
    #expect(c.jauges.map(\.libelle) == ["FC moy.", "Efficacité"])
    #expect(c.jauges.map(\.valeur) == ["138 bpm", "1,72"])
    #expect(c.jauges.map(\.ecart) == ["+1", "+0,03"])
}

// 04, Carte de séance : une jauge sans échantillon suffisant affiche sa mention « en cours » (D-026).
@Test func uneJaugeSansEchantillonAfficheNormeEnCours() throws {
    let seances = [seance("ft", "2026-10-29", .footing, fcMoy: 138)]
    let jauge = try #require(try carte("ft", dans: seances).jauges.first)
    #expect(jauge.phrase == "Norme en cours (0 sur 4)")
}

// MARK: - Estimation du jour (S2)

// S2 : la carte porte « aujourd'hui » seulement pour la date A (J − 1, D-022).
@Test func laCarteDAujourdhuiEstLaSeanceDeLaVeille() throws {
    let seances = [
        seance("auj", "2026-10-29", .footing),
        seance("hier", "2026-10-28", .footing),
    ]
    #expect(try carte("auj", dans: seances).estDuJour)
    #expect(try carte("hier", dans: seances).estDuJour == false)
}

// MARK: - En-tête de semaine (S1)

// 03 S1, D-026 : la semaine en cours s'appelle « Cette semaine ».
@Test func laSemaineEnCoursSAppelleCetteSemaine() {
    let entete = ModeleSeances.enTete(semaine(enCours: true), J: aujourdhui, seances: [])
    #expect(entete.titre == "Cette semaine")
}

// 03 S1 : une autre semaine s'écrit « Sem. du lundi » ; l'année s'ajoute hors de l'année en cours (point de décision 16).
@Test func uneAutreSemaineSAppelleParSonLundi() {
    let entete = ModeleSeances.enTete(semaine(lundi: "2026-10-20", enCours: false), J: aujourdhui, seances: [])
    #expect(entete.titre == "Sem. du 20 oct.")
}

// Point de décision 16 : une semaine d'une autre année porte son année.
@Test func uneSemaineDUneAutreAnneePorteSonAnnee() {
    let entete = ModeleSeances.enTete(semaine(lundi: "2025-12-29", enCours: false), J: aujourdhui, seances: [])
    #expect(entete.titre == "Sem. du 29 déc. 2025")
}

// 03 S1 : « 37,4 km · 3 h 07 », « 3 séances · 1 seuil · 40′ sous-seuil (21\u{00A0}%) ».
@Test func lEnteteAfficheLeVolumeEtLeResumeDeLaSemaine() {
    let entete = ModeleSeances.enTete(semaine(), J: aujourdhui, seances: [])
    #expect(entete.kmDuree == "37,4 km · 3 h 07")
    #expect(entete.resume == "3 séances · 1 seuil · 40′ sous-seuil (21\u{00A0}%)")
}

// 03 S1 : sans séance, le résumé dit « aucune séance ».
@Test func uneSemaineSansSeanceLDitAucuneSeance() {
    let vide = semaine(km: 0, min: 0, nbSeances: 0, nbSousSeuil: 0, minSS: 0, partSS: nil)
    #expect(ModeleSeances.enTete(vide, J: aujourdhui, seances: []).resume == "aucune séance")
}

// Point de décision 15 : une semaine qui contient une course garde son résumé et ajoute « dont course 10 km · 37:40 ».
@Test func laCourseSAjouteAuResumeSansLeRemplacer() {
    let course = seance("co", "2026-10-25", .course, allure: 226, distance: 10, temps: 2260, marquage: .course)
    let entete = ModeleSeances.enTete(
        semaine(nbSeances: 2, nbSousSeuil: 0, minSS: 0, partSS: nil, courses: ["co"]), J: aujourdhui, seances: [course]
    )
    #expect(entete.resume == "2 séances · dont course 10 km · 37:40")
}

// 04, « Répartition » (S1) : quatre parts dans l'ordre Facile, Allure marathon, Sous-seuil, Au-dessus, somme 1 ; toutes
// nulles sans minute.
@Test func laRepartitionAQuatrePartsDansLOrdreEtFaitUn() {
    let repartition = ModeleSeances.enTete(
        semaine(minutes: Minutes(easy: 60, mp: 0, subt: 30, hard: 10)), J: aujourdhui, seances: []
    ).repartition
    #expect(repartition == [0.6, 0, 0.3, 0.1])
    let vide = ModeleSeances.enTete(semaine(minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0)), J: aujourdhui, seances: [])
    #expect(vide.repartition == [0, 0, 0, 0])
}

// MARK: - Marquage (D-020)

// Déplacées depuis ModeleApercu avec leurs fonctions : mêmes assertions.

@Test func uneSeanceNonMarqueeProposeLesDeuxMarquages() {
    #expect(ModeleSeances.optionsMarquage(.aucun).map(\.titre) == ["Marquer comme course", "Marquer comme test"])
    #expect(ModeleSeances.optionsMarquage(.inconnu).map(\.titre) == ["Marquer comme course", "Marquer comme test"])
}

@Test func uneCourseProposeLeTestEtLeRetrait() {
    let options = ModeleSeances.optionsMarquage(.course)
    #expect(options.map(\.titre) == ["Marquer comme test", "Retirer le marquage"])
    #expect(options.map(\.valeur) == [.test, nil])
}

@Test func unTestProposeLaCourseEtLeRetrait() {
    let options = ModeleSeances.optionsMarquage(.test)
    #expect(options.map(\.titre) == ["Marquer comme course", "Retirer le marquage"])
    #expect(options.map(\.valeur) == [.course, nil])
}

@Test func lesValeursEnregistrentLeMarquageChoisi() {
    #expect(ModeleSeances.optionsMarquage(.aucun).map(\.valeur) == [.course, .test])
}

@Test func lePastilleSuitLeMarquageCourant() {
    #expect(ModeleSeances.libelleMarquage(.course) == "Course")
    #expect(ModeleSeances.libelleMarquage(.test) == "Test")
    #expect(ModeleSeances.libelleMarquage(.aucun) == nil)
    #expect(ModeleSeances.libelleMarquage(.inconnu) == nil)
}

@Test func lEnteteDuMenuNommeLeMarquageActuel() {
    #expect(ModeleSeances.libelleMarquageActuel(.course) == "Marquage actuel : Course")
    #expect(ModeleSeances.libelleMarquageActuel(.aucun) == "Marquage actuel : aucun")
}

@Test func lActionVoiceOverNommeLaSeanceQuandLeJourEnComptePlusieurs() {
    let seance = SeanceAffichee(id: "k", titre: "Sous-seuil", marquage: .aucun)
    let option = ModeleSeances.optionsMarquage(.aucun)[0]
    #expect(ModeleSeances.libelleAction(option, seance: seance, plusieurs: false) == "Marquer comme course")
    #expect(ModeleSeances.libelleAction(option, seance: seance, plusieurs: true) == "Marquer comme course : Sous-seuil")
}

// MARK: - Phrase habituelle avec la taille de l'échantillon (point de décision 11)

// Point de décision 11 : « 4 footings des 8 dernières semaines, habituel 135–139 bpm » ; la bande est arrondie à l'unité
// (D-015) : 137 ± 0,95 × 2,236 donne 134,9 à 139,1.
@Test func laPhraseHabituelleDUnFootingNommeLEchantillon() throws {
    let seances = footingsDeReference + [seance("ft", "2026-10-29", .footing, fcMoy: 138, ef: 1.72)]
    let c = try carte("ft", dans: seances)
    #expect(c.jauges.map(\.phrase) == [
        "4 footings des 8 dernières semaines, habituel 135–139 bpm",
        "4 footings des 8 dernières semaines, habituel 1,67–1,71",
    ])
}

// MARK: - Formats des gabarits non couverts (carte construite à la main)

/// Jauge de carte construite à la main : les champs de LigneJauge sont ceux du moteur, sans passer par lui.
private func jaugeMain(
    _ cle: CleJauge, valeur: Double, trait: Double?, bande: ClosedRange<Double>?, ecart: Double?, n: Int?
) -> JaugeSeance {
    JaugeSeance(cle: cle, ligne: LigneJauge(
        valeur: valeur, valeurAffichee: valeur, trait: trait, bande: bande, ecart: ecart, horsBande: false, n: n
    ))
}

// 04, Carte de séance (sous-seuil) : deux jauges, FC de fin de répétition puis allure normalisée. L'allure s'écrit m:ss,
// son écart en secondes signées (« −2 s »), et la phrase nomme les 6 séances sous-seuil précédentes.
@Test func lesJaugesDUnSousSeuilSontDansLOrdreAvecLeurFormat() throws {
    let s = seance("ss", "2026-10-29", .sousSeuil, km: 14.8, dureeMin: 67, format: "2×8′")
    let c = CarteSeance(cleSource: "ss", type: .sousSeuil, verdict: .ok("Maîtrisée"), jauges: [
        jaugeMain(.fcFinRepetitions, valeur: 166, trait: 165, bande: 163...168, ecart: 1, n: 6),
        jaugeMain(.allureNorm, valeur: 234, trait: 236, bande: 230...242, ecart: -2, n: 6),
    ])
    let jauges = ModeleSeances.carte(s, c, J: aujourdhui, fuseau: paris).jauges
    #expect(jauges.map(\.libelle) == ["FC fin", "Allure"])
    #expect(jauges.map(\.valeur) == ["166 bpm", "3:54"])
    #expect(jauges.map(\.ecart) == ["+1", "−2 s"])
    #expect(jauges[1].phrase == "6 séances sous-seuil précédentes, habituel 3:50–4:02")
}

// 04, Carte de séance (sortie longue) : découplage en pourcentage (« 6,1 % », écart « +1,9 »), puis D+ en mètres
// (« 212 m », écart « +40 m »), dans cet ordre.
@Test func lesJaugesDUneSortieLongueSontDansLOrdreAvecLeurFormat() throws {
    let s = seance("sl", "2026-10-29", .sortieLongue, km: 21, dureeMin: 120)
    let c = CarteSeance(cleSource: "sl", type: .sortieLongue, verdict: .surveiller("Dérive en fin"), jauges: [
        jaugeMain(.decouplage, valeur: 6.1, trait: 4.2, bande: 4.0...7.0, ecart: 1.9, n: 5),
        jaugeMain(.dPlus, valeur: 212, trait: 172, bande: 150...230, ecart: 40, n: 5),
    ])
    let jauges = ModeleSeances.carte(s, c, J: aujourdhui, fuseau: paris).jauges
    #expect(jauges.map(\.libelle) == ["Découpl.", "D+"])
    #expect(jauges.map(\.valeur) == ["6,1\u{00A0}%", "212 m"])
    #expect(jauges.map(\.ecart) == ["+1,9", "+40 m"])
    #expect(jauges[0].phrase == "5 sorties longues des 8 dernières semaines, habituel 4,0–7,0\u{00A0}%")
}

// 04, Carte de séance (course) : VDOT à un chiffre décimal, puis charge en « × » sans écart (point de décision 5).
@Test func lesJaugesDUneCourseSontLeVdotEtLaChargeEnFois() throws {
    let s = seance("co", "2026-10-29", .course, distance: 10, temps: 2260, marquage: .course)
    let c = CarteSeance(cleSource: "co", type: .course, verdict: .ok("Conforme"), jauges: [
        jaugeMain(.vdot, valeur: 51.3, trait: 51.0, bande: 50.5...51.5, ecart: 0.3, n: nil),
        jaugeMain(.charge, valeur: 2.1, trait: 1, bande: 0.8...1.2, ecart: nil, n: 5),
    ])
    let jauges = ModeleSeances.carte(s, c, J: aujourdhui, fuseau: paris).jauges
    #expect(jauges.map(\.libelle) == ["VDOT", "Charge"])
    #expect(jauges[0].valeur == "51,3")
    #expect(jauges[0].ecart == "+0,3")
    #expect(jauges[1].valeur == "2,1×")
    #expect(jauges[1].ecart == "")
    #expect(jauges[1].phrase == "5 séances sous-seuil des 8 dernières semaines, habituel 0,8–1,2×")
}

// MARK: - Bornes « plus d'un an » (S2)

// 04, Carte de séance : à exactement 365 jours de A, la date n'a pas d'année (borne ACCUEIL.joursIlYAUnAn incluse).
@Test func uneSeanceA365JoursNAPasLAnnee() throws {
    let s = seance("ft", "2025-10-29", .footing, debutUtc: try instant("2025-10-29T17:05:00Z"))
    #expect(ModeleSeances.quand(s, J: aujourdhui, fuseau: paris) == "mer. 29 · 18:05")
}

// 04, Carte de séance : à 366 jours de A, la date porte son année.
@Test func uneSeanceA366JoursAPorteSonAnnee() throws {
    let s = seance("ft", "2025-10-28", .footing, debutUtc: try instant("2025-10-28T17:05:00Z"))
    #expect(ModeleSeances.quand(s, J: aujourdhui, fuseau: paris) == "mar. 28 oct. 2025 · 18:05")
}

// MARK: - Résumé de semaine sans sous-seuil (S1)

// 03 S1 : sans sous-seuil (nbSousSeuil == 0), le résumé ne donne que le nombre de séances, sans détail seuil ni sous-seuil.
@Test func unResumeSansSousSeuilNeDonneQueLeNombreDeSeances() {
    let entete = ModeleSeances.enTete(
        semaine(nbSeances: 2, nbSousSeuil: 0, minSS: 0, partSS: nil), J: aujourdhui, seances: []
    )
    #expect(entete.resume == "2 séances")
}

// MARK: - Accueil (lot 18) : ordre des blocs, sections par semaine, sélecteur de mois, destinations

// 02, « Contenu par onglet » ; 03 : l'ordre est N1, A5, A2, puis S1, avec ou sans séance du jour, avec ou sans nuit.
// Seule l'absence totale de séance ajoute le message d'accueil, en tête.
@Test func lOrdreDesBlocsNeChangePasAvecLaSeanceOuLaNuit() throws {
    let nuits = try nuitsExemple(.normal, aujourdhui: aujourdhui)
    let recuperation = try #require(try calculerRecuperation(nuits, derniereSession: nil, aujourdhui: aujourdhui))
    let seanceDuJour = seance("a", "2026-10-30", .footing, fcMoy: 134, ef: 1.66)
    for seances in [[], [seanceDuJour]] {
        for avecNuit in [false, true] {
            var vue = vueAvec(seances)
            if avecNuit {
                vue.recuperation = recuperation
            }
            let blocs = ModeleAccueil.blocs(sansDonnees: vue.seances.isEmpty)
            #expect(blocs == (seances.isEmpty ? [.sansDonnees] : []) + ModeleAccueil.ordre)
        }
    }
}

// 03, S1 : une semaine sans séance (en cours, ou absente de l'historique) garde sa feuille : une ligne vide à son lundi,
// avec zéro kilomètre et sans type ni course, au lieu de « Pas de semaine ».
@Test func laSemaineSansSeanceAUneLigneVideAMonLundi() {
    let ligne = ModeleHistorique.semaine([:], vue: vueAvec([]), lundi: "2026-10-26")
    #expect(ligne.id == "2026-10-26")
    #expect(ligne.enCours)
    #expect(ligne.km == 0)
    #expect(ligne.types.isEmpty)
    #expect(ligne.courses.isEmpty)
}

// 03, Accueil : sans aucune donnée, A2 dit « Pas encore de verdict », A5 n'a aucune ligne, et S1 ne garde que la semaine
// en cours, qui dit « aucune séance ».
@MainActor @Test func laVueVideDonneUnAccueilSansLignes() {
    let calculs = CacheAccueil().calculs(Vue.vide(J: aujourdhui), besoin_min: BesoinSommeil.defaut, cartes: CacheCartes())
    #expect(calculs.verdict.texte == "Pas encore de verdict")
    #expect(calculs.recuperation.isEmpty)
    #expect(calculs.etatRecuperation == nil)
    #expect(calculs.sections.map(\.id) == ["2026-10-26"])
    #expect(calculs.sections[0].entete.resume == "aucune séance")
    #expect(calculs.sections[0].cartes.isEmpty)
}

// 03, S1 : une section par semaine, la plus récente en premier ; chaque section porte les cartes de sa semaine, dans
// l'ordre de la semaine. La séance de la veille (A) porte le contour du jour (S2).
@Test func chaqueSemaineAUneSectionAvecSesCartes() throws {
    let seances = [
        seance("a", "2026-10-29", .footing, fcMoy: 134, ef: 1.66),
        seance("b", "2026-10-27", .footing, fcMoy: 136, ef: 1.68),
        seance("c", "2026-10-21", .footing, fcMoy: 138, ef: 1.70),
    ]
    let cartes = try cartesSeances(vueAvec(seances), parDefaut)
    var courante = semaine(lundi: "2026-10-26", enCours: true)
    courante.seances = ["a", "b"]
    var precedente = semaine(lundi: "2026-10-19", enCours: false)
    precedente.seances = ["c"]

    let sections = ModeleAccueil.sections(
        semaines: [courante, precedente], seances: seances, cartes: cartes, J: aujourdhui, fuseau: paris
    )

    #expect(sections.map(\.id) == ["2026-10-26", "2026-10-19"])
    #expect(sections[0].entete.titre == "Cette semaine")
    #expect(sections[0].cartes.map(\.id) == ["a", "b"])
    #expect(sections[0].cartes.map(\.estDuJour) == [true, false])
    #expect(sections[1].cartes.map(\.id) == ["c"])
}

// 03, S1 : sans aucune séance, la semaine en cours reste seule, avec « aucune séance ».
@Test func sansSeanceLaSemaineEnCoursResteAvecAucuneSeance() {
    let semaines = ModeleAccueil.semainesAffichees([], lundiDeA: "2026-10-26")
    #expect(semaines.map(\.lundi) == ["2026-10-26"])
    #expect(semaines[0].enCours)

    let sections = ModeleAccueil.sections(semaines: semaines, seances: [], cartes: [:], J: aujourdhui, fuseau: paris)
    #expect(sections[0].entete.titre == "Cette semaine")
    #expect(sections[0].entete.resume == "aucune séance")
    #expect(sections[0].cartes.isEmpty)
}

// 03, S1 : quand la Vue a des semaines, elles sont gardées telles quelles.
@Test func lesSemainesCalculeesNeSontPasChangees() {
    let existantes = [semaine(lundi: "2026-10-26")]
    #expect(ModeleAccueil.semainesAffichees(existantes, lundiDeA: "2026-10-26") == existantes)
}

// 02, « Règles d'Aujourd'hui » et point de décision 8 : le sélecteur de mois liste chaque mois une fois, du plus récent,
// et saute à la semaine la plus récente de ce mois.
@Test func leSelecteurDeMoisSauteALaSemaineLaPlusRecenteDuMois() {
    let semaines = ["2026-10-26", "2026-10-19", "2026-09-28", "2026-09-21"].map { semaine(lundi: $0, enCours: false) }
    let sections = ModeleAccueil.sections(semaines: semaines, seances: [], cartes: [:], J: aujourdhui, fuseau: paris)

    let mois = ModeleAccueil.mois(sections)

    #expect(mois.map(\.titre) == ["Octobre 2026", "Septembre 2026"])
    #expect(mois.map(\.cible) == ["2026-10-26", "2026-09-28"])
}

// 03, Accueil : chaque élément ouvre son écran (02, « Écrans de détail ») ; la pastille du verdict empile Décision, la
// carte Récupération Récupération, une carte de séance Séance, un en-tête la semaine (point de décision 8).
@Test func chaqueElementDeLAccueilOuvreSonEcran() {
    #expect(ModeleAccueil.destination(de: .niveau) == .courses)
    #expect(ModeleAccueil.destination(de: .recuperation) == .recuperation)
    #expect(ModeleAccueil.destination(de: .verdict) == .decision)
    #expect(ModeleAccueil.destination(de: .entete("2026-10-26")) == .semaine(lundi: "2026-10-26"))
    #expect(ModeleAccueil.destination(de: .seance("a")) == .seance(cleSource: "a"))
}
