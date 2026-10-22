import Foundation
import Testing
@testable import JogCore

/// Erreur interne du harnais (fonction inconnue, argument mal formé). Elle ne compte pas comme une erreur attendue
/// du moteur : un cas `erreur` ne réussit que si le moteur lève une autre erreur.
struct ErreurHarnais: Error, CustomStringConvertible {
    let message: String

    init(_ message: String) { self.message = message }

    var description: String { message }
}

extension JSONValue {
    var tableau: [JSONValue]? {
        if case let .array(valeurs) = self { return valeurs }
        return nil
    }

    var chaine: String? {
        if case let .string(texte) = self { return texte }
        return nil
    }

    var booleen: Bool? {
        if case let .bool(valeur) = self { return valeur }
        return nil
    }

    /// Valeur de sortie pour un nombre : NaN s'écrit null, ±Infinity s'écrit en chaînes (LISEZMOI).
    static func nombre(_ valeur: Double) -> JSONValue {
        if valeur.isNaN { return .null }
        if valeur == .infinity { return .string("Infinity") }
        if valeur == -.infinity { return .string("-Infinity") }
        return .number(valeur)
    }

    /// Décode la valeur dans un type Decodable (par un aller-retour JSON, sans perte).
    func decoder<T: Decodable>(_: T.Type) throws -> T {
        let donnees = try JSONEncoder().encode(self)
        return try JSONDecoder().decode(T.self, from: donnees)
    }

    /// Valeur JSON d'un type Encodable (NaN dans les types du moteur s'écrit null).
    init(encodant valeur: some Encodable) throws {
        let donnees = try JSONEncoder().encode(valeur)
        self = try JSONDecoder().decode(JSONValue.self, from: donnees)
    }
}

extension CasOracle {
    /// Arguments positionnels de `entree`.
    func arguments() throws -> [JSONValue] {
        guard let valeurs = entree.tableau else {
            throw ErreurHarnais("entrée de « \(nom) » : tableau attendu")
        }
        return valeurs
    }
}

/// Argument d'indice donné. Un argument absent lève ErreurHarnais (le cas est mal formé, pas le moteur).
func arg(_ args: [JSONValue], _ indice: Int) throws -> JSONValue {
    guard indice < args.count else { throw ErreurHarnais("argument \(indice) absent (\(args.count) reçu(s))") }
    return args[indice]
}

/// Nombre d'un argument : null vaut NaN, « Infinity » et « -Infinity » valent ±infini.
func argNombre(_ valeur: JSONValue) throws -> Double {
    switch valeur {
    case .null: return .nan
    case let .number(nombre): return nombre
    case let .string(texte) where texte == "Infinity": return .infinity
    case let .string(texte) where texte == "-Infinity": return -.infinity
    default: throw ErreurHarnais("nombre attendu : \(valeur)")
    }
}

/// Entier d'un argument. Un nombre non entier (ou non fini) lève RangeError, comme Number.isInteger côté TypeScript.
func argEntier(_ valeur: JSONValue) throws -> Int {
    let nombre = try argNombre(valeur)
    guard nombre.isFinite, nombre.rounded(.towardZero) == nombre, abs(nombre) < 9e18 else {
        throw RangeError("entier attendu : \(nombre)")
    }
    return Int(nombre)
}

func argChaine(_ valeur: JSONValue) throws -> String {
    guard let texte = valeur.chaine else { throw ErreurHarnais("chaîne attendue : \(valeur)") }
    return texte
}

func argBooleen(_ valeur: JSONValue) throws -> Bool {
    guard let booleen = valeur.booleen else { throw ErreurHarnais("booléen attendu : \(valeur)") }
    return booleen
}

func argDecode<T: Decodable>(_ valeur: JSONValue, _ type: T.Type) throws -> T {
    try valeur.decoder(type)
}

