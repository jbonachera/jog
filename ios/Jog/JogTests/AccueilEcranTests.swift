// Tests de l'écran Séance (S3) : modèle `ModeleSeances.ecran` (lot 16). 03 S3 et P4, 04 « Carte de séance », D-020 (marquage),
// D-021 (répétitions estimées). Le tableau des répétitions d'une séance est celui de P4 pour la dernière séance. Fixtures
// construites par code, sans donnée réelle. Aujourd'hui (J) : 2026-10-30. Fuseau : Europe/Paris.
import Foundation
import Testing
@testable import JogCore
@testable import Jog

private let jourJ: DateCivile = "2026-10-30"
private let fuseauParis = TimeZone(identifier: "Europe/Paris")!

/// Paramètres de test : seuil à 240 s/km, sous-seuil de FC 160 à 168.
private let parametresEcran = ParamsDates(
    hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92, lt2Hr: 172, lt2Pace: 240, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)
private let parDefautEcran: ParamsAuJour = { _ in parametresEcran }

/// Séance de la Vue, avec ses répétitions et son format. Les champs non renseignés restent absents.
private func seanceEcran(
    _ cle: String, _ date: DateCivile, _ type: TypeSeance, repetitions: [Repetition] = [], format: String? = nil,
    distance: Double? = nil, temps: Double? = nil
) -> SeanceVue {
    SeanceVue(seance: Seance(
        intrinseque: SeanceIntrinseque(
            cleSource: cle, date: date, debutUtc: 0, nom: nil, marquage: .aucun, duree_min: 58, km: 10,
            fcMoy: 165, allureMoy_skm: 330, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: 0, mp_min: 0,
            segmentsMp: [], repetitions: repetitions, format: format, recup_s: 60, ef: nil, fcPic: nil, decouplage: nil,
            lignesDroites: false, distanceRef_km: distance, temps_s: temps
        ),
        type: type
    ))
}

/// Répétitions de test : allure et FC de fin par numéro.
private func repetitionsEcran(_ allures: [Double]) -> [Repetition] {
    allures.enumerated().map { i, allure in
        Repetition(n: Double(i + 1), debut_s: Double(i) * 500, duree_s: 480, allure_skm: allure, fcFin: 166)
    }
}

/// Vue portant exactement ces séances.
private func vueEcran(_ seances: [SeanceVue]) -> Vue {
    var vue = Vue.vide(J: jourJ)
    vue.seances = seances
    return vue
}

/// L'écran de la séance `cle` : sa carte jugée par le moteur, puis le modèle de l'écran.
private func ecranDe(_ cle: String, dans seances: [SeanceVue]) throws -> ModeleSeances.Ecran {
    let vue = vueEcran(seances)
    let cartes = try cartesSeances(vue, parDefautEcran)
    let s = try #require(seances.first { $0.cleSource == cle })
    let c = try #require(cartes[cle])
    return ModeleSeances.ecran(s, c, parDefautEcran, J: jourJ, fuseau: fuseauParis)
}

// S3 · tableau : « Une séance sous-seuil affiche le tableau de P4 pour cette séance »
// 03 S3, P4 : la dernière séance sous-seuil porte le même tableau à l'écran Séance que dans P4.
@Test func tableauDeLaDerniereSeanceSousSeuilEstCeluiDeP4() throws {
    let ancienne = seanceEcran("a", "2026-10-15", .sousSeuil, repetitions: repetitionsEcran([238, 240]), format: "3×8′")
    let derniere = seanceEcran(
        "b", "2026-10-27", .sousSeuil, repetitions: repetitionsEcran([236, 238, 240, 244, 250]), format: "5×8′"
    )
    let vue = vueEcran([ancienne, derniere])

    let ecran = try ecranDe("b", dans: [ancienne, derniere])
    let p4 = try #require(derniereSeanceSousSeuil(vue, parDefautEcran))

    #expect(ecran.tableau == ModeleProgression.tableauDerniere(p4))
    #expect(ecran.tableau?.lignes.count == 5)
    #expect(ecran.tableau?.lignes.first?.first == "#1")
}

// S3 · tableau : « Une séance sans répétition n'a pas de tableau »
// 03 S3 : un footing n'a ni tableau ni segment ; une course non plus.
@Test func footingEtCourseSansRepetitionNAffichentNiTableauNiSegment() throws {
    let footing = seanceEcran("f", "2026-10-27", .footing)
    let course = seanceEcran("c", "2026-10-26", .course, distance: 10, temps: 2260)

    let ecranFooting = try ecranDe("f", dans: [footing, course])
    let ecranCourse = try ecranDe("c", dans: [footing, course])

    #expect(ecranFooting.tableau == nil)
    #expect(ecranFooting.segments.isEmpty)
    #expect(ecranCourse.tableau == nil)
    #expect(ecranCourse.segments.isEmpty)
}

