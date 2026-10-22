import Testing
@testable import JogCore

/// Dispatch des cas `series` de l'oracle : serieCharge, serieRatio, semaines, palier, compteurs.
private func executerSeries(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "serieCharge":
        let jours = try argDecode(try arg(args, 0), [JourAgrege].self)
        let options = try argDecode(try arg(args, 1), OptionsCharge.self)
        return try JSONValue(encodant: try serieCharge(jours, options))
    case "serieRatio":
        let jours = try argDecode(try arg(args, 0), [JourAgrege].self)
        return try JSONValue(encodant: try serieRatio(jours))
    case "semaines":
        let jours = try argDecode(try arg(args, 0), [JourAgrege].self)
        let seances = try argDecode(try arg(args, 1), [Seance].self)
        let J = try argChaine(try arg(args, 2))
        let params = try argDecode(try arg(args, 3), Parametres.self)
        return try JSONValue(encodant: try semaines(jours, seances, J, params))
    case "palier":
        let semaines = try argDecode(try arg(args, 0), [SemaineVue].self)
        return try JSONValue(encodant: try palier(semaines))
    case "compteurs":
        let jours = try argDecode(try arg(args, 0), [JourAgrege].self)
        let seances = try argDecode(try arg(args, 1), [Seance].self)
        let J = try argChaine(try arg(args, 2))
        return try JSONValue(encodant: try compteurs(jours, seances, J))
    default:
        throw ErreurHarnais("fonction inconnue dans series : \(cas.fn)")
    }
}

@Test func oracleSeries() throws {
    let differences = rejouer(module: "series", executer: executerSeries)
    #expect(differences.isEmpty, messageDifferences(differences))
}
