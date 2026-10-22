import Testing
@testable import JogCore

/// Dispatch des cas `arrondi` de l'oracle, par nom de fonction.
private func executerArrondi(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "arrondir":
        return .nombre(try arrondir(try argNombre(try arg(args, 0)), try argNombre(try arg(args, 1))))
    case "arrondirDecimales":
        return .nombre(try arrondirDecimales(try argNombre(try arg(args, 0)), try argEntier(try arg(args, 1))))
    default:
        throw ErreurHarnais("fonction inconnue dans arrondi : \(cas.fn)")
    }
}

@Test func oracleArrondi() throws {
    let differences = rejouer(module: "arrondi", executer: executerArrondi)
    #expect(differences.isEmpty, messageDifferences(differences))
}
