import Testing
@testable import JogCore

// Tests de règles de la séance, écrits à la main (et non tirés de l'oracle). Chaque test cite la règle qu'il vérifie :
// D-001 (classement des minutes), D-013 (FC échantillonnée), D-014 (marquage course ou test), 07 (classification des
// séances, règles 1 à 4) et 04 (règle de classement). Les données sont synthétiques, construites dans ce fichier.

// MARK: - Données synthétiques

/// Paramètres de test : bande basse à 148,2 bpm (z2 × hrMax), seuil lt2Hr à 172 bpm, subtHrLo à 160 bpm.
private let parametresSynthetiques = ParamsDates(
    hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92,
    lt2Hr: 172, lt2Pace: 240, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)

/// FC par seconde, bloc après bloc : `blocs` donne (durée en s, FC en bpm) dans l'ordre.
private func fcParBlocs(_ blocs: [(duree: Int, fc: Float)]) -> (Int) -> Float {
    var fins: [(fin: Int, fc: Float)] = []
    var total = 0
    for bloc in blocs {
        total += bloc.duree
        fins.append((total, bloc.fc))
    }
    return { t in fins.first { t < $0.fin }?.fc ?? Float.nan }
}

/// Pivot synthétique à 1 Hz, de `duree` secondes. `fc(t)` vaut NaN s'il n'y a pas de mesure à t ; `vitesse(t)` en m/s.
private func pivotSynthetique(
    duree: Int,
    fc: (Int) -> Float = { _ in 120 },
    vitesse: (Int) -> Float = { _ in 3 },
    tours: [Tour] = [],
    competition: Bool = false,
    nom: String? = "Séance fictive"
) -> ActivitePivot {
    var distances: [Float] = []
    var distance: Float = 0
    for t in 0..<duree {
        distances.append(distance)
        distance += vitesse(t)
    }
    let flux = Flux(
        t_s: (0..<duree).map { Float($0) },
        dist_m: distances,
        fc_bpm: (0..<duree).map { fc($0) },
        alt_m: nil,
        vitesse_ms: (0..<duree).map { vitesse($0) }
    )
    return ActivitePivot(
        cleSource: "test:regle", source: .fit, versionAdaptateur: "1.0.0", empreinteBrute: "test",
        debutUtc: 1_700_000_000_000, decalageLocal_min: 0, dateLocale: "2026-10-10",
        duree_s: Double(duree), distance_m: Double(distance), nom: nom, competition: competition,
        sousType: .route, pasFC_s: 1, flux: flux, tours: tours
    )
}

/// Séance à trois répétitions de 3 min (tours manuels), séparées de 1 min à 120 bpm, avec une FC de `fcRep` pendant
/// chaque répétition. Échauffement et retour au calme ne sont pas des tours.
private func seanceTroisRepetitions(fcRep: Float) -> ActivitePivot {
    let tours = [
        Tour(iDebut: 300, iFin: 479, declenchement: .manuel),
        Tour(iDebut: 540, iFin: 719, declenchement: .manuel),
        Tour(iDebut: 780, iFin: 959, declenchement: .manuel),
    ]
    let fc = fcParBlocs([(300, 120), (180, fcRep), (60, 120), (180, fcRep), (60, 120), (180, fcRep), (240, 120)])
    return pivotSynthetique(duree: 1200, fc: fc, tours: tours)
}

/// Type attribué à une séance seule (étapes ②a puis ②b).
private func typeDeSeance(_ pivot: ActivitePivot) throws -> TypeSeance {
    let intrinseque = try calculerSeanceIntrinseque(pivot, parametresSynthetiques)
    return try classerSeances([intrinseque])[0].type
}

// MARK: - D-001 : classement des minutes par intensité

@Test func d001UneRepetitionAFcDeFinSousLt2HrEstSousSeuil() throws {
    // D-001 : pendant une répétition, toute sa durée prend « sous-seuil » si la FC de fin ≤ lt2Hr (172).
    let seance = try calculerSeanceIntrinseque(seanceTroisRepetitions(fcRep: 170), parametresSynthetiques)
    #expect(seance.repetitions.count == 3)
    #expect(seance.minutes.subt == 9)
    #expect(seance.minutes.hard == 0)
}

@Test func d001UneRepetitionAFcDeFinAuDessusLt2HrEstAuDessusDuSeuil() throws {
    // D-001 : une répétition dont la FC de fin dépasse lt2Hr (172) est classée « au-dessus du seuil » (hard), pas sous-seuil.
    // La récupération qui suit, à FC encore au-dessus de lt2Hr, compte aussi en hard.
    let seance = try calculerSeanceIntrinseque(seanceTroisRepetitions(fcRep: 175), parametresSynthetiques)
    #expect(seance.repetitions.count == 3)
    #expect(seance.minutes.subt == 0)
    #expect(seance.minutes.hard >= 9)
}

