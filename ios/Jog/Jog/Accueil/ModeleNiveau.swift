// En-tête du niveau, radar des six qualités, bulle, et liste des courses de N2 (03 N1, N2 ; 04, « VDOT et niveau »,
// « Six qualités », « Records » ; D-027, D-028 ; points de décision 6, 9 et 14 ; docs/implementation/refonte-accueil.md,
// lot 15). Aucun import SwiftUI : ce fichier se teste sans interface. Les calculs restent dans JogCore (VueNiveau,
// SixQualites, LigneCourse, recordsParDistance) ; ici, seulement la mise en forme et la géométrie du radar.
import Foundation
import CoreGraphics
import JogCore

enum ModeleNiveau {
    // MARK: - En-tête

    /// En-tête du niveau (N1) : « Niveau (VDOT) », valeur, il y a un an, écart et son ton ; sous-titre de la référence.
    struct EnTete: Equatable {
        let titre: String
        let valeur: String?
        let ilYAUnAn: String?
        let ecart: String?
        let ton: Ton
        let sousTitre: String?
    }

    /// Un axe du radar (N1) : nom, écart affiché et son ton, rayon de l'anneau, et les deux phrases de la bulle.
    struct Axe: Identifiable, Equatable {
        let id: Qualite
        let nom: String
        let ecart: String
        let ton: Ton
        let rayon: Double
        /// La mesure de la bulle, capitalisée (textes de la maquette).
        let mesure: String
        /// « +14 % face à il y a un an », ou « Pas encore de comparaison ».
        let comparaison: String
        let accessibilite: String
    }

    static func enTete(_ n: VueNiveau, _ q: SixQualites) -> EnTete {
        guard let valeur = n.valeur else {
            return EnTete(
                titre: "Niveau en cours : cours un test 5 km", valeur: nil, ilYAUnAn: nil, ecart: nil,
                ton: .neutre, sousTitre: nil
            )
        }
        let ecart = n.ecart
        return EnTete(
            titre: "Niveau (VDOT)",
            valeur: ModeleApercu.nombre(valeur, 1),
            ilYAUnAn: n.ilYAUnAn.map { ModeleApercu.nombre($0, 1) },
            ecart: ecart.map { ModeleApercu.signe($0, 1) },
            ton: ecart.map(tonDeSigne) ?? .neutre,
            sousTitre: referenceDeRepli(q) ? "face à tes 12 premières semaines" : nil
        )
    }

    /// Q et Q₀ disjoints avec une référence de repli : la comparaison se fait aux 12 premières semaines (point 6).
    private static func referenceDeRepli(_ q: SixQualites) -> Bool {
        guard q.referencePremieresSemaines, let fenetre = q.Q, let reference = q.Q0 else { return false }
        return (try? numeroJour(fenetre.0)) ?? 0 > ((try? numeroJour(reference.1)) ?? 0)
    }

    private static func tonDeSigne(_ valeur: Double) -> Ton {
        if valeur > 0 { return .bon }
        if valeur < 0 { return .attention }
        return .neutre
    }

    // MARK: - Axes

    /// Les six axes dans l'ordre horaire depuis le haut (03 N1). Chaque écart s'écrit dans son unité (D-015).
    static func axes(_ q: SixQualites) -> [Axe] {
        q.axes.map { axe in
            let ecart = ecartTexte(axe.ecartAffiche, axe.qualite)
            let nom = nomQualite(axe.qualite)
            let comparaison = ecart.map { "\($0) face à il y a un an" } ?? "Pas encore de comparaison"
            return Axe(
                id: axe.qualite,
                nom: nom,
                ecart: ecart ?? ModeleApercu.tiret,
                ton: tonAxe(axe.ecartOriente, axe.qualite),
                rayon: axe.rayon,
                mesure: mesureQualite(axe.qualite),
                comparaison: comparaison,
                accessibilite: "\(nom), \(ecart.map { "\($0) face à il y a un an" } ?? "pas encore de comparaison")"
            )
        }
    }

