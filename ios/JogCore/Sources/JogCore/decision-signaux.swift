// Étape ⑤ (05, D-007, D-015) : les 7 signaux à J−1, traduits de src/core/decision/signaux.ts. Chaque mesure est arrondie à sa
// précision d'affichage avant d'être comparée aux seuils. Les paramètres datés sont ceux du jour de la séance, sauf pour
// les phrases, qui citent la valeur à J−1 (D-006).
import Foundation

public let NOMS_SIGNAUX: [CleSignal: String] = [
    .progressivite: "Progressivité",
    .fraicheur: "Fraîcheur",
    .reponse: "Réponse à l’effort",
    .horsSousSeuil: "Répétitions hors sous-seuil",
    .footings: "Footings sous le plafond",
    .decouplage: "Découplage de la dernière sortie longue",
    .palier: "Palier de volume",
]

/// Phrase d'une mesure qui n'est pas un nombre fini (NaN, infini) : état insuffisant, valeur « – ».
private let NON_CALCULABLE = "Mesure non calculable."
/// Phrase du ratio quand il n'y a aucun km sur 30 jours (chronic nul) : il n'est pas défini.
private let RATIO_INDEFINI = "Aucun km sur les 30 derniers jours."

/// Contexte commun aux sept signaux : entrées, veille (J−1) et paramètres en vigueur à J−1.
struct ContexteSignaux {
    let e: EntreesDecision
    let J: DateCivile
    let veille: DateCivile
    let paramsVeille: ParamsDates
    /// Index des paramètres datés : `index.auJour(d)` donne les paramètres en vigueur à la date d.
    let index: IndexParametres
}

/// Tous les signaux, dans l'ordre de la liste de 05. `e.seances` doit être trié (voir `decider`).
func calculerSignaux(_ e: EntreesDecision, _ veille: DateCivile) throws -> [Signal] {
    let index = try indexerParametres(e.parametres)
    let ctx = ContexteSignaux(e: e, J: e.J, veille: veille, paramsVeille: index.auJour(veille), index: index)
    return [
        try signalProgressivite(ctx),
        try signalFraicheur(ctx),
        try signalReponse(ctx),
        try signalHorsSousSeuil(ctx),
        try signalFootings(ctx),
        try signalDecouplage(ctx),
        try signalPalier(ctx),
    ]
}

private func nomDe(_ cle: CleSignal) -> String {
    NOMS_SIGNAUX[cle] ?? ""
}

private func insuffisant(_ cle: CleSignal, _ explication: String) -> Signal {
    Signal(cle: cle, nom: nomDe(cle), etat: .insuffisant, valeur: nil, valeurTexte: "–", explication: explication)
}

// ── 1 · Progressivité : r(J−1) ──────────────────────────────────────────────

private func signalProgressivite(_ ctx: ContexteSignaux) throws -> Signal {
    let cle = CleSignal.progressivite
    let manque = try joursManquants(MINIMUMS.progressiviteJours, ctx.e.premierJour, ctx.veille)
    if manque > 0 {
        return insuffisant(cle, "Il faut \(MINIMUMS.progressiviteJours) jours d’historique (encore \(jours(manque))).")
    }
    guard let entree = ctx.e.ratio.first(where: { $0.date == ctx.veille }) else {
        return insuffisant(cle, NON_CALCULABLE)
    }
    if let r = entree.r, !r.isFinite {
        return insuffisant(cle, NON_CALCULABLE)
    }
    guard let r = entree.r else {
        return insuffisant(cle, RATIO_INDEFINI)
    }
    let valeur = try arrondir(r, PRECISION.progressivite)
    let etat = etatProgressivite(valeur)
    let explication: String
    if etat == .ok {
        explication = "Volume récent cohérent avec le mois écoulé."
    } else if valeur < SEUILS.progressivite.okMin {
        explication = "Semaine nettement plus légère que la moyenne du mois."
    } else {
        explication = "Les 7 derniers jours dépassent nettement la moyenne du mois."
    }
    return Signal(cle: cle, nom: nomDe(cle), etat: etat, valeur: valeur, valeurTexte: try formatNombre(valeur, 2), explication: explication)
}

// ── 2 · Fraîcheur : TSB(J−1) ────────────────────────────────────────────────

