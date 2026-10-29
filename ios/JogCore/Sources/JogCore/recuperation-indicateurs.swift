// Indicateurs de la récupération, R2 (D-023 ; docs/design/04-metriques.md « Indicateurs de récupération (R2) » ;
// docs/design/maquette/recuperation.html, valeurs, détails, explications et repères ; docs/implementation/recuperation.md,
// lot 4). Fonctions pures. Les nombres passent par `formatNombre` et les durées par `formatDuree` ; les comparaisons
// se font après `arrondir` (D-015).
import Foundation

public enum EtatIndicateur: String, Codable, Sendable { case ok, surveiller, alerte, insuffisant, contexte }
public enum CleIndicateur: String, Codable, Sendable { case vfc, fcRepos, sommeil, regularite, respiration }

public struct RepereIndicateur: Codable, Sendable, Equatable {
    public var etat: EtatIndicateur
    public var texte: String

    public init(etat: EtatIndicateur, texte: String) {
        self.etat = etat
        self.texte = texte
    }
}

public struct IndicateurRecuperation: Codable, Sendable, Equatable {
    public var cle: CleIndicateur
    public var nom: String
    public var etat: EtatIndicateur
    public var valeurTexte: String
    public var detail: String
    public var explication: String
    public var reperes: [RepereIndicateur]

    public init(
        cle: CleIndicateur, nom: String, etat: EtatIndicateur, valeurTexte: String, detail: String, explication: String,
        reperes: [RepereIndicateur]
    ) {
        self.cle = cle
        self.nom = nom
        self.etat = etat
        self.valeurTexte = valeurTexte
        self.detail = detail
        self.explication = explication
        self.reperes = reperes
    }
}

/// Valeur absente ou invalide (tiret demi-cadratin, 04 « Données insuffisantes »).
private let TIRET_INDICATEUR = "–"

/// Les cinq indicateurs de R2, dans l'ordre de la maquette : VFC, FC de repos, Sommeil, Régularité, Fréquence
/// respiratoire. `nuits` : nuits de F7(A), les autres sont écartées. `besoin_min` : préférence de l'app (D-023).
/// Chaque indicateur demande au moins 4 nuits dans F7(A), sinon il est « Données insuffisantes ».
public func indicateursRecuperation(
    point p: PointRecuperation, nuits: [NuitResumee], aujourdhui: DateCivile, besoin_min: Double
) throws -> [IndicateurRecuperation] {
    let fin = try numeroJour(aujourdhui)
    var f7: [NuitResumee] = []
    for nuit in nuits {
        let n = try numeroJour(nuit.date)
        if n >= fin - (RECUPERATION.nuitsFenetre - 1) && n <= fin {
            f7.append(nuit)
        }
    }
    return [
        try indicateurVfc(p),
        try indicateurFcRepos(p, nuitsFc: f7.filter { $0.fcSommeil != nil }.count),
        try indicateurSommeil(f7, besoin_min: besoin_min),
        try indicateurRegularite(f7),
        try indicateurRespiration(f7),
    ]
}

private func indicateurVfc(_ p: PointRecuperation) throws -> IndicateurRecuperation {
    let reperes = [
        RepereIndicateur(etat: .ok, texte: "dans la norme ou au-dessus"),
        RepereIndicateur(etat: .surveiller, texte: "sous la norme"),
        RepereIndicateur(etat: .alerte, texte: "sous la norme et FC de repos haute"),
    ]
    let valeur = try valeurAvecUnite(p.vfc7_ms, "ms")
    guard let vfc7 = p.vfc7_ms, let vfcBas = p.vfcBas, let vfcHaut = p.vfcHaut else {
        // Norme absente d'abord, comme pour l'état ; sinon il manque des nuits.
        let explication = p.vfcBas == nil || p.vfcHaut == nil
            ? texteNormeEnCours(p.nuitsNormeVfc)
            : texteManqueDeNuits(p.nuitsFenetreVfc)
        return insuffisant(.vfc, "VFC", valeur: valeur, explication: explication, reperes: reperes)
    }
    let sous = try vfcSousLaNorme(vfc7, vfcBas)
    return IndicateurRecuperation(
        cle: .vfc, nom: "VFC", etat: sous ? .surveiller : .ok, valeurTexte: valeur,
        detail: "7 nuits · norme \(try formatNombre(vfcBas, 0))–\(try formatNombre(vfcHaut, 0))",
        explication: sous
            ? "Sous ta plage habituelle : le système nerveux récupère moins bien que d’ordinaire."
            : "Dans ta plage habituelle.",
        reperes: reperes
    )
}

private func indicateurFcRepos(_ p: PointRecuperation, nuitsFc: Int) throws -> IndicateurRecuperation {
    let reperes = [
        RepereIndicateur(etat: .ok, texte: "dans la norme ou en dessous"),
        RepereIndicateur(etat: .surveiller, texte: "au-dessus de la norme"),
    ]
    let valeur = try valeurAvecUnite(p.fc7, "bpm")
    guard let fc7 = p.fc7, let fcBas = p.fcBas, let fcHaut = p.fcHaut else {
        let explication = p.fcBas == nil || p.fcHaut == nil
            ? texteNormeEnCours(p.nuitsNormeVfc)
            : texteManqueDeNuits(nuitsFc)
        return insuffisant(.fcRepos, "FC de repos", valeur: valeur, explication: explication, reperes: reperes)
    }
    let haute = try fcAuDessusDeLaNorme(fc7, fcHaut)
    return IndicateurRecuperation(
        cle: .fcRepos, nom: "FC de repos", etat: haute ? .surveiller : .ok, valeurTexte: valeur,
        detail: "7 nuits · norme \(try formatNombre(fcBas, 0))–\(try formatNombre(fcHaut, 0))",
        explication: haute
            ? "Plus haute que d’habitude : fatigue, chaleur, alcool ou début de maladie."
            : "Dans ta plage habituelle.",
        reperes: reperes
    )
}

