import Testing
@testable import JogCore

/// Valeur JSON d'une sortie optionnelle : nil s'écrit null.
private func valeurOptionnelle<T: Encodable>(_ valeur: T?) throws -> JSONValue {
    guard let valeur else { return .null }
    return try JSONValue(encodant: valeur)
}

/// Un nombre optionnel d'un argument : null (ou absent) vaut nil.
private func nombreOptionnel(_ valeur: JSONValue) throws -> Double? {
    if case .null = valeur { return nil }
    return try argNombre(valeur)
}

/// Une date civile optionnelle d'un argument : null vaut nil (jour 1 absent).
private func dateOptionnelle(_ valeur: JSONValue) throws -> DateCivile? {
    if case .null = valeur { return nil }
    return try argChaine(valeur)
}

/// Dispatch des cas `decision` de l'oracle. `decider` reçoit un objet (EntreesDecision) ; les autres fonctions, des arguments positionnels.
private func executerDecision(_ cas: CasOracle) throws -> JSONValue {
    if cas.fn == "decider" {
        let entree = try argDecode(cas.entree, EntreesDecision.self)
        return try JSONValue(encodant: try decider(entree))
    }
    let args = try cas.arguments()
    switch cas.fn {
    case "simuler":
        let km = try argNombre(try arg(args, 0))
        let simulateur = try argDecode(try arg(args, 1), Simulateur.self)
        let fourchette = try argDecode(try arg(args, 2), Fourchette.self)
        return try JSONValue(encodant: try simuler(km, simulateur, fourchette))
    case "etatProgressivite":
        return .string(etatProgressivite(try argNombre(try arg(args, 0))).rawValue)
    case "etatFraicheur":
        return .string(etatFraicheur(try argNombre(try arg(args, 0))).rawValue)
    case "etatReponse":
        return .string(etatReponse(try argNombre(try arg(args, 0))).rawValue)
    case "etatHorsSousSeuil":
        return .string(etatHorsSousSeuil(try argNombre(try arg(args, 0))).rawValue)
    case "etatFootings":
        return .string(etatFootings(try argNombre(try arg(args, 0))).rawValue)
    case "etatDecouplage":
        return .string(etatDecouplage(try argNombre(try arg(args, 0))).rawValue)
    case "etatPalier":
        return .string(etatPalier(try argNombre(try arg(args, 0))).rawValue)
    case "verdictDe":
        let signaux = try argDecode(try arg(args, 0), [Signal].self)
        let manque = try argEntier(try arg(args, 1))
        return try JSONValue(encodant: verdictDe(signaux, manque))
    case "fourchetteDe":
        let verdict = try argDecode(try arg(args, 0), Verdict.self)
        let entrees = try argDecode(try arg(args, 1), EntreesFourchette.self)
        // Le troisième argument peut être absent (chronic undefined) : c'est alors nil, comme null.
        var chronic: Double?
        if args.count > 2 {
            chronic = try nombreOptionnel(args[2])
        }
        return try valeurOptionnelle(try fourchetteDe(verdict, entrees, chronic))
    case "jours":
        return .string(jours(try argEntier(try arg(args, 0))))
    case "enumerer":
        let noms = try argDecode(try arg(args, 0), [String].self)
        return .string(enumerer(noms))
    case "joursHistorique":
        let premier = try dateOptionnelle(try arg(args, 0))
        return try JSONValue(encodant: try joursHistorique(premier, try argChaine(try arg(args, 1))))
    case "joursManquants":
        let minimum = try argEntier(try arg(args, 0))
        let premier = try dateOptionnelle(try arg(args, 1))
        return try JSONValue(encodant: try joursManquants(minimum, premier, try argChaine(try arg(args, 2))))
    case "dansFenetre":
        let d = try argChaine(try arg(args, 0))
        let J = try argChaine(try arg(args, 1))
        let n = try argEntier(try arg(args, 2))
        return try JSONValue(encodant: try dansFenetre(d, J, n, try argChaine(try arg(args, 3))))
    case "trierSeances":
        let seances = try argDecode(try arg(args, 0), [Seance].self)
        return try JSONValue(encodant: trierSeances(seances))
    default:
        throw ErreurHarnais("fonction inconnue dans decision : \(cas.fn)")
    }
}

@Test func oracleDecision() throws {
    let differences = rejouer(module: "decision", executer: executerDecision)
    #expect(differences.isEmpty, messageDifferences(differences))
}
