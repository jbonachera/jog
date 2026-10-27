import Foundation
import Testing
@testable import JogCore

// Comportement des séances HealthKit par app (migration-ios, décisions 2 à 4) : analyse des intervalles réservée à
// l'Exercice d'Apple, doublons entre apps, et Vue qui n'en compte qu'une. Séances construites par ConstruireSeanceBrute
// avec des valeurs inventées ; aucune donnée de local-data.

private let exerciceApple = "com.apple.health.7D1E1FAC-B565-45D1-9D90-C0C92AA39647"
private let workoutDoors = "net.workoutdoors.workoutdoors"
private let strava = "com.strava.run"
private let debutSeance = dateTest("2026-07-03T07:07:27+0200")
private let jourDeCalcul = "2026-07-10"

private let parametresTest = ParamsDates(
    hrMax: 188, hrRest: 46, z1: 68, z2: 78, z3: 85, z4: 92,
    lt2Hr: 172, lt2Pace: 238, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)

/// Footing de `duree` secondes à 3 m/s, avec FC à 150 bpm si `fc`, commençant `decalage` secondes après `debutSeance`.
private func constructeur(
    _ id: String, bundle: String, decalage: Double = 0, duree: Double = 1200, fc: Bool = false
) -> ConstructeurSeance {
    var c = ConstructeurSeance()
    c.id = id
    c.bundle = bundle
    c.debut = debutSeance.addingTimeInterval(decalage)
    c.dureeEcoulee = duree
    let echantillons = echantillonsTroncon(debut: 0, fin: duree, vitesse: 3, fc: fc ? 150 : nil)
    c.distances = echantillons.distances
    c.fc = echantillons.fc
    return c
}

private func pivot(_ c: ConstructeurSeance) throws -> ActivitePivot {
    try #require(try adapterSeance(c.brute(), decalageAppareil_min: 120))
}

/// Entraînement à quatre répétitions (travail de 4 min à 170 bpm, récupération de 90 s), avec échauffement et retour.
private func entrainement(bundle: String) -> ConstructeurSeance {
    var etapes: [(cle: String, debut: Double, fin: Double, vitesse: Double, fc: Double)] = []
    var t = 0.0
    func ajouter(_ cle: String, _ duree: Double, _ vitesse: Double, _ fc: Double) {
        etapes.append((cle, t, t + duree, vitesse, fc))
        t += duree
    }
    ajouter("0.0.0", 600, 1000 / 330, 135)
    for i in 0..<4 {
        ajouter("1.\(i).0", 240, 1000 / 230, 170)
        ajouter("1.\(i).1", i == 3 ? 89 : 90, 1000 / 360, 130)
    }
    ajouter("2.0.0", 600, 1000 / 330, 135)

    var c = ConstructeurSeance()
    c.bundle = bundle
    c.dureeEcoulee = t
    c.etapes = etapes.map { (cle: $0.cle, debut: $0.debut, fin: $0.fin) }
    for etape in etapes {
        let echantillons = echantillonsTroncon(debut: etape.debut, fin: etape.fin, vitesse: etape.vitesse, fc: etape.fc)
        c.distances += echantillons.distances
        c.fc += echantillons.fc
    }
    return c
}

/// Moteur neuf, avec les activités données (ordre d'arrivée conservé) et leurs flux.
private func moteurAvec(_ pivots: [ActivitePivot]) async throws -> (Moteur, URL) {
    let dossier = try dossierTemporaire()
    let moteur = Moteur(stockage: Stockage(racine: dossier), lireFlux: { cle in
        pivots.first { $0.cleSource == cle }?.flux
    })
    try await moteur.ajouterOuMettreAJour(activites: pivots.map(PivotSansFlux.init))
    return (moteur, dossier)
}

/// Clés des séances comptées dans la Vue du jour de calcul.
private func clesDansLaVue(_ moteur: Moteur) async throws -> [String] {
    try await moteur.recalculer(J: jourDeCalcul, derniereSynchro: nil).seances.map(\.cleSource)
}

// MARK: - Analyse réservée à l'Exercice (décision 2)

@Test func uneSeanceWorkoutDoorsAvecEtapesNAPasDeTourNiDeRepetition() throws {
    let pivotWod = try pivot(entrainement(bundle: workoutDoors))
    #expect(pivotWod.tours.isEmpty)
    #expect(pivotWod.appSource == workoutDoors)
    let seance = try calculerSeanceIntrinseque(pivotWod, parametresTest)
    #expect(seance.repetitions.isEmpty)
    #expect(seance.duree_min > 0)
    #expect(seance.km > 0)
}

