// Graduations lisibles sur les axes de la Progression et de l'aperçu forme/fatigue.
// Le test appelle les fonctions pures de repères de chaque vue (TendancesView, NuageView, SaisonsView,
// FormeFatigueView) avec les mêmes domaines que la vue, et vérifie le contrat du résultat :
// - sous-ensemble des repères du domaine, dans l'ordre croissant ;
// - au moins deux repères quand deux repères tiennent aux deux extrémités de l'axe ;
// - espacement minimal entre repères retenus d'au moins la taille du libellé + 4 pt.
// Le total des repères mensuels est calculé ici, indépendamment de `Axes.reperesMois`. Les libellés mesurés sont ceux
// réellement dessinés (`libelleMois`, `formatAllure`, `ModeleApercu.nombre`) au Dynamic Type du cas.
// Fichier de la cible JogTests, hébergée par Jog (TEST_HOST) : il importe le module de l'app.
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog

/// Largeurs d'écran : iPhone 15 Pro, iPhone SE (2e et 3e générations), iPhone SE (1re génération).
private let largeursEcran: [CGFloat] = [393, 375, 320]
/// Dynamic Type : xSmall, large, accessibility3 (UIKit : accessibilityExtraLarge).
private let categoriesDynamiques: [UIContentSizeCategory] = [.extraSmall, .large, .accessibilityExtraLarge]
/// Gouttière horizontale de la Progression et padding de la carte, de chaque côté.
private let gouttiere: CGFloat = 16
private let paddingCarte: CGFloat = 16
/// Espace exigé entre deux repères retenus, au-delà de la taille du libellé.
private let margeEspacement: CGFloat = 4
private let bandeFC: (lo: Double, hi: Double) = (158, 170)

/// Calendrier explicite : grégorien, Europe/Paris, français. Le test ne dépend pas du réglage du simulateur.
private func calendrierFixe() -> Calendar {
    var calendrier = Calendar(identifier: .gregorian)
    calendrier.timeZone = TimeZone(identifier: "Europe/Paris") ?? .current
    calendrier.locale = Locale(identifier: "fr_FR")
    return calendrier
}

/// Dates hebdomadaires à partir du 6 mars 2023.
private func datesHebdomadaires(_ nombre: Int) -> [Date] {
    let calendrier = calendrierFixe()
    guard let debut = calendrier.date(from: DateComponents(year: 2023, month: 3, day: 6)) else { return [] }
    return (0..<nombre).compactMap { index in
        calendrier.date(byAdding: .day, value: 7 * index, to: debut)
    }
}

/// Un jeu de données de Progression et de forme. Allures en s/km, FC en bpm, forme en points.
struct Scenario: Sendable, CustomTestStringConvertible {
    let nom: String
    let dates: [Date]
    let allures: [Double]
    let fc: [Double]
    /// Forme de fond par date (la fatigue suit la forme de 6 points dans le test).
    let formes: [Double]

    var testDescription: String { nom }

    static let longue = datesHebdomadaires(190)
    static let allureRealiste = (0..<190).map { (i: Int) -> Double in 318 - Double(i) * 0.05 + Double((i * 7) % 11 - 5) }
    static let allureExtreme = (0..<190).map { (i: Int) -> Double in 210 + Double((i * 37) % 221) }
    static let fcRealiste = (0..<40).map { (i: Int) -> Double in 150 + Double((i * 7) % 26) }
    static let fcExtreme = (0..<40).map { (i: Int) -> Double in 120 + Double((i * 29) % 81) }
    static let formesRealistes = (0..<190).map { (i: Int) -> Double in 40 + Double((i * 5) % 13) }
    static let formesExtremes = (0..<190).map { (i: Int) -> Double in -120 + Double((i * 41) % 260) }

