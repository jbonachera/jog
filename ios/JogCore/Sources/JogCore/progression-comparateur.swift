// P1 · Comparateur de périodes (03, P1 ; 04, « Comparateur de périodes » ; traduit de src/core/progression/comparateur.ts).

/// Le paramètre `paramsAuJour` du TypeScript est une fonction ; ici la fonction est construite par l'appelant.
/// Une période [début, fin], bornes incluses, est définie dans progression-types.swift (PeriodeDates).

private struct DefinitionMesure {
    let cle: CleMesure
    let groupe: GroupeMesure
    let nom: String
    let sens: Sens
}

// Les 14 mesures de 04, dans l'ordre du tableau de P1 (03).
private let DEFINITIONS_MESURES: [DefinitionMesure] = [
    DefinitionMesure(cle: .km, groupe: .volume, nom: "km / sem.", sens: .plusHaut),
    DefinitionMesure(cle: .heures, groupe: .volume, nom: "h / sem.", sens: .plusHaut),
    DefinitionMesure(cle: .seances, groupe: .volume, nom: "séances / sem.", sens: .neutre),
    DefinitionMesure(cle: .minutesSS, groupe: .sousSeuil, nom: "min / sem.", sens: .plusHaut),
    DefinitionMesure(cle: .partSS, groupe: .sousSeuil, nom: "% du temps", sens: .neutre),
    // Le nom de cette mesure porte la FC de référence (voir `nomDeMesure`).
    DefinitionMesure(cle: .allure, groupe: .sousSeuil, nom: "allure", sens: .plusRapide),
    DefinitionMesure(cle: .fcFin, groupe: .sousSeuil, nom: "FC de fin de dernière rép.", sens: .neutre),
    DefinitionMesure(cle: .ef, groupe: .endurance, nom: "efficacité en footing", sens: .plusHaut),
    DefinitionMesure(cle: .footings, groupe: .endurance, nom: "footings ≤ plafond", sens: .plusHaut),
    DefinitionMesure(cle: .decouplage, groupe: .endurance, nom: "découplage sortie longue", sens: .plusBas),
    DefinitionMesure(cle: .formeMoy, groupe: .charge, nom: "forme de fond moyenne", sens: .plusHaut),
    DefinitionMesure(cle: .formeMax, groupe: .charge, nom: "forme de fond maximale", sens: .plusHaut),
    DefinitionMesure(cle: .picRatio, groupe: .charge, nom: "pic du ratio 7 j / 30 j", sens: .neutre),
    DefinitionMesure(cle: .test5, groupe: .performance, nom: "meilleur test 5 km", sens: .plusRapide),
]

/// Les valeurs d'une période, une par mesure (nil quand la mesure est absente).
private struct ValeursPeriode {
    var km: Double?
    var heures: Double?
    var seances: Double?
    var minutesSS: Double?
    var partSS: Double?
    var allure: Double?
    var fcFin: Double?
    var ef: Double?
    var footings: Double?
    var decouplage: Double?
    var formeMoy: Double?
    var formeMax: Double?
    var picRatio: Double?
    var test5: Double?

    func valeur(_ cle: CleMesure) -> Double? {
        switch cle {
        case .km: km
        case .heures: heures
        case .seances: seances
        case .minutesSS: minutesSS
        case .partSS: partSS
        case .allure: allure
        case .fcFin: fcFin
        case .ef: ef
        case .footings: footings
        case .decouplage: decouplage
        case .formeMoy: formeMoy
        case .formeMax: formeMax
        case .picRatio: picRatio
        case .test5: test5
        }
    }
}

/// Compare deux périodes, A (référence) et B (comparée). Chaque période est bornée à l'historique. Les valeurs
/// sont ramenées à la semaine pour les volumes. `paramsAuJour` donne le plafond des footings à leur date (D-006).
func comparer(_ vue: Vue, _ a: PeriodeDates, _ b: PeriodeDates, _ paramsAuJour: ParamsAuJour) throws -> Comparaison {
    try verifier(.a, a)
    try verifier(.b, b)
    let periodeA = try borner(vue, a.debut, a.fin)
    let periodeB = try borner(vue, b.debut, b.fin)
    let valeursA = try valeursDePeriode(vue, periodeA, paramsAuJour)
    let valeursB = try valeursDePeriode(vue, periodeB, paramsAuJour)

    let mesures = try DEFINITIONS_MESURES.map { d -> Mesure in
        let valeurA = valeursA.valeur(d.cle)
        let valeurB = valeursB.valeur(d.cle)
        let ecart: Double? = if let a = valeurA, let b = valeurB { b - a } else { nil }
        guard let precision = PRECISIONS[d.cle] else { throw ErreurPrecisionAbsente(cle: d.cle) }
        let affiche = try ecartAffiche(valeurA, valeurB, precision)
        return Mesure(
            cle: d.cle, groupe: d.groupe, nom: nomDeMesure(d, vue), sens: d.sens, a: valeurA, b: valeurB,
            ecart: ecart, ecartAffiche: affiche, etat: etat(d.sens, affiche)
        )
    }

    return Comparaison(
        a: periodeA,
        b: periodeB,
        historiquePartiel: periodeB.jours - periodeA.jours > 6,
        mesures: mesures
    )
}

/// Les périodes des préréglages de P1 : B est toujours les 84 derniers jours (J−84 à J−1).
func prereglage(_ vue: Vue, _ nom: Prereglage) throws -> (a: PeriodeDates, b: PeriodeDates) {
    let b = PeriodeDates(debut: try ajouterJours(vue.J, -84), fin: try ajouterJours(vue.J, -1))
    let a: PeriodeDates
    switch nom {
    case .douzeSemainesPrecedentes:
        a = PeriodeDates(debut: try ajouterJours(vue.J, -168), fin: try ajouterJours(vue.J, -85))
    case .douzeSemainesAnneePrecedente:
        a = PeriodeDates(debut: try ajouterJours(b.debut, -364), fin: try ajouterJours(b.fin, -364))
    }
    return (a: a, b: b)
}

