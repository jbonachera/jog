// Décision (étapes ⑤ et ⑥, 05) : signaux, verdict, fourchette et simulateur, à partir des entrées à J−1. Traduit de
// src/core/decision/index.ts. Fonctions pures et déterministes (ADR 0006). `simuler` est défini dans decision-simulateur.swift.
import Foundation

/// La décision à J : verdict, phrase, signaux, fourchette et simulateur (sans verdict : les deux derniers sont nil).
/// Les séances sont triées ici (date, debutUtc, cleSource) : l'ordre de l'entrée n'a pas d'effet.
public func decider(_ entree: EntreesDecision) throws -> Decision {
    var e = entree
    e.seances = trierSeances(entree.seances)
    let veille = try ajouterJours(e.J, -1)
    let signaux = try calculerSignaux(e, veille)
    let manque = try joursManquants(MINIMUMS.progressiviteJours, e.premierJour, veille)
    let verdictEtPhrase = verdictDe(signaux, manque)
    let chronic = e.ratio.first(where: { $0.date == veille })?.chronic
    let fourchette = try fourchetteDe(verdictEtPhrase.verdict, EntreesFourchette(semaines: e.semaines, palier: e.palier), chronic)
    let simulateur: Simulateur?
    if let fourchette {
        simulateur = try simulateurDe(e, veille, fourchette)
    } else {
        simulateur = nil
    }
    return Decision(
        verdict: verdictEtPhrase.verdict,
        phrase: verdictEtPhrase.phrase,
        signaux: signaux,
        fourchette: fourchette,
        simulateur: simulateur
    )
}
