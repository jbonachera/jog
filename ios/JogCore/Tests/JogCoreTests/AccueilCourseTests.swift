import Foundation
import Testing
@testable import JogCore

// Lot 7 de la refonte de l'accueil (docs/implementation/refonte-accueil.md) : carte de course et de test (S2).
// Tests à la frontière publique `cartesSeances` / `carteSeance`, sur des Vue dont les séances sont écrites ici.
// Règles citées : 04 « Carte de séance » (course, test), 04 « VDOT et niveau » (niveau la veille), D-025, D-027,
// D-015 (arrondi avant comparaison). Points de décision 1 (test = course), 2 (« Premier repère ») et 5 (charge en « × »).

/// Paramètres de test : ces cartes ne dépendent pas des seuils datés, mais `carteSeance` les demande.
private let parametres = ParamsDates(
    hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92,
    lt2Hr: 172, lt2Pace: 240, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)
private let parDefaut: ParamsAuJour = { _ in parametres }

/// Jour de la course « cible » : toutes les dates des tests se calculent à partir de lui.
private let S = "2026-11-01"

private func jour(_ decalage: Int) throws -> DateCivile {
    try ajouterJours(S, decalage)
}

/// Temps (s) d'une course de `km` dont la VDOT arrondie vaut `cible`. La VDOT décroît quand le temps croît : dichotomie
/// sur la fonction publique `vdot`, qui arrondit déjà à 0,1 (D-015). Donne donc la valeur exacte, au pas près.
private func tempsPourVdot(km: Double, vdot cible: Double) -> Double {
    var bas = 1.0, haut = 600.0
    for _ in 0..<60 {
        let milieu = (bas + haut) / 2
        if (vdot(distance_m: km * 1_000, temps_min: milieu) ?? 0) > cible { bas = milieu } else { haut = milieu }
    }
    return haut * 60
}

/// Course (ou test) de la Vue : distance et temps de référence donnent la VDOT voulue, FC moyenne et charge optionnelles.
private func course(
    _ cle: String, _ date: DateCivile, vdot cible: Double, km: Double = 10, fcMoy: Double? = nil, charge: Double = 0,
    type: TypeSeance = .course
) -> SeanceVue {
    let temps = tempsPourVdot(km: km, vdot: cible)
    let intrinseque = SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 1_000_000, nom: nil, marquage: type == .test ? .test : .course,
        duree_min: temps / 60, km: km, fcMoy: fcMoy, allureMoy_skm: nil,
        minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: charge, mp_min: 0, segmentsMp: [], repetitions: [],
        format: nil, recup_s: nil, ef: nil, fcPic: nil, decouplage: nil, lignesDroites: false, distanceRef_km: km,
        temps_s: temps
    )
    return SeanceVue(seance: Seance(intrinseque: intrinseque, type: type))
}

/// Séance sous-seuil de la Vue, avec sa charge (le seul champ utile à la charge de course).
private func sousSeuil(_ cle: String, _ date: DateCivile, charge: Double) -> SeanceVue {
    let intrinseque = SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 1_000_000, nom: nil, marquage: .aucun, duree_min: 40, km: 8,
        fcMoy: nil, allureMoy_skm: nil, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: charge, mp_min: 0,
        segmentsMp: [], repetitions: [], format: nil, recup_s: nil, ef: nil, fcPic: nil, decouplage: nil,
        lignesDroites: false, distanceRef_km: nil, temps_s: nil
    )
    return SeanceVue(seance: Seance(intrinseque: intrinseque, type: .sousSeuil))
}

/// Vue portant exactement ces séances (les autres champs viennent d'une Vue calculée sans séance).
private func vueAvec(_ seances: [SeanceVue]) throws -> Vue {
    var vue = try calculerVue(EntreeVue(intrinseques: [], parametres: parametresDefaut(), J: try jour(1), derniereSynchro: nil))
    vue.seances = seances
    return vue
}

/// Carte de la séance `cle`, ou échec si elle n'en a pas.
private func carte(_ seances: [SeanceVue], _ cle: String) throws -> CarteSeance {
    try #require(try carteSeance(try vueAvec(seances), cleSource: cle, parDefaut))
}

/// Ligne d'une jauge de la carte, ou échec si la carte ne la porte pas.
private func jauge(_ carte: CarteSeance, _ cle: CleJauge) throws -> LigneJauge {
    try #require(carte.jauges.first { $0.cle == cle }?.ligne)
}

// MARK: - 04, Carte de course et de test : jauge VDOT et niveau de la veille

