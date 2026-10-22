import Testing
@testable import JogCore

// Fonctions de JavaScript reproduites (js-nombres.swift) : Math.round, Math.max et Number.prototype.toString.

@Test func mathRoundSuitLesMoitiesVersPlusInfini() {
    #expect(mathRoundJS(2.5) == 3)
    #expect(mathRoundJS(2.4) == 2)
    #expect(mathRoundJS(-2.5) == -2)
    #expect(mathRoundJS(-0.5) == 0)
    #expect(mathRoundJS(0.49999999999999994) == 0)
    #expect(mathRoundJS(120) == 120)
    #expect(mathRoundJS(.infinity) == .infinity)
    #expect(mathRoundJS(.nan).isNaN)
}

@Test func mathMaxSuitLesRegleesDeJavaScript() {
    #expect(mathMaxJS([]) == nil)
    #expect(mathMaxJS([1, 3, 2]) == 3)
    #expect(mathMaxJS([1, .infinity, 2]) == .infinity)
    // Math.max renvoie NaN dès qu'une valeur vaut NaN, quelle que soit sa position.
    #expect(mathMaxJS([1, .nan, 2])?.isNaN == true)
    #expect(mathMaxJS([.nan, 1])?.isNaN == true)
}

@Test func texteNombreJSCommeNumberToString() {
    let cas: [(Double, String)] = [
        (.nan, "NaN"), (.infinity, "Infinity"), (-.infinity, "-Infinity"),
        (0, "0"), (-0.0, "0"),
        (168, "168"), (164.5, "164.5"), (-0.5, "-0.5"), (168.0, "168"),
        (0.1 + 0.2, "0.30000000000000004"),
        (100, "100"), (1e15, "1000000000000000"), (1e16, "10000000000000000"),
        (1e20, "100000000000000000000"),
        (1e21, "1e+21"), (1.5e21, "1.5e+21"),
        (0.000001, "0.000001"), (0.0000015, "0.0000015"),
        (1e-7, "1e-7"), (1.5e-7, "1.5e-7"), (-1e-7, "-1e-7"),
        (5e-324, "5e-324"), (1.7976931348623157e308, "1.7976931348623157e+308"),
    ]
    for (valeur, attendu) in cas {
        #expect(texteNombreJS(valeur) == attendu, "texte de \(valeur)")
    }
}