// S3 · segments : « Une sortie longue affiche ses minutes à allure marathon »
// 03 S3 : les segments déjà présents dans SeanceVue (mp_min) s'écrivent en texte, sans courbe.
@Test func sortieLongueAfficheSesMinutesAAllureMarathon() throws {
    var longue = seanceEcran("l", "2026-10-27", .sortieLongue)
    longue.mp_min = 40

    let ecran = try ecranDe("l", dans: [longue])

    #expect(ecran.segments == ["40 min à allure marathon"])
    #expect(ecran.tableau == nil)
}

// S3 · carte : « L'en-tête de l'écran est la carte S2 de la séance »
// 03 S3 : la carte de l'écran Séance est celle de l'accueil (S2), sans recalcul.
@Test func enTeteDeLEcranEstLaCarteS2() throws {
    let footing = seanceEcran("f", "2026-10-27", .footing)
    let vue = vueEcran([footing])
    let c = try #require(try cartesSeances(vue, parDefautEcran)["f"])

    let ecran = ModeleSeances.ecran(footing, c, parDefautEcran, J: jourJ, fuseau: fuseauParis)

    #expect(ecran.carte == ModeleSeances.carte(footing, c, J: jourJ, fuseau: fuseauParis))
}

// S3 · tableau : « Une séance qualité aux répétitions estimées a son tableau »
// D-021 : une séance qualité dont les répétitions sont estimées (vitesse et FC) porte le tableau de P4.
@Test func seanceQualiteAuxRepetitionsEstimeesAUnTableau() throws {
    var qualite = seanceEcran("q", "2026-10-27", .seanceQualite, repetitions: repetitionsEcran([236, 240, 244]))
    qualite.repetitionsEstimees = true

    let ecran = try ecranDe("q", dans: [qualite])

    #expect(ecran.tableau?.lignes.count == 3)
}

// S3 · tableau : « Une séance sous-seuil sans répétition n'a pas de tableau »
// 03 S3 : sans répétition, il n'y a rien à tabuler ; le tableau est nil, pas un tableau vide.
@Test func sousSeuilSansRepetitionNAPasDeTableau() throws {
    let sansRepetition = seanceEcran("s", "2026-10-27", .sousSeuil, format: "5×8′")

    let ecran = try ecranDe("s", dans: [sansRepetition])

    #expect(ecran.tableau == nil)
}

// S3 · segments : « Une séance en lignes droites affiche le segment Lignes droites »
// 03 S3 : `lignesDroites` (footing) s'écrit en segment ; sans le drapeau, aucun segment.
@Test func lignesDroitesAfficheLeSegmentLignesDroites() throws {
    var droites = seanceEcran("d", "2026-10-27", .footingLignesDroites)
    droites.lignesDroites = true

    let ecran = try ecranDe("d", dans: [droites])

    #expect(ecran.segments == ["Lignes droites"])
}

// S3 · segments : « Sans minute à allure marathon, aucun segment »
// 03 S3 : borne basse de `mp_min` : 0 ne produit aucun segment.
@Test func zeroMinuteAAllureMarathonNAfficheAucunSegment() {
    var seance = seanceEcran("z", "2026-10-27", .sortieLongue)
    seance.mp_min = 0

    #expect(ModeleSeances.segments(seance).isEmpty)
}

// S3 · segments : « Une minute juste positive affiche un segment »
// 03 S3 : 0,5 min, plus petite valeur affichable (arrondie à 1 min), produit un segment.
@Test func uneMinuteJusteSuperieureAZeroAfficheUnSegment() {
    var seance = seanceEcran("p", "2026-10-27", .sortieLongue)
    seance.mp_min = 0.5

    #expect(ModeleSeances.segments(seance) == ["1 min à allure marathon"])
}

// D-020 · S3 : « Chaque option du menu transmet la clé de la séance et sa valeur »
// Le menu de marquage de S3 relaie `(cleSource, valeur)` pour chacune de ses options, selon le marquage courant.
@Test func chaqueOptionDuMenuSeanceTransmetLaCleEtSaValeur() {
    let cas: [(courant: Marquage, titres: [String], valeurs: [MarquageUtilisateur?])] = [
        (.aucun, ["Marquer comme course", "Marquer comme test"], [.course, .test]),
        (.course, ["Marquer comme test", "Retirer le marquage"], [.test, nil]),
        (.test, ["Marquer comme course", "Retirer le marquage"], [.course, nil]),
    ]
    for (courant, titres, valeurs) in cas {
        var recus: [(String, MarquageUtilisateur?)] = []
        let options = ModeleSeances.menuMarquage(cleSource: "cle-s3", courant: courant, surMarquage: { cle, valeur in
            recus.append((cle, valeur))
        })

        #expect(options.map(\.titre) == titres)
        options.forEach { $0.action() }
        #expect(recus.map(\.0) == Array(repeating: "cle-s3", count: titres.count))
        #expect(recus.map(\.1) == valeurs)
        #expect(options.map(\.valeur) == valeurs)
    }
}
