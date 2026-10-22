import Testing
@testable import JogCore

/// Dispatch des cas `seance-marquage` : `marquer`, `distanceStandardProche` et `mediane`.
private func executerSeanceMarquage(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "marquer":
        let competition = try argBooleen(try arg(args, 0))
        let nomJSON = try arg(args, 1)
        let nom: String? = nomJSON == .null ? nil : try argChaine(nomJSON)
        return try JSONValue(encodant: marquer(competition, nom))
    case "distanceStandardProche":
        return JSONValue.nombre(distanceStandardProche(try argNombre(try arg(args, 0))))
    case "mediane":
        guard let valeurs = try arg(args, 0).tableau else { throw ErreurHarnais("tableau attendu") }
        let nombres = try valeurs.map { try argNombre($0) }
        return mediane(nombres).map(JSONValue.nombre) ?? .null
    default:
        throw ErreurHarnais("fonction inconnue dans seance-marquage : \(cas.fn)")
    }
}

@Test func oracleSeanceMarquage() throws {
    let differences = rejouer(module: "seance-marquage", executer: executerSeanceMarquage)
    #expect(differences.isEmpty, messageDifferences(differences))
}
