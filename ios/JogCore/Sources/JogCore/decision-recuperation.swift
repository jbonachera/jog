// Signal 8 « Récupération » (D-023 ; 05, « Tableau des signaux » et « Textes d'explication »). Traduit du point de vue du
// moteur : pas de référence TypeScript. L'état vient de la Vue (`etatRecuperation`, D-015 déjà appliqué) ; le signal n'en
// fait que la correspondance avec les états du verdict.
import Foundation

/// Pas d'arrondi de la VFC affichée, en ms : la comparaison d'état se fait au même pas (D-015, `etatRecuperation`).
private let PAS_VFC_MS = 1.0

/// Le 8ᵉ signal, à partir de la Vue de récupération de la veille. Dans la norme → ok ; sous la norme → surveiller ; basse →
/// alerte ; norme en cours ou nuits insuffisantes → insuffisant, valeur « – ». Non décisif : voir `verdictDe`.
func signalRecuperation(_ r: VueRecuperation) throws -> Signal {
    let cle = CleSignal.recuperation
    let nom = NOMS_SIGNAUX[cle] ?? ""

    let etat: EtatSignal
    switch r.etat {
    case .dansLaNorme: etat = .ok
    case .sousLaNorme: etat = .surveiller
    case .basse: etat = .alerte
    case .normeEnCours, .nuitsInsuffisantes:
        return Signal(cle: cle, nom: nom, etat: .insuffisant, valeur: nil, valeurTexte: "–", explication: r.phrase)
    }

    // Les trois états « avec valeur » supposent une VFC sur 7 nuits (D-023) ; sans elle, le signal est insuffisant.
    guard let vfc7 = r.point.vfc7_ms else {
        return Signal(cle: cle, nom: nom, etat: .insuffisant, valeur: nil, valeurTexte: "–", explication: r.phrase)
    }
    let valeur = try arrondir(vfc7, PAS_VFC_MS)
    let explication: String
    switch r.etat {
    case .basse:
        explication = "VFC sous ta norme et FC de repos au-dessus de la sienne."
    default:
        guard let vfcBas = r.point.vfcBas, let vfcHaut = r.point.vfcHaut else {
            return Signal(cle: cle, nom: nom, etat: .insuffisant, valeur: nil, valeurTexte: "–", explication: r.phrase)
        }
        let plage = "\(try formatNombre(vfcBas, 0))–\(try formatNombre(vfcHaut, 0))"
        explication = r.etat == .dansLaNorme
            ? "VFC des 7 dernières nuits dans ta norme (\(plage) ms)."
            : "VFC des 7 dernières nuits sous ta norme (\(plage) ms)."
    }
    return Signal(
        cle: cle,
        nom: nom,
        etat: etat,
        valeur: valeur,
        valeurTexte: "VFC \(try formatNombre(valeur, 0)) ms",
        explication: explication
    )
}