@Test func lesMemesEtapesDansLExerciceDonnentLesRepetitions() throws {
    let pivotExercice = try pivot(entrainement(bundle: exerciceApple))
    #expect(!pivotExercice.tours.isEmpty)
    #expect(!(try calculerSeanceIntrinseque(pivotExercice, parametresTest)).repetitions.isEmpty)
}

@Test func uneSeanceWorkoutDoorsComptePourSesMinutesSaDistanceEtSaCharge() async throws {
    let pivotWod = try pivot(entrainement(bundle: workoutDoors))
    let (moteur, dossier) = try await moteurAvec([pivotWod])
    defer { try? FileManager.default.removeItem(at: dossier) }

    let vue = try await moteur.recalculer(J: jourDeCalcul, derniereSynchro: nil)
    let seance = try #require(vue.seances.first)
    #expect(vue.seances.count == 1)
    #expect(seance.duree_min > 0)
    #expect(seance.km > 0)
    #expect(seance.charge > 0)
    #expect(seance.repetitions.isEmpty)
}

// MARK: - Doublons (décision 3)

@Test func unChevauchementExerciceEtAutreAppNeCompteQuLExerciceQuelQueSoitLOrdre() async throws {
    let exercice = try pivot(constructeur("exercice", bundle: exerciceApple))
    let wod = try pivot(constructeur("wod", bundle: workoutDoors))

    for ordre in [[exercice, wod], [wod, exercice]] {
        let (moteur, dossier) = try await moteurAvec(ordre)
        defer { try? FileManager.default.removeItem(at: dossier) }
        #expect(try await clesDansLaVue(moteur) == [exercice.cleSource])
        #expect(await moteur.doublons == [Ignoree(cleSource: wod.cleSource, raison: .doublon, detail: exercice.cleSource)])
    }
}

@Test func deuxEnregistrementsSuccessifsSansRecouvrementComptentTousLesDeux() async throws {
    let exercice = try pivot(constructeur("exercice", bundle: exerciceApple))
    let wod = try pivot(constructeur("wod", bundle: workoutDoors, decalage: 3600))
    let (moteur, dossier) = try await moteurAvec([exercice, wod])
    defer { try? FileManager.default.removeItem(at: dossier) }

    #expect(Set(try await clesDansLaVue(moteur)) == [exercice.cleSource, wod.cleSource])
    #expect(await moteur.doublons.isEmpty)
}

@Test func unRecouvrementDe40PourCentNeCompteQuUneFoisPasDeDoublon() async throws {
    // Décalé de 720 s sur 1 200 s : 480 s communes, soit 40 % de la plus courte. Sous le seuil de 50 %.
    let exercice = try pivot(constructeur("exercice", bundle: exerciceApple))
    let wod = try pivot(constructeur("wod", bundle: workoutDoors, decalage: 720))
    let (moteur, dossier) = try await moteurAvec([exercice, wod])
    defer { try? FileManager.default.removeItem(at: dossier) }

    #expect(Set(try await clesDansLaVue(moteur)) == [exercice.cleSource, wod.cleSource])
}

@Test func unRecouvrementDe50PourCentFaitUnDoublon() async throws {
    let exercice = try pivot(constructeur("exercice", bundle: exerciceApple))
    let wod = try pivot(constructeur("wod", bundle: workoutDoors, decalage: 600))
    let (moteur, dossier) = try await moteurAvec([exercice, wod])
    defer { try? FileManager.default.removeItem(at: dossier) }

    #expect(try await clesDansLaVue(moteur) == [exercice.cleSource])
}

@Test func sansExerciceLaPlusRicheEnFcGagneQuelQueSoitLOrdre() throws {
    let avecFC = try pivot(constructeur("avec-fc", bundle: workoutDoors, fc: true))
    let sansFC = try pivot(constructeur("sans-fc", bundle: strava))
    let attendu = [Ignoree(cleSource: sansFC.cleSource, raison: .doublon, detail: avecFC.cleSource)]

    let activites = [avecFC, sansFC].map(PivotSansFlux.init)
    #expect(doublonsEcartes(activites) == attendu)
    #expect(doublonsEcartes(activites.reversed()) == attendu)
}

