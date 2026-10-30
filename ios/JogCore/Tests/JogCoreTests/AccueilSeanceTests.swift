import Foundation
import Testing
@testable import JogCore

// Lot 6 de la refonte de l'accueil (docs/implementation/refonte-accueil.md) : carte de séance hors course (S2).
// Tests à la frontière publique `cartesSeances` / `carteSeance`, sur des Vue dont les séances sont écrites ici.
// Règles citées : 04 « Carte de séance », D-025 (échantillon, minimum, verdicts), D-006 (paramètres à la date de la
// séance), D-015 (arrondi avant comparaison). Points de décision 1, 2 et 4 appliqués.

/// Paramètres de test : plafond des footings à 140 (easyCap), sous-seuil à 168 bpm de FC de fin, allure seuil 240 s/km.
private let parametres = ParamsDates(
    hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92,
    lt2Hr: 172, lt2Pace: 240, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)
private let parDefaut: ParamsAuJour = { _ in parametres }

/// Jour de la séance « cible » : toutes les dates des tests se calculent à partir de lui.
private let S = "2026-11-01"

private func jour(_ decalage: Int) throws -> DateCivile {
    try ajouterJours(S, decalage)
}

/// Séance de la Vue, de type donné. Les champs non renseignés sont absents (nil ou NaN), comme pour une séance sans mesure.
private func seance(
    _ cle: String, _ date: DateCivile, _ type: TypeSeance, fcMoy: Double? = nil, ef: Double? = nil, charge: Double = 0,
    repetitions: [Repetition] = [], decouplage: Decouplage? = nil, dPlus: Double? = nil
) -> SeanceVue {
    var intrinseque = SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 1_000_000, nom: nil, marquage: .aucun, duree_min: 40, km: 8,
        fcMoy: fcMoy, allureMoy_skm: nil, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: charge, mp_min: 0,
        segmentsMp: [], repetitions: repetitions, format: nil, recup_s: nil, ef: ef, fcPic: nil, decouplage: decouplage,
        lignesDroites: type == .footingLignesDroites, distanceRef_km: nil, temps_s: nil
    )
    intrinseque.dPlus_m = dPlus
    return SeanceVue(seance: Seance(intrinseque: intrinseque, type: type))
}

/// Répétition de test : allure en s/km, FC de fin en bpm.
private func repetition(allure: Double, fcFin: Double) -> Repetition {
    Repetition(n: 1, debut_s: 0, duree_s: 180, allure_skm: allure, fcFin: fcFin)
}

/// Découplage utilisable (ou non, si `valeur` est nil) d'une sortie longue.
private func decouplage(_ valeur: Double?) -> Decouplage {
    Decouplage(valeur: valeur, retenu_min: 70, total_min: 90, avecMp: false)
}

/// Vue portant exactement ces séances (les autres champs viennent d'une Vue vide).
private func vueAvec(_ seances: [SeanceVue]) throws -> Vue {
    var vue = try calculerVue(EntreeVue(intrinseques: [], parametres: parametresDefaut(), J: try jour(1), derniereSynchro: nil))
    vue.seances = seances
    return vue
}

/// Carte de la séance `cle`, ou échec si elle n'en a pas.
private func carte(_ seances: [SeanceVue], _ cle: String, _ paramsAuJour: ParamsAuJour = parDefaut) throws -> CarteSeance {
    try #require(try carteSeance(try vueAvec(seances), cleSource: cle, paramsAuJour))
}

/// Ligne d'une jauge de la carte, ou échec si la carte ne la porte pas.
private func jauge(_ carte: CarteSeance, _ cle: CleJauge) throws -> LigneJauge {
    try #require(carte.jauges.first { $0.cle == cle }?.ligne)
}

// MARK: - 04, Carte de séance : échantillon de référence

@Test func unFootingSeCompareAuxFootingsDesCinquanteSixJours() throws {
    // 04, « Carte de séance » et D-025 : l'échantillon de s est les séances du même type datées de s − 56 à s − 1.
    // Entrent : s − 56, s − 20, s − 5, s − 1 (FC 130, 132, 134, 136 ; moyenne 133). N'entrent pas : s − 57 (FC 100),
    // une autre séance du même jour s (FC 200), un sous-seuil de s − 10 (FC 500). Le trait est donc 133.
    let seances = [
        seance("s-56", try jour(-56), .footing, fcMoy: 130),
        seance("s-20", try jour(-20), .footing, fcMoy: 132),
        seance("s-5", try jour(-5), .footing, fcMoy: 134),
        seance("s-1", try jour(-1), .footing, fcMoy: 136),
        seance("s-57", try jour(-57), .footing, fcMoy: 100),
        seance("meme-jour", try jour(0), .footing, fcMoy: 200),
        seance("autre-type", try jour(-10), .sousSeuil, fcMoy: 500),
        seance("cible", try jour(0), .footing, fcMoy: 133),
    ]
    let fc = try jauge(try carte(seances, "cible"), .fcMoy)

    #expect(fc.trait == 133)
    #expect(fc.enCours == nil)
}

