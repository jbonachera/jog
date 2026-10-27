// Chef d'orchestre de l'app (migration-ios, « Calcul » et « Écran de première ouverture »). Possède le stockage, le
// moteur et la synchronisation ; décide quand synchroniser et recalculer ; traduit les résultats en `EtatApp` via
// `TransitionsApp`. Aucune logique HealthKit ici : elle reste dans `LecteurHealthKit` et `Synchronisation`.
import Foundation
import Observation
import JogCore

/// Préférence « autorisation HealthKit demandée » : sans elle, l'app montre l'écran d'accueil.
private let CLE_AUTORISATION_DEMANDEE = "autorisationDemandee"

@MainActor
@Observable
final class ModeleApp {
    private(set) var etat: EtatApp = .chargement

    #if DEBUG
    /// Affiche la maquette à la place des données réelles (Paramètres > Développement). Non persisté.
    var maquetteActive = false {
        didSet { maquette = maquetteActive ? (try? chargerMaquette()) : nil }
    }
    private(set) var maquette: Vue?
    #endif

    /// Les services sont absents si le stockage n'a pas pu s'ouvrir : l'app affiche alors une erreur.
    private let services: Services?
    @ObservationIgnored private var derniereSynchro: String?
    @ObservationIgnored private var tacheJour: Task<Void, Never>?
    @ObservationIgnored private var synchroEnCours = false
    @ObservationIgnored private var aRelancer = false

    private struct Services: Sendable {
        let lecteur: LecteurHealthKit
        let moteur: Moteur
        let synchro: Synchronisation
    }

    init() {
        do {
            let stockage = try Stockage.parDefaut()
            let lecteur = LecteurHealthKit()
            let moteur = Moteur(stockage: stockage, lireFlux: Synchronisation.lectureFlux(lecteur: lecteur))
            let synchro = Synchronisation(stockage: stockage, lecteur: lecteur, moteur: moteur)
            services = Services(lecteur: lecteur, moteur: moteur, synchro: synchro)
        } catch {
            services = nil
            etat = .erreur(message: "Les données de l’app n’ont pas pu être ouvertes.", vue: nil)
        }
    }

    private var autorisationDemandee: Bool {
        UserDefaults.standard.bool(forKey: CLE_AUTORISATION_DEMANDEE)
    }

    // MARK: - Cycle de vie

    /// Au lancement de l'interface : affiche la dernière Vue tout de suite, puis synchronise et recalcule.
    func demarrer() async {
        guard let services else { return }
        let vue = await services.moteur.charger()
        derniereSynchro = vue?.derniereSynchro
        let autorisee = autorisationDemandee
        etat = TransitionsApp.suivant(etat, .lancement(autorisationDemandee: autorisee, vue: vue))
        armerChangementDeJour()
        if autorisee {
            await synchroniser()
        }
    }

    /// Armé dès l'init de l'app, avant toute interface : iOS peut relancer l'app en arrière-plan pour une nouvelle séance.
    func armerLivraisonEnArrierePlan() {
        guard autorisationDemandee, let services else { return }
        // Capture forte : le modèle vit toute la durée de l'app.
        Task {
            // L'échec n'a pas de quoi être montré : la synchronisation reste possible à chaque ouverture.
            try? await services.synchro.activerLivraisonEnArrierePlan {
                await self.synchroniser()
            }
        }
    }

    /// Au retour au premier plan : synchronisation incrémentale et recalcul.
    func auPremierPlan() async {
        guard autorisationDemandee else { return }
        await synchroniser()
    }

    // MARK: - Actions de l'interface

    /// Demande l'accès à HealthKit depuis l'écran d'accueil, puis lance le premier import.
    func autoriserSante() async {
        guard let services else { return }
        do {
            try await services.lecteur.demanderAutorisation()
        } catch {
            etat = TransitionsApp.suivant(etat, .autorisationEchouee(message(pour: error)))
            return
        }
        UserDefaults.standard.set(true, forKey: CLE_AUTORISATION_DEMANDEE)
        etat = TransitionsApp.suivant(etat, .autorisationAccordee)
        armerLivraisonEnArrierePlan()
        await synchroniser()
    }

    /// « Réessayer » : relance la demande d'autorisation si elle n'a pas abouti, sinon la synchronisation.
    func reessayer() async {
        guard services != nil else { return }
        guard autorisationDemandee else {
            await autoriserSante()
            return
        }
        etat = TransitionsApp.suivant(etat, .reessayer)
        await synchroniser()
    }

    // MARK: - Synchronisation et recalcul

    /// Une seule synchronisation à la fois. Une demande reçue pendant la synchronisation en relance une à la fin, pour
    /// qu'aucune séance arrivée entre-temps ne reste en attente.
    private func synchroniser() async {
        guard let services else { return }
        if synchroEnCours {
            aRelancer = true
            return
        }
        synchroEnCours = true
        defer { synchroEnCours = false }
        repeat {
            aRelancer = false
            do {
                let vue = try await services.synchro.synchroniserEtRecalculer { traitees, total in
                    Task { @MainActor in self.progression(traitees, total) }
                }
                recevoir(vue)
            } catch {
                etat = TransitionsApp.suivant(etat, .echec(message(pour: error)))
            }
        } while aRelancer
    }

    /// Recalcul au changement de jour (ADR 0007) : J change, les données non. Sans synchronisation.
    private func recalculerJour() async {
        guard autorisationDemandee, let services else { return }
        do {
            let J = services.moteur.jourCourant(maintenant: Date(), fuseau: .current)
            let vue = try await services.moteur.recalculer(J: J, derniereSynchro: derniereSynchro)
            recevoir(vue)
        } catch {
            etat = TransitionsApp.suivant(etat, .echec(message(pour: error)))
        }
    }

    /// Tâche qui dort jusqu'à minuit (heure du lieu), recalcule, et se réarme. Remplacée à chaque appel.
    private func armerChangementDeJour() {
        tacheJour?.cancel()
        guard let services else { return }
        let moteur = services.moteur
        tacheJour = Task {
            while !Task.isCancelled {
                let maintenant = Date()
                let prochain = moteur.prochainChangementDeJour(après: maintenant, fuseau: .current)
                try? await Task.sleep(for: .seconds(max(prochain.timeIntervalSince(maintenant), 1)))
                guard !Task.isCancelled else { return }
                await self.recalculerJour()
            }
        }
    }

    private func progression(_ traitees: Int, _ total: Int) {
        etat = TransitionsApp.suivant(etat, .progression(traitees: traitees, total: total))
    }

    private func recevoir(_ vue: Vue) {
        derniereSynchro = vue.derniereSynchro
        etat = TransitionsApp.suivant(etat, .vueCalculee(vue))
    }

    private func message(pour erreur: Error) -> String {
        if let erreurLecteur = erreur as? ErreurLecteur {
            switch erreurLecteur {
            case .nonAutorise:
                return "L’accès à Santé n’est pas accordé. Vérifiez : Réglages > Santé > Accès aux données > Jog."
            case .indisponible:
                return erreurLecteur.localizedDescription
            }
        }
        return "La synchronisation a échoué : \(erreur.localizedDescription)"
    }
}
