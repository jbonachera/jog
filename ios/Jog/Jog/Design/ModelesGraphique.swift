// Types partagés par les graphiques de l'app (08 : vue tableau D-011, description VoiceOver, axes). Aucun import
// SwiftUI : ce fichier se teste sans interface. Les domaines d'axe viennent de JogCore (`domaineAxe`, D-009).
import Foundation

/// Graphique ou tableau des mêmes séries (D-011). Le choix n'est pas mémorisé.
enum ModeAffichage: CaseIterable, Hashable, Sendable {
    case graphique, tableau

    var libelle: String {
        switch self {
        case .graphique: "Graphique"
        case .tableau: "Tableau"
        }
    }
}

/// Un tableau des mêmes séries qu'un graphique : en-têtes réels et lignes déjà formatées, dans l'ordre du graphique.
struct TableauAffiche: Equatable, Sendable {
    let entetes: [String]
    let lignes: [[String]]
}

/// Les données d'un graphique pour sa description VoiceOver (08). `libelles` donne le nom lu de chaque position ; une série
/// sans valeur à une position n'a pas de point là.
struct DonneesAccessibles: Equatable, Sendable {
    struct Serie: Equatable, Sendable {
        let nom: String
        let valeurs: [Double?]
    }

    let titre: String
    let resume: String
    let axeX: String
    let axeY: String
    let unite: String
    let libelles: [String]
    let series: [Serie]
    let domaineY: ClosedRange<Double>
    let continu: Bool
}

enum Axes {
    /// Espace exigé entre deux repères retenus, au-delà de la taille du libellé (pt).
    static let margeLibelle: CGFloat = 4

    /// Les graduations d'un domaine, de pas en pas. Le domaine vient de `domaineAxe` (JogCore, D-009).
    static func graduations(_ domaine: ClosedRange<Double>, pas: Double) -> [Double] {
        guard pas > 0 else { return [domaine.lowerBound] }
        return stride(from: domaine.lowerBound, through: domaine.upperBound, by: pas).map { $0 }
    }

    /// Graduations retenues sur un axe de `longueur` pt dont chaque libellé occupe `tailleLibelle` pt. Sous-ensemble ordonné
    /// dont chaque espacement vaut au moins `tailleLibelle + margeLibelle`. Le pas est régulier, sauf pour le dernier repère,
    /// ajouté pour garder l'extrémité quand il tient. Rien n'est retiré si tout tient.
    static func graduations(domaine: ClosedRange<Double>, pas: Double, longueur: CGFloat, tailleLibelle: CGFloat) -> [Double] {
        let toutes = graduations(domaine, pas: pas)
        return echantillon(toutes, domaine: domaine, longueur: longueur, tailleLibelle: tailleLibelle).map { toutes[$0] }
    }

    /// Repères entiers (numéros de répétition) retenus sur un axe de `longueur` pt. Même règle que `graduations(domaine:…)`.
    static func reperesEntiers(_ valeurs: [Int], longueur: CGFloat, tailleLibelle: CGFloat) -> [Double] {
        let toutes = valeurs.map(Double.init)
        guard let premier = toutes.first, let dernier = toutes.last else { return [] }
        let domaine = (premier - 0.5)...(dernier + 0.5)
        return echantillon(toutes, domaine: domaine, longueur: longueur, tailleLibelle: tailleLibelle).map { toutes[$0] }
    }

    /// Repères choisis parmi des valeurs croissantes (positions libres : étiquettes de semaines, dates), retenus sur un axe
    /// de `longueur` pt couvrant `domaine`. Même règle que `graduations(domaine:…)`.
    static func reperesChoisis(_ valeurs: [Double], domaine: ClosedRange<Double>, longueur: CGFloat, tailleLibelle: CGFloat) -> [Double] {
        echantillon(valeurs, domaine: domaine, longueur: longueur, tailleLibelle: tailleLibelle).map { valeurs[$0] }
    }

    /// Repères mensuels (premier jour de chaque mois, à minuit du calendrier fourni) entre deux dates, retenus sur un axe
    /// de `longueur` pt. Même règle que `graduations(domaine:…)`, sur les dates. Le premier repère est toujours retenu : il
    /// porte l'année du libellé.
    static func reperesMois(entre debut: Date, et fin: Date, calendrier: Calendar, longueur: CGFloat, tailleLibelle: CGFloat) -> [Date] {
        guard debut <= fin, let premier = calendrier.dateInterval(of: .month, for: debut)?.start else { return [] }
        var courant = premier
        var toutes: [Date] = []
        while courant <= fin {
            if courant >= debut { toutes.append(courant) }
            guard let suivant = calendrier.date(byAdding: .month, value: 1, to: courant) else { break }
            courant = suivant
        }
        let domaine = debut.timeIntervalSince1970...fin.timeIntervalSince1970
        let indices = echantillon(toutes.map(\.timeIntervalSince1970), domaine: domaine, longueur: longueur, tailleLibelle: tailleLibelle)
        return indices.map { toutes[$0] }
    }

    /// Indices retenus parmi des valeurs croissantes, placées linéairement sur un axe de `longueur` pt couvrant `domaine`.
    /// Rien n'est retiré si l'espacement minimal tient. Sinon : le plus petit pas régulier qui tient, en gardant le dernier
    /// repère quand il le peut. À défaut, le premier seul.
    static func echantillon(_ valeurs: [Double], domaine: ClosedRange<Double>, longueur: CGFloat, tailleLibelle: CGFloat) -> [Int] {
        let n = valeurs.count
        guard n > 1, longueur.isFinite else { return Array(valeurs.indices) }
        let seuil = tailleLibelle + margeLibelle
        let etendue = domaine.upperBound - domaine.lowerBound
        let positions: [CGFloat] = valeurs.map { etendue > 0 ? CGFloat(($0 - domaine.lowerBound) / etendue) * longueur : 0 }
        func espaceMinimal(_ indices: [Int]) -> CGFloat {
            let pos = indices.map { positions[$0] }
            return zip(pos, pos.dropFirst()).map { $1 - $0 }.min() ?? .infinity
        }

        let toutes = Array(valeurs.indices)
        if espaceMinimal(toutes) >= seuil { return toutes }
        for pas in stride(from: 2, through: n - 1, by: 1) {
            var indices = Array(stride(from: 0, to: n, by: pas))
            if indices.last != n - 1 {
                indices.append(n - 1)
                if indices.count > 2, positions[n - 1] - positions[indices[indices.count - 2]] < seuil {
                    indices.remove(at: indices.count - 2)
                } else if indices.count == 2, positions[n - 1] - positions[0] < seuil {
                    continue
                }
            }
            if espaceMinimal(indices) >= seuil { return indices }
        }
        return [0]
    }
}
