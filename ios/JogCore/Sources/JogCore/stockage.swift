// Stockage local de l'app (migration-ios, « Stockage » ; ADR 0014). Des fichiers JSON `Codable` dans un dossier
// racine injecté, écrits de façon atomique. Foundation seulement : pas d'UIKit ni de HealthKit.
//
// Lectures : un fichier absent, illisible ou d'une autre version rend la valeur par défaut, sans lever d'erreur. Les
// écritures lèvent une erreur, car un échec d'écriture doit être vu par l'appelant.
import Foundation

/// Version du format de chaque fichier JSON. Un fichier d'une autre version est ignoré (valeur par défaut).
public let VERSION_FORMAT_STOCKAGE = 1

/// Marquage saisi par l'athlète (D-020) : seules ces deux valeurs sont stockées.
public enum MarquageUtilisateur: String, Codable, Sendable, Equatable {
    case course, test
}

/// Enveloppe de chaque fichier JSON : la version du format, puis les données.
private struct Enveloppe<Donnees: Codable & Sendable>: Codable, Sendable {
    var version: Int
    var donnees: Donnees
}

public struct Stockage: Sendable {
    /// Dossier qui contient les fichiers. Créé à la première écriture.
    public let racine: URL

    /// Dossier racine injecté. Les tests passent un dossier temporaire.
    public init(racine: URL) {
        self.racine = racine
    }

    /// Application Support/Jog, dans le dossier de l'utilisateur de l'app.
    public static func parDefaut() throws -> Stockage {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        return Stockage(racine: support.appendingPathComponent("Jog", isDirectory: true))
    }

    // MARK: - Paramètres

    /// `parametres.json` ; défauts de `parametresDefaut()` si absent ou illisible.
    public func lireParametres() -> Parametres {
        lire(Parametres.self, "parametres.json") ?? parametresDefaut()
    }

    public func ecrireParametres(_ parametres: Parametres) throws {
        try ecrire(parametres, "parametres.json")
    }

    // MARK: - Séances (mémorisation de ②a)

    /// `seances.json` : séances intrinsèques par clé de mémorisation. Vide si absent ou illisible.
    public func lireMemoire() -> MemoireSeances {
        MemoireSeances(entrees: lire([String: SeanceIntrinseque].self, "seances.json") ?? [:])
    }

    public func ecrireMemoire(_ memoire: MemoireSeances) throws {
        try ecrire(memoire.entrees, "seances.json")
    }

    // MARK: - Ancre HealthKit

    /// `ancre` : octets opaques de l'ancre de synchronisation, nil si absente. Pas de JSON, pas de version :
    /// HealthKit sérialise son ancre lui-même.
    public func lireAncre() -> Data? {
        try? Data(contentsOf: racine.appendingPathComponent("ancre"))
    }

    /// Écrit l'ancre, ou la supprime si `ancre` est nil.
    public func ecrireAncre(_ ancre: Data?) throws {
        let fichier = racine.appendingPathComponent("ancre")
        guard let ancre else {
            try? FileManager.default.removeItem(at: fichier)
            return
        }
        try ecrireOctets(ancre, dans: fichier)
    }

    // MARK: - Dernière Vue

    /// `vue.json` : la dernière Vue calculée, pour un affichage instantané. nil si absente ou illisible.
    public func lireVue() -> Vue? {
        lire(Vue.self, "vue.json")
    }

    public func ecrireVue(_ vue: Vue) throws {
        try ecrire(vue, "vue.json")
    }

    // MARK: - Marquages (D-020)

    /// `marquages.json` : marquage par clé source. Vide si absent ou illisible.
    public func lireMarquages() -> [String: MarquageUtilisateur] {
        lire([String: MarquageUtilisateur].self, "marquages.json") ?? [:]
    }

    public func ecrireMarquages(_ marquages: [String: MarquageUtilisateur]) throws {
        try ecrire(marquages, "marquages.json")
    }

    // MARK: - Suppression (D-016)

    /// Supprime tout le dossier : paramètres, séances, ancre, vue et marquages.
    public func supprimerTout() throws {
        guard FileManager.default.fileExists(atPath: racine.path) else { return }
        try FileManager.default.removeItem(at: racine)
    }

    // MARK: - Lecture et écriture

    /// Décode `nom` si le fichier existe, est lisible et a la bonne version ; nil sinon.
    private func lire<T: Codable & Sendable>(_ type: T.Type, _ nom: String) -> T? {
        guard let octets = try? Data(contentsOf: racine.appendingPathComponent(nom)) else { return nil }
        guard let enveloppe = try? JSONDecoder().decode(Enveloppe<T>.self, from: octets) else { return nil }
        guard enveloppe.version == VERSION_FORMAT_STOCKAGE else { return nil }
        return enveloppe.donnees
    }

    private func ecrire<T: Codable & Sendable>(_ donnees: T, _ nom: String) throws {
        let encodeur = JSONEncoder()
        encodeur.outputFormatting = [.sortedKeys]
        let octets = try encodeur.encode(Enveloppe(version: VERSION_FORMAT_STOCKAGE, donnees: donnees))
        try ecrireOctets(octets, dans: racine.appendingPathComponent(nom))
    }

    /// Écriture atomique (fichier temporaire puis renommage), avec protection « complete » sur iOS.
    private func ecrireOctets(_ octets: Data, dans fichier: URL) throws {
        try FileManager.default.createDirectory(at: racine, withIntermediateDirectories: true)
        var options: Data.WritingOptions = [.atomic]
        #if os(iOS) || os(visionOS)
        options.insert(.completeFileProtection)
        #endif
        try octets.write(to: fichier, options: options)
    }
}
