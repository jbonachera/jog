import Foundation
import Testing
@testable import JogCore

// Tests de comportement de l'adaptateur HealthKit (partie pure, migration-ios, source). Les séances sont construites par
// ConstruireSeanceBrute.swift, avec des valeurs inventées. Les paramètres sont les défauts de 06 (contrats.md).

private let parametresHK = ParamsDates(
    hrMax: 188, hrRest: 46, z1: 68, z2: 78, z3: 85, z4: 92,
    lt2Hr: 172, lt2Pace: 238, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)

/// Pivot d'une séance construite. Échoue si le filtre écarte la séance.
private func pivotDe(_ constructeur: ConstructeurSeance, decalage: Int = 120) throws -> ActivitePivot {
    try #require(try adapterSeance(constructeur.brute(), decalageAppareil_min: decalage))
}

/// Entrainement personnalisé : échauffement de 10 min, `nombre` étapes de travail de `duree` s à `fcTravail` bpm,
/// séparées de `recuperation` s de récupération (la dernière de 89 s), retour au calme de 10 min. Chaque étape a son
/// rang dans l'export.
private func entrainementPersonnalise(
    nombre: Int = 4, duree: Double = 240, recuperation: Double = 90, fcTravail: Double = 170
) -> ConstructeurSeance {
    var etapes: [(cle: String, debut: Double, fin: Double, vitesse: Double, fc: Double)] = []
    var t = 0.0
    func ajouter(_ cle: String, _ duree: Double, _ vitesse: Double, _ fc: Double) {
        etapes.append((cle, t, t + duree, vitesse, fc))
        t += duree
    }
    ajouter("0.0.0", 600, 1000 / 330, 135)
    for i in 0..<nombre {
        ajouter("1.\(i).0", duree, 1000 / 230, fcTravail)
        ajouter("1.\(i).1", i == nombre - 1 ? 89 : recuperation, 1000 / 360, 130)
    }
    ajouter("2.0.0", 600, 1000 / 330, 135)

    var c = ConstructeurSeance()
    c.dureeEcoulee = t
    c.etapes = etapes.map { (cle: $0.cle, debut: $0.debut, fin: $0.fin) }
    for etape in etapes {
        let echantillons = echantillonsTroncon(debut: etape.debut, fin: etape.fin, vitesse: etape.vitesse, fc: etape.fc)
        c.distances += echantillons.distances
        c.fc += echantillons.fc
    }
    return c
}

// MARK: - Filtre de source et de type

@Test func filtreRetientLAppExerciceEtLesCoursesSeulement() throws {
    var workoutDoors = ConstructeurSeance()
    workoutDoors.bundle = "net.workoutdoors.workoutdoors"
    #expect(try adapterSeance(workoutDoors.brute(), decalageAppareil_min: 120) == nil)
    #expect(raisonIgnoreeHealthKit(try workoutDoors.brute())?.raison == .autreSource)

    var marche = ConstructeurSeance()
    marche.activityType = 52
    #expect(raisonIgnoreeHealthKit(try marche.brute())?.raison == .pasUneCourse)
    #expect(try adapterSeance(marche.brute(), decalageAppareil_min: 120) == nil)

    let exerciceSurWatch = ConstructeurSeance()
    #expect(raisonIgnoreeHealthKit(try exerciceSurWatch.brute()) == nil)

    var exerciceDeBundleGenerique = ConstructeurSeance()
    exerciceDeBundleGenerique.bundle = "com.apple.workout"
    #expect(try adapterSeance(exerciceDeBundleGenerique.brute(), decalageAppareil_min: 120) != nil)
}

// MARK: - Pivot

@Test func pivotDUneSeanceExerciceEstUnPivotHealthKit() throws {
    var c = ConstructeurSeance()
    c.nomMarque = "Marque de test"
    let pivot = try pivotDe(c)
    #expect(pivot.source == .healthkit)
    #expect(pivot.cleSource == "hk:" + c.id)
    #expect(pivot.versionAdaptateur == "healthkit-1.0.0")
    #expect(pivot.nom == "Marque de test")
    #expect(pivot.competition == false)
    #expect(pivot.sousType == .route)
    #expect(pivot.empreinteBrute.count == 64)
    #expect(pivot.flux.t_s.first == 0)
}

