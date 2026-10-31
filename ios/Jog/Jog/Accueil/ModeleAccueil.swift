// Modèle pur de l'onglet Aujourd'hui (02, « Contenu par onglet » ; 03, N1, A5, A2, S1 ; D-024 ; point de décision 8 ;
// docs/implementation/refonte-accueil.md, lot 18). Aucun import SwiftUI : l'ordre des blocs, les sections par semaine, les
// mois du sélecteur et les destinations se testent sans interface. Les calculs restent dans JogCore et dans les modèles.
import Foundation
import JogCore

enum ModeleAccueil {
    /// Les blocs d'Aujourd'hui, dans l'ordre fixe de 02 : il ne change jamais, avec ou sans séance du jour, avec ou sans nuit.
    enum Bloc: Hashable {
        /// Sans aucune séance : le message d'accueil, avant les cartes.
        case sansDonnees, niveau, recuperation, volume, semaines
    }

    static let ordre: [Bloc] = [.niveau, .recuperation, .volume, .semaines]

    /// Les blocs à afficher, dans l'ordre de `ordre` ; le message sans donnée passe en tête quand la Vue n'a aucune séance.
    /// Ni la séance du jour ni la nuit n'entrent dans ce calcul : seul leur contenu change.
    static func blocs(sansDonnees: Bool) -> [Bloc] {
        sansDonnees ? [.sansDonnees] + ordre : ordre
    }

    /// Ce qu'un élément de l'accueil ouvre (02, « Écrans de détail » ; 03).
    enum Element: Equatable {
        /// La carte Niveau (N1) : Courses.
        case niveau
        /// La carte Récupération (A5) : l'écran Récupération.
        case recuperation
        /// La pastille du verdict (A2) : la Décision.
        case verdict
        /// En-tête d'une semaine (S1) : le détail de la semaine, lundi en identifiant (point de décision 8).
        case entete(DateCivile)
        /// Carte d'une séance (S2) : l'écran Séance.
        case seance(String)
    }

    static func destination(de element: Element) -> Destination {
        switch element {
        case .niveau: .courses
        case .recuperation: .recuperation
        case .verdict: .decision
        case let .entete(lundi): .semaine(lundi: lundi)
        case let .seance(cleSource): .seance(cleSource: cleSource)
        }
    }

    /// Une semaine de S1 prête à afficher : son en-tête épinglé, puis ses cartes de séance, la plus récente d'abord.
    struct SectionSemaine: Identifiable, Equatable {
        let id: DateCivile
        let entete: ModeleSeances.EnTete
        let cartes: [ModeleSeances.Carte]
    }

    /// Une semaine à laquelle sauter depuis le sélecteur de mois : le mois, son titre, et la section de sa semaine la plus récente.
    struct Mois: Identifiable, Equatable {
        let id: String
        let titre: String
        let cible: DateCivile
    }

    /// Une section par semaine, dans l'ordre reçu (le plus récent d'abord). Chaque carte est mise en forme à partir de
    /// `cartes` (calculées par JogCore) ; une séance sans carte est omise.
    static func sections(
        semaines: [SemaineAccueil], seances: [SeanceVue], cartes: [String: CarteSeance], J: DateCivile, fuseau: TimeZone
    ) -> [SectionSemaine] {
        var parCle: [String: SeanceVue] = [:]
        for seance in seances where parCle[seance.cleSource] == nil {
            parCle[seance.cleSource] = seance
        }
        return semaines.map { semaine in
            let cartesSemaine = semaine.seances.compactMap { cle -> ModeleSeances.Carte? in
                guard let seance = parCle[cle], let carte = cartes[cle] else { return nil }
                return ModeleSeances.carte(seance, carte, J: J, fuseau: fuseau)
            }
            return SectionSemaine(
                id: semaine.lundi,
                entete: ModeleSeances.enTete(semaine, J: J, seances: seances),
                cartes: cartesSemaine
            )
        }
    }

    /// Les semaines à afficher. Sans aucune séance, la semaine en cours reste seule : elle dit « aucune séance » (03, S1).
    static func semainesAffichees(_ semaines: [SemaineAccueil], lundiDeA: DateCivile) -> [SemaineAccueil] {
        guard semaines.isEmpty else { return semaines }
        return [SemaineAccueil(
            lundi: lundiDeA, enCours: true, km: 0, min: 0, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0),
            nbSeances: 0, nbSousSeuil: 0, minSS: 0, partSS: nil, seances: [], courses: []
        )]
    }

    /// Le sélecteur de mois (02, point de décision 8) : un mois par entrée, du plus récent, qui saute à sa semaine la plus
    /// récente (la première section du mois, puisque les sections sont du plus récent au plus ancien).
    static func mois(_ sections: [SectionSemaine]) -> [Mois] {
        var resultat: [Mois] = []
        for section in sections {
            let cle = String(section.id.prefix(7))
            guard resultat.last?.id != cle else { continue }
            resultat.append(Mois(id: cle, titre: ModeleHistorique.titreMois(section.id), cible: section.id))
        }
        return resultat
    }
}
