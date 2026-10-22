import Testing
@testable import JogCore

/// Dispatch des cas `riegel` de l'oracle : `tempsRiegel(tempsTest_s, distanceTest_km, distanceCible_km)`.
private func executerRiegel(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "tempsRiegel":
        return .nombre(tempsRiegel(try argNombre(try arg(args, 0)), try argNombre(try arg(args, 1)), try argNombre(try arg(args, 2))))
    default:
        throw ErreurHarnais("fonction inconnue dans riegel : \(cas.fn)")
    }
}

@Test func oracleRiegel() throws {
    let differences = rejouer(module: "riegel", executer: executerRiegel)
    #expect(differences.isEmpty, messageDifferences(differences))
}