    static let realisteTroisAns = Scenario(
        nom: "réaliste, 3,5 ans", dates: longue, allures: allureRealiste, fc: fcRealiste,
        formes: formesRealistes
    )
    static let extremeTroisAns = Scenario(
        nom: "extrême, 3,5 ans", dates: longue, allures: allureExtreme, fc: fcExtreme,
        formes: formesExtremes
    )
    static let domainePlat = Scenario(
        nom: "domaine plat", dates: longue, allures: Array(repeating: 300, count: 190),
        fc: Array(repeating: 160, count: 40), formes: Array(repeating: 40, count: 190)
    )
    static let zeroPoint = Scenario(nom: "zéro point", dates: [], allures: [], fc: [], formes: [])
    static let unPoint = Scenario(
        nom: "un point", dates: Array(longue.prefix(1)), allures: [318], fc: [160], formes: [40]
    )
    static let deuxPoints = Scenario(
        nom: "deux points", dates: Array(longue.prefix(2)), allures: [318, 305], fc: [160, 165], formes: [40, 42]
    )

    /// Tous les scénarios du contrat.
    static let tous: [Scenario] = [realisteTroisAns, extremeTroisAns, domainePlat, zeroPoint, unPoint, deuxPoints]
    /// Peu de données : le test positif ne vérifie que les cas où les libellés tiennent.
    static let peuDeDonnees: [Scenario] = [zeroPoint, unPoint, deuxPoints]
}

/// Un cas : un scénario, une largeur d'écran et une catégorie de Dynamic Type.
struct Cas: Sendable, CustomTestStringConvertible {
    let scenario: Scenario
    let largeur: CGFloat
    let categorie: UIContentSizeCategory

    var testDescription: String { "\(scenario.nom), écran \(Int(largeur)) pt, Dynamic Type \(categorie.rawValue)" }

    static func produit(_ scenarios: [Scenario]) -> [Cas] {
        scenarios.flatMap { scenario in
            largeursEcran.flatMap { largeur in
                categoriesDynamiques.map { Cas(scenario: scenario, largeur: largeur, categorie: $0) }
            }
        }
    }
}

/// Un axe mesuré : les repères retenus par la vue, face au total attendu, dans la place donnée.
struct AxeMesure: Sendable {
    let nom: String
    /// Total attendu : tous les repères du domaine, calculés indépendamment de la vue.
    let total: [Double]
    /// Repères retenus par la fonction de la vue.
    let retenus: [Double]
    /// Domaine de positionnement, comme celui de la vue (marge de l'étendue X de la dernière séance, domaine des données).
    let domaine: ClosedRange<Double>
    let longueur: CGFloat
    /// Taille du libellé le plus long de l'axe.
    let taille: CGFloat
}

/// Mois (premier jour) entre les deux dates, calculés à partir des composantes année/mois, indépendamment de `Axes.reperesMois`.
@MainActor
private func moisAttendus(entre premier: Date, et dernier: Date, calendrier: Calendar) -> [Date] {
    let debut = calendrier.dateComponents([.year, .month], from: premier)
    let fin = calendrier.dateComponents([.year, .month], from: dernier)
    guard let annee1 = debut.year, let mois1 = debut.month, let annee2 = fin.year, let mois2 = fin.month else { return [] }
    var resultat: [Date] = []
    var annee = annee1
    var mois = mois1
    while (annee, mois) <= (annee2, mois2) {
        if let debutMois = calendrier.date(from: DateComponents(year: annee, month: mois, day: 1)), debutMois >= premier, debutMois <= dernier {
            resultat.append(debutMois)
        }
        mois += 1
        if mois > 12 {
            mois = 1
            annee += 1
        }
    }
    return resultat
}

/// Position en pt des valeurs sur un axe de `longueur` pt couvrant `domaine`.
private func positions(_ valeurs: [Double], domaine: ClosedRange<Double>, longueur: CGFloat) -> [CGFloat] {
    let etendue = domaine.upperBound - domaine.lowerBound
    guard etendue > 0 else { return valeurs.map { _ in 0 } }
    return valeurs.map { CGFloat(($0 - domaine.lowerBound) / etendue) * longueur }
}

/// Espacement minimal entre deux repères consécutifs, en pt (infini s'il y en a moins de deux).
private func espaceMinimal(_ valeurs: [Double], domaine: ClosedRange<Double>, longueur: CGFloat) -> CGFloat {
    let pos = positions(valeurs, domaine: domaine, longueur: longueur).sorted()
    return zip(pos, pos.dropFirst()).map { $1 - $0 }.min() ?? .infinity
}