@Test func unSousSeuilSeCompareAuxSixPrecedentsQuelQuSoitLAnciennete() throws {
    // 04, « Carte de séance » : sous-seuil, les 6 séances sous-seuil précédentes, quelle que soit leur ancienneté. Les
    // six plus récentes (de s − 10 à s − 60, FC de fin 150) entrent, la septième (s − 70, FC de fin 200) n'entre pas.
    var seances: [SeanceVue] = []
    for k in 1...7 {
        let fcFin = k == 7 ? 200.0 : 150.0
        seances.append(seance("ss-\(k)", try jour(-10 * k), .sousSeuil, repetitions: [repetition(allure: 300, fcFin: fcFin)]))
    }
    seances.append(seance("cible", try jour(0), .sousSeuil, repetitions: [repetition(allure: 300, fcFin: 150)]))
    let fcFin = try jauge(try carte(seances, "cible"), .fcFinRepetitions)

    #expect(fcFin.trait == 150)
    #expect(fcFin.bande == 150...150)
}

@Test func moinsDeQuatreSeancesDeLEchantillonDonnentUneNormeEnCours() throws {
    // D-025 : trois footings dans l'échantillon → « Norme en cours (3 sur 4) » sur chaque jauge, sans trait ni bande.
    // Le verdict ne dépend pas de la norme : il est calculé (140 ≤ plafond 140 : « Bien facile »).
    let seances = [
        seance("f-10", try jour(-10), .footing, fcMoy: 140, ef: 0.80),
        seance("f-20", try jour(-20), .footing, fcMoy: 140, ef: 0.80),
        seance("f-30", try jour(-30), .footing, fcMoy: 140, ef: 0.80),
        seance("cible", try jour(0), .footing, fcMoy: 140, ef: 0.80),
    ]
    let c = try carte(seances, "cible")

    for cle in [CleJauge.fcMoy, .ef] {
        let ligne = try jauge(c, cle)
        #expect(ligne.enCours == MentionEnCours(n: 3, sur: 4))
        #expect(ligne.trait == nil)
        #expect(ligne.bande == nil)
    }
    #expect(c.verdict == .ok("Bien facile"))
}

@Test func quatreSeancesDeLEchantillonDonnentLaNorme() throws {
    // Borne D-025 : un échantillon de 4 séances donne une norme. FC 130, 132, 134, 136 : moyenne 133, écart-type 2,24,
    // bande 130,9–135,1 (arrondie à l'unité de bpm : 131–135).
    let seances = [
        seance("f-10", try jour(-10), .footing, fcMoy: 130),
        seance("f-20", try jour(-20), .footing, fcMoy: 132),
        seance("f-30", try jour(-30), .footing, fcMoy: 134),
        seance("f-40", try jour(-40), .footing, fcMoy: 136),
        seance("cible", try jour(0), .footing, fcMoy: 133),
    ]
    let fc = try jauge(try carte(seances, "cible"), .fcMoy)

    #expect(fc.enCours == nil)
    #expect(fc.trait == 133)
    #expect(fc.bande == 131...135)
}

@Test func lesLignesDroitesSeComparentAuxFootings() throws {
    // Point de décision 1 : footing-lignes-droites = famille footing. Son échantillon compte les footings et les lignes
    // droites : FC 130 (lignes droites, s − 10), 130, 136, 136 ; moyenne 133.
    let seances = [
        seance("ld-10", try jour(-10), .footingLignesDroites, fcMoy: 130),
        seance("f-20", try jour(-20), .footing, fcMoy: 130),
        seance("f-30", try jour(-30), .footing, fcMoy: 136),
        seance("f-40", try jour(-40), .footing, fcMoy: 136),
        seance("cible", try jour(0), .footingLignesDroites, fcMoy: 133, ef: 0.9),
    ]
    let c = try carte(seances, "cible")

    #expect(c.type == .footingLignesDroites)
    #expect(try jauge(c, .fcMoy).trait == 133)
    #expect(c.jauges.map(\.cle) == [.fcMoy, .ef])
}

