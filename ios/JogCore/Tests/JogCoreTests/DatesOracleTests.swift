import Testing
@testable import JogCore

/// Dispatch des cas `dates` de l'oracle, par nom de fonction.
private func executerDates(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "numeroJour":
        return .number(Double(try numeroJour(try argChaine(try arg(args, 0)))))
    case "dateDepuisNumero":
        return .string(try dateDepuisNumero(try argEntier(try arg(args, 0))))
    case "ajouterJours":
        return .string(try ajouterJours(try argChaine(try arg(args, 0)), try argEntier(try arg(args, 1))))
    case "jourDeSemaine":
        return .number(Double(try jourDeSemaine(try argChaine(try arg(args, 0)))))
    case "lundiISO":
        return .string(try lundiISO(try argChaine(try arg(args, 0))))
    case "dateLocale":
        return .string(try dateLocale(try argNombre(try arg(args, 0)), try argNombre(try arg(args, 1))))
    case "semaineTerminee":
        return .bool(try semaineTerminee(try argChaine(try arg(args, 0)), try argChaine(try arg(args, 1))))
    case "decomposerDate":
        return try JSONValue(encodant: try decomposerDate(try argChaine(try arg(args, 0))))
    case "estDateCivile":
        return .bool(estDateCivile(try argChaine(try arg(args, 0))))
    case "instantUtc":
        return .nombre(try instantUtc(try argChaine(try arg(args, 0))))
    default:
        throw ErreurHarnais("fonction inconnue dans dates : \(cas.fn)")
    }
}

@Test func oracleDates() throws {
    let differences = rejouer(module: "dates", executer: executerDates)
    #expect(differences.isEmpty, messageDifferences(differences))
}
