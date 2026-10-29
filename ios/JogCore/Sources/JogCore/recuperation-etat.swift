// État, titre et phrase de la récupération (D-015, D-023 ; docs/design/04-metriques.md « Récupération » ; docs/
// implementation/recuperation.md, lot 4). Fonctions pures sur un point de la série. Les comparaisons se font après
// `arrondir` (D-015, arrondi au plus proche, mi-chemin loin de zéro).
import Foundation

public enum EtatRecuperation: String, Codable, Sendable, Equatable {
    case dansLaNorme = "dans-la-norme", sousLaNorme = "sous-la-norme", basse
    case normeEnCours = "norme-en-cours", nuitsInsuffisantes = "nuits-insuffisantes"
}

/// VFC des 7 nuits sous la borne basse de la norme, après arrondi (D-015).
func vfcSousLaNorme(_ vfc7: Double, _ vfcBas: Double) throws -> Bool {
    try arrondir(vfc7, 1) < arrondir(vfcBas, 1)
}

/// FC de repos des 7 nuits au-dessus de la borne haute de la norme, après arrondi (D-015).
func fcAuDessusDeLaNorme(_ fc7: Double, _ fcHaut: Double) throws -> Bool {
    try arrondir(fc7, 1) > arrondir(fcHaut, 1)
}

/// État de la récupération du jour (D-023). La norme absente passe avant le manque de nuits : « Norme en cours de
/// calcul » l'emporte sur « Pas assez de nuits ».
public func etatRecuperation(_ p: PointRecuperation) throws -> EtatRecuperation {
    guard let vfcBas = p.vfcBas, let fcHaut = p.fcHaut else { return .normeEnCours }
    guard let vfc7 = p.vfc7_ms, let fc7 = p.fc7 else { return .nuitsInsuffisantes }
    let bas = try vfcSousLaNorme(vfc7, vfcBas)
    let haute = try fcAuDessusDeLaNorme(fc7, fcHaut)
    if bas && haute { return .basse }
    if bas { return .sousLaNorme }
    return .dansLaNorme
}

/// Titre de l'état (03 R2, 05).
public func titreEtatRecuperation(_ e: EtatRecuperation) -> String {
    switch e {
    case .dansLaNorme: return "Dans ta norme"
    case .sousLaNorme: return "Sous ta norme"
    case .basse: return "Récupération basse"
    case .normeEnCours: return "Norme en cours de calcul"
    case .nuitsInsuffisantes: return "Pas assez de nuits"
    }
}

/// Phrase de l'état, textes de 04 « Récupération ». Lève RangeError si le point ne porte pas les valeurs que l'état
/// suppose.
public func phraseRecuperation(_ e: EtatRecuperation, point p: PointRecuperation) throws -> String {
    switch e {
    case .dansLaNorme:
        if let vfc = p.vfc_ms, let vfcBas = p.vfcBas, try arrondir(vfc, 1) < arrondir(RECUPERATION.nuitBasseFraction * vfcBas, 1) {
            return "Nuit dernière basse (VFC \(try formatNombre(vfc, 0)) ms), mais une nuit isolée ne change pas la tendance des 7 nuits."
        }
        return "VFC et FC de repos des 7 dernières nuits restent dans ta plage habituelle."
    case .sousLaNorme:
        return "La VFC des 7 dernières nuits est passée sous ta plage habituelle. La FC de repos tient encore."
    case .basse:
        guard let vfc7 = p.vfc7_ms, let vfcBas = p.vfcBas, let vfcHaut = p.vfcHaut, let fc7 = p.fc7 else {
            throw RangeError("phrase « basse » sans VFC ni FC sur 7 nuits, ou sans norme")
        }
        return "VFC sous ta norme (\(try formatNombre(vfc7, 0)) ms contre \(try formatNombre(vfcBas, 0))–\(try formatNombre(vfcHaut, 0))) et FC de repos au-dessus (\(try formatNombre(fc7, 0)) bpm). Le corps n’absorbe pas la charge actuelle."
    case .normeEnCours:
        return texteNormeEnCours(p.nuitsNormeVfc)
    case .nuitsInsuffisantes:
        return texteManqueDeNuits(p.nuitsFenetreVfc)
    }
}

/// « Norme en cours de calcul », avec le nombre de nuits mesurées de la norme (04).
func texteNormeEnCours(_ nuitsMesurees: Int) -> String {
    "Norme en cours de calcul : il faut \(RECUPERATION.minNuitsNorme) nuits mesurées (\(nuitsMesurees) pour l’instant)."
}

/// « Pas assez de nuits », avec le nombre de nuits sur les 7 dernières (04).
func texteManqueDeNuits(_ nuits: Int) -> String {
    "Il faut \(RECUPERATION.minNuitsFenetre) nuits mesurées sur les \(RECUPERATION.nuitsFenetre) dernières (\(nuits) pour l’instant)."
}
