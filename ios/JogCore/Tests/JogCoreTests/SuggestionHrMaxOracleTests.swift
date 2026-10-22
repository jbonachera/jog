import Testing
@testable import JogCore

/// Dispatch des cas `suggestionHrMax` de l'oracle, par nom de fonction.
private func executerSuggestionHrMax(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    let vue = try argDecode(try arg(args, 0), Vue.self)
    switch cas.fn {
    case "suggestionHrMax":
        guard let suggestion = try suggestionHrMax(vue) else { return .null }
        return try JSONValue(encodant: suggestion)

    case "picRetenu":
        guard let pic = try picRetenu(vue) else { return .null }
        return .object([
            "seance": try JSONValue(encodant: pic.seance),
            "bpm": .nombre(pic.bpm),
        ])

    case "seancesExaminees":
        return try JSONValue(encodant: try seancesExaminees(vue))

    default:
        throw ErreurHarnais("fonction inconnue dans suggestionHrMax : \(cas.fn)")
    }
}

@Test func oracleSuggestionHrMax() throws {
    let differences = rejouer(module: "suggestionHrMax", executer: executerSuggestionHrMax)
    #expect(differences.isEmpty, messageDifferences(differences))
}
