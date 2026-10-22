// Étape ⑥ (05, « Règle du verdict », « Fourchette », D-007, D-008, D-015). Traduit de src/core/decision/verdict.ts.
import Foundation

// Signaux décisifs : seuls eux peuvent déclencher « Alléger », et seuls eux empêchent « Augmenter ».
private let DECISIFS: [CleSignal] = [.progressivite, .fraicheur, .reponse, .decouplage]

/// Entrées de la fourchette : `Pick<EntreesDecision, 'semaines' | 'palier'>` de la décision.
public struct EntreesFourchette: Codable, Sendable, Equatable {
    public var semaines: [SemaineEntree]
    public var palier: Palier

    public init(semaines: [SemaineEntree], palier: Palier) {
        self.semaines = semaines
        self.palier = palier
    }
}

/// Le verdict et sa phrase, d'après les 7 signaux (05). `manqueProgressivite` sert à la phrase « Pas encore de verdict ».
public func verdictDe(_ signaux: [Signal], _ manqueProgressivite: Int) -> VerdictEtPhrase {
    if let progressivite = signaux.first(where: { $0.cle == .progressivite }), progressivite.etat == .insuffisant {
        // Sans historique suffisant, la phrase dit ce qui manque. Avec l'historique, c'est la phrase du signal :
        // « Aucun km sur les 30 derniers jours. » (ratio indéfini).
        let phrase = manqueProgressivite > 0
            ? "Il faut \(MINIMUMS.progressiviteJours) jours d’historique pour comparer la semaine au mois (encore \(jours(manqueProgressivite)))."
            : progressivite.explication
        return VerdictEtPhrase(verdict: .aucun, phrase: phrase)
    }

    let decisifs = signaux.filter { DECISIFS.contains($0.cle) }
    let alertesDecisives = decisifs.filter { $0.etat == .alerte }
    if !alertesDecisives.isEmpty {
        return VerdictEtPhrase(verdict: .alleger, phrase: "À surveiller en priorité : \(enumerer(alertesDecisives.map { $0.nom })).")
    }

    let insuffisantsDecisifs = decisifs.filter { $0.etat == .insuffisant }
    let aSurveiller = signaux.filter { $0.etat == .surveiller || $0.etat == .alerte }
    if !aSurveiller.isEmpty {
        let titre = aSurveiller.count == 1 ? "Point à surveiller" : "Points à surveiller"
        var phrase = "Rien d’alarmant, mais mieux vaut consolider avant de monter. \(titre) : \(enumerer(aSurveiller.map { $0.nom }))."
        if !insuffisantsDecisifs.isEmpty {
            phrase += " Pas assez de données sur : \(enumerer(insuffisantsDecisifs.map { $0.nom }))."
        }
        return VerdictEtPhrase(verdict: .maintenir, phrase: phrase)
    }

    if !insuffisantsDecisifs.isEmpty {
        return VerdictEtPhrase(
            verdict: .maintenir,
            phrase: "Aucun signal défavorable, mais pas assez de données pour conseiller une hausse : \(enumerer(insuffisantsDecisifs.map { $0.nom }))."
        )
    }

    let insuffisantAilleurs = signaux.contains { $0.etat == .insuffisant }
    return VerdictEtPhrase(
        verdict: .augmenter,
        phrase: insuffisantAilleurs
            ? "Tous les signaux disponibles sont au vert : la charge actuelle est absorbée."
            : "Tous les signaux sont au vert : la charge actuelle est absorbée."
    )
}

/// La fourchette des 7 prochains jours (05). La référence est le km de la dernière semaine terminée
/// quand le verdict n'est pas « Alléger » et que le palier atteint 2 ; sinon chronic(J−1).
/// Les bornes sont arrondies au km. Nil sans verdict, ou si chronic n'est pas un nombre fini.
public func fourchetteDe(_ verdict: Verdict, _ entrees: EntreesFourchette, _ chronic: Double?) throws -> Fourchette? {
    guard verdict != .aucun, let chronic, chronic.isFinite else { return nil }

    let coefficients: (min: Double, max: Double)
    switch verdict {
    case .augmenter: coefficients = FOURCHETTE.augmenter
    case .maintenir: coefficients = FOURCHETTE.maintenir
    case .alleger: coefficients = FOURCHETTE.alleger
    case .aucun: return nil
    }
    let derniere = derniereSemaineTerminee(entrees.semaines)
    let palierAtteint = entrees.palier.semaines >= Double(SEUILS.palier.semainesOk)
    let parPalier = verdict != .alleger && palierAtteint ? derniere : nil
    let reference = parPalier?.km ?? chronic
    return Fourchette(
        min: try arrondir(reference * coefficients.min, 1),
        max: try arrondir(reference * coefficients.max, 1),
        reference: reference,
        sourceReference: parPalier != nil ? .palier : .moyenne30j
    )
}

/// La plus récente des semaines terminées (la liste peut être dans le désordre).
private func derniereSemaineTerminee(_ semaines: [SemaineEntree]) -> SemaineEntree? {
    var derniere: SemaineEntree?
    for semaine in semaines where semaine.statut == .terminee {
        if let courante = derniere, !(semaine.lundi > courante.lundi) { continue }
        derniere = semaine
    }
    return derniere
}