private func signalFraicheur(_ ctx: ContexteSignaux) throws -> Signal {
    let cle = CleSignal.fraicheur
    let manque = try joursManquants(MINIMUMS.fraicheurJours, ctx.e.premierJour, ctx.veille)
    if manque > 0 {
        return insuffisant(cle, "Il faut \(MINIMUMS.fraicheurJours) jours d’historique pour estimer la fatigue (encore \(jours(manque))).")
    }
    guard let entree = ctx.e.serieCharge.first(where: { $0.date == ctx.veille }), entree.tsb.isFinite else {
        return insuffisant(cle, NON_CALCULABLE)
    }
    let valeur = try arrondir(entree.tsb, PRECISION.fraicheur)
    let etat = etatFraicheur(valeur)
    let explication: String
    switch etat {
    case .alerte: explication = "Fatigue nettement au-dessus de ce que la forme absorbe."
    case .surveiller: explication = "Très frais : il y a de la marge pour charger."
    default: explication = "Fatigue d’entraînement normale."
    }
    return Signal(cle: cle, nom: nomDe(cle), etat: etat, valeur: valeur, valeurTexte: try formatEcart(valeur, 0), explication: explication)
}

// ── 3 · Réponse à l’effort : allure normalisée, 3 dernières séances contre les 6 précédentes ──

private func signalReponse(_ ctx: ContexteSignaux) throws -> Signal {
    let cle = CleSignal.reponse
    let recentes = SEANCES_SOUS_SEUIL_SIGNAUX.recentes
    let precedentes = SEANCES_SOUS_SEUIL_SIGNAUX.precedentes
    let e = ctx.e
    let valeurs: [(date: DateCivile, norm: Double)] = seancesSousSeuil(e, ctx.veille).map {
        (date: $0.date, norm: allureNormaliseeSeance($0, e.globaux))
    }

    if valeurs.count < MINIMUMS.reponseSeancesSousSeuil {
        return insuffisant(cle, "Il faut \(MINIMUMS.reponseSeancesSousSeuil) séances sous-seuil (\(valeurs.count) pour l’instant).")
    }
    let dernieres = Array(valeurs.suffix(recentes))
    for x in dernieres {
        if try !dansFenetre(x.date, ctx.J, MINIMUMS.reponseFenetreJours, ctx.veille) {
            return insuffisant(cle, "Moins de \(MINIMUMS.reponseSeancesRecentes) séances sous-seuil sur les \(MINIMUMS.reponseFenetreJours) derniers jours.")
        }
    }

    // Comme `slice(-(recentes + precedentes), -recentes)` : bornes ramenées à 0, vide si elles se croisent.
    let fin = max(0, valeurs.count - recentes)
    let debut = max(0, valeurs.count - (recentes + precedentes))
    let avant = debut < fin ? Array(valeurs[debut..<fin]) : []
    let ecart = moyenneDesValeurs(dernieres.map { $0.norm }) - moyenneDesValeurs(avant.map { $0.norm })
    let valeur = try arrondir(ecart, PRECISION.reponseEffort)
    let texte: String
    if valeur > 0 {
        let ecartAffiche = try formatNombre(valeur)
        texte = "\(ecartAffiche) s/km plus lent à FC égale"
    } else if valeur < 0 {
        let ecartAffiche = try formatNombre(-valeur)
        texte = "\(ecartAffiche) s/km plus rapide à FC égale"
    } else {
        texte = "0 s/km, sans écart à FC égale"
    }
    return Signal(
        cle: cle,
        nom: nomDe(cle),
        etat: etatReponse(valeur),
        valeur: valeur,
        valeurTexte: texte,
        explication: "Allure normalisée à \(texteNombreJS(e.globaux.refHr)) bpm, \(recentes) dernières séances sous-seuil comparées aux \(precedentes) précédentes."
    )
}

// ── 4 · Répétitions hors sous-seuil : sur les 3 dernières séances sous-seuil ────

