// Validation des paramètres proposés, au moment d'enregistrer (06, « Validation, au moment d'enregistrer »), traduite
// de src/core/validationParametres.ts. Fonction pure. Les règles s'appliquent au jeu de valeurs en vigueur à chaque
// date touchée (06) : pour chaque date d'effet distincte, et pour la première valeur enregistrée (celle qui vaut avant
// toute modification). Ordre : la structure des modifications, puis la règle 1 sur tous les champs, puis les règles
// 3, 2 et 4. Elle rend le premier échec trouvé, avec le champ fautif. Aucune exception n'en sort.
import Foundation

/// Résultat de la validation : `{ ok: true }` ou `{ ok: false, champ, message }` dans le JSON.
public enum ResultatValidation: Codable, Sendable, Equatable {
    case ok
    case echec(champ: String, message: String)

    private enum CodingKeys: String, CodingKey {
        case ok, champ, message
    }

    public init(from decodeur: Decoder) throws {
        let conteneur = try decodeur.container(keyedBy: CodingKeys.self)
        if try conteneur.decode(Bool.self, forKey: .ok) {
            self = .ok
        } else {
            self = .echec(
                champ: try conteneur.decode(String.self, forKey: .champ),
                message: try conteneur.decode(String.self, forKey: .message)
            )
        }
    }

    public func encode(to encodeur: Encoder) throws {
        var conteneur = encodeur.container(keyedBy: CodingKeys.self)
        switch self {
        case .ok:
            try conteneur.encode(true, forKey: .ok)
        case let .echec(champ, message):
            try conteneur.encode(false, forKey: .ok)
            try conteneur.encode(champ, forKey: .champ)
            try conteneur.encode(message, forKey: .message)
        }
    }
}

private let CLES_GLOBAUX: [CleGlobale] = CleGlobale.allCases
private let CLES_DATEES: [CleDatee] = CleDatee.allCases

/// Libellés de 06, « Champs ». Ils servent au message « Valeur manquante ou invalide : {libellé}. ».
public let LIBELLES: [String: String] = [
    "refHr": "FC de référence pour l’allure normalisée",
    "paceHrK": "Coefficient allure ↔ FC",
    "ctlDays": "Forme de fond (CTL)",
    "atlDays": "Fatigue (ATL)",
    "subtPctLo": "Part de sous-seuil, min",
    "subtPctHi": "Part de sous-seuil, max",
    "hrMax": "FC max",
    "hrRest": "FC repos",
    "z1": "Limite haute de la zone 1",
    "z2": "Limite haute de la zone 2",
    "z3": "Limite haute de la zone 3",
    "z4": "Limite haute de la zone 4",
    "lt2Hr": "FC au seuil",
    "lt2Pace": "Allure au seuil",
    "easyCap": "Plafond des footings",
    "subtHrLo": "FC de fin de répétition, bas",
    "subtHrHi": "FC de fin de répétition, haut",
]

/// Messages de 06, « Validation, au moment d'enregistrer », et de sa forme (règles 3 et 4, date d'effet).
public let MESSAGE_FUTUR = "La date d’effet ne peut pas être dans le futur."
/// Ajout à 06 : la spécification ne prévoit pas ce cas.
public let MESSAGE_FORMAT_DATE = "La date d’effet n’est pas une date valide."
public let MESSAGE_FORMAT_ALLURE = "Allure au seuil : utilisez le format m:ss, par exemple 4:02."
public let MESSAGE_PACE_HR_K = "Coefficient allure ↔ FC : choisissez une valeur entre 0,6 et 3."
public let MESSAGE_BORNES = "Chaque borne basse doit être inférieure à la borne haute, et les zones doivent croître."
/// Forme d'une modification : instant d'enregistrement invalide, identifiant absent.
public let MESSAGE_ENREGISTREMENT = "La date d’enregistrement n’est pas valide."
public let MESSAGE_ID_ABSENT = "Identifiant de modification absent."

/// Date antérieure à toute date d'effet : le jeu qu'elle désigne est celui d'avant la première modification.
private let AVANT_TOUT = "0000-01-01"

