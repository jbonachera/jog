import Testing
@testable import JogCore

@Test func valeursIdentiquesNonDifferentes() {
    let valeur: JSONValue = .object(["a": .number(1), "b": .array([.string("x"), .null, .bool(true)])])
    #expect(comparer(valeur, valeur).isEmpty)
}

@Test func nombresComparesEnToleranceAbsolue() {
    #expect(comparer(.number(1.0), .number(1.0 + 1e-12)).isEmpty)
    #expect(comparer(.number(0), .number(1e-10)).isEmpty)
    // Tolérance absolue (LISEZMOI : 1e-9), pas relative : 1e12 et 1e12 + 1 diffèrent.
    #expect(comparer(.number(1e12), .number(1e12 + 1)).count == 1)

    let differences = comparer(.number(1.0), .number(1.001))
    #expect(differences == ["$ : attendu 1.0, obtenu 1.001"])
}

@Test func cleAbsenteVautNullMaisPasUneValeur() {
    #expect(comparer(.object(["a": .number(1)]), .object(["a": .number(1), "b": .null])).isEmpty)
    #expect(comparer(.object(["a": .number(1), "b": .null]), .object(["a": .number(1)])).isEmpty)

    let differences = comparer(.object(["a": .number(1)]), .object(["a": .number(1), "b": .number(2)]))
    #expect(differences == ["$.b : attendu null, obtenu 2.0"])
}

@Test func cheminImbriqueDansLesDifferences() {
    let attendu: JSONValue = .object(["x": .array([.object(["y": .string("Infinity")])])])
    let obtenu: JSONValue = .object(["x": .array([.object(["y": .string("-Infinity")])])])
    #expect(comparer(attendu, obtenu) == ["$.x[0].y : attendu \"Infinity\", obtenu \"-Infinity\""])
}

@Test func longueurDeTableauDifferente() {
    let longueur = comparer(.array([.number(1)]), .array([.number(1), .number(2)]))
    #expect(longueur == ["$ : longueur attendue 1, obtenue 2"])
}

// Convention (LISEZMOI) : NaN s'écrit null, ±Infinity s'écrivent en chaînes « Infinity » / « -Infinity ».
// Un nombre fini ne vaut jamais un infini, et un infini ne vaut que lui-même.

@Test func nullEtNombreNeSeConfondentPas() {
    #expect(comparer(.null, .null).isEmpty)
    #expect(!comparer(.null, .number(0)).isEmpty)
    #expect(!comparer(.number(0), .null).isEmpty)
}

@Test func infinisComparesCommeChainesOuNombres() {
    #expect(comparer(.string("Infinity"), .string("Infinity")).isEmpty)
    #expect(!comparer(.string("Infinity"), .string("-Infinity")).isEmpty)
    #expect(!comparer(.string("Infinity"), .null).isEmpty)
    #expect(!comparer(.string("Infinity"), .number(1e308)).isEmpty)
    #expect(!comparer(.number(.infinity), .number(-.infinity)).isEmpty)
    #expect(!comparer(.number(.infinity), .number(1e308)).isEmpty)
    #expect(comparer(.number(.infinity), .number(.infinity)).isEmpty)
}

@Test func nanSeLitNullSansEgalerUnNombre() {
    #expect(!comparer(.number(.nan), .number(0)).isEmpty)
    #expect(!comparer(.number(.nan), .number(.nan)).isEmpty)
    #expect(!comparer(.null, .number(.nan)).isEmpty)
}