private func signalHorsSousSeuil(_ ctx: ContexteSignaux) throws -> Signal {
    let cle = CleSignal.horsSousSeuil
    let e = ctx.e
    let sousSeuil = seancesSousSeuil(e, ctx.veille)
    var dansLaFenetre = 0
    for s in sousSeuil {
        if try dansFenetre(s.date, ctx.J, MINIMUMS.horsSousSeuilFenetreJours, ctx.veille) {
            dansLaFenetre += 1
        }
    }
    if dansLaFenetre < MINIMUMS.horsSousSeuilSeances {
        return insuffisant(cle, "Moins de \(MINIMUMS.horsSousSeuilSeances) séances sous-seuil sur les \(MINIMUMS.horsSousSeuilFenetreJours) derniers jours.")
    }

    let recentes = sousSeuil.suffix(SEANCES_SOUS_SEUIL_SIGNAUX.recentes)
    var hors = 0
    var total = 0
    for s in recentes {
        let params = ctx.index.auJour(s.date)
        for r in s.repetitions {
            if !repetitionUtilisable(r, e.globaux) { continue }
            total += 1
            if estHorsSousSeuil(r, params) { hors += 1 }
        }
    }

    let valeur = try arrondir(Double(hors), PRECISION.horsSousSeuil)
    let texteHors = try formatNombre(Double(hors))
    let texteTotal = try formatNombre(Double(total))
    let allure = formatAllure(ctx.paramsVeille.lt2Pace)
    let fcFin = try formatNombre(ctx.paramsVeille.subtHrHi)
    return Signal(
        cle: cle,
        nom: nomDe(cle),
        etat: etatHorsSousSeuil(valeur),
        valeur: valeur,
        valeurTexte: "\(texteHors) sur \(texteTotal)",
        explication: "Plus rapides que l’allure seuil (\(allure)/km) ou FC de fin au-dessus de \(fcFin) bpm, \(SEANCES_SOUS_SEUIL_SIGNAUX.recentes) dernières séances."
    )
}

// ── 5 · Footings sous le plafond : sur 14 jours ─────────────────────────────

private func signalFootings(_ ctx: ContexteSignaux) throws -> Signal {
    let cle = CleSignal.footings
    var fenetre: [Seance] = []
    for s in ctx.e.seances where s.type == .footing || s.type == .footingLignesDroites {
        if try dansFenetre(s.date, ctx.J, MINIMUMS.footingsFenetreJours, ctx.veille) {
            fenetre.append(s)
        }
    }
    if fenetre.count < MINIMUMS.footingsNombre {
        return insuffisant(cle, "Il faut \(MINIMUMS.footingsNombre) footings sur \(MINIMUMS.footingsFenetreJours) jours (\(fenetre.count) pour l’instant).")
    }
    // Chaque footing est jugé avec le plafond en vigueur à sa date (D-006). Sans FC moyenne finie, il n'est pas conforme.
    var conformes = 0
    for s in fenetre {
        if let fcMoy = s.fcMoy, fcMoy.isFinite, fcMoy <= ctx.index.auJour(s.date).easyCap {
            conformes += 1
        }
    }
    let valeur = try arrondir(Double(conformes * 100) / Double(fenetre.count), PRECISION.footings)
    let plafond = try formatNombre(ctx.paramsVeille.easyCap)
    return Signal(
        cle: cle,
        nom: nomDe(cle),
        etat: etatFootings(valeur),
        valeur: valeur,
        valeurTexte: try formatPourcentage(valeur),
        explication: "FC moyenne ≤ \(plafond) bpm. Des footings trop rapides empiètent sur la récupération."
    )
}

// ── 6 · Découplage de la dernière sortie longue utilisable, sur 14 jours ────

private func signalDecouplage(_ ctx: ContexteSignaux) throws -> Signal {
    let cle = CleSignal.decouplage
    // La dernière sortie longue de la fenêtre qui a un découplage (nil : pas utilisable, D-005).
    var derniere: (seance: Seance, valeur: Double)?
    for seance in ctx.e.seances {
        guard seance.type == .sortieLongue, let valeur = seance.decouplage?.valeur else { continue }
        if try dansFenetre(seance.date, ctx.J, MINIMUMS.decouplageFenetreJours, ctx.veille) {
            derniere = (seance, valeur)
        }
    }
    guard let retenue = derniere else {
        return insuffisant(cle, "Aucune sortie longue utilisable sur les \(MINIMUMS.decouplageFenetreJours) derniers jours.")
    }
    if !retenue.valeur.isFinite {
        return insuffisant(cle, NON_CALCULABLE)
    }

    let seance = retenue.seance
    let valeur = try arrondir(retenue.valeur, PRECISION.decouplage)
    let kmArrondi = try arrondir(seance.km, 0.1)
    let decimales = kmArrondi.isFinite && kmArrondi.rounded(.towardZero) == kmArrondi ? 0 : 1
    let texteKm = try formatNombre(seance.km, decimales)
    let seuil = try formatPourcentage(SEUILS.decouplage.surveillerApres)
    var explication = "Sortie longue du \(formatDate(seance.date)) (\(texteKm) km). Sous \(seuil), la base aérobie tient la durée."
    if let detail = seance.decouplage, detail.avecMp {
        let retenuMin = try formatNombre(detail.retenu_min)
        let totalMin = try formatNombre(detail.total_min)
        explication += " Portions faciles : \(retenuMin) min sur \(totalMin)."
    }
    return Signal(
        cle: cle,
        nom: nomDe(cle),
        etat: etatDecouplage(valeur),
        valeur: valeur,
        valeurTexte: try formatPourcentage(valeur, 1),
        explication: explication
    )
}

