import Testing
@testable import JogCore

/// Dispatch des cas `format` de l'oracle, par nom de fonction. Les décimales, optionnelles, valent 0 par défaut.
private func executerFormat(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    func decimales(_ indice: Int) throws -> Int {
        args.count > indice ? try argEntier(args[indice]) : 0
    }
    switch cas.fn {
    case "formatNombre":
        return .string(try formatNombre(try argNombre(try arg(args, 0)), try decimales(1)))
    case "formatEcart":
        return .string(try formatEcart(try argNombre(try arg(args, 0)), try decimales(1)))
    case "formatAllure":
        return .string(formatAllure(try argNombre(try arg(args, 0))))
    case "formatDuree":
        return .string(formatDuree(try argNombre(try arg(args, 0))))
    case "formatPourcentage":
        return .string(try formatPourcentage(try argNombre(try arg(args, 0)), try decimales(1)))
    case "formatEcartPoints":
        return .string(try formatEcartPoints(try argNombre(try arg(args, 0)), try decimales(1)))
    case "formatDate":
        return .string(formatDate(try argChaine(try arg(args, 0))))
    case "formatDateAnnee":
        return .string(formatDateAnnee(try argChaine(try arg(args, 0))))
    case "formatJourDate":
        return .string(formatJourDate(try argChaine(try arg(args, 0))))
    case "formatSemaine":
        return .string(formatSemaine(try argChaine(try arg(args, 0))))
    case "formatTempsCourse":
        return .string(formatTempsCourse(try argNombre(try arg(args, 0))))
    default:
        throw ErreurHarnais("fonction inconnue dans format : \(cas.fn)")
    }
}

@Test func oracleFormat() throws {
    let differences = rejouer(module: "format", executer: executerFormat)
    #expect(differences.isEmpty, messageDifferences(differences))
}