@Test func leTraitDuVDOTEstLeNiveauDeLaVeille() throws {
    // 04 « Carte de course et de test » et « VDOT et niveau » : le trait est le niveau de la veille (s − 365 à s − 1),
    // la bande ±0,5. La course de s bat le niveau (52,0 contre 50,0) : elle se compare au niveau d'avant, pas à elle.
    let c = try carte([course("veille", try jour(-10), vdot: 50), course("cible", try jour(0), vdot: 52)], "cible")
    let vdot = try jauge(c, .vdot)

    #expect(vdot.valeurAffichee == 52)
    #expect(vdot.trait == 50)
    #expect(vdot.bande == 49.5...50.5)
    #expect(vdot.ecart == 2)
    #expect(vdot.horsBande)
}

@Test func laCourseDeAUnAnEntreDansLeNiveauEtCelleDeAUnAnEtUnJourNon() throws {
    // 04 « VDOT et niveau » : le niveau de la veille de s couvre s − 365 à s − 1 (D-027 : 365 jours). s − 365 entre,
    // s − 366 non.
    let dedans = try carte([course("a-365", try jour(-365), vdot: 50), course("cible", try jour(0), vdot: 52)], "cible")
    let dehors = try carte([course("a-366", try jour(-366), vdot: 50), course("cible", try jour(0), vdot: 52)], "cible")

    #expect(try jauge(dedans, .vdot).trait == 50)
    #expect(try jauge(dehors, .vdot).trait == nil)
}

@Test func uneCourseDuMemeJourNeFixePasLeNiveauDeLaVeille() throws {
    // 04 « VDOT et niveau » : la fenêtre du niveau de la veille s'arrête à s − 1. Une course du même jour, même plus
    // rapide, ne donne pas de trait : la première course n'a pas de repère (point de décision 2).
    let c = try carte([course("meme-jour", try jour(0), vdot: 50), course("cible", try jour(0), vdot: 52)], "cible")

    #expect(try jauge(c, .vdot).trait == nil)
    #expect(c.verdict == .neutre("Premier repère"))
}

@Test func lEcartAuNiveauSeLitSurLesValeursArrondiesEtLeVerdictSuit() throws {
    // 04 « Carte de course et de test » ; D-015 : VDOT − niveau arrondi à 0,1. +0,6 « Au-dessus du niveau » (OK) ;
    // +0,5 et −0,5 « Conforme » (OK) ; −0,6 « En dessous du niveau » (neutre).
    let cas: [(valeur: Double, attendu: VerdictSeance)] = [
        (50.6, .ok("Au-dessus du niveau")),
        (50.5, .ok("Conforme")),
        (49.5, .ok("Conforme")),
        (49.4, .neutre("En dessous du niveau")),
    ]
    for (valeur, attendu) in cas {
        let c = try carte([course("veille", try jour(-10), vdot: 50), course("cible", try jour(0), vdot: valeur)], "cible")
        #expect(c.verdict == attendu, "VDOT \(valeur) face à 50,0")
    }
}

@Test func unePremiereCourseSansNiveauAvantAUnTraitAbsentEtUnVerdictNeutre() throws {
    // Point de décision 2 : aucun niveau la veille, donc pas de trait et un verdict neutre « Premier repère », jamais OK.
    let c = try carte([course("premiere", try jour(0), vdot: 52)], "premiere")

    #expect(try jauge(c, .vdot).trait == nil)
    #expect(try jauge(c, .vdot).bande == nil)
    #expect(c.verdict == .neutre("Premier repère"))
}

// MARK: - 04, Carte de course et de test : FC moyenne sur les courses de même distance

@Test func laFCMoyenneSeComparAuxCoursesDeMemeDistanceSurTout() throws {
    // 04 « Carte de course et de test » : trait et bande sur les courses et tests de même distance, sur tout l'historique
    // antérieur, au moins 2. Entrent : 10 km à 160 bpm (s − 300) et 164 bpm (s − 30) : moyenne 162, écart-type 2, bande
    // 160,1–163,9, affichée 160–164. N'entrent pas : 5 km à 100 bpm (s − 10), et une 10 km le même jour (200 bpm).
    let c = try carte([
        course("ancienne", try jour(-300), vdot: 49, fcMoy: 160),
        course("recente", try jour(-30), vdot: 49, fcMoy: 164),
        course("autre-distance", try jour(-10), vdot: 49, km: 5, fcMoy: 100),
        course("meme-jour", try jour(0), vdot: 52, fcMoy: 200),
        course("cible", try jour(0), vdot: 52, fcMoy: 170),
    ], "cible")
    let fc = try jauge(c, .fcMoy)

    #expect(fc.valeurAffichee == 170)
    #expect(fc.trait == 162)
    #expect(fc.bande == 160...164)
    #expect(fc.horsBande)
}