@Test func laPlusRicheEnFcGagneMemeSiElleEstPlusCourte() throws {
    let courte = try pivot(constructeur("courte", bundle: workoutDoors, duree: 1200, fc: true))
    let longue = try pivot(constructeur("longue", bundle: strava, duree: 1500, fc: true))
    #expect(doublonsEcartes([courte, longue].map(PivotSansFlux.init))
        .map(\.cleSource) == [courte.cleSource])
}

@Test func siLExerciceEstSupprimeLAutreReapparait() async throws {
    let exercice = try pivot(constructeur("exercice", bundle: exerciceApple))
    let wod = try pivot(constructeur("wod", bundle: workoutDoors))
    let (moteur, dossier) = try await moteurAvec([exercice, wod])
    defer { try? FileManager.default.removeItem(at: dossier) }
    #expect(try await clesDansLaVue(moteur) == [exercice.cleSource])

    try await moteur.retirer(cles: [exercice.cleSource])

    #expect(try await clesDansLaVue(moteur) == [wod.cleSource])
    #expect(await moteur.doublons.isEmpty)
}

@Test func unDoublonRestePourLeMoteurMaisNEntrePasDansLaVue() async throws {
    let exercice = try pivot(constructeur("exercice", bundle: exerciceApple))
    let wod = try pivot(constructeur("wod", bundle: workoutDoors))
    let (moteur, dossier) = try await moteurAvec([exercice, wod])
    defer { try? FileManager.default.removeItem(at: dossier) }

    _ = try await moteur.recalculer(J: jourDeCalcul, derniereSynchro: nil)

    #expect(try await moteur.clesActivites().count == 2)
    #expect(try await clesDansLaVue(moteur) == [exercice.cleSource])
}

// MARK: - Durée écoulée, FC inconnue, non-transitivité (migration-ios, décision 3)

/// Pivot sans flux, construit directement (sans adaptateur), pour les bornes et le rang. Début en secondes après
/// `debutSeance`.
private func sansFlux(
    _ cle: String, debut: Double = 0, duree: Double, source: Source = .healthkit, appSource: String? = nil,
    nbMesuresFC: Int? = nil, dureeEcoulee: Double? = nil
) -> PivotSansFlux {
    PivotSansFlux(
        cleSource: cle, source: source, versionAdaptateur: "test", empreinteBrute: "empreinte-" + cle,
        debutUtc: (debutSeance.timeIntervalSince1970 + debut) * 1000, decalageLocal_min: 120, dateLocale: jourDeCalcul,
        duree_s: duree, distance_m: 3000, nom: nil, competition: false, sousType: .route, pasFC_s: nil, tours: [],
        appSource: appSource, nbMesuresFC: nbMesuresFC, dureeEcoulee_s: dureeEcoulee
    )
}

/// Toutes les permutations de `elements`.
private func permutations<T>(_ elements: [T]) -> [[T]] {
    guard elements.count > 1 else { return [elements] }
    return elements.indices.flatMap { indice -> [[T]] in
        var reste = elements
        let tete = reste.remove(at: indice)
        return permutations(reste).map { [tete] + $0 }
    }
}

@Test func lesBornesPortentSurLaDureeEcouleeEtNonSurLeTempsEnMouvement() async throws {
    // Exercice avec une pause de 5 min : 1 200 s écoulées, 900 s en mouvement. Une autre app commence 720 s plus tard,
    // sans pause : 480 s communes, soit 40 % de la durée écoulée (sous le seuil), mais 53 % du temps en mouvement.
    var c = constructeur("exercice", bundle: exerciceApple)
    c.pauses = [(600, 900)]
    let exercice = try pivot(c)
    #expect(exercice.duree_s == 900)
    #expect(exercice.dureeEcoulee_s == 1200)
    let wod = try pivot(constructeur("wod", bundle: workoutDoors, decalage: 720))

    let (moteur, dossier) = try await moteurAvec([exercice, wod])
    defer { try? FileManager.default.removeItem(at: dossier) }

    #expect(Set(try await clesDansLaVue(moteur)) == [exercice.cleSource, wod.cleSource])
    #expect(await moteur.doublons.isEmpty)
}

