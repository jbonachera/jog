// Largeur d'un iPhone 15 Pro (393 pt) pour l'onglet Progrès : aucune section ne dépasse de l'écran.
// La mesure est faite côté SwiftUI : chaque section est hébergée dans un UIHostingController, dans le même conteneur que
// ProgressionView.corps (padding horizontal de 16 pt), et on lit la largeur que SwiftUI lui donne à 393 pt de proposition.
// Une section qui ne tient pas rend une largeur supérieure à 393 pt, même si ses vues SwiftUI ne sont pas des UIView.
// Le contenu qui défile exprès (tableaux du comparateur et du niveau, dans une ScrollView horizontale) n'est pas contrôlé.
// Fichier de la cible JogTests, hébergée par Jog (TEST_HOST) : il importe le module de l'app.
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog

private let largeurEcran: CGFloat = 393
/// Gouttière horizontale de ProgressionView.corps, de chaque côté.
private let gouttiere: CGFloat = 16

/// Les calculs de l'onglet avec un historique réel : l'aperçu n'a pas de bornes, donc le sélecteur de dates n'y apparaît pas.
@MainActor
private func calculsAvecHistorique() throws -> CalculsProgression {
    let base = CalculsProgression.exemple
    let premierJour = try #require(ModeleApercu.date("2023-03-06"))
    let hier = try #require(ModeleApercu.date("2026-10-27"))
    return CalculsProgression(
        refHr: base.refHr,
        bandeFC: base.bandeFC,
        bornes: premierJour...hier,
        tendances: base.tendances,
        niveau: base.niveau,
        prereglage: base.prereglage,
        comparer: base.comparer,
        nuage: base.nuage
    )
}

/// Les mêmes calculs, avec de grands nombres dans les tendances : l'en-tête de tendance se met sur une ligne.
@MainActor
private func calculsAuxGrandsNombres() throws -> CalculsProgression {
    let base = try calculsAvecHistorique()
    return CalculsProgression(
        refHr: base.refHr,
        bandeFC: base.bandeFC,
        bornes: try #require(base.bornes),
        tendances: Tendances(
            allure: Tendance(points: [], derniere: 12_345.6, ecart: -1_234.5, bonSens: true),
            ef: Tendance(points: [], derniere: 1_234.56, ecart: 123.45, bonSens: false),
            decouplage: Tendance(points: [], derniere: 14.1, ecart: -11.4, bonSens: true)
        ),
        niveau: base.niveau,
        prereglage: base.prereglage,
        comparer: base.comparer,
        nuage: base.nuage
    )
}

/// Les mêmes calculs, avec des libellés longs dans le tableau du comparateur.
@MainActor
private func calculsAuxLibellesLongs() throws -> CalculsProgression {
    let base = try calculsAvecHistorique()
    let periodeA = PeriodeBornee(debut: "2026-06-03", fin: "2026-08-25", jours: 84)
    let periodeB = PeriodeBornee(debut: "2026-08-26", fin: "2026-11-18", jours: 84)
    let comparaison = Comparaison(
        a: periodeA,
        b: periodeB,
        historiquePartiel: true,
        mesures: [
            Mesure(cle: .km, groupe: .volume, nom: "kilomètres parcourus par semaine en moyenne", sens: .plusHaut, a: 32.4, b: 36.1, ecart: 3.7, ecartAffiche: 3.7, etat: .mieux),
            Mesure(cle: .minutesSS, groupe: .sousSeuil, nom: "minutes passées sous le seuil par semaine", sens: .plusHaut, a: 48, b: 41, ecart: -7, ecartAffiche: -7, etat: .moinsBien),
            Mesure(cle: .allure, groupe: .sousSeuil, nom: "allure moyenne sous le seuil à 164 bpm de FC", sens: .plusRapide, a: 312, b: 306, ecart: -6, ecartAffiche: -6, etat: .mieux),
            Mesure(cle: .decouplage, groupe: .endurance, nom: "découplage cardiaque sur la sortie longue du dimanche", sens: .plusBas, a: 6.2, b: 4.1, ecart: -2.1, ecartAffiche: -2.1, etat: .mieux),
        ]
    )
    return CalculsProgression(
        refHr: base.refHr,
        bandeFC: base.bandeFC,
        bornes: try #require(base.bornes),
        tendances: base.tendances,
        niveau: base.niveau,
        prereglage: base.prereglage,
        comparer: { _, _ in comparaison },
        nuage: base.nuage
    )
}

