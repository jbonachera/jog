import Foundation
import Testing
@testable import JogCore

// Test de performance de `calculerVue` (PERFORMANCE, lot 1E). Désactivé par défaut : il ne tourne que si JOG_PERF=1.
// Lancement, en release : JOG_PERF=1 swift test -c release --disable-sandbox --scratch-path /tmp/jogcore-E --filter mesure
// L'entrée est le cas doré « maquette 14 mois » (Tests/Oracle/vue.json). 3 itérations d'échauffement, puis 20 mesurées.

/// Durée d'un `Duration`, en millisecondes.
private func millisecondes(_ duree: Duration) -> Double {
    Double(duree.components.seconds) * 1_000 + Double(duree.components.attoseconds) * 1e-15
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["JOG_PERF"] == "1"))
func mesureCalculerVue() throws {
    let cas = try #require(try chargerCasOracle("vue").cas.first { $0.nom == "maquette 14 mois" })
    let entree = try argDecode(cas.entree, EntreeVue.self)

    for _ in 0..<3 {
        _ = try calculerVue(entree)
    }
    let debut = ContinuousClock.now
    for _ in 0..<20 {
        _ = try calculerVue(entree)
    }
    let moyenne = millisecondes(ContinuousClock.now - debut) / 20
    print(String(format: "calculerVue (maquette 14 mois, moyenne sur 20 itérations) : %.3f ms", moyenne))
}

/// Mesure de `serieRecuperation` (D-023, recuperation.md lot 3, lot 9) : 450 nuits, 450 points. Budget : moins de 1 ms en release.
/// Lancement : JOG_PERF=1 swift test -c release --disable-sandbox --scratch-path /tmp/jogcore-R --filter mesure
@Test(.enabled(if: ProcessInfo.processInfo.environment["JOG_PERF"] == "1"))
func mesureSerieRecuperation() throws {
    let aujourdhui: DateCivile = "2026-10-29"
    let nuits = try nuitsExemple(.normal, aujourdhui: aujourdhui, nombre: RECUPERATION.nuitsLues)
    let du = try ajouterJours(aujourdhui, -(RECUPERATION.nuitsLues - 1))

    for _ in 0..<3 {
        _ = try serieRecuperation(nuits, du: du, au: aujourdhui)
    }
    let debut = ContinuousClock.now
    for _ in 0..<20 {
        _ = try serieRecuperation(nuits, du: du, au: aujourdhui)
    }
    let moyenne = millisecondes(ContinuousClock.now - debut) / 20
    print(String(format: "serieRecuperation (450 nuits, 450 points, moyenne sur 20 itérations) : %.3f ms", moyenne))
    #expect(moyenne < 1)
}

// MARK: - Accueil (lot 20, 04 « Accueil » : budget < 10 ms en release sur 2 000 séances et 4 ans)

/// Paramètres de la mesure : mêmes seuils que les autres mesures de l'accueil.
private let paramsMesure = ParamsDates(
    hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92, lt2Hr: 172, lt2Pace: 240, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)

/// Séance synthétique de la mesure (même forme que les autres mesures : champs renseignés, les autres absents).
private func seanceMesure(
    _ cle: String, _ date: DateCivile, _ type: TypeSeance, km: Double, fcMoy: Double, ef: Double, charge: Double,
    repetitions: [Repetition], decouplage: Decouplage?, dPlus: Double, marquage: Marquage = .aucun,
    distanceRef: Double? = nil, temps: Double? = nil
) -> SeanceVue {
    var intrinseque = SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 1_000_000, nom: nil, marquage: marquage, duree_min: 40, km: km,
        fcMoy: fcMoy, allureMoy_skm: nil, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: charge, mp_min: 0,
        segmentsMp: [], repetitions: repetitions, format: nil, recup_s: nil, ef: ef, fcPic: nil, decouplage: decouplage,
        lignesDroites: type == .footingLignesDroites, distanceRef_km: distanceRef, temps_s: temps
    )
    intrinseque.dPlus_m = dPlus
    return SeanceVue(seance: Seance(intrinseque: intrinseque, type: type))
}