@Test func d001UnSegmentDeDouzeMinutesDansLaBandeEstAllureMarathon() throws {
    // D-001 et 04 : un segment continu d'au moins 10 min dans la bande [z2 × hrMax, lt2Hr] est classé « allure marathon ».
    // La bande est lue sur la FC lissée (30 s) : un bloc de 12 min y reste plus de 10 min.
    let fc = fcParBlocs([(120, 120), (720, 160), (120, 120)])
    let seance = try calculerSeanceIntrinseque(pivotSynthetique(duree: 960, fc: fc), parametresSynthetiques)
    #expect(seance.segmentsMp.count == 1)
    #expect(seance.minutes.mp >= 10)
}

@Test func d001UnSegmentDeNeufMinutesDansLaBandeEstFacile() throws {
    // D-001 et 04 : en dessous de 10 min continues dans la bande, rien n'est classé allure marathon : tout reste facile.
    // Le bloc de 9 min à 160 bpm, lu sur la FC lissée, donne moins de 10 min dans la bande.
    let fc = fcParBlocs([(120, 120), (540, 160), (120, 120)])
    let seance = try calculerSeanceIntrinseque(pivotSynthetique(duree: 780, fc: fc), parametresSynthetiques)
    #expect(seance.segmentsMp.isEmpty)
    #expect(seance.minutes.mp == 0)
    #expect(seance.minutes.easy == 13)
}

// MARK: - D-013 : FC échantillonnée

@Test func d013UneFcA1SecondeEtA5SecondesDonnentLesMemesMinutes() throws {
    // D-013 : la FC est rééchantillonnée à 1 s, chaque mesure tient jusqu'à la suivante (10 s au plus). Une même FC
    // mesurée toutes les 5 s, sur le même flux à 1 Hz, donne donc les mêmes minutes qu'une FC mesurée chaque seconde.
    let fc1Hz = fcParBlocs([(300, 120), (900, 160), (300, 120)])
    let fc5s: (Int) -> Float = { t in t % 5 == 0 ? fc1Hz(t) : Float.nan }

    let a = try calculerSeanceIntrinseque(pivotSynthetique(duree: 1500, fc: fc1Hz), parametresSynthetiques)
    let b = try calculerSeanceIntrinseque(pivotSynthetique(duree: 1500, fc: fc5s), parametresSynthetiques)
    #expect(a.minutes == b.minutes)
    #expect(a.segmentsMp == b.segmentsMp)
    #expect(a.minutes.mp > 0)
}

// MARK: - 07 règle 2 : répétitions et tours

@Test func regle2UnFootingATtoursAutomatiquesAuKilometreNEstPasUnSousSeuil() throws {
    // 07 règle 2 : seuls les tours de travail déclenchés à la main (ou inconnus) sont des répétitions. Des tours
    // automatiques au kilomètre ne font pas un sous-seuil, même à FC élevée pendant 20 min.
    // Allure 6:00/km (au-dessus de lt2Pace + 40 s/km) : le repli sur le flux ne trouve rien non plus.
    let allure = Float(1000.0 / 360.0)
    let tours = [
        Tour(iDebut: 0, iFin: 299, declenchement: .distance),
        Tour(iDebut: 300, iFin: 599, declenchement: .distance),
        Tour(iDebut: 600, iFin: 899, declenchement: .distance),
        Tour(iDebut: 900, iFin: 1199, declenchement: .distance),
    ]
    let pivot = pivotSynthetique(duree: 1200, fc: { _ in 170 }, vitesse: { _ in allure }, tours: tours)
    let seance = try calculerSeanceIntrinseque(pivot, parametresSynthetiques)
    #expect(seance.repetitions.isEmpty)
    #expect(seance.minutes.subt == 0)
    #expect(try typeDeSeance(pivot) == .footing)
}

// MARK: - D-014 : marquage course ou test

@Test func d014UnNomDeSemiEstUneCourse() {
    // D-014 : « semi » dans un nom personnalisé fait une course.
    #expect(marquer(false, "Semi De Porto Vecchio") == .course)
}

@Test func d014UnEntrainementAKmNEstPasUneCourse() {
    // D-014 : « 11km » suivi d'un mot ne ferme pas la frontière `\d+ ?k\b` : un entraînement endurance reste « aucun ».
    #expect(marquer(false, "Paris / Pantin • 11km endurance") == .aucun)
}

// MARK: - 07 : type de chaque séance (règles 1 à 4)

@Test func typeFootingPourUnFootingSansLigneDroite() throws {
    // 07 règle 4 : tout le reste est un footing.
    #expect(try typeDeSeance(pivotSynthetique(duree: 1200)) == .footing)
}

