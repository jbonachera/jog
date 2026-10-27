// Chef d'orchestre de l'app (migration-ios, « Calcul » et « Écran de première ouverture »). Possède le stockage, le
// moteur et la synchronisation ; décide quand synchroniser et recalculer ; traduit les résultats en `EtatApp` via
// `TransitionsApp`. Aucune logique HealthKit ici : elle reste dans `LecteurHealthKit` et `Synchroniseur` (JogCore).
// Synchronisations et recalculs de jour passent par une même file : jamais deux à la fois.
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

    /// Les services sont absents si le stockage n'a pas pu s'ouvrir (l'app affiche alors une erreur) ou dans un aperçu.
    private let services: Services?
    @ObservationIgnored private var derniereSynchro: String?
    @ObservationIgnored private var tacheJour: Task<Void, Never>?
    /// Dernière tâche de la file : synchronisations et recalculs s'exécutent l'un après l'autre, dans l'ordre.
    @ObservationIgnored private var fileTravail: Task<Void, Never>?
    /// Synchronisation en file ou en cours. Une demande pendant ce temps la relance une fois, à la fin.
    @ObservationIgnored private var synchroTache: Task<Void, Never>?
    @ObservationIgnored private var aRelancer = false
    /// Dernier nombre de séances traitées affiché pendant l'import : la progression ne recule jamais.
    @ObservationIgnored private var progressionRecue = 0

    private struct Services: Sendable {
        let lecteur: LecteurHealthKit
        let moteur: Moteur
        let synchro: Synchroniseur
    }

    init() {
        do {
            let stockage = try Stockage.parDefaut()
            let lecteur = LecteurHealthKit()
            let moteur = Moteur(stockage: stockage, lireFlux: Synchronisation.lectureFlux(lecteur: lecteur))
            let synchro = Synchroniseur(source: lecteur, stockage: stockage, moteur: moteur)
            services = Services(lecteur: lecteur, moteur: moteur, synchro: synchro)
        } catch {
            services = nil
            etat = .erreur(message: "Les données de l’app n’ont pas pu être ouvertes.", vue: nil)
        }
    }

    /// Aperçus (Xcode) : pas de stockage ni de HealthKit, l'état est donné tel quel.
    private init(apercu etat: EtatApp) {
        services = nil
        self.etat = etat
    }

    static func apercu(_ etat: EtatApp) -> ModeleApp {
        ModeleApp(apercu: etat)
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
            try? await services.lecteur.activerLivraisonEnArrierePlan {
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

    /// Marque la séance « Course » ou « Test » (D-020), ou retire le marquage saisi (nil), puis recalcule la Vue.
    func marquer(cleSource: String, comme marquage: MarquageUtilisateur?) async {
        guard let services else { return }
        do {
            try await services.moteur.marquer(cleSource: cleSource, comme: marquage)
        } catch {
            etat = TransitionsApp.suivant(etat, .echec(message(pour: error)))
            return
        }
        await recalculerJour()
    }

    // MARK: - Paramètres et données (06, D-016, D-017)

    /// Les paramètres stockés, avec leur historique, pour la feuille Paramètres.
    func lireParametres() async throws -> Parametres {
        guard let services else { throw ErreurParametres.indisponible }
        return try await services.moteur.lireParametres()
    }

    /// Enregistre l'ensemble des paramètres, puis recalcule. Le calcul se fait hors du fil principal, dans la file.
    /// Si le recalcul échoue, les paramètres précédents sont rétablis et l'erreur est levée.
    func enregistrerParametres(_ nouveaux: Parametres) async throws {
        guard let services else { throw ErreurParametres.indisponible }
        let anciens = try await services.moteur.lireParametres()
        var erreur: ErreurParametres?
        await enfiler { [self] in
            do {
                try await services.moteur.modifierParametres(nouveaux)
            } catch {
                erreur = .ecriture(error.localizedDescription)
                return
            }
            do {
                let J = services.moteur.jourCourant(maintenant: Date(), fuseau: .current)
                let vue = try await services.moteur.recalculer(J: J, derniereSynchro: derniereSynchro)
                if case .erreur(let message, _) = etat {
                    etat = .erreur(message: message, vue: vue)
                } else {
                    recevoir(vue)
                }
            } catch {
                erreur = .recalcul
                try? await services.moteur.modifierParametres(anciens)
            }
        }.value
        if let erreur { throw erreur }
    }

    /// Compteurs de l'état des données (D-017, adapté) : versions, séances importées, écartées, ignorées, synchro.
    func etatDonnees() async -> EtatDonnees? {
        guard let services else { return nil }
        let importees = (try? await services.moteur.nombreActivites()) ?? 0
        let ecartees = await services.moteur.ecartees.count
        let ignorees = await services.synchro.ignorees.values.map(\.raison)
        let echecs = await services.synchro.echecs.count
        return EtatDonnees(
            reglesVersion: REGLES_VERSION, seancesImportees: importees, ecartees: ecartees, raisonsIgnorees: ignorees,
            echecs: echecs, derniereSynchro: derniereSynchro
        )
    }

    /// « Supprimer toutes mes données » (D-016) : efface le stockage (paramètres, séances, marquages, ancre, Vue), les
    /// préférences de l'app, puis ramène à l'écran d'accueil. Les données Santé d'Apple ne sont pas touchées.
    func supprimerToutesLesDonnees() async throws {
        guard let services else { throw ErreurParametres.indisponible }
        var erreur: Error?
        await enfiler { [self] in
            do {
                try await services.moteur.supprimerTout()
            } catch {
                erreur = error
                return
            }
            UserDefaults.standard.removeObject(forKey: CLE_AUTORISATION_DEMANDEE)
            UserDefaults.standard.removeObject(forKey: CLE_HRMAX_IGNOREE)
            derniereSynchro = nil
            etat = .premiereOuverture
        }.value
        if let erreur { throw ErreurParametres.ecriture(erreur.localizedDescription) }
    }

    // MARK: - Synchronisation et recalcul

    /// Une seule synchronisation à la fois, dans la file. Une demande reçue pendant qu'une synchronisation est en file ou
    /// en cours la relance une fois à la fin, et attend cette fin : l'appelant (la livraison en arrière-plan) ne rend
    /// la main à iOS qu'une fois toutes les séances traitées.
    private func synchroniser() async {
        guard let services else { return }
        if let tache = synchroTache {
            aRelancer = true
            await tache.value
            return
        }
        let tache = enfiler { [self] in
            defer { synchroTache = nil }
            repeat {
                aRelancer = false
                progressionRecue = 0
                do {
                    let vue = try await services.synchro.synchroniser { traitees, total in
                        await self.progression(traitees, total)
                    }
                    recevoir(vue)
                } catch {
                    etat = TransitionsApp.suivant(etat, .echec(message(pour: error)))
                }
            } while aRelancer
        }
        synchroTache = tache
        await tache.value
    }

    /// Recalcul au changement de jour (ADR 0007) : J change, les données non. Sans synchronisation, mais dans la même file.
    private func recalculerJour() async {
        guard autorisationDemandee, services != nil else { return }
        await enfiler { [self] in
            guard let services else { return }
            do {
                let J = services.moteur.jourCourant(maintenant: Date(), fuseau: .current)
                let vue = try await services.moteur.recalculer(J: J, derniereSynchro: derniereSynchro)
                // Un bandeau d'erreur déjà affiché reste : seule la Vue dessous est mise à jour.
                if case .erreur(let message, _) = etat {
                    etat = .erreur(message: message, vue: vue)
                } else {
                    recevoir(vue)
                }
            } catch {
                // Un état d'erreur déjà affiché n'est pas remplacé par celui-ci.
                if case .erreur = etat { return }
                etat = TransitionsApp.suivant(etat, .echec(message(pour: error)))
            }
        }.value
    }

    /// Ajoute une tâche à la file : elle démarre quand la précédente est finie.
    private func enfiler(_ travail: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        let precedent = fileTravail
        let tache = Task { @MainActor in
            await precedent?.value
            await travail()
        }
        fileTravail = tache
        return tache
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
        guard traitees >= progressionRecue else { return }
        progressionRecue = traitees
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