private func verifier(_ nom: ErreurPeriodeInvalide.Periode, _ periode: PeriodeDates) throws {
    if !estDateCivile(periode.debut) || !estDateCivile(periode.fin) {
        throw ErreurPeriodeInvalide(periode: nom, raison: .date)
    }
    if periode.debut > periode.fin {
        throw ErreurPeriodeInvalide(periode: nom, raison: .ordre)
    }
}

/// Le nom d'une mesure : la ligne d'allure porte la FC de référence (03, P1 : « allure à 164 bpm »).
private func nomDeMesure(_ d: DefinitionMesure, _ vue: Vue) -> String {
    d.cle == .allure ? "allure à \(texteNombreJS(vue.parametresEnVigueur.globaux.refHr)) bpm" : d.nom
}

/// Un écart nul affiche « = » (égal). Une valeur absente, ou une mesure sans sens, est neutre.
private func etat(_ sens: Sens, _ ecart: Double?) -> EtatEcart {
    guard let ecart else { return .neutre }
    if ecart == 0 { return .egal }
    if sens == .neutre { return .neutre }
    let meilleurSiHaut = sens == .plusHaut
    return (ecart > 0) == meilleurSiHaut ? .mieux : .moinsBien
}

private func valeursDePeriode(_ vue: Vue, _ periode: PeriodeBornee, _ paramsAuJour: ParamsAuJour) throws -> ValeursPeriode {
    let seances = vue.seances.filter { contient(periode, $0.date) }
    let indices = vue.jours.date.indices.filter { contient(periode, vue.jours.date[$0]) }
    func sommeJours(_ valeurs: [Double]) -> Double {
        var total = 0.0
        for i in indices { total += valeurs[i] }
        return total
    }

    let km = sommeJours(vue.jours.km)
    let minutesSS = sommeJours(vue.jours.minutes.subt)
    let minutesTotal = sommeJours(vue.jours.minutes.easy) + sommeJours(vue.jours.minutes.mp)
        + minutesSS + sommeJours(vue.jours.minutes.hard)
    // Une semaine vaut 7 jours ; une période sans jour n'a pas de moyenne hebdomadaire.
    let semaines = periode.jours / 7
    func parSemaine(_ somme: Double) -> Double? {
        periode.jours == 0 ? nil : somme / semaines
    }

    let ss = seances.filter { $0.type == .sousSeuil }
    let footings = seances.filter(estFooting)
    let sorties = seances.filter { $0.type == .sortieLongue }
    let chronos5 = seances.filter { ($0.type == .course || $0.type == .test) && $0.distanceRef_km == 5 && $0.temps_s != nil }
    // Les valeurs de forme de fond non finies sont ignorées (ni moyenne, ni maximum).
    var ctl: [Double] = []
    for p in vue.serieCharge where contient(periode, p.date) && p.ctl.isFinite {
        ctl.append(p.ctl)
    }
    var ratios: [Double] = []
    for (i, d) in vue.ratio.date.enumerated() where contient(periode, d) {
        if i < vue.ratio.r.count, let r = vue.ratio.r[i] { ratios.append(r) }
    }

    let globaux = Globaux(refHr: vue.parametresEnVigueur.globaux.refHr, paceHrK: vue.parametresEnVigueur.globaux.paceHrK)
    let nombreSeances = seances.filter { $0.duree_min > 0 }.count

    return ValeursPeriode(
        km: parSemaine(km),
        heures: parSemaine(sommeJours(vue.jours.min) / 60),
        // Une séance de durée nulle n'est pas une séance (04, Compteurs).
        seances: parSemaine(Double(nombreSeances)),
        minutesSS: parSemaine(minutesSS),
        partSS: minutesTotal == 0 ? nil : (minutesSS / minutesTotal) * 100,
        allure: moyenneDesFinies(ss.lazy.map { allureNormSeance($0, globaux) }),
        fcFin: moyenneDesFinies(ss.lazy.map { $0.repetitions.last?.fcFin }),
        ef: moyenneDesFinies(footings.lazy.map { $0.ef }),
        footings: try pourcentPlafond(footings, paramsAuJour),
        decouplage: moyenneDesFinies(sorties.lazy.map { $0.decouplage?.valeur }),
        formeMoy: moyenneDesFinies(ctl),
        formeMax: mathMaxJS(ctl),
        picRatio: mathMaxJS(ratios),
        test5: meilleurTemps(chronos5)
    )
}

private func estFooting(_ s: SeanceVue) -> Bool {
    s.type == .footing || s.type == .footingLignesDroites
}

// Part des footings dont la FC moyenne est ≤ plafond, à la date de chaque footing, en % (un sans FC moyenne compte non conforme).
private func pourcentPlafond(_ footings: [SeanceVue], _ paramsAuJour: ParamsAuJour) throws -> Double? {
    if footings.isEmpty { return nil }
    var conformes = 0
    for s in footings {
        if let fc = s.fcMoy, fc <= paramsAuJour(s.date).easyCap { conformes += 1 }
    }
    return (Double(conformes) / Double(footings.count)) * 100
}

private func meilleurTemps(_ chronos: [SeanceVue]) -> Double? {
    var meilleur: Double?
    for s in chronos {
        guard let temps = s.temps_s else { continue }
        if let actuel = meilleur {
            if temps < actuel { meilleur = temps }
        } else {
            meilleur = temps
        }
    }
    return meilleur
}
