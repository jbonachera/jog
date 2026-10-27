// Branchement de la synchronisation HealthKit au moteur (migration-ios, « Source »). La logique (lots, ancre, relecture,
// journal) est dans JogCore (`Synchroniseur`) ; ici, seulement la lecture du flux d'une séance par le moteur.
import Foundation
import JogCore

enum Synchronisation {
    /// Le `LectureFlux` du moteur : relit la séance dans HealthKit et renvoie son flux adapté.
    static func lectureFlux(lecteur: LecteurHealthKit) -> Moteur.LectureFlux {
        { cleSource in
            guard cleSource.hasPrefix("hk:"), let uuid = UUID(uuidString: String(cleSource.dropFirst(3))) else {
                return nil
            }
            guard let seance = try await lecteur.lireSeance(uuid: uuid) else { return nil }
            return try adapterSeance(seance, decalageAppareil: decalageAppareilMinutesDefaut)?.flux
        }
    }
}
