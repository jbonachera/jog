import Testing
@testable import JogCore

/// Dispatch des cas `seance-classement` : `classerSeances(intrinseques)`.
private func executerSeanceClassement(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "classerSeances":
        let intrinseques = try argDecode(try arg(args, 0), [SeanceIntrinseque].self)
        return try JSONValue(encodant: try classerSeances(intrinseques))
    default:
        throw ErreurHarnais("fonction inconnue dans seance-classement : \(cas.fn)")
    }
}

@Test func oracleSeanceClassement() throws {
    let differences = rejouer(module: "seance-classement", executer: executerSeanceClassement)
    #expect(differences.isEmpty, messageDifferences(differences))
}