/// Rejoue les cas d'un module de l'oracle et rend les différences, nommées par cas (une par ligne).
/// Un cas `sortie` réussit si `executer` rend une valeur égale à la sortie (tolérance 1e-9 sur les nombres).
/// Un cas `erreur` réussit si `executer` lève une erreur (une erreur du harnais ne compte pas).
func rejouer(module: String, executer: (CasOracle) throws -> JSONValue) -> [String] {
    let fichier: FichierOracle
    do {
        fichier = try chargerCasOracle(module)
    } catch {
        return ["module « \(module) » introuvable dans Tests/Oracle : \(error)"]
    }
    var differences: [String] = []
    for cas in fichier.cas {
        do {
            let obtenu = try executer(cas)
            if cas.erreur != nil {
                differences.append("\(cas.nom) : une erreur était attendue, obtenu \(obtenu)")
            } else {
                for difference in comparer(cas.sortie ?? .null, obtenu) {
                    differences.append("\(cas.nom) — \(difference)")
                }
            }
        } catch let erreur as ErreurHarnais {
            differences.append("\(cas.nom) : défaut du harnais : \(erreur)")
        } catch {
            if cas.erreur == nil {
                differences.append("\(cas.nom) : erreur inattendue : \(error)")
            }
        }
    }
    return differences
}

/// Dossier Tests/Oracle, lu à partir des sources de test (#filePath). Le manifeste ne peut pas vérifier l'existence
/// de ce dossier dans cet environnement (condition ORACLE_PRESENT toujours fausse) : la ressource n'est donc pas
/// copiée dans le bundle, et chargerOracle échoue. Le harnais lit directement les fichiers du dépôt.
private let dossierOracleSources = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("Oracle")

/// Charge `Tests/Oracle/<module>.json` depuis les sources du dépôt.
func chargerCasOracle(_ module: String) throws -> FichierOracle {
    let url = dossierOracleSources.appendingPathComponent("\(module).json")
    return try JSONDecoder().decode(FichierOracle.self, from: Data(contentsOf: url))
}

/// Message d'un échec : le nombre de différences et au plus cinq d'entre elles.
func messageDifferences(_ differences: [String]) -> Comment? {
    guard !differences.isEmpty else { return nil }
    let details = differences.prefix(5).joined(separator: "\n")
    return Comment(rawValue: "\(differences.count) différence(s) ; les premières :\n\(details)")
}

/// Le harnais lit bien tous les cas de chaque module : le nombre égale celui du LISEZMOI de l'oracle.
@Test(arguments: [
    ("dates", 150), ("arrondi", 116), ("format", 122), ("parametres", 38),
    ("validationParametres", 65), ("riegel", 14), ("jours", 13),
] as [(String, Int)])
func harnaisLitTousLesCasDeLOracle(module: String, attendu: Int) throws {
    #expect(try chargerCasOracle(module).cas.count == attendu)
}

/// Convention de sérialisation (LISEZMOI) : NaN s'écrit null et se relit NaN ; ±Infinity s'écrivent en chaînes ;
/// les flottants Float32 s'écrivent en doubles exacts.
@Test func nanEtInfiniSeSerialisentComme_LOracle() throws {
    let repetition = Repetition(n: 1, debut_s: 0, duree_s: 120, allure_skm: .nan, fcFin: .infinity)
    let json = try JSONValue(encodant: repetition)
    guard case let .object(objet) = json else {
        Issue.record("objet JSON attendu")
        return
    }
    #expect(objet["allure_skm"] == JSONValue.null)
    #expect(objet["fcFin"] == JSONValue.string("Infinity"))
    let relue = try json.decoder(Repetition.self)
    #expect(relue.allure_skm.isNaN)
    #expect(relue.fcFin == .infinity)

    let flux = Flux(t_s: [0.1], dist_m: [.nan], fc_bpm: nil, alt_m: nil, vitesse_ms: [1])
    let jsonFlux = try JSONValue(encodant: flux)
    #expect(comparer(jsonFlux, .object([
        "t_s": .array([.number(Double(Float(0.1)))]),
        "dist_m": .array([.null]),
        "fc_bpm": .null,
        "alt_m": .null,
        "vitesse_ms": .array([.number(1)]),
    ])).isEmpty)
}