/// Dates des séances de la Vue par code (une par semaine, en remontant depuis la veille de J).
private let datesSeancesExemple: [DateCivile] = [
    "2026-10-24", "2026-10-17", "2026-10-10", "2026-10-03", "2026-09-26", "2026-09-19", "2026-09-12", "2026-09-05",
]

/// Vue construite par code, avec une sortie longue par semaine de `km` kilomètres (fixtures de AccueilSeancesTests).
/// Les Saisons (H1) la lisent. Fixture construite par code, sans donnée d'export.
@MainActor
private func vueAvecHistorique(km: Double) -> Vue {
    var vue = Vue.vide(J: "2026-10-28")
    vue.seances = datesSeancesExemple.enumerated().map { indice, date in
        SeanceVue(seance: Seance(
            intrinseque: SeanceIntrinseque(
                cleSource: "saisons-\(indice)", date: date, debutUtc: 0, nom: nil, marquage: .aucun, duree_min: 60, km: km,
                fcMoy: nil, allureMoy_skm: nil, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: 0, mp_min: 0,
                segmentsMp: [], repetitions: [], format: nil, recup_s: nil, ef: nil, fcPic: nil, decouplage: nil,
                lignesDroites: false, distanceRef_km: nil, temps_s: nil
            ),
            type: .sortieLongue
        ))
    }
    return vue
}

/// Largeur que SwiftUI donne à la section, dans le conteneur réel (padding horizontal de 16 pt), proposée à 393 pt.
/// Rendu en français, Dynamic Type par défaut, classe de taille compacte (iPhone). Sans proposition de largeur
/// contrainte à la section, un contenu trop large sort du cadre et la mesure le rend tel quel.
@MainActor
private func largeurRendue<Contenu: View>(_ section: Contenu) -> CGFloat {
    let hote = UIHostingController(
        rootView: section
            .padding(.horizontal, gouttiere)
            .environment(\.locale, Locale(identifier: "fr_FR"))
            .environment(\.horizontalSizeClass, .compact)
            .environment(\.dynamicTypeSize, .large)
    )
    return hote.view.sizeThatFits(CGSize(width: largeurEcran, height: .greatestFiniteMagnitude)).width
}

// 03, Progrès : P1, P2, P3, P5, puis H1 (Saisons). P4 n'y est plus (lot 19, il vit dans S3).
@Test func laProgressionSuitLOrdreDuPlan() {
    #expect(SectionProgres.ordre == [.comparateur, .tendances, .nuage, .niveau, .saisons])
}

@MainActor
@Test func lesSectionsDeLaProgressionTiennentDansLEcranDUnIPhone() throws {
    let scenarios: [(scenario: String, calculs: CalculsProgression, vue: Vue)] = [
        ("historique réaliste", try calculsAvecHistorique(), vueAvecHistorique(km: 40)),
        ("grands nombres", try calculsAuxGrandsNombres(), vueAvecHistorique(km: 1_234.5)),
        ("libellés longs", try calculsAuxLibellesLongs(), vueAvecHistorique(km: 40)),
    ]
    for (scenario, calculs, vue) in scenarios {
        let largeurs: [(section: String, largeur: CGFloat)] = [
            ("comparateur", largeurRendue(ComparateurView(calculs: calculs))),
            ("tendances", largeurRendue(TendancesView(tendances: calculs.tendances, refHr: calculs.refHr))),
            ("nuage", largeurRendue(NuageView(calculs: calculs))),
            ("niveau", largeurRendue(NiveauView(niveau: calculs.niveau))),
            ("saisons", largeurRendue(SaisonsSectionView(vue: vue))),
        ]
        for (section, largeur) in largeurs {
            #expect(
                largeur <= largeurEcran,
                "section « \(section) » (\(scenario)) : largeur \(largeur) pt, écran de \(largeurEcran) pt"
            )
        }
    }
}