@Test func troisEnregistrementsEnChaineNeSontPasTransitifs() {
    // A et B se recouvrent à 50 %, B et C aussi, mais A et C pas du tout. A (Exercice) est gardée : B, qui la recouvre,
    // est écartée. C ne recouvre que B, déjà écartée : elle reste. Le résultat suit le rang des enregistrements, pas
    // la chaîne des recouvrements : c'est voulu, une séance écartée ne sert pas de référence.
    let a = sansFlux("hk:a", duree: 1200, appSource: exerciceApple)
    let b = sansFlux("hk:b", debut: 600, duree: 1200, appSource: workoutDoors)
    let c = sansFlux("hk:c", debut: 1200, duree: 1200, appSource: workoutDoors)

    #expect(doublonsEcartes([a, b, c]) == [Ignoree(cleSource: b.cleSource, raison: .doublon, detail: a.cleSource)])
    #expect(doublonsEcartes([c, b, a]) == [Ignoree(cleSource: b.cleSource, raison: .doublon, detail: a.cleSource)])
}

@Test func uneDureeNulleNeFaitJamaisUnDoublon() {
    let nulle = sansFlux("hk:nulle", duree: 0, appSource: workoutDoors)
    let normale = sansFlux("hk:normale", duree: 1200, appSource: exerciceApple)

    #expect(doublonsEcartes([nulle, normale]).isEmpty)
    #expect(doublonsEcartes([normale, nulle]).isEmpty)
}

@Test func leResultatNeDependPasDeLOrdreDEntree() {
    // Mélange de FC connues et inconnues, de durées et de recouvrements : chaque permutation donne le même résultat.
    let activites = [
        sansFlux("hk:1", duree: 1200, appSource: exerciceApple),
        sansFlux("hk:2", debut: 600, duree: 1200, appSource: workoutDoors, nbMesuresFC: 300),
        sansFlux("hk:3", debut: 300, duree: 1500, source: .stravaArchive),
        sansFlux("hk:4", debut: 900, duree: 900, source: .fit, nbMesuresFC: 200),
        sansFlux("hk:5", debut: 3000, duree: 1200, appSource: workoutDoors, nbMesuresFC: 0),
    ]
    let attendu = doublonsEcartes(activites)
    #expect(attendu.map(\.cleSource) == ["hk:2", "hk:3"])

    for ordre in permutations(activites) {
        #expect(doublonsEcartes(ordre) == attendu)
    }
}

@Test func uneSeanceFITRecouvrantUnExerciceEstLeDoublonDeLExercice() {
    let exercice = sansFlux("hk:exercice", duree: 1200, appSource: exerciceApple, nbMesuresFC: 100)
    let fit = sansFlux("fit:1", duree: 1200, source: .fit)

    #expect(doublonsEcartes([fit, exercice]) == [Ignoree(cleSource: fit.cleSource, raison: .doublon, detail: exercice.cleSource)])
}

@Test func uneFCInconnueNePenalisePasLaSeanceStrava() {
    // Strava ne donne pas le nombre de mesures de FC : la FC n'arbitre pas, la plus longue gagne face à WorkOutDoors.
    let wod = sansFlux("hk:wod", duree: 1200, appSource: workoutDoors, nbMesuresFC: 150)
    let strava = sansFlux("strava:1", duree: 1500, source: .stravaArchive)

    #expect(doublonsEcartes([wod, strava]) == [Ignoree(cleSource: wod.cleSource, raison: .doublon, detail: strava.cleSource)])
}

/// Mesure de performance : 500 séances, avec un tri et des recouvrements. Désactivé par défaut, comme `VuePerfTests`.
/// Lancement : JOG_PERF=1 swift test -c release --disable-sandbox --scratch-path /tmp/jogcore-Z --filter cinqCent
@Test(.enabled(if: ProcessInfo.processInfo.environment["JOG_PERF"] == "1"))
func cinqCentSeancesSeCalculentEnMoinsDe100Millisecondes() {
    let activites = (0..<500).map { indice in
        sansFlux(
            "hk:\(indice)", debut: Double(indice) * 700, duree: 1200 + Double(indice % 7) * 60,
            appSource: indice % 3 == 0 ? exerciceApple : workoutDoors,
            nbMesuresFC: indice % 5 == 0 ? nil : 100 + indice % 50
        )
    }
    let debut = ContinuousClock.now
    _ = doublonsEcartes(activites)
    let duree = ContinuousClock.now - debut
    print("doublonsEcartes (500 séances) : \(duree)")
    #expect(duree < .milliseconds(100))
}
