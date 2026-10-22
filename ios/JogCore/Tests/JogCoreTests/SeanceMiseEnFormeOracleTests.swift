import Testing
@testable import JogCore

/// Tableau de nombres d'un argument (null vaut NaN, ±Infinity en chaînes).
private func tableauDeNombresOracle(_ valeur: JSONValue) throws -> [Double] {
    guard let valeurs = valeur.tableau else { throw ErreurHarnais("tableau de nombres attendu : \(valeur)") }
    return try valeurs.map { try argNombre($0) }
}

/// Dispatch des cas `seance-miseEnForme` : `miseEnForme(pivot)` et `moyenneGlissante(valeurs, t, dt, avant, apres)`.
private func executerSeanceMiseEnForme(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "miseEnForme":
        let pivot = try argDecode(try arg(args, 0), ActivitePivot.self)
        return try JSONValue(encodant: try miseEnForme(pivot))
    case "moyenneGlissante":
        let valeurs = try tableauDeNombresOracle(try arg(args, 0))
        let t = try tableauDeNombresOracle(try arg(args, 1))
        let dt = try tableauDeNombresOracle(try arg(args, 2))
        let avant = try argNombre(try arg(args, 3))
        let apres = try argNombre(try arg(args, 4))
        let sortie = moyenneGlissante(valeurs, t, dt, avant, apres)
        return .array(sortie.map(JSONValue.nombre))
    default:
        throw ErreurHarnais("fonction inconnue dans seance-miseEnForme : \(cas.fn)")
    }
}

@Test func oracleSeanceMiseEnForme() throws {
    let differences = rejouer(module: "seance-miseEnForme", executer: executerSeanceMiseEnForme)
    #expect(differences.isEmpty, messageDifferences(differences))
}
