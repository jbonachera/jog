import Testing
@testable import JogCore

/// Dispatch des cas `jours` de l'oracle : `agregerJours(seances, du, au)`.
private func executerJours(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "agregerJours":
        let seances = try argDecode(try arg(args, 0), [Seance].self)
        return try JSONValue(encodant: try agregerJours(seances, try argChaine(try arg(args, 1)), try argChaine(try arg(args, 2))))
    default:
        throw ErreurHarnais("fonction inconnue dans jours : \(cas.fn)")
    }
}

@Test func oracleJours() throws {
    let differences = rejouer(module: "jours", executer: executerJours)
    #expect(differences.isEmpty, messageDifferences(differences))
}