@Test func typeFootingLignesDroitesPourQuatreAccelerationsDeQuinzeSecondes() throws {
    // 07 règle 4 : quatre accélérations de 15 s (vitesse 5 m/s contre 3 m/s) dans les 15 dernières minutes.
    let debutsAcceleration = [400, 600, 800, 1000]
    let vitesse: (Int) -> Float = { t in
        debutsAcceleration.contains { t >= $0 && t < $0 + 15 } ? 5 : 3
    }
    let pivot = pivotSynthetique(duree: 1200, vitesse: vitesse)
    #expect(try typeDeSeance(pivot) == .footingLignesDroites)
}

@Test func typeSousSeuilPourTroisRepetitionsDeTroisMinutes() throws {
    // 07 règle 2 : au moins 3 tours de travail d'au moins 2 min, séparés par des récupérations ≤ 2 min, FC de fin ≥ 155.
    #expect(try typeDeSeance(seanceTroisRepetitions(fcRep: 170)) == .sousSeuil)
}

@Test func typeSortieLonguePourUneSeanceDeQuatreVingtDixMinutes() throws {
    // 07 règle 3 : une durée d'au moins 90 min fait une sortie longue.
    #expect(try typeDeSeance(pivotSynthetique(duree: 95 * 60)) == .sortieLongue)
}

@Test func typeCoursePourUneSeanceMarqueeParLaPlateforme() throws {
    // 07 règle 1 : la case compétition de la plateforme fait une course, quelle que soit la durée ou le nom.
    #expect(try typeDeSeance(pivotSynthetique(duree: 1200, competition: true, nom: nil)) == .course)
}

@Test func typeTestPourUnNomContenantTest() throws {
    // 07 règle 1 et D-014 : « Test » (mot entier) dans le nom fait un test.
    #expect(try typeDeSeance(pivotSynthetique(duree: 1200, nom: "Test chrono 5000 m")) == .test)
}

// MARK: - 07 règle 2 : bornes de durée et de récupération, tours exclus, format (données synthétiques)

/// Pivot à 1 Hz : FC 170 pendant chaque tour, 120 ailleurs. Vitesse 3 m/s (333 s/km) : le repli sur le flux ne trouve
/// aucune répétition, si bien qu'un résultat vide vient bien du chemin par tours.
private func pivotAvecTours(duree: Int, tours: [Tour]) -> ActivitePivot {
    pivotSynthetique(duree: duree, fc: { t in tours.contains { t >= $0.iDebut && t <= $0.iFin } ? 170 : 120 }, tours: tours)
}

/// Trois tours manuels de `duree` échantillons, séparés de `repos` échantillons, à partir de `debut`. Un repos de `r`
/// secondes à 1 Hz donne un écart de `r` secondes entre deux tours.
private func troisTours(debut: Int, duree: Int, repos: Int) -> [Tour] {
    (0..<3).map { k in
        let a = debut + k * (duree + repos)
        return Tour(iDebut: a, iFin: a + duree - 1, declenchement: .manuel)
    }
}

/// Répétitions de la séance par le chemin des tours (paramètres synthétiques : fin de répétition ≥ 155 bpm).
private func repetitionsDe(_ pivot: ActivitePivot) throws -> Repetitions {
    try detecterRepetitions(try miseEnForme(pivot), pivot.tours, parametresSynthetiques)
}

@Test func regle2UneRepetitionDeCentVingtSecondesEstAdmiseEtRepos120EstAccepte() throws {
    // 07 règle 2 : durée minimale de 2 min incluse, récupération de 2 min incluse (≤ 120 s).
    let pivot = pivotAvecTours(duree: 1020, tours: troisTours(debut: 300, duree: 120, repos: 120))
    let reps = try repetitionsDe(pivot)
    #expect(reps.repetitions.count == 3)
    #expect(reps.repetitions.map(\.duree_s) == [120, 120, 120])
    #expect(reps.repetitions.map(\.debut_s) == [300, 540, 780])
    #expect(reps.recup_s == 120)
    #expect(reps.format == "3×2′")
}

@Test func regle2UnTourDe119SecondesNEstPasUneRepetition() throws {
    // 07 règle 2 : sous 2 min, un tour n'est pas une répétition : aucune série ne reste.
    let pivot = pivotAvecTours(duree: 1020, tours: troisTours(debut: 300, duree: 119, repos: 120))
    #expect(try repetitionsDe(pivot).repetitions.isEmpty)
}

@Test func regle2UnTourAuDelaDeDeuxMinutesEstAdmisAvecSonFormat() throws {
    // 07 règle 2 : au-delà du minimum, le tour compte. 150 s = 2,5 min, arrondies à la minute à mi-chemin vers le haut
    // (D-015) : format « 3×3′ », sans écart à la médiane.
    let pivot = pivotAvecTours(duree: 1110, tours: troisTours(debut: 300, duree: 150, repos: 120))
    let reps = try repetitionsDe(pivot)
    #expect(reps.repetitions.count == 3)
    #expect(reps.repetitions.allSatisfy { $0.duree_s == 150 })
    #expect(reps.format == "3×3′")
}

