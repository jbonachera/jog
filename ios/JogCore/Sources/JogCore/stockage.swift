// Stockage local de l'app (migration-ios, « Stockage » ; ADR 0014). Des fichiers JSON `Codable` dans un dossier
// racine injecté, écrits de façon atomique. Foundation seulement : pas d'UIKit ni de HealthKit.
//
// Lectures : trois issues distinctes (`Lecture`). Un fichier absent donne `.absent` ; un fichier qui ne se décode pas,
// ou d'une autre version, donne `.illisible` ; une erreur d'accès (téléphone verrouillé, annulation) LÈVE une erreur,
// car elle est transitoire : l'appelant ne doit ni écraser le fichier ni avancer sur un état « à vide ».
// Les écritures lèvent une erreur, car un échec d'écriture doit être vu par l'appelant.
import Foundation

/// Version du format de chaque fichier JSON. Un fichier d'une autre version est illisible.
public let VERSION_FORMAT_STOCKAGE = 1

/// Version du format de `activites.json`, propre à ce fichier. Passée à 2 pour que les activités écrites avant la durée
/// écoulée et le bundle source soient illisibles : la synchronisation repart alors d'une relecture complète, sans
/// toucher aux autres fichiers (paramètres, marquages).
public let VERSION_FORMAT_ACTIVITES = 2

/// Marquage saisi par l'athlète (D-020) : seules ces deux valeurs sont stockées.
public enum MarquageUtilisateur: String, Codable, Sendable, Equatable {
    case course, test
}

/// Résultat de la lecture d'un fichier du stockage.
public enum Lecture<Valeur: Sendable>: Sendable {
    /// Pas de fichier : état normal avant la première écriture.
    case absent
    case valeur(Valeur)
    /// Le fichier existe mais ne se décode pas, ou il est d'une autre version de format.
    case illisible
}

