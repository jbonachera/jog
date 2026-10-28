// Graduations lisibles sur les axes de la Progression et de l'aperçu forme/fatigue.
// Le test appelle les fonctions pures de repères de chaque vue (TendancesView, NuageView, DerniereSeanceView,
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
private let seuilSeance: Double = 296
private let bandeSeance: (lo: Double, hi: Double) = (299, 305)
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

/// Un jeu de données de Progression et de forme. Allures et répétitions en s/km, FC en bpm, forme en points.
struct Scenario: Sendable, CustomTestStringConvertible {
    let nom: String
    let dates: [Date]
    let allures: [Double]
    let fc: [Double]
    let repetitions: [Double]
    /// Forme de fond par date (la fatigue suit la forme de 6 points dans le test).
    let formes: [Double]

    var testDescription: String { nom }

    static let longue = datesHebdomadaires(190)
    static let allureRealiste = (0..<190).map { (i: Int) -> Double in 318 - Double(i) * 0.05 + Double((i * 7) % 11 - 5) }
    static let allureExtreme = (0..<190).map { (i: Int) -> Double in 210 + Double((i * 37) % 221) }
    static let fcRealiste = (0..<40).map { (i: Int) -> Double in 150 + Double((i * 7) % 26) }
    static let fcExtreme = (0..<40).map { (i: Int) -> Double in 120 + Double((i * 29) % 81) }
    static let repetitionsRealistes = (0..<20).map { (i: Int) -> Double in 296 + Double((i * 7) % 11 - 5) }
    static let repetitionsExtremes: [Double] = [240, 420, 300, 360, 250, 410, 330, 280, 390, 260, 240, 420, 300, 360, 250, 410, 330, 280, 390, 260]
    static let formesRealistes = (0..<190).map { (i: Int) -> Double in 40 + Double((i * 5) % 13) }
    static let formesExtremes = (0..<190).map { (i: Int) -> Double in -120 + Double((i * 41) % 260) }

    static let realisteTroisAns = Scenario(
        nom: "réaliste, 3,5 ans", dates: longue, allures: allureRealiste, fc: fcRealiste,
        repetitions: repetitionsRealistes, formes: formesRealistes
    )
    static let extremeTroisAns = Scenario(
        nom: "extrême, 3,5 ans", dates: longue, allures: allureExtreme, fc: fcExtreme,
        repetitions: repetitionsExtremes, formes: formesExtremes
    )
    static let domainePlat = Scenario(
        nom: "domaine plat", dates: longue, allures: Array(repeating: 300, count: 190),
        fc: Array(repeating: 160, count: 40), repetitions: Array(repeating: 300, count: 20), formes: Array(repeating: 40, count: 190)
    )
    static let vingtRepetitions = Scenario(nom: "vingt répétitions extrêmes", dates: [], allures: [], fc: [], repetitions: repetitionsExtremes, formes: [])
    static let zeroPoint = Scenario(nom: "zéro point", dates: [], allures: [], fc: [], repetitions: [], formes: [])
    static let unPoint = Scenario(
        nom: "un point", dates: Array(longue.prefix(1)), allures: [318], fc: [160], repetitions: [300], formes: [40]
    )
    static let deuxPoints = Scenario(
        nom: "deux points", dates: Array(longue.prefix(2)), allures: [318, 305], fc: [160, 165], repetitions: [300, 302], formes: [40, 42]
    )

    /// Tous les scénarios du contrat.
    static let tous: [Scenario] = [realisteTroisAns, extremeTroisAns, domainePlat, vingtRepetitions, zeroPoint, unPoint, deuxPoints]
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

    // Dernière séance : Y (allures, pas 5 s/km) et X (numéros de répétition, sur l'étendue de la vue).
    if !scenario.repetitions.isEmpty {
        let n = scenario.repetitions.count
        let domaineY = ModeleProgression.domaineAllure(scenario.repetitions, reperes: [seuilSeance, bandeSeance.lo, bandeSeance.hi])
        let totalY = Axes.graduations(domaineY, pas: 5)
        let largeurSeanceY = largeurMaxLibelles(totalY.map { formatAllure($0) }, categorie: categorie)
        let longueurY = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.derniereSeance, categorie: categorie, lignesX: 2)
        mesures.append(AxeMesure(
            nom: "dernière séance Y", total: totalY,
            retenus: DerniereSeanceView.reperesAxeY(domaine: domaineY, longueur: longueurY, categorie: categorie),
            domaine: domaineY, longueur: longueurY, taille: hauteurX
        ))

        let numeros = Array(1...n)
        let longueurX = DimensionsGraphique.longueurAxeX(largeurGraphique: largeurAxeX, largeurAxeY: largeurSeanceY)
        mesures.append(AxeMesure(
            nom: "dernière séance X", total: numeros.map(Double.init),
            retenus: DerniereSeanceView.reperesAxeX(numeros: numeros, longueur: longueurX, categorie: categorie),
            domaine: DerniereSeanceView.etendueX(nombre: n), longueur: longueurX,
            taille: largeurMaxLibelles(numeros.map { "#\($0)" }, categorie: categorie)
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

@Suite("Graduations des axes de la Progression et de la forme")
struct ProgressionGraduationsTests {

    /// Contrat : les repères retenus sont un sous-ensemble ordonné du total, espacés d'au moins la taille du libellé + 4 pt.
    @MainActor
    @Test(arguments: Cas.produit(Scenario.tous))
    func lesRepèresRetenusTiennentSurLAxe(cas: Cas) {
        for mesure in axesMesures(cas.scenario, largeur: cas.largeur, categorie: cas.categorie) {
            let contexte = "\(mesure.nom), \(cas.testDescription)"
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
    }

    /// Positif conditionnel : si le total tient (espacement ≥ libellé + 4 pt), rien ne doit être retiré. Sinon, le contrat
    /// ci-dessus s'applique et ce test ne tranche pas.
    @MainActor
    @Test(arguments: Cas.produit(Scenario.peuDeDonnees))
    func siLeTotalTientRienNEstRetire(cas: Cas) {
        for mesure in axesMesures(cas.scenario, largeur: cas.largeur, categorie: cas.categorie) {
            let espaceTotal = espaceMinimal(mesure.total, domaine: mesure.domaine, longueur: mesure.longueur)
            guard espaceTotal >= mesure.taille + margeEspacement else { continue }
            #expect(
                mesure.retenus == mesure.total,
                "\(mesure.nom), \(cas.testDescription) : \(mesure.total.count - mesure.retenus.count) repère(s) retiré(s) alors que le total tient"
            )
        }
    }
}
