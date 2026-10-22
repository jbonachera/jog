import Testing
@testable import JogCore

/// Dispatch des cas `parametres` de l'oracle, par nom de fonction.
private func executerParametres(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "parametresDefaut":
        return try JSONValue(encodant: parametresDefaut())
    case "parametresAuJour":
        let parametres = try argDecode(try arg(args, 0), Parametres.self)
        return try JSONValue(encodant: try parametresAuJour(parametres, try argChaine(try arg(args, 1))))
    case "indexerParametres":
        // Sortie : [{ date, jeu }] avec jeu = index.auJour(date).
        let parametres = try argDecode(try arg(args, 0), Parametres.self)
        // Sans liste de dates (cas d'erreur), seule l'indexation compte : elle doit lever.
        let dates: [DateCivile] = args.count > 1 ? try argDecode(try arg(args, 1), [DateCivile].self) : []
        let index = try indexerParametres(parametres)
        let sorties: [JSONValue] = dates.map { (date: DateCivile) -> JSONValue in
            let jeu = (try? JSONValue(encodant: index.auJour(date))) ?? JSONValue.null
            return JSONValue.object(["date": JSONValue.string(date), "jeu": jeu])
        }
        return JSONValue.array(sorties)
    case "trierModifs":
        let modifs = try argDecode(try arg(args, 0), [ModifDatee].self)
        return try JSONValue(encodant: try trierModifs(modifs))
    case "historiqueModifications":
        let parametres = try argDecode(try arg(args, 0), Parametres.self)
        return try JSONValue(encodant: try historiqueModifications(parametres))
    default:
        throw ErreurHarnais("fonction inconnue dans parametres : \(cas.fn)")
    }
}

@Test func oracleParametres() throws {
    let differences = rejouer(module: "parametres", executer: executerParametres)
    #expect(differences.isEmpty, messageDifferences(differences))
}
