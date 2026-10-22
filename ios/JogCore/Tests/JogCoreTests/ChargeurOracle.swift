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

/// Un cas doré : une entrée, puis une sortie attendue (`sortie`) ou une erreur attendue (`erreur`, son message).
/// `sortie` présent à null vaut `.null` ; absent, il vaut nil. Un cas sans l'un ni l'autre est mal formé.
struct CasOracle: Decodable, Equatable {
    let nom: String
    let fn: String
    let entree: JSONValue
    let sortie: JSONValue?
    let erreur: String?

    init(nom: String, fn: String, entree: JSONValue, sortie: JSONValue?, erreur: String?) {
        self.nom = nom
        self.fn = fn
        self.entree = entree
        self.sortie = sortie
        self.erreur = erreur
    }

    private enum Cles: String, CodingKey {
        case nom, fn, entree, sortie, erreur
    }

    init(from decoder: Decoder) throws {
        let conteneur = try decoder.container(keyedBy: Cles.self)
        nom = try conteneur.decode(String.self, forKey: .nom)
        fn = try conteneur.decode(String.self, forKey: .fn)
        entree = try conteneur.decode(JSONValue.self, forKey: .entree)
        sortie = conteneur.contains(.sortie) ? try conteneur.decode(JSONValue.self, forKey: .sortie) : nil
        erreur = try conteneur.decodeIfPresent(String.self, forKey: .erreur)
    }
}

/// Contenu d'un fichier `<module>.json` du dossier Oracle.
struct FichierOracle: Decodable, Equatable {
    let module: String
    let cas: [CasOracle]
}

/// Tolérance absolue sur les nombres (LISEZMOI de l'oracle : 1e-9).
let toleranceOracle = 1e-9

/// Compare deux valeurs JSON et renvoie la liste des différences, avec leur chemin.
///
/// - `a` : la valeur attendue (oracle) ; `b` : la valeur obtenue.
/// - Deux nombres sont égaux s'ils diffèrent de moins de `tolerance` en absolu. Un nombre fini ne vaut jamais
///   un infini ni NaN ; un NaN s'écrit null, un infini « Infinity » / « -Infinity » (chaînes, comparées telles quelles).
/// - Objets : mêmes clés, à une exception. Une clé absente d'un côté équivaut à `null` de l'autre (champs `T | null`
///   optionnels encodés sans clé) ; une clé absente d'un côté et non nulle de l'autre est une différence.
func comparer(_ a: JSONValue, _ b: JSONValue, tolerance: Double = toleranceOracle) -> [String] {
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
        if !nombresEgaux(x, y, tolerance: tolerance) {
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
            switch (x[cle], y[cle]) {
            case let (valeurA?, valeurB?):
                comparerRecursif(valeurA, valeurB, chemin: "\(chemin).\(cle)", tolerance: tolerance, differences: &differences)
            case (nil, nil):
                continue
            default:
                // Une seule clé présente : équivalente seulement si sa valeur est null.
                comparerRecursif(x[cle] ?? .null, y[cle] ?? .null, chemin: "\(chemin).\(cle)",
                                 tolerance: tolerance, differences: &differences)
            }
        }
    default:
        differences.append("\(chemin) : attendu \(libelle(a)), obtenu \(libelle(b))")
    }
}

private func nombresEgaux(_ x: Double, _ y: Double, tolerance: Double) -> Bool {
    if x == y { return true }
    guard x.isFinite, y.isFinite else { return false }
    return abs(x - y) <= tolerance
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