/// Les axes d'un cas, dans la place réelle : longueurs issues de la largeur d'écran, de la carte et des hauteurs partagées.
@MainActor
private func axesMesures(_ scenario: Scenario, largeur: CGFloat, categorie: UIContentSizeCategory) -> [AxeMesure] {
    let calendrier = calendrierFixe()
    let hauteurX = hauteurLibelleAxe(categorie: categorie)
    let largeurAxeX = largeur - 2 * gouttiere - 2 * paddingCarte
    var mesures: [AxeMesure] = []

    // P2, tendance d'allure : Y (pas 5 s/km) et X mensuel sur les dates des points.
    var largeurY: CGFloat = 0
    if !scenario.allures.isEmpty {
        let domaine = ModeleProgression.domaineTendance(.allure, scenario.allures)
        let pas = presetAxe(SerieTendance.allure.preset).pas
        let total = Axes.graduations(domaine, pas: pas)
        largeurY = largeurMaxLibelles(total.map { formatAllure($0) }, categorie: categorie)
        let longueur = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.tendance, categorie: categorie)
        mesures.append(AxeMesure(
            nom: "tendance Y", total: total,
            retenus: TendancesView.reperesAxeY(domaine: domaine, pas: pas, longueur: longueur, categorie: categorie),
            domaine: domaine, longueur: longueur, taille: hauteurX
        ))
    }
    if let premier = scenario.dates.first, let dernier = scenario.dates.last {
        let total = moisAttendus(entre: premier, et: dernier, calendrier: calendrier)
        let domaine = premier.timeIntervalSince1970...dernier.timeIntervalSince1970
        let taille = largeurMaxLibelles(total.enumerated().map { index, date in
            libelleMois(date, premierRepere: index == 0, calendrier: calendrier)
        }, categorie: categorie)
        let longueur = DimensionsGraphique.longueurAxeX(largeurGraphique: largeurAxeX, largeurAxeY: largeurY)
        mesures.append(AxeMesure(
            nom: "tendance X (mois)", total: total.map(\.timeIntervalSince1970),
            retenus: TendancesView.reperesAxeX(dates: scenario.dates, calendrier: calendrier, longueur: longueur, categorie: categorie)
                .map(\.timeIntervalSince1970),
            domaine: domaine, longueur: longueur, taille: taille
        ))
    }

    // P3, nuage allure × FC : Y (pas 2 bpm) et X (pas 5 s/km).
    if !scenario.allures.isEmpty, !scenario.fc.isEmpty {
        let domaineY = ModeleProgression.domaineFC(scenario.fc, bande: bandeFC)
        let pasY = presetAxe(.fcFin).pas
        let totalY = Axes.graduations(domaineY, pas: pasY)
        let largeurNuageY = largeurMaxLibelles(totalY.map { ModeleApercu.nombre($0) }, categorie: categorie)
        let longueurY = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.nuage, categorie: categorie)
        mesures.append(AxeMesure(
            nom: "nuage Y", total: totalY,
            retenus: NuageView.reperesAxeY(domaine: domaineY, longueur: longueurY, categorie: categorie),
            domaine: domaineY, longueur: longueurY, taille: hauteurX
        ))

        let domaineX = ModeleProgression.domaineAllure(scenario.allures)
        let totalX = Axes.graduations(domaineX, pas: presetAxe(.allure).pas)
        let longueurX = DimensionsGraphique.longueurAxeX(largeurGraphique: largeurAxeX, largeurAxeY: largeurNuageY)
        mesures.append(AxeMesure(
            nom: "nuage X", total: totalX,
            retenus: NuageView.reperesAxeX(domaine: domaineX, longueur: longueurX, categorie: categorie),
            domaine: domaineX, longueur: longueurX,
            taille: largeurMaxLibelles(totalX.map { formatAllure($0) }, categorie: categorie)
        ))
    }

    // Aperçu, forme et fatigue : Y de la forme (pas 10) et X mensuel sur les dates des points.
    if !scenario.formes.isEmpty {
        let points = scenario.dates.indices.map { index in
            ModeleApercu.PointForme(
                id: "\(index)", date: scenario.dates[index], forme: scenario.formes[index],
                fatigue: scenario.formes[index] + 6, fraicheur: -6
            )
        }
        let domaineY = domaineAxe(points.flatMap { [$0.forme, $0.fatigue] }, preset: .formeFond)
        let totalY = Axes.graduations(domaineY, pas: 10)
        let largeurFormeY = largeurMaxLibelles(totalY.map { ModeleApercu.nombre($0) }, categorie: categorie)
        let longueurY = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.formeFatigue, categorie: categorie)
        mesures.append(AxeMesure(
            nom: "forme Y", total: totalY,
            retenus: FormeFatigueView.reperesAxeY(domaine: domaineY, pas: 10, longueur: longueurY, categorie: categorie),
            domaine: domaineY, longueur: longueurY, taille: hauteurX
        ))

        if let premier = points.first?.date, let dernier = points.last?.date {
            let total = moisAttendus(entre: premier, et: dernier, calendrier: calendrier)
            let taille = largeurMaxLibelles(total.enumerated().map { index, date in
                libelleMois(date, premierRepere: index == 0, calendrier: calendrier)
            }, categorie: categorie)
            let longueur = DimensionsGraphique.longueurAxeX(largeurGraphique: largeurAxeX, largeurAxeY: largeurFormeY)
            mesures.append(AxeMesure(
                nom: "forme X (mois)", total: total.map(\.timeIntervalSince1970),
                retenus: FormeFatigueView.reperesAxeX(dates: points.map(\.date), calendrier: calendrier, longueur: longueur, categorie: categorie)
                    .map(\.timeIntervalSince1970),
                domaine: premier.timeIntervalSince1970...dernier.timeIntervalSince1970, longueur: longueur, taille: taille
            ))
        }
    }
    return mesures
}