// ── 7 · Palier de volume : jamais d'alerte ──────────────────────────────────

private func signalPalier(_ ctx: ContexteSignaux) throws -> Signal {
    let cle = CleSignal.palier
    let terminees = ctx.e.semaines.filter { $0.statut == .terminee }.count
    if terminees < MINIMUMS.palierSemaines {
        return insuffisant(cle, "Il faut \(MINIMUMS.palierSemaines) semaines terminées.")
    }
    let semaines = ctx.e.palier.semaines
    let etat = etatPalier(semaines)
    let texteSemaines = try formatNombre(semaines)
    let texteReference = try formatNombre(ctx.e.palier.reference_km)
    return Signal(
        cle: cle,
        nom: nomDe(cle),
        etat: etat,
        valeur: semaines,
        valeurTexte: "\(texteSemaines) sem. autour de \(texteReference) km",
        explication: etat == .ok
            ? "Volume tenu assez longtemps pour envisager une hausse."
            : "Volume atteint récemment : le consolider avant de monter."
    )
}

// ── Outils ──────────────────────────────────────────────────────────────────

/// Séances sous-seuil utilisables (04), à J−1 au plus, dans l'ordre de la Vue. Une séance sans aucune répétition d'allure
/// finie (allure normalisée finie, D-004) n'est comptée ni par le signal 3 ni par le signal 4 : elle est exclue des deux décomptes.
/// Les répétitions estimées sur la FC (D-021) n'entrent jamais dans ces signaux : elles ne sont pas des séances sous-seuil.
private func seancesSousSeuil(_ e: EntreesDecision, _ veille: DateCivile) -> [Seance] {
    e.seances.filter { s in
        s.type == .sousSeuil && s.repetitionsEstimees != true && s.date <= veille
            && s.repetitions.contains { repetitionUtilisable($0, e.globaux) }
    }
}

/// Allure normalisée d'une répétition (04, D-004) : allure + (FC de fin − refHr) × paceHrK.
private func allureNormaliseeRepetition(_ r: Repetition, _ globaux: ParamsGlobaux) -> Double {
    r.allure_skm + (r.fcFin - globaux.refHr) * globaux.paceHrK
}

/// Une répétition compte si son allure normalisée est finie.
private func repetitionUtilisable(_ r: Repetition, _ globaux: ParamsGlobaux) -> Bool {
    allureNormaliseeRepetition(r, globaux).isFinite
}

/// Moyenne des allures normalisées des répétitions utilisables de la séance (04).
private func allureNormaliseeSeance(_ s: Seance, _ globaux: ParamsGlobaux) -> Double {
    moyenneDesValeurs(s.repetitions.filter { repetitionUtilisable($0, globaux) }.map { allureNormaliseeRepetition($0, globaux) })
}

/// Une répétition est hors sous-seuil si elle est plus rapide que lt2Pace, ou si sa FC de fin dépasse subtHrHi (04).
private func estHorsSousSeuil(_ r: Repetition, _ params: ParamsDates) -> Bool {
    r.allure_skm < params.lt2Pace || r.fcFin > params.subtHrHi
}

/// Moyenne arithmétique, dans l'ordre des valeurs. Sans valeur, le résultat est NaN (comme 0 ÷ 0 en JavaScript).
private func moyenneDesValeurs(_ valeurs: [Double]) -> Double {
    var somme = 0.0
    for v in valeurs { somme += v }
    return somme / Double(valeurs.count)
}