    /// Sommets du radar : le premier en haut, puis un pas régulier dans le sens horaire. `rayon` est celui de l'anneau
    /// extérieur ; chaque axe se place à `rayon × axe.rayon` (0,5 = l'anneau du milieu).
    static func sommets(_ axes: [Axe], centre: CGPoint, rayon: Double) -> [CGPoint] {
        axes.enumerated().map { i, axe in
            point(centre, direction(i, sur: axes.count), rayon * axe.rayon)
        }
    }

    /// Un anneau du radar : polygone régulier à `fraction × rayon` (25, 50, 75 ou 100 % de l'anneau extérieur).
    static func anneau(_ fraction: Double, centre: CGPoint, rayon: Double, nombre: Int) -> [CGPoint] {
        (0..<max(nombre, 0)).map { i in point(centre, direction(i, sur: nombre), rayon * fraction) }
    }

    /// Direction unitaire du sommet `i` sur `n` : le premier en haut (−90°), puis un pas de 360°/n dans le sens horaire.
    static func direction(_ i: Int, sur n: Int) -> CGVector {
        let angle = (-90.0 + Double(i) * 360.0 / Double(max(n, 1))) * .pi / 180
        return CGVector(dx: cos(angle), dy: sin(angle))
    }

    private static func point(_ centre: CGPoint, _ direction: CGVector, _ distance: Double) -> CGPoint {
        CGPoint(x: centre.x + distance * direction.dx, y: centre.y + distance * direction.dy)
    }

    /// Ce que la carte Niveau affiche, calculé une fois par Vue (`CacheNiveau`) : en-tête et six axes.
    struct Calculs: Equatable {
        let enTete: EnTete
        let axes: [Axe]
    }

    /// Les calculs de JogCore (niveau VDOT, six qualités) mis en forme ; nil si l'un des deux ne se calcule pas.
    static func calculs(_ vue: Vue) -> Calculs? {
        guard let niveau = try? niveauVDOT(vue), let six = try? sixQualites(vue) else { return nil }
        return Calculs(enTete: enTete(niveau, six), axes: axes(six))
    }

    private static func nomQualite(_ q: Qualite) -> String {
        switch q {
        case .volume: "Volume"
        case .seuil: "Seuil"
        case .efficacite: "Efficacité"
        case .endurance: "Endurance"
        case .regularite: "Régularité"
        case .resilience: "Résilience"
        }
    }

    /// Mesure de la bulle (maquette, `QUAL[].m`), capitalisée.
    private static func mesureQualite(_ q: Qualite) -> String {
        switch q {
        case .volume: "Km par semaine en moyenne"
        case .seuil: "Allure sous-seuil normalisée à ta FC de référence"
        case .efficacite: "Efficacité en footing : vitesse divisée par la FC"
        case .endurance: "Découplage moyen des sorties longues"
        case .regularite: "Part des semaines avec au moins 4 séances"
        case .resilience: "VFC de base : milieu de ta norme sur 60 nuits"
        }
    }

    /// L'écart affiché dans l'unité de la qualité, à la précision de l'affichage ; nil sans écart.
    private static func ecartTexte(_ valeur: Double?, _ q: Qualite) -> String? {
        guard let valeur else { return nil }
        let espace = "\u{00A0}"
        switch q {
        case .volume, .efficacite: return ModeleApercu.ecartPourcentage(valeur)
        case .seuil: return ModeleApercu.signe(valeur, 0, unite: "\(espace)s/km")
        case .endurance: return (try? formatEcartPoints(valeur, 1)) ?? ModeleApercu.tiret
        case .regularite: return (try? formatEcartPoints(valeur, 0)) ?? ModeleApercu.tiret
        case .resilience: return ModeleApercu.signe(valeur, 0, unite: "\(espace)ms")
        }
    }

    /// Le ton suit le sens du progrès (écart orienté, D-015 : arrondi à la précision affichée), neutre si nul ou absent.
    private static func tonAxe(_ oriente: Double?, _ q: Qualite) -> Ton {
        guard let oriente, let arrondi = try? arrondir(oriente, pasAffichage(q)) else { return .neutre }
        return tonDeSigne(arrondi)
    }

    /// Pas d'arrondi de l'écart affiché : 0,1 pour l'endurance (points), 1 pour les autres.
    private static func pasAffichage(_ q: Qualite) -> Double {
        q == .endurance ? 0.1 : 1
    }