/// Largeur du libellé le plus long d'un axe, au Dynamic Type donné (mesure partagée avec les vues).
@MainActor
private func largeurMax(_ textes: [String], _ categorie: UIContentSizeCategory) -> CGFloat {
    largeurMaxLibelles(textes, categorie: categorie)
}

/// Dates journalières se terminant le 27 octobre 2026 (J−1), de la plus ancienne à la plus récente.
private func joursFenetre(_ nombre: Int) -> [Date] {
    let calendrier = calendrierFixe()
    guard let fin = calendrier.date(from: DateComponents(year: 2026, month: 10, day: 27)) else { return [] }
    return (0..<nombre).reversed().compactMap { calendrier.date(byAdding: .day, value: -$0, to: fin) }
}

/// Date civile (chaîne) d'une date, dans le calendrier fixé.
private func civile(_ date: Date) -> DateCivile {
    let composantes = calendrierFixe().dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", composantes.year ?? 0, composantes.month ?? 0, composantes.day ?? 0)
}

/// Un jeu de données des vues de charge : des valeurs par semaine (Historique, Discipline, Minutes) et par jour
/// (Progressivité). La Discipline affiche les 30 dernières semaines, les Minutes les 26 dernières, l'Historique toutes
/// celles de sa période, la Progressivité les jours de sa fenêtre (112 ou 365).
struct ScenarioCharge: Sendable, CustomTestStringConvertible {
    let nom: String
    let dates: [Date]
    let lundis: [DateCivile]
    let km: [Double]
    let parts: [Double]
    let minutes: [Double]
    let datesJour: [Date]
    let volumesJour: [Double]
    let ratiosJour: [Double]

    var testDescription: String { nom }

    /// Dates et lundis (chaîne civile) de `nombre` semaines à partir du 6 mars 2023.
    static func semaines(_ nombre: Int) -> (dates: [Date], lundis: [DateCivile]) {
        let calendrier = calendrierFixe()
        guard let debut = calendrier.date(from: DateComponents(year: 2023, month: 3, day: 6)) else { return ([], []) }
        let dates = (0..<nombre).compactMap { calendrier.date(byAdding: .day, value: 7 * $0, to: debut) }
        return (dates, dates.map(civile))
    }

    static let sem190 = semaines(190)
    static let sem26 = semaines(26)
    static let annee = joursFenetre(365)

