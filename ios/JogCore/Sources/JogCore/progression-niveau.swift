// P5 · Niveau estimé (03, P5 ; 04, « Équivalences », « Records » ; D-014 ; traduit de src/core/progression/niveau.ts).

private let DISTANCE_SOURCE_KM = 5.0
private let LIBELLES_NIVEAU = ["5 km", "10 km", "Semi", "Marathon"]

/// Le niveau estimé, depuis le dernier test ou la dernière course de 5 km (04). Les records portent sur les courses
/// et les tests de chaque distance de référence (D-014). Sans test ni course de 5 km, il n'y a pas de source.
public func niveauEstime(_ vue: Vue) throws -> NiveauEstime {
    let chronos = vue.seances.filter { estChrono($0) && $0.distanceRef_km == DISTANCE_SOURCE_KM && $0.temps_s != nil }
    guard let derniere = chronos.last, let tempsSource = derniere.temps_s else {
        return .indisponible(raison: "Aucun test ni course de 5 km dans l’historique : pas de niveau estimé.")
    }
    let source = SourceNiveau(
        date: derniere.date,
        distance_km: DISTANCE_SOURCE_KM,
        temps_s: tempsSource,
        type: derniere.type == .test ? .test : .course
    )
    var lignes: [LigneNiveau] = []
    for (i, distance) in DISTANCES_STANDARD_KM.enumerated() {
        lignes.append(try ligne(vue, source, distance, i < LIBELLES_NIVEAU.count ? LIBELLES_NIVEAU[i] : ""))
    }
    return .estime(source: source, lignes: lignes)
}

// L'équivalence et le record se comparent à la seconde près : ce que l'athlète lit est ce qui est jugé (D-015).
private func ligne(_ vue: Vue, _ source: SourceNiveau, _ distance_km: Double, _ libelle: String) throws -> LigneNiveau {
    let equivalence_s = tempsRiegel(source.temps_s, source.distance_km, distance_km)
    let record = meilleurRecord(vue.seances, distance_km)
    let equivalenceAffichee = try arrondir(equivalence_s, 1)
    let recordAffiche = try record.map { try arrondir($0.temps_s, 1) }
    return LigneNiveau(
        distance_km: distance_km,
        libelle: libelle,
        equivalence_s: equivalence_s,
        allure_skm: equivalence_s / distance_km,
        record: record,
        libelleDateRecord: record.map { formatDate($0.date) } ?? "pas encore couru",
        ecart_s: recordAffiche.map { equivalenceAffichee - $0 },
        bat: recordAffiche.map { equivalenceAffichee < $0 } ?? false
    )
}

// Meilleur temps des courses et des tests de la distance ; à égalité, la plus ancienne (ordre de la Vue).
private func meilleurRecord(_ seances: [SeanceVue], _ distance_km: Double) -> RecordNiveau? {
    var meilleur: RecordNiveau?
    for s in seances {
        guard estChrono(s), s.distanceRef_km == distance_km, let temps = s.temps_s else { continue }
        // Strictement plus rapide : à égalité, la plus ancienne garde le record.
        if let actuel = meilleur, temps >= actuel.temps_s { continue }
        meilleur = RecordNiveau(temps_s: temps, date: s.date)
    }
    return meilleur
}

private func estChrono(_ s: SeanceVue) -> Bool {
    s.type == .course || s.type == .test
}
