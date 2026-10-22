import Testing
@testable import JogCore

/// Valeur JSON d'un nombre optionnel (nil s'écrit null).
private func nombreOuNull(_ valeur: Double?) -> JSONValue {
    valeur.map(JSONValue.nombre) ?? .null
}

/// Valeur JSON d'un type Encodable optionnel (nil s'écrit null).
private func encodantOuNull<T: Encodable>(_ valeur: T?) throws -> JSONValue {
    guard let valeur else { return .null }
    return try JSONValue(encodant: valeur)
}

/// Argument optionnel : null vaut nil.
private func argNombreOptionnel(_ valeur: JSONValue) throws -> Double? {
    if case .null = valeur { return nil }
    return try argNombre(valeur)
}

private func argTableau(_ valeur: JSONValue) throws -> [JSONValue] {
    guard let tableau = valeur.tableau else { throw ErreurHarnais("tableau attendu : \(valeur)") }
    return tableau
}

/// Dispatch des cas `progression` de l'oracle, par nom de fonction.
private func executerProgression(_ cas: CasOracle) throws -> JSONValue {
    let args = try cas.arguments()
    switch cas.fn {
    case "allureNormRepetition":
        let r = try argDecode(try arg(args, 0), Repetition.self)
        let g = try argDecode(try arg(args, 1), Globaux.self)
        return .nombre(allureNormRepetition(r, g))

    case "allureNormSeance":
        let s = try argDecode(try arg(args, 0), SeanceVue.self)
        let g = try argDecode(try arg(args, 1), Globaux.self)
        return nombreOuNull(allureNormSeance(s, g))

    case "allureNormSemaine":
        let seances = try argDecode(try arg(args, 0), [SeanceVue].self)
        let g = try argDecode(try arg(args, 1), Globaux.self)
        return nombreOuNull(allureNormSemaine(seances, g))

    case "horsSousSeuil":
        let r = try argDecode(try arg(args, 0), Repetition.self)
        let p = try argDecode(try arg(args, 1), ParamsDates.self)
        return try JSONValue(encodant: horsSousSeuil(r, p))

    case "tendances":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        return try JSONValue(encodant: try tendances(vue))

    case "nuage":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        let periode = try argDecode(try arg(args, 1), PeriodeNuage.self)
        return try JSONValue(encodant: try nuage(vue, periode))

    case "derniereSeanceSousSeuil":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        let parametres = try argDecode(try arg(args, 1), Parametres.self)
        let index = try indexerParametres(parametres)
        return try encodantOuNull(derniereSeanceSousSeuil(vue, { index.auJour($0) }))

    case "niveauEstime":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        return try JSONValue(encodant: try niveauEstime(vue))

    case "comparer":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        let a = try argDecode(try arg(args, 1), PeriodeDates.self)
        let b = try argDecode(try arg(args, 2), PeriodeDates.self)
        let parametres = try argDecode(try arg(args, 3), Parametres.self)
        let index = try indexerParametres(parametres)
        return try JSONValue(encodant: try comparer(vue, a, b, { index.auJour($0) }))

    case "prereglage":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        let nom = try argDecode(try arg(args, 1), Prereglage.self)
        let periodes = try prereglage(vue, nom)
        return .object([
            "a": .array([.string(periodes.a.debut), .string(periodes.a.fin)]),
            "b": .array([.string(periodes.b.debut), .string(periodes.b.fin)]),
        ])

    case "suggestionPaceHrK":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        return nombreOuNull(try suggestionPaceHrK(vue))

    case "PRECISIONS":
        return .object(Dictionary(uniqueKeysWithValues: try PRECISIONS.map { ($0.key.rawValue, try JSONValue(encodant: $0.value)) }))

    case "arrondiAffiche":
        let valeur = try argNombre(try arg(args, 0))
        let precision = try argDecode(try arg(args, 1), Precision.self)
        return .nombre(try arrondiAffiche(valeur, precision))

    case "ecartAffiche":
        let a = try argNombreOptionnel(try arg(args, 0))
        let b = try argNombreOptionnel(try arg(args, 1))
        let precision = try argDecode(try arg(args, 2), Precision.self)
        return nombreOuNull(try ecartAffiche(a, b, precision))

    case "moyenneGlissante":
        let valeurs = try argTableau(try arg(args, 0)).map(argNombre)
        let fenetre = try argEntier(try arg(args, 1))
        return .array(moyenneGlissanteProgression(valeurs, fenetre).map(JSONValue.nombre))

    case "moyenneDesFinies":
        let valeurs = try argTableau(try arg(args, 0)).map(argNombre)
        return nombreOuNull(moyenneDesFinies(valeurs))

    case "borner":
        let vue = try argDecode(try arg(args, 0), Vue.self)
        return try JSONValue(encodant: try borner(vue, try argChaine(try arg(args, 1)), try argChaine(try arg(args, 2))))

    case "contient":
        let periode = try argDecode(try arg(args, 0), PeriodeBornee.self)
        return .bool(contient(periode, try argChaine(try arg(args, 1))))

    default:
        throw ErreurHarnais("fonction inconnue dans progression : \(cas.fn)")
    }
}

@Test func oracleProgression() throws {
    let differences = rejouer(module: "progression", executer: executerProgression)
    #expect(differences.isEmpty, messageDifferences(differences))
}