@Test func nomEstNilSansMarqueEtTapisSiIndoor() throws {
    var c = ConstructeurSeance()
    c.indoor = true
    let pivot = try pivotDe(c)
    #expect(pivot.nom == nil)
    #expect(pivot.sousType == .tapis)
}

@Test func dateDecodeLeFormatDuSpikeAvecDecalageAvecOuSansDeuxPoints() throws {
    let json = #"""
    {"id": "x", "activityType": 37, "debut": "2026-07-03T07:07:27.938+0200",
     "fin": "2026-07-03T07:27:27+02:00", "dureeSecondes": 1200}
    """#
    let brute = try decodeurSeanceBrute().decode(SeanceBrute.self, from: Data(json.utf8))
    #expect(abs(brute.debut.timeIntervalSince1970 - 1_783_055_247.938) < 0.001)
    #expect(abs(brute.fin.timeIntervalSince1970 - 1_783_056_447) < 0.001)
}

// MARK: - Fuseau et date locale (ADR 0007)

@Test func fuseauParisDonneDeux_heuresEnEteEtUneHeureEnHiver() throws {
    var ete = ConstructeurSeance()
    ete.debut = dateTest("2026-07-03T07:07:27+0200")
    #expect(try pivotDe(ete, decalage: 0).decalageLocal_min == 120)

    var hiver = ConstructeurSeance()
    hiver.debut = dateTest("2026-01-15T07:00:00+0100")
    #expect(try pivotDe(hiver, decalage: 0).decalageLocal_min == 60)
}

@Test func sansFuseauDeLaSeanceLeDecalageDeLAppareilSertDeRepli() throws {
    var c = ConstructeurSeance()
    c.fuseau = nil
    #expect(try pivotDe(c, decalage: 60).decalageLocal_min == 60)
}

@Test func dateLocaleSuitLeFuseauDuLieu() throws {
    var c = ConstructeurSeance()
    c.debut = dateTest("2026-07-03T22:30:00Z")
    #expect(try pivotDe(c).dateLocale == "2026-07-04")
}

// MARK: - Durée, distance et tronçons (ADR 0003, D-013)

@Test func dureeEstLaDureeEnMouvementEtLaDistanceCelleDesEchantillons() throws {
    var c = ConstructeurSeance()
    c.dureeEcoulee = 600
    c.distances = echantillonsTroncon(debut: 0, fin: 600, vitesse: 3, fc: nil).distances
    let pivot = try pivotDe(c)
    #expect(pivot.duree_s == 600)
    #expect(abs(pivot.distance_m - 1800) < 1e-6)
    #expect(abs(Double(pivot.flux.dist_m.last ?? .nan) - 1800) < 0.01)
}

@Test func unResumeQuiDoubleLesFinsNeCompteQuUneFois() throws {
    // Un résumé de 10 min qui recouvre les échantillons fins (comme sur l'export réel) ne doit rien ajouter.
    var c = ConstructeurSeance()
    c.dureeEcoulee = 600
    c.distances = echantillonsTroncon(debut: 0, fin: 600, vitesse: 3, fc: nil).distances
    c.distances.append((0, 600, 1800))
    #expect(abs(try pivotDe(c).distance_m - 1800) < 1e-6)
}

@Test func lePremierEchantillonDeborderAvantLeDebutEstRogne() throws {
    // [-1, 1,5] : 5 m sur 2,5 s, dont 1,5 s dans la séance : 3 m. Le total vaut 3 + 7,5 + 6 = 16,5 m.
    var c = ConstructeurSeance()
    c.dureeEcoulee = 6
    c.distances = [(-1.0, 1.5, 5.0), (1.5, 4.0, 7.5), (4.0, 6.0, 6.0)]
    let pivot = try pivotDe(c)
    #expect(abs(pivot.distance_m - 16.5) < 1e-6)
    #expect(pivot.flux.t_s == [0, 1, 2, 3, 4, 5, 6])
    // À 1 s, 2 m ont été parcourus : 3 m répartis sur 1,5 s.
    #expect(abs(Double(pivot.flux.dist_m[1]) - 2) < 1e-3)
}

@Test func unePauseNEstPasComptéeDansLeTempsEnMouvement() throws {
    // 25 min écoulées, dont 5 min de pause (de 600 à 900 s) : 20 min en mouvement, 3 m/s, 3 600 m.
    var c = ConstructeurSeance()
    c.dureeEcoulee = 1500
    c.pauses = [(600, 900)]
    c.distances = echantillonsTroncon(debut: 0, fin: 600, vitesse: 3, fc: nil).distances
        + echantillonsTroncon(debut: 900, fin: 1500, vitesse: 3, fc: nil).distances
    let pivot = try pivotDe(c)
    #expect(pivot.duree_s == 1200)
    #expect(pivot.flux.t_s.allSatisfy { !($0 >= 600 && $0 < 900) })
    #expect(abs(pivot.distance_m - 3600) < 1e-6)

    let seance = try calculerSeanceIntrinseque(pivot, parametresHK)
    // Le moteur compte jusqu'à 10 s pour l'échantillon qui précède un trou (ADR 0006, poids plafonné) : un dépassement
    // de 9 s est donc accepté. La pause de 5 min, elle, n'est pas comptée.
    #expect(seance.duree_min * 60 >= 1200)
    #expect(seance.duree_min * 60 <= 1210)
    #expect(seance.minutes.easy + seance.minutes.mp + seance.minutes.subt + seance.minutes.hard <= 20.2)
}

// MARK: - Répétitions : footing libre et entraînement personnalisé

@Test func footingLibreASegmentsAuKmNADAucuneRepetition() throws {
    // 40 min à 5:30 au km, FC 140, avec les segments automatiques au km et au mile (qui se chevauchent).
    let vitesse = 1000.0 / 330
    var c = ConstructeurSeance()
    c.dureeEcoulee = 2400
    c.fc = echantillonsTroncon(debut: 0, fin: 2400, vitesse: vitesse, fc: 140).fc
    c.distances = echantillonsTroncon(debut: 0, fin: 2400, vitesse: vitesse, fc: nil).distances
    for k in 1...7 {
        c.segments.append((Double(k - 1) * 330, Double(k) * 330))
    }
    for k in 1...4 {
        c.segments.append((Double(k - 1) * 531, Double(k) * 531))
    }
    let pivot = try pivotDe(c)
    #expect(pivot.tours.allSatisfy { $0.declenchement == .distance })
    let seance = try calculerSeanceIntrinseque(pivot, parametresHK)
    #expect(seance.repetitions.isEmpty)
    #expect(seance.format == nil)
}

@Test func entrainementPersonnaliseDonneLesRepetitionsDesEtapesDeTravail() throws {
    let pivot = try pivotDe(entrainementPersonnalise())
    let seance = try calculerSeanceIntrinseque(pivot, parametresHK)

    #expect(seance.repetitions.count == 4)
    #expect(seance.format == "4×4′")
    #expect(seance.recup_s == 90)
    #expect(pivot.tours.filter { $0.intensite == .actif }.count == 4)
    #expect(pivot.tours.filter { $0.intensite == .echauffement }.count == 1)
    #expect(pivot.tours.filter { $0.intensite == .retour }.count == 1)
    #expect(pivot.tours.filter { $0.intensite == .recuperation }.count == 4)
    #expect(pivot.tours.filter { $0.declenchement == .manuel }.isEmpty)
}

@Test func recuperationsDe6Min48EntreEtapesDeTravailDonnentQuatreRepetitions() throws {
    // Écart 07 règle 2 levé : travail « actif », récupération « recuperation », travail « actif ».
    let seance = try calculerSeanceIntrinseque(
        try pivotDe(entrainementPersonnalise(duree: 360, recuperation: 408)), parametresHK
    )
    #expect(seance.repetitions.count == 4)
    #expect(seance.format == "4×6′")
    #expect(seance.recup_s == 408)
}

@Test func laDerniereRecuperationDe89SNeChangeRien() throws {
    // La seule récupération de 89 s sépare la quatrième étape de travail du retour : elle n'entre pas dans la série.
    let avec = try calculerSeanceIntrinseque(try pivotDe(entrainementPersonnalise(duree: 360, recuperation: 408)), parametresHK)
    let sansRetourDeTravail = try calculerSeanceIntrinseque(
        try pivotDe(entrainementPersonnalise(nombre: 4, duree: 360, recuperation: 408)), parametresHK
    )
    #expect(avec.repetitions.count == 4)
    #expect(avec.repetitions.map(\.duree_s) == sansRetourDeTravail.repetitions.map(\.duree_s))
    #expect(avec.repetitions.allSatisfy { $0.duree_s == 360 })
}

@Test func lesFiltresDeDureeEtDeFcRestentAppliquesAuxEtapesDeTravail() throws {
    // Étapes de travail trop courtes (100 s), ou à 140 bpm (sous 155) : aucune répétition.
    let courtes = try calculerSeanceIntrinseque(try pivotDe(entrainementPersonnalise(duree: 100, recuperation: 408)), parametresHK)
    let sansFc = try calculerSeanceIntrinseque(try pivotDe(entrainementPersonnalise(duree: 360, recuperation: 408, fcTravail: 140)), parametresHK)
    #expect(courtes.repetitions.isEmpty)
    #expect(sansFc.repetitions.isEmpty)
}

/// Tours manuels (type 3) de 6 min à 170 bpm, séparés de `ecart` s à 130 bpm, sans étape ni intensité : une séance
/// « sans intensité explicite », comme un export FIT.
private func toursManuels(ecart: Double, nombre: Int = 4) -> ConstructeurSeance {
    var c = ConstructeurSeance()
    var t = 300.0
    var travaux: [(debut: Double, fin: Double)] = []
    for _ in 0..<nombre {
        travaux.append((debut: t, fin: t + 360))
        t += 360 + ecart
    }
    let total = t + 300
    c.dureeEcoulee = total
    c.tours = travaux
    c.fc = stride(from: 0.0, to: total, by: 5).map { seconde in
        (t: seconde, bpm: travaux.contains { seconde >= $0.debut && seconde < $0.fin } ? 170 : 130)
    }
    c.distances = echantillonsTroncon(debut: 0, fin: total, vitesse: 3, fc: nil).distances
    return c
}

@Test func sansIntensiteExpliciteLAncienneRegleDEcartSApplique() throws {
    // Mêmes tours de 6 min : séparés de 6 min 48, ils ne forment aucune série ; séparés de 90 s, quatre répétitions.
    let ecartLong = try calculerSeanceIntrinseque(try pivotDe(toursManuels(ecart: 408)), parametresHK)
    let ecartCourt = try calculerSeanceIntrinseque(try pivotDe(toursManuels(ecart: 90)), parametresHK)
    #expect(ecartLong.repetitions.isEmpty)
    #expect(ecartLong.format == nil)
    #expect(ecartCourt.repetitions.count == 4)
    #expect(ecartCourt.format == "4×6′")
}

@Test func footingAuxSegmentsDeKmAvecIntensitesDeTravailNADAucuneRepetition() throws {
    // Footing à 170 bpm (la FC passerait le seuil) : les segments de km ne sont pas des tours de travail, même alternés
    // « actif » et « recuperation ». La règle de récupération non plafonnée ne les touche pas.
    var c = ConstructeurSeance()
    c.dureeEcoulee = 2400
    c.fc = echantillonsTroncon(debut: 0, fin: 2400, vitesse: 1000.0 / 330, fc: 170).fc
    c.distances = echantillonsTroncon(debut: 0, fin: 2400, vitesse: 1000.0 / 330, fc: nil).distances
    for k in 1...7 {
        c.segments.append((Double(k - 1) * 330, Double(k) * 330))
    }
    var pivot = try pivotDe(c)
    pivot.tours = pivot.tours.enumerated().map { indice, tour in
        var entre = tour
        entre.intensite = indice % 2 == 0 ? .actif : .recuperation
        return entre
    }
    #expect(pivot.tours.count == 7)
    #expect(try calculerSeanceIntrinseque(pivot, parametresHK).repetitions.isEmpty)
}

@Test func unResumeSeulDonneLaDistanceSansEchantillonFin() throws {
    // Repli : aucun échantillon fin, le résumé compte entièrement.
    var c = ConstructeurSeance()
    c.dureeEcoulee = 600
    c.distances = [(0, 600, 1800)]
    #expect(abs(try pivotDe(c).distance_m - 1800) < 1e-6)
}

@Test func unEchantillonDeDixHuitSecondesEstFinEtLeResumeEstIgnore() throws {
    // Le seuil des fins est 30 s : un échantillon de 18 s (près d'une pause, sur l'export) compte comme fin, et le
    // résumé qui le recouvre ne s'ajoute pas.
    var c = ConstructeurSeance()
    c.dureeEcoulee = 600
    c.distances = [(0, 18, 54), (0, 600, 1800)]
    #expect(abs(try pivotDe(c).distance_m - 54) < 1e-6)
}

@Test func lesToursManuelsSontIgnoresQuandLesEtapesExistent() throws {
    // Avec des étapes, les tours manuels (type 3) ne servent pas : ils feraient double emploi avec les étapes.
    var c = entrainementPersonnalise()
    c.tours = [(600, 840), (840, 930)]
    let pivot = try pivotDe(c)
    #expect(pivot.tours.allSatisfy { $0.declenchement != .manuel })
    #expect(try calculerSeanceIntrinseque(pivot, parametresHK).repetitions.count == 4)
}

@Test func lesToursManuelsSansEtapesDeviennentDesToursManuels() throws {
    var c = ConstructeurSeance()
    c.dureeEcoulee = 900
    c.tours = [(300, 600)]
    let pivot = try pivotDe(c)
    #expect(pivot.tours == [Tour(iDebut: 300, iFin: 599, declenchement: .manuel)])
}

// MARK: - FC (D-013)

@Test func fcACinqSecondesDonneLesMemesMinutesQueLaFCAUneSeconde() throws {
    // FC de 150 bpm, puis 175 bpm à partir de 600 s : mêmes minutes à 1 s et à 5 s d'écart.
    let fc: (Double) -> Double = { $0 < 600 ? 150 : 175 }
    let distances = echantillonsTroncon(debut: 0, fin: 1200, vitesse: 3, fc: nil).distances
    var unHertz = ConstructeurSeance()
    unHertz.dureeEcoulee = 1200
    unHertz.distances = distances
    unHertz.fc = (0..<1200).map { (t: Double($0), bpm: fc(Double($0))) }
    var cinqSecondes = unHertz
    cinqSecondes.fc = stride(from: 0, to: 1200, by: 5).map { (t: Double($0), bpm: fc(Double($0))) }

    let courte = try pivotDe(unHertz)
    let longue = try pivotDe(cinqSecondes)
    let minutesA = try calculerSeanceIntrinseque(courte, parametresHK).minutes
    let minutesB = try calculerSeanceIntrinseque(longue, parametresHK).minutes
    #expect(abs(minutesA.easy - minutesB.easy) < 1e-9)
    #expect(abs(minutesA.mp - minutesB.mp) < 1e-9)
    #expect(abs(minutesA.subt - minutesB.subt) < 1e-9)
    #expect(abs(minutesA.hard - minutesB.hard) < 1e-9)
    #expect(minutesB.hard > 9)

    #expect(courte.pasFC_s == 1)
    #expect(longue.pasFC_s == 5)
    #expect(longue.flux.fc_bpm?.filter { !$0.isNaN }.count == 240)
}

@Test func sansFcLeFluxNADeFcNiDePas() throws {
    var c = ConstructeurSeance()
    c.fc = []
    let pivot = try pivotDe(c)
    #expect(pivot.flux.fc_bpm == nil)
    #expect(pivot.pasFC_s == nil)
}

@Test func uneFcHorsPlageEstIgnoreeSansFaireTomberLaSerie() throws {
    var c = ConstructeurSeance()
    c.fc = [(0, 300), (5, 150), (10, 152)]
    let fc = try #require(try pivotDe(c).flux.fc_bpm)
    #expect(fc[0].isNaN)
    #expect(fc[5] == 150)
    #expect(fc[10] == 152)
}

// MARK: - Altitude et vitesse (tracé)

@Test func leTraceDonneAltitudeEtVitesseSansCoordonnees() throws {
    var c = ConstructeurSeance()
    c.dureeEcoulee = 600
    c.points = (0..<600).map { (seconde: Int) -> (t: Double, altitude: Double, vitesse: Double, precisionVerticale: Double) in
        let t = Double(seconde)
        return (t: t, altitude: 100 + t / 10, vitesse: 3.0, precisionVerticale: seconde == 10 ? -1.0 : 2.0)
    }
    c.points[20].vitesse = -1
    let pivot = try pivotDe(c)
    let alt = try #require(pivot.flux.alt_m)
    let vitesse = try #require(pivot.flux.vitesse_ms)
    #expect(abs(alt[5] - 100.5) < 1e-3)
    #expect(alt[10].isNaN)
    #expect(abs(vitesse[5] - 3) < 1e-6)
    #expect(vitesse[20].isNaN)
}

@Test func sansTraceAltitudeEtVitesseSontNulles() throws {
    let pivot = try pivotDe(ConstructeurSeance())
    #expect(pivot.flux.alt_m == nil)
    #expect(pivot.flux.vitesse_ms == nil)
}

// MARK: - Empreinte et erreurs

@Test func lEmpreinteEstStableEtDependDeLaSeance() throws {
    let premiere = try pivotDe(ConstructeurSeance()).empreinteBrute
    #expect(premiere == (try pivotDe(ConstructeurSeance()).empreinteBrute))
    var autre = ConstructeurSeance()
    autre.id = "7D1E1FAC-0000-4000-8000-000000000002"
    #expect(try pivotDe(autre).empreinteBrute != premiere)
}

@Test func uneDureeNulleOuUneFinAvantLeDebutLeveUneErreur() throws {
    var duree = ConstructeurSeance()
    duree.dureeMouvement = 0
    #expect(throws: ErreurSeanceHealthKit.self) {
        try adapterSeance(duree.brute(), decalageAppareil_min: 120)
    }
    var fin = ConstructeurSeance()
    fin.dureeEcoulee = 0
    #expect(throws: ErreurSeanceHealthKit.self) {
        try adapterSeance(fin.brute(), decalageAppareil_min: 120)
    }
}

@Test func leChampsEnErreurDuSpikeSeDecodeSansCasser() throws {
    var c = ConstructeurSeance()
    c.surcharge = [
        "frequenceCardiaque": ["erreur": "boum"],
        "distanceEchantillonsFins": ["erreur": "x"],
        "traces": ["erreur": "y"],
    ]
    let brute = try c.brute()
    #expect(brute.frequenceCardiaque == nil)
    #expect(brute.distanceEchantillonsFins == nil)
    #expect(brute.traces == nil)
    let pivot = try pivotDe(c)
    #expect(pivot.flux.fc_bpm == nil)
    #expect(pivot.distance_m == 0)
}

@Test func lesPassagesAutomatiquesNeCassentPasLEnchainementDUnEntrainementStructure() throws {
    // Constat sur un vrai export : les segments au km, intercalés dans l'ordre des tours, cassaient la suite
    // travail, récupération, travail. Un entraînement structuré n'a que ses étapes pour tours.
    var c = entrainementPersonnalise(duree: 360, recuperation: 408)
    for k in 1...13 { c.segments.append((Double(k - 1) * 330, Double(k) * 330)) }
    let pivot = try pivotDe(c)
    #expect(pivot.tours.allSatisfy { $0.intensite != nil })
    let seance = try calculerSeanceIntrinseque(pivot, parametresHK)
    #expect(seance.repetitions.count == 4)
    #expect(seance.format == "4×6′")
}