/// Valide les paramètres proposés, à la date J. Le champ fautif est une clé de paramètre, ou `dateEffet`, ou `id`,
/// ou `enregistreLe`. Pour une paire `a < b` violée, le champ renvoyé est `b` ; pour `z4 < 100`, c'est `z4`.
public func validerParametres(_ proposes: Parametres, _ J: DateCivile) -> ResultatValidation {
    if let structure = verifierStructure(proposes) { return structure }

    for modif in proposes.modifs where modif.dateEffet > J {
        return echec("dateEffet", MESSAGE_FUTUR)
    }

    // Règle 1 sur tous les champs, d'abord : globaux, puis le jeu de chaque date touchée.
    // La structure est vérifiée : l'indexation ne peut plus échouer.
    guard let index = try? indexerParametres(proposes) else {
        return echec("enregistreLe", MESSAGE_ENREGISTREMENT)
    }
    let dates = Array(Set([AVANT_TOUT] + proposes.modifs.map(\.dateEffet))).sorted()
    let jeux = dates.map { (date: $0, jeu: index.auJour($0)) }
    for cle in CLES_GLOBAUX where !estPositif(proposes.globaux[cle]) {
        return manquante(cle.rawValue)
    }
    for (_, jeu) in jeux {
        for cle in CLES_DATEES where !estPositif(jeu[cle]) {
            return manquante(cle.rawValue)
        }
    }

    // Règles 3, 2 et 4, ensuite.
    if proposes.globaux.paceHrK < 0.6 || proposes.globaux.paceHrK > 3 {
        return echec("paceHrK", MESSAGE_PACE_HR_K)
    }
    if !(proposes.globaux.subtPctLo < proposes.globaux.subtPctHi) {
        return echec("subtPctHi", MESSAGE_BORNES)
    }
    for (_, jeu) in jeux {
        if let erreur = validerJeuDate(jeu) { return erreur }
    }
    return .ok
}

/// Règles 2 et 4 appliquées au jeu de valeurs en vigueur à une date (la règle 1 l'a déjà été).
private func validerJeuDate(_ jeu: ParamsDates) -> ResultatValidation? {
    if !estEntier(jeu.lt2Pace) { return echec("lt2Pace", MESSAGE_FORMAT_ALLURE) }
    if !(jeu.subtHrLo < jeu.subtHrHi) { return echec("subtHrHi", MESSAGE_BORNES) }
    if !(jeu.z1 < jeu.z2) { return echec("z2", MESSAGE_BORNES) }
    if !(jeu.z2 < jeu.z3) { return echec("z3", MESSAGE_BORNES) }
    if !(jeu.z3 < jeu.z4) { return echec("z4", MESSAGE_BORNES) }
    if !(jeu.z4 < 100) { return echec("z4", MESSAGE_BORNES) }
    return nil
}

/// Forme des modifications : clé connue, identifiant non vide et unique, valeur de type nombre, instant d'enregistrement
/// valide. Une forme inconnue est refusée avant tout calcul, sans lever d'exception.
private func verifierStructure(_ proposes: Parametres) -> ResultatValidation? {
    var ids = Set<String>()
    for modif in proposes.modifs {
        if !estDateCivile(modif.dateEffet) { return echec("dateEffet", MESSAGE_FORMAT_DATE) }
        guard let cle = CleDatee(rawValue: modif.cle) else {
            return echec(modif.cle, "Paramètre inconnu : \(modif.cle).")
        }
        if modif.id.isEmpty { return echec("id", MESSAGE_ID_ABSENT) }
        if ids.contains(modif.id) { return echec("id", "Identifiant de modification en double : \(modif.id).") }
        ids.insert(modif.id)
        if modif.valeurNonNumerique {
            return echec(cle.rawValue, "Valeur non numérique : \(LIBELLES[cle.rawValue] ?? cle.rawValue).")
        }
        if !instantValide(modif.enregistreLe) { return echec("enregistreLe", MESSAGE_ENREGISTREMENT) }
    }
    return nil
}

private func instantValide(_ valeur: String) -> Bool {
    (try? instantUtc(valeur)) != nil
}

/// Nombre entier au sens de Number.isInteger : fini et sans partie fractionnaire.
private func estEntier(_ valeur: Double) -> Bool {
    valeur.isFinite && valeur.rounded(.towardZero) == valeur
}

private func estPositif(_ valeur: Double) -> Bool {
    valeur.isFinite && valeur > 0
}

private func manquante(_ cle: String) -> ResultatValidation {
    echec(cle, "Valeur manquante ou invalide : \(LIBELLES[cle] ?? cle).")
}

private func echec(_ champ: String, _ message: String) -> ResultatValidation {
    .echec(champ: champ, message: message)
}