@Test func regle2UnReposDe121SecondesCoupeLaSerie() throws {
    // 07 règle 2 : au-delà de 2 min de récupération, les tours ne forment plus une série de trois : aucune répétition.
    let pivot = pivotAvecTours(duree: 1023, tours: troisTours(debut: 300, duree: 120, repos: 121))
    let reps = try repetitionsDe(pivot)
    #expect(reps.repetitions.isEmpty)
    #expect(reps.format == nil)
    #expect(reps.recup_s == nil)
}

@Test func regle2LEchauffementEtLeRetourAuCalmeNeSontPasDesRepetitions() throws {
    // 07 règle 2 (précision contrats.md) : le tour qui contient le premier échantillon est l'échauffement ; le dernier
    // tour, s'il contient le dernier échantillon, est le retour. Tous deux ont FC et durée de répétition : ils sont exclus.
    let echauffement = Tour(iDebut: 0, iFin: 299, declenchement: .manuel)
    let retour = Tour(iDebut: 900, iFin: 1019, declenchement: .manuel)
    let tours = [echauffement] + troisTours(debut: 300, duree: 120, repos: 120) + [retour]
    let reps = try repetitionsDe(pivotAvecTours(duree: 1020, tours: tours))
    #expect(reps.repetitions.count == 3)
    #expect(reps.repetitions.map(\.debut_s) == [300, 540, 780])
}

@Test func regle2UnTourSuiviDUnTourFinEstUnRetourExclu() throws {
    // 07 règle 2 (contrats.md) : le dernier tour qui n'est pas « fin » est le retour s'il est suivi d'un tour « fin ».
    let retour = Tour(iDebut: 920, iFin: 1060, declenchement: .manuel)
    let fin = Tour(iDebut: 1061, iFin: 1079, declenchement: .fin)
    let tours = troisTours(debut: 300, duree: 120, repos: 120) + [retour, fin]
    let reps = try repetitionsDe(pivotAvecTours(duree: 1080, tours: tours))
    #expect(reps.repetitions.count == 3)
}

@Test func regle2LesTourinconnuSontDesToursDeTravailEtLesTourNonActifsNon() throws {
    // 07 règle 2 : déclenchement « inconnu » admis ; intensité « repos » exclue, « actif » admise.
    let inconnus = troisTours(debut: 300, duree: 120, repos: 120).map { tour -> Tour in
        var copie = tour
        copie.declenchement = .inconnu
        return copie
    }
    #expect(try repetitionsDe(pivotAvecTours(duree: 1020, tours: inconnus)).repetitions.count == 3)

    var repos = troisTours(debut: 300, duree: 120, repos: 120)
    repos[1].intensite = .repos
    #expect(try repetitionsDe(pivotAvecTours(duree: 1020, tours: repos)).repetitions.isEmpty)

    var actifs = troisTours(debut: 300, duree: 120, repos: 120)
    actifs[1].intensite = .actif
    #expect(try repetitionsDe(pivotAvecTours(duree: 1020, tours: actifs)).repetitions.count == 3)
}

@Test func regle2LeFormatTolereQuinzePourCentDeLaMediane() throws {
    // 07 règle 2 : format « 3×6′ » si chaque durée est à ±15 % de la médiane (360 s : marge 54 s). Un écart de 40 s
    // reste dans la marge ; un écart de 60 s, non : le format liste alors les durées, « 6′-6′-7′ ».
    let uniforme = [
        Tour(iDebut: 300, iFin: 659, declenchement: .manuel),
        Tour(iDebut: 700, iFin: 1059, declenchement: .manuel),
        Tour(iDebut: 1100, iFin: 1499, declenchement: .manuel),
    ]
    #expect(try repetitionsDe(pivotAvecTours(duree: 1700, tours: uniforme)).format == "3×6′")

    let disperse = [
        Tour(iDebut: 300, iFin: 659, declenchement: .manuel),
        Tour(iDebut: 700, iFin: 1059, declenchement: .manuel),
        Tour(iDebut: 1100, iFin: 1519, declenchement: .manuel),
    ]
    #expect(try repetitionsDe(pivotAvecTours(duree: 1700, tours: disperse)).format == "6′-6′-7′")
}

@Test func unFluxDeColonnesIncoherentesLeveUneErreurClaire() {
    // Colonnes de longueurs différentes : miseEnForme lève ErreurFluxIncoherent au lieu de lire hors bornes.
    var pivot = pivotSynthetique(duree: 120)
    pivot.flux.dist_m.removeLast()
    #expect(throws: ErreurFluxIncoherent.self) { _ = try miseEnForme(pivot) }
}
