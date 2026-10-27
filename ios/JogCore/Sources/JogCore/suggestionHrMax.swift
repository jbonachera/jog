// FC max observée (D-019, ADR 0013) : suggestion de hrMax à partir des pics soutenus des séances de la Vue.
// Fonction pure, sur la Vue assemblée : même place que la suggestion paceHrK (D-004). Traduit de
// src/core/suggestionHrMax.ts.

/// Fenêtre des séances examinées : de J−365 à J−1 (D-019).
private let FENETRE_JOURS = 365
/// Distance affichée au dixième de km (comme l'affichage des séances, D-015).
private let PAS_KM = 0.1

/// Séances examinées : celles de la Vue datées de J−365 à J−1, et au plus tôt du jour d'effet de la dernière
/// modification de hrMax (D-006, D-019).
public func seancesExaminees(_ vue: Vue) throws -> [SeanceVue] {
    let debut = plusTard(try ajouterJours(vue.J, -FENETRE_JOURS), dateDerniereModifHrMax(vue))
    let fin = try ajouterJours(vue.J, -1)
    return vue.seances.filter { $0.date >= debut && $0.date <= fin }
}

/// Pic retenu parmi les séances examinées : le plus haut fcPic, arrondi au bpm. À égalité, la séance la plus récente :
/// la Vue les range par (date, debutUtc, cleSource), donc la dernière retenue gagne. Nil sans séance avec un pic.
/// `vue` doit être la Vue brute (pics non arrondis à 4 décimales), voir `avecSuggestion`.
public func picRetenu(_ vue: Vue) throws -> (seance: SeanceVue, bpm: Double)? {
    var meilleure: (seance: SeanceVue, bpm: Double)?
    for seance in try seancesExaminees(vue) {
        guard let fcPic = seance.fcPic else { continue }
        let bpm = try arrondir(fcPic, 1)
        if let actuelle = meilleure, bpm < actuelle.bpm { continue }
        meilleure = (seance: seance, bpm: bpm)
    }
    return meilleure
}

/// La suggestion n'est faite que si le pic retenu atteint hrMax(J−1) plus MARGE_HRMAX_BPM (D-019).
/// `vue` doit être la Vue brute, voir `avecSuggestion`.
public func suggestionHrMax(_ vue: Vue) throws -> SuggestionHrMax? {
    let hrMaxVeille = vue.parametresEnVigueur.datesAJm1.hrMax
    guard let meilleure = try picRetenu(vue), meilleure.bpm >= hrMaxVeille + MARGE_HRMAX_BPM else { return nil }

    let seance = meilleure.seance
    return SuggestionHrMax(
        bpm: meilleure.bpm,
        date: seance.date,
        cleSource: seance.cleSource,
        nom: seance.nom,
        km: try arrondir(seance.km, PAS_KM),
        ecartSuspect: meilleure.bpm > hrMaxVeille + ECART_SUSPECT_HRMAX_BPM
    )
}

/// Jour d'effet de la modification de hrMax la plus récente, ou nil sans modification (D-006).
private func dateDerniereModifHrMax(_ vue: Vue) -> DateCivile? {
    var derniere: DateCivile?
    for modif in vue.parametresEnVigueur.modifs where modif.cle == "hrMax" {
        if let actuelle = derniere, modif.dateEffet <= actuelle { continue }
        derniere = modif.dateEffet
    }
    return derniere
}

// Les dates AAAA-MM-JJ se comparent comme des textes. Une date absente ne borne rien.
private func plusTard(_ borne: DateCivile, _ autre: DateCivile?) -> DateCivile {
    if let autre, autre > borne { return autre }
    return borne
}
