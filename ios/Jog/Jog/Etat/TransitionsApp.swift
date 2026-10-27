// Transitions entre les états de l'app (migration-ios, « Écran de première ouverture »). Fonctions pures, sans
// HealthKit ni SwiftUI : tout ce qui décide de l'écran affiché passe ici, et se teste sans simulateur.
import JogCore

/// Ce que l'app montre. `chargement` ne dure qu'un instant, le temps de lire la dernière Vue au lancement.
enum EtatApp: Equatable {
    case chargement
    /// Aucune autorisation HealthKit demandée : écran d'accueil.
    case premiereOuverture
    /// Premier import, ou synchronisation sans Vue encore affichable. (traitées, total) ; total nul tant qu'on ne sait pas.
    case importEnCours(traitees: Int, total: Int)
    case pret(Vue)
    /// Erreur. La Vue déjà affichée, s'il y en a une, reste visible sous un bandeau.
    case erreur(message: String, vue: Vue?)
}

/// Ce qui arrive à l'app.
enum EvenementApp: Equatable {
    /// Premier affichage : la dernière Vue persistée (nil si aucune) et l'état de l'autorisation.
    case lancement(autorisationDemandee: Bool, vue: Vue?)
    /// La demande d'autorisation HealthKit s'est terminée sans erreur. HealthKit ne dit pas si la lecture est accordée.
    case autorisationAccordee
    case autorisationEchouee(String)
    case progression(traitees: Int, total: Int)
    case vueCalculee(Vue)
    case echec(String)
    case reessayer
}

enum TransitionsApp {
    static func suivant(_ etat: EtatApp, _ evenement: EvenementApp) -> EtatApp {
        switch evenement {
        case let .lancement(autorisationDemandee, vue):
            guard etat == .chargement else { return etat }
            if !autorisationDemandee { return .premiereOuverture }
            if let vue { return .pret(vue) }
            return .importEnCours(traitees: 0, total: 0)

        case .autorisationAccordee:
            guard etat == .premiereOuverture || etat.estErreurSansVue else { return etat }
            return .importEnCours(traitees: 0, total: 0)

        case let .autorisationEchouee(message):
            guard etat == .premiereOuverture || etat.estErreurSansVue else { return etat }
            return .erreur(message: message, vue: nil)

        case let .progression(traitees, total):
            // Pendant une synchronisation sur une Vue déjà affichée, la progression reste silencieuse.
            guard case .importEnCours = etat else { return etat }
            return .importEnCours(traitees: traitees, total: total)

        case let .vueCalculee(vue):
            return .pret(vue)

        case let .echec(message):
            return .erreur(message: message, vue: vue(de: etat))

        case .reessayer:
            guard case let .erreur(_, vue) = etat else { return etat }
            if let vue { return .pret(vue) }
            return .importEnCours(traitees: 0, total: 0)
        }
    }

    /// La Vue à garder à l'écran pendant qu'un autre état s'affiche (bandeau d'erreur), nil si aucune.
    static func vue(de etat: EtatApp) -> Vue? {
        switch etat {
        case let .pret(vue): vue
        case let .erreur(_, vue): vue
        case .chargement, .premiereOuverture, .importEnCours: nil
        }
    }
}

private extension EtatApp {
    /// Une erreur sans Vue derrière elle : l'écran d'erreur seul, dont « Réessayer » relance la demande ou l'import.
    var estErreurSansVue: Bool {
        if case .erreur(_, nil) = self { return true }
        return false
    }
}
