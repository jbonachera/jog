import Foundation

/// Valeur JSON générique, pour comparer les sorties sans connaître leur type.
enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let conteneur = try decoder.singleValueContainer()
        if conteneur.decodeNil() {
            self = .null
        } else if let booleen = try? conteneur.decode(Bool.self) {
            self = .bool(booleen)
        } else if let nombre = try? conteneur.decode(Double.self) {
            self = .number(nombre)
        } else if let chaine = try? conteneur.decode(String.self) {
            self = .string(chaine)
        } else if let tableau = try? conteneur.decode([JSONValue].self) {
            self = .array(tableau)
        } else if let objet = try? conteneur.decode([String: JSONValue].self) {
            self = .object(objet)
        } else {
            throw DecodingError.dataCorruptedError(
                in: conteneur,
                debugDescription: "Valeur JSON non reconnue"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var conteneur = encoder.singleValueContainer()
        switch self {
        case .null: try conteneur.encodeNil()
        case .bool(let booleen): try conteneur.encode(booleen)
        case .number(let nombre): try conteneur.encode(nombre)
        case .string(let chaine): try conteneur.encode(chaine)
        case .array(let tableau): try conteneur.encode(tableau)
        case .object(let objet): try conteneur.encode(objet)
        }
    }
}

/// Un cas doré : une entrée, une sortie attendue ou une erreur attendue.
struct CasOracle: Codable, Equatable {
    let nom: String
    let fn: String
    let entree: JSONValue
    let sortie: JSONValue?
    let erreur: String?
}

/// Contenu d'un fichier `<module>.json` du dossier Oracle.
struct FichierOracle: Codable, Equatable {
    let module: String
    let cas: [CasOracle]
}

enum ErreurOracle: Error, Equatable {
    case moduleIntrouvable(String)
}

#if ORACLE_PRESENT
private let bundleOracle = Bundle.module
#endif

/// Noms des modules présents dans le dossier Oracle du bundle de test (vide si absent).
func modulesOracleDisponibles() -> [String] {
#if ORACLE_PRESENT
    let urls = bundleOracle.urls(forResourcesWithExtension: "json", subdirectory: "Oracle") ?? []
    return urls.map { $0.deletingPathExtension().lastPathComponent }.sorted()
#else
    return []
#endif
}

/// Charge `Oracle/<module>.json` depuis le bundle de test.
func chargerOracle(_ module: String) throws -> FichierOracle {
#if ORACLE_PRESENT
    guard let url = bundleOracle.url(forResource: module, withExtension: "json", subdirectory: "Oracle") else {
        throw ErreurOracle.moduleIntrouvable(module)
    }
    let donnees = try Data(contentsOf: url)
    return try JSONDecoder().decode(FichierOracle.self, from: donnees)
#else
    throw ErreurOracle.moduleIntrouvable(module)
#endif
}

/// Compare deux valeurs JSON et renvoie la liste des différences, avec leur chemin.
///
/// - `a` : la valeur attendue (oracle) ; `b` : la valeur obtenue.
/// - Une clé absente vaut `null`.
/// - Deux nombres sont égaux s'ils diffèrent de moins de `tolerance` en absolu,
///   ou de moins de `tolerance` fois la plus grande magnitude (au-delà de 1).
/// - `"Infinity"` et `"-Infinity"` sont des chaînes, comparées telles quelles.
func comparer(_ a: JSONValue, _ b: JSONValue, tolerance: Double = 1e-9) -> [String] {
    var differences: [String] = []
    comparerRecursif(a, b, chemin: "$", tolerance: tolerance, differences: &differences)
    return differences
}

private func comparerRecursif(
    _ a: JSONValue,
    _ b: JSONValue,
    chemin: String,
    tolerance: Double,
    differences: inout [String]
) {
    switch (a, b) {
    case (.null, .null):
        return
    case let (.bool(x), .bool(y)) where x == y:
        return
    case let (.number(x), .number(y)):
        if abs(x - y) > tolerance * max(1, abs(x), abs(y)) {
            differences.append("\(chemin) : attendu \(x), obtenu \(y)")
        }
    case let (.string(x), .string(y)) where x == y:
        return
    case let (.array(x), .array(y)):
        if x.count != y.count {
            differences.append("\(chemin) : longueur attendue \(x.count), obtenue \(y.count)")
        }
        for indice in 0..<min(x.count, y.count) {
            comparerRecursif(x[indice], y[indice], chemin: "\(chemin)[\(indice)]",
                             tolerance: tolerance, differences: &differences)
        }
    case let (.object(x), .object(y)):
        for cle in Set(x.keys).union(y.keys).sorted() {
            comparerRecursif(x[cle] ?? .null, y[cle] ?? .null, chemin: "\(chemin).\(cle)",
                             tolerance: tolerance, differences: &differences)
        }
    default:
        differences.append("\(chemin) : attendu \(libelle(a)), obtenu \(libelle(b))")
    }
}

private func libelle(_ valeur: JSONValue) -> String {
    switch valeur {
    case .null: return "null"
    case .bool(let booleen): return booleen ? "true" : "false"
    case .number(let nombre): return "\(nombre)"
    case .string(let chaine): return "\"\(chaine)\""
    case .array(let tableau): return "tableau(\(tableau.count))"
    case .object(let objet): return "objet(\(objet.count) clés)"
    }
}