    // MARK: - Courses (N2)

    /// Le filtre de la liste N2 (02, « Filtre des courses ») : non mémorisé.
    enum FiltreCourses: CaseIterable, Equatable {
        case toutes, cinqKm, dixKm, semi, marathon

        var libelle: String {
            switch self {
            case .toutes: "Toutes"
            case .cinqKm: "5 km"
            case .dixKm: "10 km"
            case .semi: "Semi"
            case .marathon: "Marathon"
            }
        }

        func retient(_ distance: DistanceCourse) -> Bool {
            switch self {
            case .toutes: true
            case .cinqKm: distance == .cinqKm
            case .dixKm: distance == .dixKm
            case .semi: distance == .semi
            case .marathon: distance == .marathon
            }
        }
    }

    /// Une course ou un test, prêt à afficher. `record` : la course qui détient le record de sa distance (P5, point 14).
    struct Ligne: Identifiable, Equatable {
        let id: String
        let date: String
        let titre: String
        let temps: String
        let allure: String
        let vdot: String
        let record: Bool
        let accessibilite: String
    }

    /// Les courses d'une année, la plus récente en haut.
    struct Annee: Identifiable, Equatable {
        let annee: Int
        let lignes: [Ligne]
        var id: Int { annee }
    }

    struct PointCourbe: Equatable {
        let date: DateCivile
        let vdot: Double
    }

    /// La courbe des VDOT (maquette, sparkline) : un point par course, du plus ancien au plus récent ; référence = il y a un an.
    struct Courbe: Equatable {
        let points: [PointCourbe]
        let reference: Double?
    }

    /// Le titre de la liste : « 7 courses et tests ».
    static func titreCompte(_ l: [LigneCourse]) -> String {
        ModeleApercu.pluriel(l.count, "course et test", "courses et tests")
    }

    /// La liste N2, filtrée, groupée par année (la plus récente en haut). `l` est dans l'ordre de `coursesEtTests` (du plus
    /// récent au plus ancien). Le record vient de `recordsParDistance` (point de décision 14), calculé sur toute la liste.
    static func courses(_ l: [LigneCourse], filtre: FiltreCourses) -> [Annee] {
        let records = recordsParDistance(l)
        var parAnnee: [Int: [Ligne]] = [:]
        for course in l where filtre.retient(course.distance) {
            parAnnee[annee(course.date), default: []].append(ligne(course, record: records.contains(course.cleSource)))
        }
        return parAnnee.keys.sorted(by: >).map { Annee(annee: $0, lignes: parAnnee[$0] ?? []) }
    }

    /// La courbe des VDOT, du plus ancien au plus récent, avec la valeur d'il y a un an en référence.
    static func courbe(_ l: [LigneCourse], ilYAUnAn: Double?) -> Courbe {
        Courbe(points: l.reversed().map { PointCourbe(date: $0.date, vdot: $0.vdot) }, reference: ilYAUnAn)
    }

    private static func ligne(_ c: LigneCourse, record: Bool) -> Ligne {
        let titre = c.estTest ? "Test \(titreDistance(c.distance))" : titreDistance(c.distance)
        let temps = formatTempsCourse(c.temps_s)
        let allure = "\(formatAllure(c.allure_skm))/km"
        let vdot = ModeleApercu.nombre(c.vdot, 1)
        return Ligne(
            id: c.cleSource, date: formatDate(c.date), titre: titre, temps: temps, allure: allure, vdot: vdot,
            record: record,
            accessibilite: "\(titre), \(temps), \(allure), VDOT \(vdot)\(record ? ", record" : "")"
        )
    }

    private static func titreDistance(_ d: DistanceCourse) -> String {
        switch d {
        case .cinqKm: "5 km"
        case .dixKm: "10 km"
        case .semi: "Semi"
        case .marathon: "Marathon"
        case .autre(let km):
            km.rounded() == km ? "\(ModeleApercu.nombre(km)) km" : "\(ModeleApercu.nombre(km, 1)) km"
        }
    }

    private static func annee(_ d: DateCivile) -> Int {
        (try? decomposerDate(d).annee) ?? 0
    }
}