// MARK: - 04, Carte de séance : verdicts par type

@Test func unFootingSeJugeAuPlafondDesFootingsAvecUneMarge() throws {
    // 04, « Carte de séance » : FC moyenne ≤ easyCap (145) : « Bien facile » ; ≤ 150 : « Un peu rapide » ; au-delà :
    // « Trop rapide ». Arrondi à l'unité avant comparaison (D-015) : 145,4 vaut 145. Demi-pas : 145,5 et 150,4 valent
    // 146 et 150 (« Un peu rapide ») ; 150,5 vaut 151 (« Trop rapide »).
    let plafond145 = ParamsDates(
        hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92,
        lt2Hr: 172, lt2Pace: 240, easyCap: 145, subtHrLo: 160, subtHrHi: 168
    )
    let parPlafond: ParamsAuJour = { _ in plafond145 }
    let cas: [(fc: Double, verdict: VerdictSeance)] = [
        (145, .ok("Bien facile")),
        (145.4, .ok("Bien facile")),
        (145.5, .surveiller("Un peu rapide")),
        (146, .surveiller("Un peu rapide")),
        (150, .surveiller("Un peu rapide")),
        (150.4, .surveiller("Un peu rapide")),
        (150.5, .alerte("Trop rapide")),
        (151, .alerte("Trop rapide")),
    ]
    for c in cas {
        let resultat = try carte([seance("cible", try jour(0), .footing, fcMoy: c.fc)], "cible", parPlafond)
        #expect(resultat.verdict == c.verdict, "FC \(c.fc)")
    }
}

@Test func leFootingGardeLePlafondDeSaDate() throws {
    // D-006 : une séance juge avec les paramètres en vigueur à sa date. Plafond 140 avant le 1er octobre, 150 après.
    // Un footing à 146 bpm du 1er septembre est « Trop rapide » ; un footing à 146 bpm de novembre est « Bien facile ».
    let apres = ParamsDates(
        hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92,
        lt2Hr: 172, lt2Pace: 240, easyCap: 150, subtHrLo: 160, subtHrHi: 168
    )
    let parDate: ParamsAuJour = { date in date < "2026-10-01" ? parametres : apres }
    let seances = [
        seance("ancien", "2026-09-01", .footing, fcMoy: 146),
        seance("recent", "2026-11-01", .footing, fcMoy: 146),
    ]
    let vue = try vueAvec(seances)

    #expect(try carteSeance(vue, cleSource: "ancien", parDate)?.verdict == .alerte("Trop rapide"))
    #expect(try carteSeance(vue, cleSource: "recent", parDate)?.verdict == .ok("Bien facile"))
}

@Test func unFootingSansFcAUnVerdictNeutre() throws {
    // Point de décision 2 : sans FC, pas de verdict OK par défaut. Pastille neutre « FC absente », jauge FC à « – ».
    let c = try carte([seance("cible", try jour(0), .footing, ef: 0.9)], "cible")

    #expect(c.verdict == .neutre("FC absente"))
    #expect(try jauge(c, .fcMoy).valeur == nil)
}

@Test func unSousSeuilSeJugeAuNombreDeRepetitionsHorsSousSeuil() throws {
    // 04, « Carte de séance » : 0 répétition hors sous-seuil : « Maîtrisée » ; 1 ou 2 : « Un peu haut » ; 3 ou plus :
    // « Au-dessus du seuil ». Hors sous-seuil : FC de fin au-dessus de subtHrHi (168). Allure 300 s/km, pas plus rapide.
    let dedans = repetition(allure: 300, fcFin: 160)
    let dehors = repetition(allure: 300, fcFin: 170)
    let cas: [(hors: Int, verdict: VerdictSeance)] = [
        (0, .ok("Maîtrisée")),
        (1, .surveiller("Un peu haut")),
        (2, .surveiller("Un peu haut")),
        (3, .alerte("Au-dessus du seuil")),
    ]
    for c in cas {
        let repetitions = [Repetition](repeating: dehors, count: c.hors) + [Repetition](repeating: dedans, count: 4 - c.hors)
        let resultat = try carte([seance("cible", try jour(0), .sousSeuil, repetitions: repetitions)], "cible")
        #expect(resultat.verdict == c.verdict, "\(c.hors) hors sous-seuil")
    }
}