@Test func uneSeuleCourseDeMemeDistanceDonneUneNormeEnCoursSur2() throws {
    // D-026 et 04 : une seule course antérieure de même distance (au moins 2 requises) : « Norme en cours (1 sur 2) »,
    // sans trait ni bande.
    let c = try carte([
        course("passee", try jour(-30), vdot: 50, fcMoy: 160),
        course("cible", try jour(0), vdot: 52, fcMoy: 170),
    ], "cible")
    let fc = try jauge(c, .fcMoy)

    #expect(fc.enCours == MentionEnCours(n: 1, sur: 2))
    #expect(fc.trait == nil)
    #expect(fc.bande == nil)
}

@Test func unTestCompteDansLaFCDesCoursesDeMemeDistance() throws {
    // 04 « Carte de course et de test » : courses et tests de même distance ensemble. Un test passé à 164 bpm compte.
    let c = try carte([
        course("passe-test", try jour(-30), vdot: 49, fcMoy: 164, type: .test),
        course("passee", try jour(-60), vdot: 49, fcMoy: 160),
        course("cible", try jour(0), vdot: 52, fcMoy: 170),
    ], "cible")

    #expect(try jauge(c, .fcMoy).trait == 162)
}

// MARK: - 04, Carte de course et de test : charge en « × » (point de décision 5)

@Test func laChargeSeLitEnFoisLaMoyenneDesSousSeuilDeLaFenetre() throws {
    // Point de décision 5 : valeur = charge ÷ moyenne des séances sous-seuil des 56 jours ; trait 1,0 ; bande = norme de
    // ces charges ÷ leur moyenne ; pas d'écart. Sous-seuil à s − 5, − 10, − 20, − 40 : charges 30, 50, 30, 50 (moyenne
    // 40, écart-type 10, norme 30,5–49,5). N'entrent pas : s − 57 (charge 500), le même jour (charge 500).
    let c = try carte([
        sousSeuil("ss-5", try jour(-5), charge: 30),
        sousSeuil("ss-10", try jour(-10), charge: 50),
        sousSeuil("ss-20", try jour(-20), charge: 30),
        sousSeuil("ss-40", try jour(-40), charge: 50),
        sousSeuil("ss-57", try jour(-57), charge: 500),
        sousSeuil("meme-jour", try jour(0), charge: 500),
        course("cible", try jour(0), vdot: 52, charge: 84),
    ], "cible")
    let charge = try jauge(c, .charge)

    #expect(charge.valeurAffichee == 2.1)
    #expect(charge.trait == 1)
    #expect(charge.bande == 0.8...1.2)
    #expect(charge.ecart == nil)
    #expect(charge.horsBande)
}

@Test func sansQuatreSousSeuilDansLaFenetreLaChargeEstEnCoursEtLeVerdictResteCalcule() throws {
    // 04 et D-025 : moins de 4 séances sous-seuil sur 56 jours : « Norme en cours (3 sur 4) », sans trait ni valeur.
    // Le verdict (VDOT) ne dépend pas de cette norme.
    let c = try carte([
        sousSeuil("ss-5", try jour(-5), charge: 30),
        sousSeuil("ss-10", try jour(-10), charge: 50),
        sousSeuil("ss-20", try jour(-20), charge: 40),
        course("veille", try jour(-10), vdot: 50),
        course("cible", try jour(0), vdot: 50, charge: 84),
    ], "cible")
    let charge = try jauge(c, .charge)

    #expect(charge.enCours == MentionEnCours(n: 3, sur: 4))
    #expect(charge.trait == nil)
    #expect(charge.valeurAffichee == nil)
    #expect(c.verdict == .ok("Conforme"))
}

// MARK: - Points de décision 1 et périmètre

@Test func unTestSeTraiteCommeUneCourse() throws {
    // Point de décision 1 : test = course. Mêmes jauges, même verdict, même échantillon de FC.
    let autres = [
        course("veille", try jour(-10), vdot: 50, fcMoy: 160),
        course("passee", try jour(-30), vdot: 49, fcMoy: 164),
    ]
    let enCourse = try carte(autres + [course("cible", try jour(0), vdot: 52, fcMoy: 170)], "cible")
    let enTest = try carte(autres + [course("cible", try jour(0), vdot: 52, fcMoy: 170, type: .test)], "cible")

    #expect(enTest.type == .test)
    #expect(enTest.jauges == enCourse.jauges)
    #expect(enTest.verdict == enCourse.verdict)
}

