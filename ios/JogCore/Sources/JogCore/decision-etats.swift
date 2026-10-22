// États des signaux (05, « Seuils du verdict », D-015), traduits de src/core/decision/etats.ts. Chaque fonction reçoit
// une mesure DÉJÀ arrondie à sa précision d'affichage : l'état est celui de ce que l'athlète lit.
import Foundation

public func etatProgressivite(_ ratio: Double) -> EtatSignal {
    if ratio > SEUILS.progressivite.alerteApres { return .alerte }
    if ratio > SEUILS.progressivite.okMax || ratio < SEUILS.progressivite.okMin { return .surveiller }
    return .ok
}

public func etatFraicheur(_ tsb: Double) -> EtatSignal {
    if tsb < SEUILS.fraicheur.alerteSous { return .alerte }
    if tsb > SEUILS.fraicheur.surveillerApres { return .surveiller }
    return .ok
}

public func etatReponse(_ ecartSkm: Double) -> EtatSignal {
    if ecartSkm > SEUILS.reponseEffort.alerteApres { return .alerte }
    if ecartSkm > SEUILS.reponseEffort.surveillerApres { return .surveiller }
    return .ok
}

public func etatHorsSousSeuil(_ repetitions: Double) -> EtatSignal {
    if repetitions >= Double(SEUILS.horsSousSeuil.alerteDes) { return .alerte }
    if repetitions >= Double(SEUILS.horsSousSeuil.surveillerDes) { return .surveiller }
    return .ok
}

/// Part des footings sous le plafond, en % entier.
public func etatFootings(_ pourcent: Double) -> EtatSignal {
    if pourcent < SEUILS.footings.alerteSous { return .alerte }
    if pourcent < SEUILS.footings.surveillerSous { return .surveiller }
    return .ok
}

public func etatDecouplage(_ pourcent: Double) -> EtatSignal {
    if pourcent > SEUILS.decouplage.alerteApres { return .alerte }
    if pourcent > SEUILS.decouplage.surveillerApres { return .surveiller }
    return .ok
}

public func etatPalier(_ semaines: Double) -> EtatSignal {
    semaines >= Double(SEUILS.palier.semainesOk) ? .ok : .surveiller
}
