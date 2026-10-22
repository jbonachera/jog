import Testing
@testable import JogCore

/// Dispatch des cas `selecteurs` de l'oracle, par nom de fonction.
private func executerSelecteurs(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "selectionProgressivite":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        let fenetre = try argDecode(try arg(args, 1), FenetreProgressivite.self)
        return try JSONValue(encodant: try selectionProgressivite(vue, fenetre))

    case "selectionMinutesSS":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        return try JSONValue(encodant: selectionMinutesSS(vue))

    case "selectionDiscipline":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        return try JSONValue(encodant: try selectionDiscipline(vue))

    case "selectionHistorique":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        let periode = try argDecode(try arg(args, 1), PeriodeHistorique.self)
        return try JSONValue(encodant: try selectionHistorique(vue, periode))

    case "etatRatio":
        return .string(try etatRatio(try argNombre(try arg(args, 0))).rawValue)

    case "etatFootings":
        return .string(try etatFootingsSelecteur(try argNombre(try arg(args, 0))).rawValue)

    case "enPourcent":
        return .nombre(enPourcent(try argNombre(try arg(args, 0))))

    case "estDansLaCible":
        let partPct: Double? = if case .null = try arg(args, 0) { nil } else { try argNombre(try arg(args, 0)) }
        let lo = try argNombre(try arg(args, 1))
        let hi = try argNombre(try arg(args, 2))
        guard let dansLaCible = try estDansLaCible(partPct, lo, hi) else { return .null }
        return .bool(dansLaCible)

    default:
        throw ErreurHarnais("fonction inconnue dans selecteurs : \(cas.fn)")
    }
}

@Test func oracleSelecteurs() throws {
    let differences = rejouer(module: "selecteurs", executer: executerSelecteurs)
    #expect(differences.isEmpty, messageDifferences(differences))
}