    static let realiste = ScenarioCharge(
        nom: "réaliste, historique complet", dates: sem190.dates, lundis: sem190.lundis,
        km: (0..<190).map { (i: Int) -> Double in 30 + Double((i * 7) % 40) },
        parts: (0..<190).map { (i: Int) -> Double in Double((i * 3) % 25) },
        minutes: (0..<190).map { (i: Int) -> Double in 80 + Double((i * 11) % 150) },
        datesJour: annee,
        volumesJour: (0..<365).map { (i: Int) -> Double in 25 + Double((i * 5) % 40) },
        ratiosJour: (0..<365).map { (i: Int) -> Double in 0.85 + Double((i * 13) % 40) / 100 }
    )
    static let extreme = ScenarioCharge(
        nom: "extrême, historique complet", dates: sem190.dates, lundis: sem190.lundis,
        km: (0..<190).map { (i: Int) -> Double in Double((i * 37) % 400) },
        parts: (0..<190).map { (i: Int) -> Double in Double((i * 29) % 101) },
        minutes: (0..<190).map { (i: Int) -> Double in Double((i * 53) % 1200) },
        datesJour: annee,
        volumesJour: (0..<365).map { (i: Int) -> Double in Double((i * 41) % 500) },
        ratiosJour: (0..<365).map { (i: Int) -> Double in 0.2 + Double((i * 17) % 300) / 100 }
    )
    static let periode26 = ScenarioCharge(
        nom: "réaliste, période de 26 semaines", dates: sem26.dates, lundis: sem26.lundis,
        km: (0..<26).map { (i: Int) -> Double in 30 + Double((i * 7) % 40) },
        parts: (0..<26).map { (i: Int) -> Double in Double((i * 3) % 25) },
        minutes: (0..<26).map { (i: Int) -> Double in 80 + Double((i * 11) % 150) },
        datesJour: annee,
        volumesJour: realiste.volumesJour,
        ratiosJour: realiste.ratiosJour
    )
    static let plat = ScenarioCharge(
        nom: "domaine plat", dates: sem190.dates, lundis: sem190.lundis,
        km: Array(repeating: 40, count: 190), parts: Array(repeating: 10, count: 190),
        minutes: Array(repeating: 120, count: 190), datesJour: annee,
        volumesJour: Array(repeating: 30, count: 365), ratiosJour: Array(repeating: 1, count: 365)
    )

    /// Les `n` premières semaines et les `m` derniers jours (les jours les plus récents).
    static func tronque(_ s: ScenarioCharge, semaines n: Int, jours m: Int, nom: String) -> ScenarioCharge {
        ScenarioCharge(
            nom: nom, dates: Array(s.dates.prefix(n)), lundis: Array(s.lundis.prefix(n)), km: Array(s.km.prefix(n)),
            parts: Array(s.parts.prefix(n)), minutes: Array(s.minutes.prefix(n)), datesJour: Array(s.datesJour.suffix(m)),
            volumesJour: Array(s.volumesJour.suffix(m)), ratiosJour: Array(s.ratiosJour.suffix(m))
        )
    }

    static let zero = tronque(realiste, semaines: 0, jours: 0, nom: "zéro point")
    static let un = tronque(realiste, semaines: 1, jours: 1, nom: "un point")
    static let deux = tronque(realiste, semaines: 2, jours: 2, nom: "deux points")

    static let tous: [ScenarioCharge] = [realiste, extreme, periode26, plat, zero, un, deux]
    /// Peu de données : le test positif ne vérifie que les cas où les libellés tiennent.
    static let peuDeDonnees: [ScenarioCharge] = [zero, un, deux]
}

/// Un cas des vues de charge : un jeu de données, une largeur d'écran, une catégorie de Dynamic Type et une fenêtre
/// de progressivité.
struct CasCharge: Sendable, CustomTestStringConvertible {
    let scenario: ScenarioCharge
    let largeur: CGFloat
    let categorie: UIContentSizeCategory
    let fenetre: FenetreProgressivite

    var testDescription: String {
        "\(scenario.nom), écran \(Int(largeur)) pt, Dynamic Type \(categorie.rawValue), fenêtre \(fenetre.rawValue)"
    }

    static func produit(_ scenarios: [ScenarioCharge]) -> [CasCharge] {
        scenarios.flatMap { scenario in
            largeursEcran.flatMap { largeur in
                categoriesDynamiques.flatMap { categorie in
                    ModeleCharge.fenetres.map { CasCharge(scenario: scenario, largeur: largeur, categorie: categorie, fenetre: $0) }
                }
            }
        }
    }
}