/// Vue de la mesure : 2 000 séances réparties sur 1 460 jours (4 ans), types en rotation, une course sur dix, un dimanche
/// sur deux de VFC (milieux renvoyés à part, comme `sixQualites(_:milieuxNormeVFC:)`).
private func vueMesureAccueil() throws -> (vue: Vue, milieux: [PointNormeVFC], parJour: ParamsAuJour) {
    let debut: DateCivile = "2022-11-01"
    let fin = try ajouterJours(debut, 1_460)
    let types: [TypeSeance] = [.footing, .sousSeuil, .sortieLongue, .seanceQualite, .footingLignesDroites]
    var seances: [SeanceVue] = []
    for k in 0..<2_000 {
        let date = try ajouterJours(debut, k * 1_460 / 2_000)
        let type = types[k % types.count]
        let reps = type == .sousSeuil ? [Repetition(n: 1, debut_s: 0, duree_s: 180, allure_skm: 300 + Double(k % 7), fcFin: 160 + Double(k % 12))] : []
        let decouplage = type == .sortieLongue ? Decouplage(valeur: Double(k % 10), retenu_min: 70, total_min: 90, avecMp: false) : nil
        if k % 10 == 9 {
            // Une course sur dix (lot 7) : distance et temps de référence, donc niveau VDOT et radar.
            seances.append(seanceMesure(
                "s-\(k)", date, .course, km: 10, fcMoy: 170, ef: 0.9, charge: 300, repetitions: [], decouplage: nil,
                dPlus: Double(k % 300), marquage: .course, distanceRef: 10, temps: 2_400 + Double(k % 300)
            ))
        } else {
            seances.append(seanceMesure(
                "s-\(k)", date, type, km: 5 + Double(k % 15), fcMoy: 130 + Double(k % 20), ef: 0.8 + Double(k % 9) / 100,
                charge: Double(40 + k % 30), repetitions: reps, decouplage: decouplage, dPlus: Double(k % 300)
            ))
        }
    }
    var vue = try calculerVue(EntreeVue(intrinseques: [], parametres: parametresDefaut(), J: try ajouterJours(fin, 1), derniereSynchro: nil))
    vue.seances = seances
    vue.premierJour = debut
    let milieux = try (0..<209).map { PointNormeVFC(date: try ajouterJours(debut, 6 + 7 * $0), milieu_ms: 40 + Double($0 % 20)) }
    return (vue, milieux, { _ in paramsMesure })
}

/// Lancement : JOG_PERF=1 swift test -c release --disable-sandbox --scratch-path /tmp/jogcore-A --filter mesure
/// Mesure combinée des sélecteurs de l'accueil, puis de chacun, tous rapportés. Budget : moins de 10 ms au total.
@Test(.enabled(if: ProcessInfo.processInfo.environment["JOG_PERF"] == "1"))
func mesureAccueilCombine() throws {
    let (vue, milieux, parJour) = try vueMesureAccueil()

    func chronometrer(_ nom: String, _ action: () throws -> Void) throws -> Double {
        for _ in 0..<3 { try action() }
        let debut = ContinuousClock.now
        for _ in 0..<20 { try action() }
        let moyenne = millisecondes(ContinuousClock.now - debut) / 20
        print(String(format: "%@ (2 000 séances, 4 ans, moyenne sur 20 itérations) : %.3f ms", nom, moyenne))
        return moyenne
    }

    let cartes = try chronometrer("cartesSeances") { _ = try cartesSeances(vue, parJour) }
    let qualites = try chronometrer("sixQualites") { _ = try sixQualites(vue, milieuxNormeVFC: milieux) }
    let volume = try chronometrer("lignesVolume") { _ = try lignesVolume(vue) }
    let semaines = try chronometrer("semainesAccueil") { _ = try semainesAccueil(vue) }
    let total = try chronometrer("Total combiné") {
        _ = try cartesSeances(vue, parJour)
        _ = try sixQualites(vue, milieuxNormeVFC: milieux)
        _ = try lignesVolume(vue)
        _ = try semainesAccueil(vue)
    }
    print(String(format: "Somme des quatre mesures : %.3f ms (cartes %.3f, qualités %.3f, volume %.3f, semaines %.3f)",
                 cartes + qualites + volume + semaines, cartes, qualites, volume, semaines))
    #expect(total < 10)
}

/// Premier lancement après mise à jour (D-025, lot 5) : ②a relit chaque séance une fois. Pas de seuil : la durée est notée
/// pour l'estimation. Mesure ②a sur une séance synthétique d'1 h à 1 Hz (altitude, FC), ramenée à 2 000 séances.
/// Lancement : JOG_PERF=1 swift test -c release --disable-sandbox --scratch-path /tmp/jogcore-A --filter mesure
@Test(.enabled(if: ProcessInfo.processInfo.environment["JOG_PERF"] == "1"))
func mesurePremierLancementDenivele() throws {
    let n = 3_601
    let pivot = ActivitePivot(
        cleSource: "perf:denivele", source: .healthkit, versionAdaptateur: "1.0.0", empreinteBrute: "perf",
        debutUtc: 1_700_000_000_000, decalageLocal_min: 0, dateLocale: "2026-10-10",
        duree_s: Double(n - 1), distance_m: Double((n - 1) * 3), nom: "Sortie fictive",
        competition: false, sousType: .route, pasFC_s: nil,
        flux: Flux(
            t_s: (0..<n).map { Float($0) }, dist_m: (0..<n).map { Float(Double($0) * 3) },
            fc_bpm: (0..<n).map { Float(140 + $0 % 30) },
            alt_m: (0..<n).map { Float(100 + 50 * sin(Double($0) / 300)) }, vitesse_ms: nil
        ),
        tours: [], appSource: "com.apple.health.TEST"
    )

    for _ in 0..<3 { _ = try calculerSeanceIntrinseque(pivot, paramsMesure) }
    let debut = ContinuousClock.now
    for _ in 0..<20 { _ = try calculerSeanceIntrinseque(pivot, paramsMesure) }
    let parSeance = millisecondes(ContinuousClock.now - debut) / 20
    print(String(format: "calculerSeanceIntrinseque (1 h à 1 Hz, moyenne sur 20 itérations) : %.3f ms par séance", parSeance))
    print(String(format: "Premier lancement estimé (2 000 séances, ×2 000) : %.1f ms", parSeance * 2_000))
}
