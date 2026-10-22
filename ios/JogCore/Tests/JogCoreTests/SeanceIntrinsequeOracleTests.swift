import Testing
@testable import JogCore

/// Dispatch des cas `seance-intrinseque` : `calculerSeanceIntrinseque(pivot, parametres)`.
private func executerSeanceIntrinseque(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "calculerSeanceIntrinseque":
        let pivot = try argDecode(try arg(args, 0), ActivitePivot.self)
        let p = try argDecode(try arg(args, 1), ParamsDates.self)
        return try JSONValue(encodant: try calculerSeanceIntrinseque(pivot, p))
    default:
        throw ErreurHarnais("fonction inconnue dans seance-intrinseque : \(cas.fn)")
    }
}

@Test func oracleSeanceIntrinseque() throws {
    let differences = rejouer(module: "seance-intrinseque", executer: executerSeanceIntrinseque)
    #expect(differences.isEmpty, messageDifferences(differences))
}