private func indicateurSommeil(_ f7: [NuitResumee], besoin_min: Double) throws -> IndicateurRecuperation {
    let reperes = [
        RepereIndicateur(etat: .ok, texte: "moins de 45 min sous le besoin"),
        RepereIndicateur(etat: .surveiller, texte: "45 min ou plus sous le besoin"),
    ]
    let durees = f7.map(\.sommeil_min)
    guard durees.count >= RECUPERATION.minNuitsFenetre else {
        return insuffisant(.sommeil, "Sommeil", valeur: TIRET_INDICATEUR, explication: texteManqueDeNuits(durees.count), reperes: reperes)
    }
    let moyenne = moyenneIndicateurs(durees)
    let ecart = besoin_min - moyenne
    // Seuil de 45 min comparé après arrondi à la minute (D-015).
    let surveiller = try arrondir(ecart, 1) >= RECUPERATION.sommeilSurveiller_min
    return IndicateurRecuperation(
        cle: .sommeil, nom: "Sommeil", etat: surveiller ? .surveiller : .ok, valeurTexte: formatDuree(moyenne),
        detail: "moy. 7 nuits · besoin \(formatDuree(besoin_min))",
        explication: surveiller
            ? "En moyenne \(try formatNombre(ecart, 0)) min de moins que ton besoin, chaque nuit."
            : "Proche de ton besoin de sommeil.",
        reperes: reperes
    )
}

private func indicateurRegularite(_ f7: [NuitResumee]) throws -> IndicateurRecuperation {
    let reperes = [
        RepereIndicateur(etat: .ok, texte: "≤ 45 min"),
        RepereIndicateur(etat: .surveiller, texte: "> 45 min"),
    ]
    let couchers = f7.map(\.coucher_min)
    guard couchers.count >= RECUPERATION.minNuitsFenetre else {
        return insuffisant(.regularite, "Régularité", valeur: TIRET_INDICATEUR, explication: texteManqueDeNuits(couchers.count), reperes: reperes)
    }
    let sigma = ecartTypeIndicateurs(couchers)
    // Seuil de 45 min comparé après arrondi à la minute (D-015).
    let surveiller = try arrondir(sigma, 1) > RECUPERATION.regulariteSurveiller_min
    return IndicateurRecuperation(
        cle: .regularite, nom: "Régularité", etat: surveiller ? .surveiller : .ok,
        valeurTexte: "± \(try formatNombre(sigma, 0)) min",
        detail: "heure de coucher, 7 nuits",
        explication: "Écart type de l’heure d’endormissement. Un horaire régulier aide la récupération.",
        reperes: reperes
    )
}

private func indicateurRespiration(_ f7: [NuitResumee]) throws -> IndicateurRecuperation {
    let respirations = f7.compactMap { $0.respiration }
    guard respirations.count >= RECUPERATION.minNuitsFenetre else {
        return insuffisant(.respiration, "Fréquence respiratoire", valeur: TIRET_INDICATEUR, explication: texteManqueDeNuits(respirations.count), reperes: [])
    }
    // Contexte, sans état ni repère (04 R2).
    return IndicateurRecuperation(
        cle: .respiration, nom: "Fréquence respiratoire", etat: .contexte,
        valeurTexte: "\(try formatNombre(moyenneIndicateurs(respirations), 1)) /min",
        detail: "pendant le sommeil",
        explication: "Très stable d’une nuit à l’autre. Une hausse durable de plus de 1 /min accompagne souvent une maladie.",
        reperes: []
    )
}

/// Valeur entière suivie de son unité, ou le tiret si la valeur manque.
private func valeurAvecUnite(_ valeur: Double?, _ unite: String) throws -> String {
    guard let valeur else { return TIRET_INDICATEUR }
    return "\(try formatNombre(valeur, 0)) \(unite)"
}

private func insuffisant(
    _ cle: CleIndicateur, _ nom: String, valeur: String, explication: String, reperes: [RepereIndicateur]
) -> IndicateurRecuperation {
    IndicateurRecuperation(
        cle: cle, nom: nom, etat: .insuffisant, valeurTexte: valeur, detail: "", explication: explication, reperes: reperes
    )
}

/// Moyenne arithmétique d'une liste non vide.
private func moyenneIndicateurs(_ valeurs: [Double]) -> Double {
    valeurs.reduce(0, +) / Double(valeurs.count)
}

/// Écart-type de population d'une liste non vide.
private func ecartTypeIndicateurs(_ valeurs: [Double]) -> Double {
    let m = moyenneIndicateurs(valeurs)
    return (valeurs.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(valeurs.count)).squareRoot()
}