@Test func leTraitDuVDOTDeChaqueCourseEstLeNiveauPublicDeLaVeille() throws {
    // 04 « VDOT et niveau » : le trait d'une course est `niveauAu` le jour de la veille. La fenêtre glissante qui le
    // calcule rend la même réponse que la règle, y compris à égalité de VDOT et aux bords d'un an.
    var seances: [SeanceVue] = []
    for k in 0..<40 {
        let vdot = 45 + Double((k * 7) % 11) * 0.5
        seances.append(course("c-\(k)", try jour(-k * 11), vdot: vdot, km: k % 3 == 0 ? 5 : 10))
    }
    let vue = try vueAvec(seances)
    let cartes = try cartesSeances(vue, parDefaut)

    for s in seances {
        let veille = try niveauAu(vue, try ajouterJours(s.date, -1))?.vdot
        let trait = cartes[s.cleSource]?.jauges.first { $0.cle == .vdot }?.ligne.trait
        #expect(trait == veille, "trait de \(s.cleSource)")
    }
}

@Test func uneCourseSansDistanceNiTempsADoncUneCarteNeutreSansVDOT() throws {
    // 04 « VDOT et niveau » ; point de décision 2 : sans distance ni temps de référence, pas de VDOT. La carte existe
    // quand même, neutre « Sans VDOT », avec une jauge VDOT vide (ni valeur, ni trait, ni bande). La FC et la charge
    // se calculent comme d'habitude : ici aucune course antérieure de même distance, aucun sous-seuil.
    var sans = course("sans", try jour(0), vdot: 52, fcMoy: 170, charge: 84)
    sans.distanceRef_km = nil
    sans.temps_s = nil
    let c = try carte([sans], "sans")
    let vdot = try jauge(c, .vdot)

    #expect(c.verdict == .neutre("Sans VDOT"))
    #expect(c.jauges.map(\.cle) == [.vdot, .fcMoy, .charge])
    #expect(vdot.valeur == nil)
    #expect(vdot.valeurAffichee == nil)
    #expect(vdot.trait == nil)
    #expect(vdot.bande == nil)
    #expect(try jauge(c, .fcMoy).enCours == MentionEnCours(n: 0, sur: 2))
    #expect(try jauge(c, .charge).enCours == MentionEnCours(n: 0, sur: 4))
}

@Test func unSousSeuilA56JoursEntreDansLaFenetreEtCeluiA57NonPas() throws {
    // D-025 : la fenêtre de la charge va de s − 56 à s − 1. Même fixture : trois sous-seuil à s − 5, − 10, − 20 et un
    // quatrième à s − 56 (charge 40) : quatre séances, la norme existe. Avec ce quatrième à s − 57, il n'en reste que trois.
    func fixture(_ decalage: Int) throws -> CarteSeance {
        try carte([
            sousSeuil("ss-5", try jour(-5), charge: 30),
            sousSeuil("ss-10", try jour(-10), charge: 50),
            sousSeuil("ss-20", try jour(-20), charge: 30),
            sousSeuil("ss-borne", try jour(decalage), charge: 40),
            course("cible", try jour(0), vdot: 52, charge: 84),
        ], "cible")
    }
    let dedans = try jauge(try fixture(-56), .charge)
    let dehors = try jauge(try fixture(-57), .charge)

    #expect(dedans.trait == 1)
    #expect(dedans.enCours == nil)
    #expect(dehors.trait == nil)
    #expect(dehors.enCours == MentionEnCours(n: 3, sur: 4))
}

@Test func aucunSousSeuilDonneUneChargeEnCoursSur4() throws {
    // D-025 : sans aucun sous-seuil sur 56 jours, la charge est « Norme en cours (0 sur 4) », sans trait ni valeur.
    let c = try carte([course("cible", try jour(0), vdot: 52, charge: 84)], "cible")
    let charge = try jauge(c, .charge)

    #expect(charge.enCours == MentionEnCours(n: 0, sur: 4))
    #expect(charge.trait == nil)
    #expect(charge.valeurAffichee == nil)
}

@Test func aucuneCourseDeMemeDistanceAnterieureDonneUneFCEnCoursSur2() throws {
    // D-026 et 04 : une course antérieure, mais d'une autre distance (5 km contre 10 km) ne compte pas : « Norme en cours
    // (0 sur 2) », sans trait ni bande.
    let c = try carte([
        course("autre-distance", try jour(-30), vdot: 50, km: 5, fcMoy: 160),
        course("cible", try jour(0), vdot: 52, fcMoy: 170),
    ], "cible")
    let fc = try jauge(c, .fcMoy)

    #expect(fc.enCours == MentionEnCours(n: 0, sur: 2))
    #expect(fc.trait == nil)
    #expect(fc.bande == nil)
}