/// Les axes des vues de charge, dans la place réelle : carte de 16 pt, padding de 16 pt de chaque côté (les aperçus ne
/// sont pas dans les cartes), domaines et étiquettes lus dans les modèles de production.
@MainActor
private func axesMesuresCharge(_ s: ScenarioCharge, largeur: CGFloat, categorie: UIContentSizeCategory, fenetre: FenetreProgressivite) -> [AxeMesure] {
    let calendrier = calendrierFixe()
    let hauteurX = hauteurLibelleAxe(categorie: categorie)
    let largeurAxeX = largeur - 2 * gouttiere - 2 * paddingCarte
    var mesures: [AxeMesure] = []

    // Historique (Saisons) : toutes les semaines de la période. Y des kilomètres, X mensuel.
    let domaineKm = ModeleHistorique.domaineKm(maxKm: s.km.filter(\.isFinite).max() ?? 0)
    let totalKm = Axes.graduations(domaineKm, pas: 20)
    let largeurKm = largeurMax(totalKm.map { ModeleApercu.nombre($0) }, categorie)
    let longueurKm = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.saisons, categorie: categorie)
    mesures.append(AxeMesure(
        nom: "saisons Y", total: totalKm,
        retenus: SaisonsView.reperesAxeY(domaine: domaineKm, longueur: longueurKm, categorie: categorie),
        domaine: domaineKm, longueur: longueurKm, taille: hauteurX
    ))
    if let premier = s.dates.first, let dernier = s.dates.last {
        let total = moisAttendus(entre: premier, et: dernier, calendrier: calendrier)
        let taille = largeurMaxLibelles(total.enumerated().map { index, date in
            libelleMois(date, premierRepere: index == 0, calendrier: calendrier)
        }, categorie: categorie)
        let longueur = DimensionsGraphique.longueurAxeX(largeurGraphique: largeurAxeX, largeurAxeY: largeurKm)
        mesures.append(AxeMesure(
            nom: "saisons X (mois)", total: total.map(\.timeIntervalSince1970),
            retenus: SaisonsView.reperesAxeX(dates: s.dates, calendrier: calendrier, longueur: longueur, categorie: categorie).map(\.timeIntervalSince1970),
            domaine: premier.timeIntervalSince1970...dernier.timeIntervalSince1970, longueur: longueur, taille: taille
        ))
    }

    // Discipline : les 30 dernières semaines (SEMAINES_GRAPHIQUE). Cible de 10 à 25 % (valeurs de scénario).
    let lundisD = Array(s.lundis.suffix(30))
    let partsD = Array(s.parts.suffix(30))
    let nD = lundisD.count
    if nD > 0 {
        let domaineParts = ModeleCharge.domaineDiscipline(parts: partsD, cibleLo: 10, cibleHi: 25)
        let totalParts = Axes.graduations(domaineParts, pas: 5)
        let largeurParts = largeurMax(totalParts.map { ModeleApercu.pourcentage($0) }, categorie)
        let longueurParts = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.discipline, categorie: categorie)
        mesures.append(AxeMesure(
            nom: "discipline Y", total: totalParts,
            retenus: DisciplineView.reperesAxeY(domaine: domaineParts, longueur: longueurParts, categorie: categorie),
            domaine: domaineParts, longueur: longueurParts, taille: hauteurX
        ))
        let etiquettes = indicesEtiquettesSemaines(nD).map(Double.init)
        let libelle: (Double) -> String? = { ModeleCharge.libelleSemaine(lundisD, $0) }
        let longueurX = DimensionsGraphique.longueurAxeX(largeurGraphique: largeurAxeX, largeurAxeY: largeurParts)
        mesures.append(AxeMesure(
            nom: "discipline X", total: etiquettes,
            retenus: DisciplineView.reperesAxeX(etiquettes: etiquettes, nombreSemaines: nD, libelle: libelle, longueur: longueurX, categorie: categorie),
            domaine: 0...Double(nD - 1), longueur: longueurX,
            taille: largeurMaxLibelles(etiquettes.compactMap(libelle), categorie: categorie)
        ))
    }

    // Minutes sous le seuil : les 26 dernières semaines (SEMAINES_AFFICHEES). La moyenne sur 4 semaines est prise sur les
    // minutes brutes (le modèle utilise les minutes sous-seuil, non exposées ici).
    let minutesM = Array(s.minutes.suffix(26))
    let lundisM = Array(s.lundis.suffix(26))
    let nM = lundisM.count
    if nM > 0 {
        let moyenne4: Double? = minutesM.count >= 4 ? minutesM.suffix(4).reduce(0, +) / 4 : nil
        let domaineMinutes = ModeleCharge.domaineMinutes(minutes: minutesM, moyenne4: moyenne4)
        let totalMinutes = Axes.graduations(domaineMinutes, pas: 20)
        let largeurMinutes = largeurMax(totalMinutes.map { ModeleApercu.nombre($0) }, categorie)
        let longueurMinutes = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.minutesSousSeuil, categorie: categorie)
        mesures.append(AxeMesure(
            nom: "minutes Y", total: totalMinutes,
            retenus: MinutesSousSeuilView.reperesAxeY(domaine: domaineMinutes, longueur: longueurMinutes, categorie: categorie),
            domaine: domaineMinutes, longueur: longueurMinutes, taille: hauteurX
        ))
        let etiquettes = indicesEtiquettesSemaines(nM).map(Double.init)
        let libelle: (Double) -> String? = { ModeleCharge.libelleSemaine(lundisM, $0) }
        let longueurX = DimensionsGraphique.longueurAxeX(largeurGraphique: largeurAxeX, largeurAxeY: largeurMinutes)
        mesures.append(AxeMesure(
            nom: "minutes X", total: etiquettes,
            retenus: MinutesSousSeuilView.reperesAxeX(etiquettes: etiquettes, nombreSemaines: nM, libelle: libelle, longueur: longueurX, categorie: categorie),
            domaine: 0...Double(nM - 1), longueur: longueurX,
            taille: largeurMaxLibelles(etiquettes.compactMap(libelle), categorie: categorie)
        ))
    }

    // Progressivité : les jours de la fenêtre (112 ou 365). Y du volume et du ratio, X des dates des points affichés.
    let fenetreJours = joursDeLaFenetre(fenetre)
    let datesJ = Array(s.datesJour.suffix(fenetreJours))
    let points = zip(datesJ, zip(Array(s.volumesJour.suffix(fenetreJours)), Array(s.ratiosJour.suffix(fenetreJours)))).map { date, valeurs in
        ModeleCharge.PointRatio(
            id: civile(date), date: date, segment: 0, s7: valeurs.0, chronic: valeurs.0 * 0.95, r: valeurs.1, etat: .ok
        )
    }
    if !points.isEmpty, let premier = datesJ.first, let dernier = datesJ.last {
        let domaines = ModeleCharge.domainesProgressivite(points: points)
        let totalVolume = Axes.graduations(domaines.volume, pas: 10)
        let longueurVolume = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.progressiviteVolume, categorie: categorie)
        mesures.append(AxeMesure(
            nom: "progressivité volume Y", total: totalVolume,
            retenus: ProgressiviteView.reperesAxeY(domaine: domaines.volume, pas: 10, longueur: longueurVolume, categorie: categorie),
            domaine: domaines.volume, longueur: longueurVolume, taille: hauteurX
        ))

        let totalRatio = Axes.graduations(domaines.ratio, pas: 0.2)
        let largeurRatio = largeurMax(totalRatio.map { ModeleApercu.nombre($0, 1) }, categorie)
        let longueurRatio = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.progressiviteRatio, categorie: categorie)
        mesures.append(AxeMesure(
            nom: "progressivité ratio Y", total: totalRatio,
            retenus: ProgressiviteView.reperesAxeY(domaine: domaines.ratio, pas: 0.2, longueur: longueurRatio, categorie: categorie),
            domaine: domaines.ratio, longueur: longueurRatio, taille: hauteurX
        ))

        // Total : les candidats de la fenêtre. Taille : le libellé le plus long de toutes les dates, dans la locale et le calendrier fixés.
        let locale = Locale(identifier: "fr_FR")
        let formatX = ProgressiviteView.formatReperesX(fenetre, locale: locale, calendrier: calendrier)
        let tailleDates = largeurMax(datesJ.map { $0.formatted(formatX) }, categorie)
        let longueurDates = DimensionsGraphique.longueurAxeX(largeurGraphique: largeurAxeX, largeurAxeY: largeurRatio)
        mesures.append(AxeMesure(
            nom: "progressivité X (dates)", total: ProgressiviteView.candidatsReperesX(datesJ, fenetre: fenetre, calendrier: calendrier).map(\.timeIntervalSince1970),
            retenus: ProgressiviteView.reperesAxeX(dates: datesJ, fenetre: fenetre, longueur: longueurDates, locale: locale, calendrier: calendrier, categorie: categorie).map(\.timeIntervalSince1970),
            domaine: premier.timeIntervalSince1970...dernier.timeIntervalSince1970, longueur: longueurDates, taille: tailleDates
        ))
    }
    return mesures
}

