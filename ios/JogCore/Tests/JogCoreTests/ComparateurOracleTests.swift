import Testing
@testable import JogCore

@Test func valeursIdentiquesNonDifferentes() {
    let valeur: JSONValue = .object(["a": .number(1), "b": .array([.string("x"), .null, .bool(true)])])
    #expect(comparer(valeur, valeur).isEmpty)
}

@Test func nombresComparesAvecTolerance() {
    #expect(comparer(.number(1.0), .number(1.0 + 1e-12)).isEmpty)
    #expect(comparer(.number(1e12), .number(1e12 + 1)).isEmpty)

    let differences = comparer(.number(1.0), .number(1.001))
    #expect(differences == ["$ : attendu 1.0, obtenu 1.001"])
}

@Test func cleAbsenteVautNull() {
    #expect(comparer(.object(["a": .number(1)]), .object(["a": .number(1), "b": .null])).isEmpty)

    let differences = comparer(.object(["a": .number(1)]), .object(["a": .number(1), "b": .number(2)]))
    #expect(differences == ["$.b : attendu null, obtenu 2.0"])
}

@Test func cheminImbriqueEtInfinitySontDesChaines() {
    let attendu: JSONValue = .object(["x": .array([.object(["y": .string("Infinity")])])])
    let obtenu: JSONValue = .object(["x": .array([.object(["y": .string("-Infinity")])])])
    #expect(comparer(attendu, obtenu) == ["$.x[0].y : attendu \"Infinity\", obtenu \"-Infinity\""])

    let longueur = comparer(.array([.number(1)]), .array([.number(1), .number(2)]))
    #expect(longueur == ["$ : longueur attendue 1, obtenue 2"])
}