@Test func unSousSeuilSansRepetitionAUnVerdictNeutre() throws {
    // Point de décision 2 : sans répétition, « zéro hors sous-seuil » ne vaut pas « Maîtrisée » : verdict neutre.
    let c = try carte([seance("cible", try jour(0), .sousSeuil)], "cible")

    #expect(c.verdict == .neutre("Répétitions absentes"))
}

@Test func leSousSeuilCompareLaFcDeFinEtLAllureNormalisee() throws {
    // 04, « Carte de séance » : jauges FC de fin (moyenne de la séance) puis allureNorm (écart en s/km). FC de référence
    // refHr = 164 : allureNorm = allure. Échantillon : 300, 302, 304, 306 s/km (moyenne 303) ; la séance vaut 304.
    var seances: [SeanceVue] = []
    for (indice, allure) in [300.0, 302, 304, 306].enumerated() {
        seances.append(seance("ss-\(indice)", try jour(-10 * (indice + 1)), .sousSeuil, repetitions: [repetition(allure: allure, fcFin: 164)]))
    }
    seances.append(seance("cible", try jour(0), .sousSeuil, repetitions: [repetition(allure: 304, fcFin: 164)]))
    let c = try carte(seances, "cible")

    #expect(c.jauges.map(\.cle) == [.fcFinRepetitions, .allureNorm])
    let allure = try jauge(c, .allureNorm)
    #expect(allure.trait == 303)
    #expect(allure.ecart == 1)
}

@Test func uneSortieLongueSeJugeAuDecouplageArrondi() throws {
    // 04, « Carte de séance » : découplage ≤ 5 % : « A tenu » ; ≤ 8 % : « Dérive en fin » ; au-delà : « Forte dérive ».
    // Arrondi au dixième avant comparaison (D-015) : 5,04 vaut 5,0.
    let cas: [(valeur: Double, verdict: VerdictSeance)] = [
        (5.0, .ok("A tenu")),
        (5.04, .ok("A tenu")),
        (5.1, .surveiller("Dérive en fin")),
        (8.0, .surveiller("Dérive en fin")),
        (8.1, .alerte("Forte dérive")),
    ]
    for c in cas {
        let resultat = try carte([seance("cible", try jour(0), .sortieLongue, decouplage: decouplage(c.valeur))], "cible")
        #expect(resultat.verdict == c.verdict, "découplage \(c.valeur)")
    }
}

@Test func uneSortieLongueSansDecouplageUtilisableALeVerdictNeutre() throws {
    // 04 : découplage non utilisable : « Découplage non mesurable », neutre. D+ absent : jauge « – » (D-025).
    let c = try carte([seance("cible", try jour(0), .sortieLongue, decouplage: decouplage(nil))], "cible")

    #expect(c.verdict == .neutre("Découplage non mesurable"))
    #expect(try jauge(c, .dPlus).valeur == nil)
}

@Test func leDPlusSAfficheEtSeComparaAuxSortiesLongues() throws {
    // D-025 : D+ en mètres, jauge après le découplage. Les sorties longues de l'échantillon ont 100, 120, 140, 160 m
    // (moyenne 130) ; la séance a 150 m. Le D+ est une jauge à deux côtés (point de décision 4).
    let seances = [
        seance("sl-10", try jour(-10), .sortieLongue, decouplage: decouplage(3), dPlus: 100),
        seance("sl-20", try jour(-20), .sortieLongue, decouplage: decouplage(3), dPlus: 120),
        seance("sl-30", try jour(-30), .sortieLongue, decouplage: decouplage(3), dPlus: 140),
        seance("sl-40", try jour(-40), .sortieLongue, decouplage: decouplage(3), dPlus: 160),
        seance("cible", try jour(0), .sortieLongue, decouplage: decouplage(3), dPlus: 150),
    ]
    let c = try carte(seances, "cible")

    #expect(c.jauges.map(\.cle) == [.decouplage, .dPlus])
    #expect(try jauge(c, .dPlus).trait == 130)
    #expect(try jauge(c, .dPlus).valeur == 150)
}

