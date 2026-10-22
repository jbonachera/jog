import Testing
@testable import JogCore

/// Dispatch des cas `validationParametres` de l'oracle : `validerParametres(proposes, J)`.
private func executerValidation(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "validerParametres":
        let proposes = try argDecode(try arg(args, 0), Parametres.self)
        return try JSONValue(encodant: validerParametres(proposes, try argChaine(try arg(args, 1))))
    default:
        throw ErreurHarnais("fonction inconnue dans validationParametres : \(cas.fn)")
    }
}

@Test func oracleValidationParametres() throws {
    let differences = rejouer(module: "validationParametres", executer: executerValidation)
    #expect(differences.isEmpty, messageDifferences(differences))
}
