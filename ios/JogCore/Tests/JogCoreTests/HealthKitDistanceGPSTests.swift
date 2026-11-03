import Testing
@testable import JogCore

/// Séance de 1200 s : HealthKit mesure `metresHK` en 120 échantillons de 10 s, le GPS `metresGPS` sur tout le tracé.
private func seance(metresHK: Double, metresGPS: Double, finGPS: Double = 1200, interieur: Bool = false) throws -> ActivitePivot {
    var c = ConstructeurSeance()
    c.distances = (0..<120).map { (debut: Double($0) * 10, fin: Double($0 + 1) * 10, metres: metresHK / 120) }
    c.pointsGPS = stride(from: 0.0, through: finGPS, by: 10).map { (t: $0, metres: metresGPS * $0 / finGPS) }
    c.indoor = interieur
    return try #require(try adapterSeance(c.brute(), decalageAppareil_min: 120))
}

@Test func laDistanceGPSRemplaceUneDistanceHealthKitQuiSEcarte() throws {
    let pivot = try seance(metresHK: 4000, metresGPS: 4400)
    #expect(abs(pivot.distance_m - 4400) < 1)
    #expect(abs(Double(try #require(pivot.flux.dist_m.last)) - 4400) < 1)
}

@Test func unEcartFaibleGardeLaDistanceHealthKit() throws {
    let pivot = try seance(metresHK: 4000, metresGPS: 4040)
    #expect(abs(pivot.distance_m - 4000) < 1)
}

@Test func unTraceQuiNeCouvrePasLaSeanceNeCorrigeRien() throws {
    let pivot = try seance(metresHK: 4000, metresGPS: 3000, finGPS: 600)
    #expect(abs(pivot.distance_m - 4000) < 1)
}

@Test func uneSeanceEnInterieurNeSeCorrigePas() throws {
    let pivot = try seance(metresHK: 4000, metresGPS: 4400, interieur: true)
    #expect(abs(pivot.distance_m - 4000) < 1)
}
