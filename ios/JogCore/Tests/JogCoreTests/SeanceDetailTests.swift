import Testing
@testable import JogCore

// D-034 · Détail de l'écran Séance (04 « Temps sous le plafond », « Moitiés de course », « Courbe d'efficacité »).
// Grilles synthétiques à 1 Hz, sans altitude : la grille ajustée est la grille brute.

/// Grille à 1 Hz : vitesse (m/s) et FC à chaque seconde.
private func grille(_ n: Int, vitesse: (Int) -> Double, fc: (Int) -> Double) -> GrilleSeance {
    var d = [0.0]
    for i in 1..<n { d.append(d[i - 1] + vitesse(i - 1)) }
    let f = (0..<n).map(fc)
    return GrilleSeance(
        n: n, t_s: (0..<n).map(Double.init), dt_s: [Double](repeating: 1, count: n), distance_m: d,
        vitesse_ms: (0..<n).map(vitesse), fc_bpm: f, fcMesuree_bpm: f, fcLissee_bpm: f, alt_m: nil
    )
}

@Test func d034TempsSousLePlafondCompteLaDureeAvecFcAuPlusAuPlafond() {
    // 600 s : 450 s à 135 bpm, 150 s à 145 bpm, plafond 140 → 75 %.
    let g = grille(600, vitesse: { _ in 3 }, fc: { $0 < 450 ? 135 : 145 })
    #expect(partSous(g, 140) == 0.75)
}

@Test func d034MoitiesDeCourseCoupentLaDistanceEnDeux() throws {
    // 5 km : 2 500 m à 4 m/s (625 s), puis 2 500 m à 5 m/s (500 s).
    let g = grille(1126, vitesse: { $0 < 625 ? 4 : 5 }, fc: { _ in 170 })
    let m = try #require(moitiesCourse(g))
    #expect(abs(m.s1 - 625) < 1e-9)
    #expect(abs(m.s2 - 500) < 1e-9)
}

@Test func d034ToursAuKilometre() {
    // 2,5 km à 4 m/s : deux tours pleins à 250 s/km et un tour partiel de 500 m.
    let g = grille(626, vitesse: { _ in 4 }, fc: { _ in 150 })
    let tours = toursKm(g, g)
    #expect(tours.map(\.km) == [1, 2, 2.5])
    #expect(tours.allSatisfy { abs($0.allure_skm - 250) < 1e-9 && $0.fc == 150 })
}

@Test func d034CourbeEfficaciteSortieLongue() throws {
    // 90 min à 3 m/s ; FC 140 puis 150 sur la 2de moitié : EF1 = 180/140, EF2 = 180/150.
    let n = 5400
    let g = grille(n, vitesse: { _ in 3 }, fc: { $0 < n / 2 ? 140 : 150 })
    let c = try #require(courbeEfficacite(g, g, []))
    #expect(abs(c.ef1 - 180.0 / 140) < 1e-6)
    #expect(abs(c.ef2 - 180.0 / 150) < 1e-6)
    #expect(abs(c.kmFinEchauffement - 1.8) < 1e-9)  // 600 s à 3 m/s
    #expect(abs(c.kmMoitie - 8.1) < 0.01)
    #expect(c.points.allSatisfy { $0.km >= 1.8 })
    #expect(c.points.count <= POINTS_DETAIL + 1)
}

@Test func d034CourbeEfficaciteAbsenteSiDecouplageNonMesurable() {
    // 30 min : trop court pour le découplage.
    let g = grille(1800, vitesse: { _ in 3 }, fc: { _ in 140 })
    #expect(courbeEfficacite(g, g, []) == nil)
}

@Test func d034SeriesReduitesAuPlusADeuxCentsPoints() {
    let g = grille(5000, vitesse: { _ in 3 }, fc: { _ in 140 })
    let p = points(g, g)
    #expect(p.count <= POINTS_DETAIL + 1)
    #expect(p.allSatisfy { abs(($0.allure_skm ?? 0) - 1000.0 / 3) < 1e-9 })
}

@Test func d034TraceProjeteEnMetresAvecAllure() {
    // 1 000 s à 3 m/s plein nord : 0,009° de latitude ≈ 1 km.
    let g = grille(1001, vitesse: { _ in 3 }, fc: { _ in 140 })
    let pos = (0...1000).map { Position(t_s: Double($0), lat: 45 + Double($0) * 0.009 / 1000, lon: 5) }
    let t = trace(pos, g)
    #expect(t.count <= POINTS_DETAIL + 1)
    #expect(t.first?.x == 0 && t.first?.y == 0)
    #expect(abs((t.last?.y ?? 0) - 994.86) < 1)
    #expect(t.allSatisfy { abs(($0.allure_skm ?? 0) - 1000.0 / 3) < 1e-6 })
}

@Test func d034AdaptateurGardeLesPositionsPrecisesEtLaCadence() throws {
    var brute = try ConstructeurSeance().brute()
    let d = brute.debut
    brute.traces = [TraceBrute(points: [
        PointTraceBrut(timestamp: d.addingTimeInterval(10), precisionHorizontale: 5, latitude: 45, longitude: 5),
        PointTraceBrut(timestamp: d.addingTimeInterval(20), precisionHorizontale: 50, latitude: 46, longitude: 6),
    ])]
    brute.pas = [EchantillonPasBrut(debut: d, fin: d.addingTimeInterval(60), pas: 170)]
    let flux = try #require(try adapterSeance(brute, decalageAppareil_min: 120)).flux
    #expect(flux.positions == [Position(t_s: 10, lat: 45, lon: 5)])
    #expect(flux.cadence == [MesureCadence(t_s: 30, ppm: 170, duree_s: 60)])
}