@Test func uneSeanceQualiteAUnVerdictNeutreEtDesJaugesFcEtCharge() throws {
    // Point de décision 1 : séance qualité aux répétitions estimées (D-021) : jauges FC moyenne et charge, verdict
    // neutre « Répétitions estimées ».
    let seances = [
        seance("q-10", try jour(-10), .seanceQualite, fcMoy: 150, charge: 40),
        seance("q-20", try jour(-20), .seanceQualite, fcMoy: 150, charge: 42),
        seance("q-30", try jour(-30), .seanceQualite, fcMoy: 150, charge: 44),
        seance("q-40", try jour(-40), .seanceQualite, fcMoy: 150, charge: 46),
        seance("cible", try jour(0), .seanceQualite, fcMoy: 152, charge: 43),
    ]
    let c = try carte(seances, "cible")

    #expect(c.verdict == .neutre("Répétitions estimées"))
    #expect(c.jauges.map(\.cle) == [.fcMoy, .charge])
    #expect(try jauge(c, .charge).trait == 43)
}

// MARK: - 04, Carte de séance : périmètre et cohérence

@Test func lesCoursesEtLesTestsNaurontPasDeCarteAvantLeLot7() throws {
    // Lot 6 « hors course » : course et test n'ont pas de carte ici (lot 7, 04 « Carte de course et de test »).
    let vue = try vueAvec([seance("course", try jour(0), .course, fcMoy: 170), seance("test", try jour(-1), .test, fcMoy: 170)])

    #expect(try cartesSeances(vue, parDefaut).isEmpty)
    #expect(try carteSeance(vue, cleSource: "course", parDefaut) == nil)
}

@Test func cartesSeancesDonneLeMemeResultatQueCarteSeanceSeanceParSeance() throws {
    // Le sélecteur groupé (index une fois par Vue) rend, séance par séance, ce que rend `carteSeance`.
    let seances = [
        seance("f-1", try jour(-1), .footing, fcMoy: 130, ef: 0.8),
        seance("f-2", try jour(-2), .footing, fcMoy: 134, ef: 0.82),
        seance("f-3", try jour(-3), .footing, fcMoy: 138, ef: 0.84),
        seance("f-4", try jour(-4), .footing, fcMoy: 151, ef: 0.86),
        seance("ss-1", try jour(-5), .sousSeuil, repetitions: [repetition(allure: 300, fcFin: 170)]),
        seance("sl-1", try jour(-6), .sortieLongue, decouplage: decouplage(6), dPlus: 90),
    ]
    let vue = try vueAvec(seances)
    let groupees = try cartesSeances(vue, parDefaut)

    #expect(groupees.count == seances.count)
    for s in seances {
        let seule = try carteSeance(vue, cleSource: s.cleSource, parDefaut)
        #expect(groupees[s.cleSource] == seule)
    }
}

// MARK: - Performance (lot 6, budget < 5 ms en release)

/// Durée d'un `Duration`, en millisecondes.
private func millisecondes(_ duree: Duration) -> Double {
    Double(duree.components.seconds) * 1_000 + Double(duree.components.attoseconds) * 1e-15
}

/// Lancement : JOG_PERF=1 swift test -c release --disable-sandbox --scratch-path /tmp/jogcore-A --filter mesure
@Test(.enabled(if: ProcessInfo.processInfo.environment["JOG_PERF"] == "1"))
func mesureCartesSeances() throws {
    // 2 000 séances sur 4 ans, types en rotation, FC et découplage variés.
    let types: [TypeSeance] = [.footing, .sousSeuil, .sortieLongue, .seanceQualite, .footingLignesDroites]
    var seances: [SeanceVue] = []
    for k in 0..<2_000 {
        let date = try ajouterJours("2022-11-01", k * 730 / 1_000)
        let type = types[k % types.count]
        let reps = type == .sousSeuil ? [repetition(allure: 300 + Double(k % 7), fcFin: 160 + Double(k % 12))] : []
        seances.append(seance("s-\(k)", date, type, fcMoy: 130 + Double(k % 20), ef: 0.8 + Double(k % 9) / 100,
                              charge: Double(40 + k % 30), repetitions: reps,
                              decouplage: type == .sortieLongue ? decouplage(Double(k % 10)) : nil, dPlus: Double(k % 300)))
    }
    let vue = try vueAvec(seances)

    for _ in 0..<3 {
        _ = try cartesSeances(vue, parDefaut)
    }
    let debut = ContinuousClock.now
    for _ in 0..<20 {
        _ = try cartesSeances(vue, parDefaut)
    }
    let moyenne = millisecondes(ContinuousClock.now - debut) / 20
    print(String(format: "cartesSeances (2 000 séances, 4 ans, moyenne sur 20 itérations) : %.3f ms", moyenne))
    #expect(moyenne < 5)
}