extension Lecture: Equatable where Valeur: Equatable {}

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

    public func lireParametres() throws -> Lecture<Parametres> {
        try lire(Parametres.self, "parametres.json")
    }

    public func ecrireParametres(_ parametres: Parametres) throws {
        try ecrire(parametres, "parametres.json")
    }

    // MARK: - Séances (mémorisation de ②a)

    /// `seances.json` : séances intrinsèques par clé de mémorisation.
    public func lireMemoire() throws -> Lecture<[String: SeanceIntrinseque]> {
        try lire([String: SeanceIntrinseque].self, "seances.json")
    }

    public func ecrireMemoire(_ entrees: [String: SeanceIntrinseque]) throws {
        try ecrire(entrees, "seances.json")
    }

    // MARK: - Ancre HealthKit

    /// `ancre` : octets opaques de l'ancre de synchronisation, nil si absente. Pas de JSON, pas de version :
    /// HealthKit sérialise son ancre lui-même. Une erreur d'accès lève (transitoire).
    public func lireAncre() throws -> Data? {
        let fichier = racine.appendingPathComponent("ancre")
        guard FileManager.default.fileExists(atPath: fichier.path) else { return nil }
        return try Data(contentsOf: fichier)
    }

    /// Écrit l'ancre, ou la supprime si `ancre` est nil.
    public func ecrireAncre(_ ancre: Data?) throws {
        let fichier = racine.appendingPathComponent("ancre")
        guard let ancre else {
            if FileManager.default.fileExists(atPath: fichier.path) {
                try FileManager.default.removeItem(at: fichier)
            }
            return
        }
        try ecrireOctets(ancre, dans: fichier)
    }

    // MARK: - Dernière Vue

    /// `vue.json` : la dernière Vue calculée, pour un affichage instantané.
    public func lireVue() throws -> Lecture<Vue> {
        try lire(Vue.self, "vue.json")
    }

    public func ecrireVue(_ vue: Vue) throws {
        try ecrire(vue, "vue.json")
    }

    // MARK: - Marquages (D-020)

    /// `marquages.json` : marquage par clé source.
    public func lireMarquages() throws -> Lecture<[String: MarquageUtilisateur]> {
        try lire([String: MarquageUtilisateur].self, "marquages.json")
    }

    public func ecrireMarquages(_ marquages: [String: MarquageUtilisateur]) throws {
        try ecrire(marquages, "marquages.json")
    }

    // MARK: - Activités sans flux (le moteur les relit au lancement)

    /// `activites.json` : les activités connues, sans leurs flux.
    public func lireActivites() throws -> Lecture<[PivotSansFlux]> {
        try lire([PivotSansFlux].self, "activites.json", version: VERSION_FORMAT_ACTIVITES)
    }

    public func ecrireActivites(_ activites: [PivotSansFlux]) throws {
        try ecrire(activites, "activites.json", version: VERSION_FORMAT_ACTIVITES)
    }

    /// Supprime `activites.json` s'il existe.
    public func supprimerActivites() throws {
        let fichier = racine.appendingPathComponent("activites.json")
        guard FileManager.default.fileExists(atPath: fichier.path) else { return }
        try FileManager.default.removeItem(at: fichier)
    }

    /// Met de côté un fichier illisible (renommé en `<nom>.corrompu`) pour qu'un enregistrement ne l'écrase pas. Sans
    /// effet si le fichier n'existe pas ; un échec de renommage est ignoré (le fichier reste alors en place).
    public func mettreDeCote(_ nom: String) {
        let fichier = racine.appendingPathComponent(nom)
        let cote = racine.appendingPathComponent(nom + ".corrompu")
        guard FileManager.default.fileExists(atPath: fichier.path) else { return }
        try? FileManager.default.removeItem(at: cote)
        try? FileManager.default.moveItem(at: fichier, to: cote)
    }

    // MARK: - Suppression (D-016)

    /// Supprime tout le dossier : paramètres, séances, activités, ancre, vue et marquages.
    public func supprimerTout() throws {
        guard FileManager.default.fileExists(atPath: racine.path) else { return }
        try FileManager.default.removeItem(at: racine)
    }

    // MARK: - Lecture et écriture

    /// Décode `nom` : `.absent` si le fichier n'existe pas, `.illisible` s'il ne se décode pas ou n'est pas de cette
    /// version, et lève si le fichier existe mais ne peut pas être lu (erreur transitoire).
    private func lire<T: Codable & Sendable>(_ type: T.Type, _ nom: String, version: Int = VERSION_FORMAT_STOCKAGE) throws -> Lecture<T> {
        let fichier = racine.appendingPathComponent(nom)
        guard FileManager.default.fileExists(atPath: fichier.path) else { return .absent }
        let octets = try Data(contentsOf: fichier)
        guard let enveloppe = try? JSONDecoder().decode(Enveloppe<T>.self, from: octets),
              enveloppe.version == version else {
            return .illisible
        }
        return .valeur(enveloppe.donnees)
    }

    private func ecrire<T: Codable & Sendable>(_ donnees: T, _ nom: String, version: Int = VERSION_FORMAT_STOCKAGE) throws {
        let encodeur = JSONEncoder()
        encodeur.outputFormatting = [.sortedKeys]
        let octets = try encodeur.encode(Enveloppe(version: version, donnees: donnees))
        try ecrireOctets(octets, dans: racine.appendingPathComponent(nom))
    }

    /// Écriture atomique (fichier temporaire puis renommage). Protection « jusqu'au premier déverrouillage » : la
    /// livraison en arrière-plan tourne téléphone verrouillé, la protection « complete » empêcherait de lire.
    /// Le dossier est exclu des sauvegardes iCloud et iTunes : ce sont des données dérivées de HealthKit.
    private func ecrireOctets(_ octets: Data, dans fichier: URL) throws {
        try FileManager.default.createDirectory(at: racine, withIntermediateDirectories: true)
        var racineExclue = URLResourceValues()
        racineExclue.isExcludedFromBackup = true
        var racineMutable = racine
        try? racineMutable.setResourceValues(racineExclue)

        var options: Data.WritingOptions = [.atomic]
        #if os(iOS) || os(visionOS)
        options.insert(.completeFileProtectionUntilFirstUserAuthentication)
        #endif
        try octets.write(to: fichier, options: options)
    }
}