/// Contrat d'un axe : sous-ensemble ordonné du total, au moins deux repères quand deux libellés tiennent aux extrémités,
/// espacement minimal d'au moins la taille du libellé + 4 pt.
@MainActor
private func verifieContrat(_ mesure: AxeMesure, contexte: String) {
    #expect(Set(mesure.retenus).isSubset(of: mesure.total), "\(contexte) : un repère retenu n'est pas dans le domaine")
    #expect(mesure.retenus == mesure.retenus.sorted(), "\(contexte) : repères retenus non ordonnés")
    if mesure.total.count >= 2, mesure.longueur >= mesure.taille + margeEspacement {
        #expect(
            mesure.retenus.count >= 2,
            "\(contexte) : \(mesure.retenus.count) repère(s) retenu(s), au moins 2 attendus (deux libellés tiennent aux extrémités)"
        )
    }
    let espace = espaceMinimal(mesure.retenus, domaine: mesure.domaine, longueur: mesure.longueur)
    #expect(
        espace >= mesure.taille + margeEspacement,
        "\(contexte) : \(mesure.retenus.count) repères, espace minimal \(espace) pt sur \(mesure.longueur) pt, libellé de \(mesure.taille) pt (+4 pt exigés)"
    )
}

/// Positif conditionnel : si le total tient, rien ne doit être retiré. Sinon, le contrat s'applique et ce test ne tranche pas.
@MainActor
private func verifiePositif(_ mesure: AxeMesure, contexte: String) {
    let espaceTotal = espaceMinimal(mesure.total, domaine: mesure.domaine, longueur: mesure.longueur)
    guard espaceTotal >= mesure.taille + margeEspacement else { return }
    #expect(mesure.retenus == mesure.total, "\(contexte) : \(mesure.total.count - mesure.retenus.count) repère(s) retiré(s) alors que le total tient")
}

