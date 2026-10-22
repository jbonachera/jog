// H1 · Saisons et volume hebdomadaire, H2 · Journal hebdomadaire (03, H1 et H2 ; 04 ; traduit de
// src/core/selecteurs/historique.ts). Sélection pure à partir de la Vue.

/// Libellés des distances de référence, dans l'ordre de DISTANCES_STANDARD_KM (07, D-014).
private let LIBELLES_DISTANCE = ["5 km", "10 km", "Semi", "Marathon"]

/// Les semaines de la période (la semaine en cours incluse), avec leurs courses. Le sélecteur de la période
/// (12, 26, toutes) ne change que la fenêtre ; chaque semaine est la même, quelle que soit la période.
func selectionHistorique(_ vue: Vue, _ periode: PeriodeHistorique) throws -> SelectionHistorique {
    let lo = vue.parametresEnVigueur.globaux.subtPctLo
    let hi = vue.parametresEnVigueur.globaux.subtPctHi
    let toutes = vue.semaines
    let choisies: ArraySlice<SemaineVue>
    switch periode {
    case .toutes: choisies = toutes[...]
    case .douze: choisies = toutes.suffix(12)
    case .vingtSix: choisies = toutes.suffix(26)
    }
    // Les courses sont rangées par lundi une seule fois, avant la boucle des semaines.
    let coursesParLundi = try regrouperCourses(vue)

    var semaines: [SemaineHistorique] = []
    semaines.reserveCapacity(choisies.count)
    for s in choisies {
        let enCours = s.statut == .enCours
        let partSSPct = s.partSS.map(enPourcent)
        let dansCible = try estDansLaCible(partSSPct, lo, hi)
        let totalMinutes = s.minutes.easy + s.minutes.mp + s.minutes.subt + s.minutes.hard
        // Sans aucune minute classée, les km n'ont pas de répartition : ils restent en facile.
        func repartir(_ minutes: Double) -> Double {
            totalMinutes == 0 ? 0 : (s.km * minutes) / totalMinutes
        }
        let conformitePct = s.conformiteFootings.map(enPourcent)

        let etatCible: EtatCible?
        if enCours {
            etatCible = .enCours
        } else if let dansCible {
            etatCible = dansCible ? .dansLaCible : .horsCible
        } else {
            etatCible = nil
        }

        semaines.append(SemaineHistorique(
            lundi: s.lundi,
            enCours: enCours,
            km: s.km,
            min: s.min,
            minutes: s.minutes,
            kmParIntensite: Minutes(
                easy: totalMinutes == 0 ? s.km : repartir(s.minutes.easy),
                mp: repartir(s.minutes.mp),
                subt: repartir(s.minutes.subt),
                hard: repartir(s.minutes.hard)
            ),
            partSSPct: partSSPct,
            etatCible: etatCible,
            nbSS: s.nbSS,
            charge: s.charge,
            ratioDimanche: s.ratioDimanche,
            etatRatio: try s.ratioDimanche.map(etatRatio),
            monotonie: s.monotonie,
            contrainte: s.contrainte,
            conformitePct: conformitePct,
            etatFootings: try conformitePct.map(etatFootingsSelecteur),
            courses: coursesParLundi[s.lundi] ?? []
        ))
    }

    let indiceSemaine = semaines.firstIndex { $0.enCours }
    let jour = try jourDeSemaine(vue.J)
    return SelectionHistorique(
        periode: periode,
        semaines: semaines,
        journal: Array(semaines.reversed()),
        aujourdhui: AujourdhuiHistorique(
            indiceSemaine: indiceSemaine,
            jourDeSemaine: Double(jour),
            fraction: Double(jour) / 7
        ),
        cible: Bande(lo: lo, hi: hi),
        plafondFootingsBpm: vue.parametresEnVigueur.datesAJm1.easyCap
    )
}

/// Les courses de la Vue, rangées par lundi de semaine, dans l'ordre de la Vue (chronologique).
private func regrouperCourses(_ vue: Vue) throws -> [DateCivile: [CourseHistorique]] {
    var parLundi: [DateCivile: [CourseHistorique]] = [:]
    for s in vue.seances where s.type == .course {
        let lundi = try lundiISO(s.date)
        let course = CourseHistorique(
            date: s.date,
            distanceKm: s.distanceRef_km,
            distance: libelleDistance(s.distanceRef_km),
            temps_s: s.temps_s,
            temps: s.temps_s.map(formatTempsCourse)
        )
        parLundi[lundi, default: []].append(course)
    }
    return parLundi
}

private func libelleDistance(_ km: Double?) -> String? {
    guard let km, let rang = DISTANCES_STANDARD_KM.firstIndex(of: km), rang < LIBELLES_DISTANCE.count else { return nil }
    return LIBELLES_DISTANCE[rang]
}
