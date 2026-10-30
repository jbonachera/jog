// Vue de la récupération (D-023 ; docs/implementation/recuperation.md, lot 5). Pour le jour A (J−1) : la série de 182
// dates, le point du jour, les nuits des 14 derniers jours (R5), la session de A (hypnogramme) et les 16 semaines (R6).
// Fonction pure, appelée par `assemblerVue`. Sans nuit mesurée, il n'y a pas de VueRecuperation (nil).
import Foundation

/// Nuits affichées par R5 : A−13 à A.
private let NUITS_VUE_JOURS = 14

/// Bloc « Récupération » de la Vue (D-023). Les nombres sont arrondis à 4 décimales dans la Vue finale (vue.swift) ;
/// l'état, le titre et la phrase sont calculés avant, sur les valeurs brutes (D-015).
public struct VueRecuperation: Codable, Sendable, Equatable {
    /// Jour A : la dernière journée close (J−1).
    public var aujourdhui: DateCivile
    public var etat: EtatRecuperation
    public var titre: String
    public var phrase: String
    /// Ce matin : la nuit de A (= `serie.last`).
    public var point: PointRecuperation
    /// 182 points, de A−181 à A.
    public var serie: [PointRecuperation]
    /// Nuits de A−13 à A, de la plus ancienne à la plus récente.
    public var nuits: [NuitResumee]
    /// Session de A seulement (hypnogramme) ; nil si la dernière session n'est pas de A.
    public var derniereSession: SessionSommeil?
    /// 16 semaines, de la plus ancienne à la semaine de A.
    public var semaines: [SemaineRecuperation]
    /// Milieu de la norme VFC à chaque dimanche de la fenêtre des 450 nuits qui a une norme (lot 9 ; 04, « Six qualités » :
    /// la Résilience). Vide sans norme.
    public var milieuxNormeVFC: [PointNormeVFC]

    public init(
        aujourdhui: DateCivile, etat: EtatRecuperation, titre: String, phrase: String, point: PointRecuperation,
        serie: [PointRecuperation], nuits: [NuitResumee], derniereSession: SessionSommeil?, semaines: [SemaineRecuperation],
        milieuxNormeVFC: [PointNormeVFC]
    ) {
        self.aujourdhui = aujourdhui
        self.etat = etat
        self.titre = titre
        self.phrase = phrase
        self.point = point
        self.serie = serie
        self.nuits = nuits
        self.derniereSession = derniereSession
        self.semaines = semaines
        self.milieuxNormeVFC = milieuxNormeVFC
    }
}

/// Bloc de récupération de la Vue au jour `aujourdhui` (A). Rend nil quand aucune nuit n'est mesurée (VFC) sur les
/// `RECUPERATION.nuitsLues` dernières dates : le signal n'existe pas (recuperation.md, lot 6). `derniereSession` n'est
/// gardée que si sa date est A. Lève RangeError ou ErreurFusionNuits si une date est invalide ou en double.
public func calculerRecuperation(
    _ nuits: [NuitResumee], derniereSession: SessionSommeil?, aujourdhui: DateCivile
) throws -> VueRecuperation? {
    let fin = try numeroJour(aujourdhui)
    let debutLus = fin - (RECUPERATION.nuitsLues - 1)
    let mesurees = try nuits.contains { nuit in
        guard nuit.vfcLn != nil else { return false }
        let n = try numeroJour(nuit.date)
        return n >= debutLus && n <= fin
    }
    guard mesurees else { return nil }

    // La série des 450 nuits lues ; les 182 derniers jours en forment `serie` (chaque point ne dépend que de son jour).
    let serieLue = try serieRecuperation(
        nuits, du: try ajouterJours(aujourdhui, -(RECUPERATION.nuitsLues - 1)), au: aujourdhui
    )
    let serie = Array(serieLue.suffix(RECUPERATION.nuitsSerie))
    guard let point = serie.last else { return nil }
    // Résilience (04, « Six qualités ») : le milieu de la norme à chaque dimanche qui en a une (lot 9).
    let milieux = try serieLue.compactMap { jour -> PointNormeVFC? in
        guard let milieu = jour.vfcMilieu, try jourDeSemaine(jour.date) == 6 else { return nil }
        return PointNormeVFC(date: jour.date, milieu_ms: milieu)
    }
    let etat = try etatRecuperation(point)

    let debutNuits = try ajouterJours(aujourdhui, -(NUITS_VUE_JOURS - 1))
    let nuitsVue = nuits.filter { $0.date >= debutNuits && $0.date <= aujourdhui }

    return VueRecuperation(
        aujourdhui: aujourdhui,
        etat: etat,
        titre: titreEtatRecuperation(etat),
        phrase: try phraseRecuperation(etat, point: point),
        point: point,
        serie: serie,
        nuits: nuitsVue,
        derniereSession: derniereSession?.date == aujourdhui ? derniereSession : nil,
        semaines: try semainesRecuperation(serie, aujourdhui: aujourdhui),
        milieuxNormeVFC: milieux
    )
}