@Suite("Graduations des axes de la Progression, de l'historique et de la charge")
struct ProgressionGraduationsTests {

    @MainActor
    @Test(arguments: Cas.produit(Scenario.tous))
    func lesRepèresRetenusTiennentSurLAxe(cas: Cas) {
        for mesure in axesMesures(cas.scenario, largeur: cas.largeur, categorie: cas.categorie) {
            verifieContrat(mesure, contexte: "\(mesure.nom), \(cas.testDescription)")
        }
    }

    @MainActor
    @Test(arguments: Cas.produit(Scenario.peuDeDonnees))
    func siLeTotalTientRienNEstRetire(cas: Cas) {
        for mesure in axesMesures(cas.scenario, largeur: cas.largeur, categorie: cas.categorie) {
            verifiePositif(mesure, contexte: "\(mesure.nom), \(cas.testDescription)")
        }
    }

    @MainActor
    @Test(arguments: CasCharge.produit(ScenarioCharge.tous))
    func lesRepèresDesVuesDeChargeTiennentSurLAxe(cas: CasCharge) {
        for mesure in axesMesuresCharge(cas.scenario, largeur: cas.largeur, categorie: cas.categorie, fenetre: cas.fenetre) {
            verifieContrat(mesure, contexte: "\(mesure.nom), \(cas.testDescription)")
        }
    }

    @MainActor
    @Test(arguments: CasCharge.produit(ScenarioCharge.peuDeDonnees))
    func siLeTotalDesVuesDeChargeTientRienNEstRetire(cas: CasCharge) {
        for mesure in axesMesuresCharge(cas.scenario, largeur: cas.largeur, categorie: cas.categorie, fenetre: cas.fenetre) {
            verifiePositif(mesure, contexte: "\(mesure.nom), \(cas.testDescription)")
        }
    }
}
