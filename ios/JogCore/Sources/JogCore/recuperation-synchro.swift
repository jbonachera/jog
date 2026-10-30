// Synchronisation des nuits de la récupération (D-023 ; docs/implementation/recuperation.md, lot 7). Lit le sommeil, la
// VFC, la respiration et la FC de chaque session depuis une source (HealthKit dans l'app, un faux dans les tests), résume
// les nuits, les fusionne avec celles déjà mémorisées et les range dans le moteur. Lecture bornée : jusqu'à 450 nuits
// la première fois (lot 9), puis les 3 dernières à chaque synchronisation. La FC moyenne se lit par session, jamais sur la plage.
import Foundation

/// Requêtes de FC moyenne en parallèle, au plus.
private let REQUETES_FC_SIMULTANEES = 8

/// La fenêtre de lecture n'a pas pu être convertie en instant (ne devrait pas arriver avec une date civile valide).
public struct ErreurFenetreNuits: Error, Sendable, Equatable {
    public init() {}
}

/// Relevé des nuits, tel que stocké dans `nuits.json` (D-023). `derniereSession` alimente l'hypnogramme de la Vue.
/// `version` est `VERSION_RECUPERATION` : un relevé d'une autre version est traité comme absent (relecture complète).
public struct ReleveNuits: Codable, Sendable, Equatable {
    public var version: Int
    public var nuits: [NuitResumee]
    public var derniereSession: SessionSommeil?

    public init(version: Int, nuits: [NuitResumee], derniereSession: SessionSommeil?) {
        self.version = version
        self.nuits = nuits
        self.derniereSession = derniereSession
    }
}

/// Source des nuits : HealthKit dans l'app, un faux dans les tests. Chaque lecture porte sur une plage bornée.
public protocol SourceNuits: Sendable {
    func echantillonsSommeil(du debut: Date, au fin: Date) async throws -> [EchantillonSommeilBrut]
    func mesuresVFC(du debut: Date, au fin: Date) async throws -> [MesureNocturneBrute]
    func mesuresRespiration(du debut: Date, au fin: Date) async throws -> [MesureNocturneBrute]
    func fcMoyenne(du debut: Date, au fin: Date) async throws -> Double?
}

/// Lit les nuits depuis la source, les résume et les range dans le moteur (lot 7).
public actor SynchroniseurNuits {
    private let source: any SourceNuits
    private let moteur: Moteur

    public init(source: any SourceNuits, moteur: Moteur) {
        self.source = source
        self.moteur = moteur
    }

    /// Rend vrai si les nuits du moteur ont changé. Sans changement, rien n'est réécrit.
    public func synchroniser(maintenant: Date = Date(), fuseau: TimeZone = .current) async throws -> Bool {
        let aujourdhui = moteur.jourCourant(maintenant: maintenant, fuseau: fuseau)
        let releve = try await moteur.releveNuits()
        let depuis = try debutFenetre(releve, aujourdhui: aujourdhui)
        let debut = try debutDeLecture(depuis, fuseau: fuseau)

        let echantillons = try await source.echantillonsSommeil(du: debut, au: maintenant)
        // Une session qui commence avant `depuis` n'est lue qu'en partie : sa nuit est déjà mémorisée, on ne la retient pas.
        let sessions = sessionsDeSommeil(echantillons, fuseau: fuseau).filter { $0.date >= depuis }
        let fc = try await fcMoyennes(sessions)
        let vfc = try await source.mesuresVFC(du: debut, au: maintenant)
        let respiration = try await source.mesuresRespiration(du: debut, au: maintenant)

        let relues = resumerNuits(sessions, vfc: vfc, fcMoyenne: fc, respiration: respiration)
        let fusionnees = try fusionnerNuits(releve?.nuits ?? [], relues, depuis: depuis, aujourdhui: aujourdhui)
        return try await moteur.remplacerNuits(ReleveNuits(
            version: VERSION_RECUPERATION, nuits: fusionnees, derniereSession: sessions.last
        ))
    }

    /// Premier jour lu : A−449 sans relevé valide, sinon la dernière nuit mémorisée − 2, sans jamais passer avant A−449.
    private func debutFenetre(_ releve: ReleveNuits?, aujourdhui: DateCivile) throws -> DateCivile {
        let plusAncien = try ajouterJours(aujourdhui, -(RECUPERATION.nuitsLues - 1))
        guard let derniere = releve?.nuits.last?.date else { return plusAncien }
        let relue = try ajouterJours(derniere, -(RECUPERATION.nuitsRelues - 1))
        return max(relue, plusAncien)
    }

    /// 18 h locale la veille du premier jour lu : la même référence que `coucher_min` (recuperation-sessions).
    private func debutDeLecture(_ depuis: DateCivile, fuseau: TimeZone) throws -> Date {
        guard let ms = dixHuitHeuresLaVeille(depuis, fuseau) else { throw ErreurFenetreNuits() }
        return Date(timeIntervalSince1970: ms / 1000)
    }

    /// Une requête de FC moyenne par session, sur la session seule, au plus `REQUETES_FC_SIMULTANEES` à la fois.
    private func fcMoyennes(_ sessions: [SessionSommeil]) async throws -> [DateCivile: Double] {
        var resultat: [DateCivile: Double] = [:]
        for lot in decoupeEnLots(sessions, taille: REQUETES_FC_SIMULTANEES) {
            let source = self.source
            let lues = try await withThrowingTaskGroup(of: (DateCivile, Double?).self) { groupe in
                for session in lot {
                    groupe.addTask {
                        let debut = Date(timeIntervalSince1970: session.debutUtc_ms / 1000)
                        let fin = Date(timeIntervalSince1970: session.finUtc_ms / 1000)
                        return (session.date, try await source.fcMoyenne(du: debut, au: fin))
                    }
                }
                var couples: [(DateCivile, Double?)] = []
                for try await couple in groupe {
                    couples.append(couple)
                }
                return couples
            }
            for (date, valeur) in lues {
                if let valeur {
                    resultat[date] = valeur
                }
            }
        }
        return resultat
    }
}
