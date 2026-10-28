// Largeur d'un iPhone 15 Pro (393 pt) pour l'onglet Progression : aucune section ne dépasse de l'écran.
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
        derniere: base.derniere,
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
        derniere: base.derniere,
        niveau: base.niveau,
        prereglage: base.prereglage,
        comparer: base.comparer,
        nuage: base.nuage
    )
}

/// Les mêmes calculs, avec des libellés longs dans le tableau du comparateur et dans la dernière séance.
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
    let seance = DerniereSeance(
        date: "2026-10-20",
        format: "dix répétitions de mille mètres à allure seuil avec récupération active",
        recup_s: 120,
        allureMoy_skm: 302,
        bande: Bande(lo: 299, hi: 305),
        seuil_skm: 296,
        subtHrHi: 170,
        repetitions: [
            RepetitionDerniere(n: 1, allure_skm: 303, fcFin: 161, ecartMoyenne_skm: 1, horsSousSeuil: true, raisons: ["allure plus rapide que la bande de régularité prévue pour cette répétition"]),
        ]
    )
    return CalculsProgression(
        refHr: base.refHr,
        bandeFC: base.bandeFC,
        bornes: try #require(base.bornes),
        tendances: base.tendances,
        derniere: seance,
        niveau: base.niveau,
        prereglage: base.prereglage,
        comparer: { _, _ in comparaison },
        nuage: base.nuage
    )
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

@MainActor
@Test func lesSectionsDeLaProgressionTiennentDansLEcranDUnIPhone() throws {
    let scenarios = [
        ("historique réaliste", try calculsAvecHistorique()),
        ("grands nombres", try calculsAuxGrandsNombres()),
        ("libellés longs", try calculsAuxLibellesLongs()),
    ]
    for (scenario, calculs) in scenarios {
        let largeurs: [(section: String, largeur: CGFloat)] = [
            ("comparateur", largeurRendue(ComparateurView(calculs: calculs))),
            ("tendances", largeurRendue(TendancesView(tendances: calculs.tendances, refHr: calculs.refHr))),
            ("nuage", largeurRendue(NuageView(calculs: calculs))),
            ("dernière séance", largeurRendue(DerniereSeanceView(seance: calculs.derniere))),
            ("niveau", largeurRendue(NiveauView(niveau: calculs.niveau))),
        ]
        for (section, largeur) in largeurs {
            #expect(
                largeur <= largeurEcran,
                "section « \(section) » (\(scenario)) : largeur \(largeur) pt, écran de \(largeurEcran) pt"
            )
        }
    }
}
