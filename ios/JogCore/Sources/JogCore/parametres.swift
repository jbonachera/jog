// Paramètres datés et globaux (06, D-006, ADR 0005), traduits de src/core/parametres.ts.
// Une clé de paramètre daté (`keyof ParamsDates` en TypeScript) est `CleDatee`. La clé d'une modification reste une
// chaîne (`ModifDatee.cle`) : une clé inconnue est décodée, puis refusée par la validation (06).

/// Clés des paramètres datés, dans l'ordre de CLES_DATEES (parametres.ts et validationParametres.ts).
public enum CleDatee: String, Codable, Sendable, Equatable, CaseIterable {
    case hrMax, hrRest, z1, z2, z3, z4, lt2Hr, lt2Pace, easyCap, subtHrLo, subtHrHi
}

/// Clés des paramètres globaux.
public enum CleGlobale: String, Codable, Sendable, Equatable, CaseIterable {
    case refHr, paceHrK, ctlDays, atlDays, subtPctLo, subtPctHi
}

// Défauts de 06, « Champs ».
private let DATES_PAR_DEFAUT = ParamsDates(
    hrMax: 188, hrRest: 46, z1: 68, z2: 78, z3: 85, z4: 92, lt2Hr: 172, lt2Pace: 238, easyCap: 140,
    subtHrLo: 160, subtHrHi: 168
)

private let GLOBAUX_PAR_DEFAUT = ParamsGlobaux(
    refHr: 164, paceHrK: 1.1, ctlDays: 42, atlDays: 7, subtPctLo: 20, subtPctHi: 25
)

extension ParamsDates {
    /// Valeur d'un paramètre daté.
    public subscript(cle: CleDatee) -> Double {
        get {
            switch cle {
            case .hrMax: hrMax
            case .hrRest: hrRest
            case .z1: z1
            case .z2: z2
            case .z3: z3
            case .z4: z4
            case .lt2Hr: lt2Hr
            case .lt2Pace: lt2Pace
            case .easyCap: easyCap
            case .subtHrLo: subtHrLo
            case .subtHrHi: subtHrHi
            }
        }
        set {
            switch cle {
            case .hrMax: hrMax = newValue
            case .hrRest: hrRest = newValue
            case .z1: z1 = newValue
            case .z2: z2 = newValue
            case .z3: z3 = newValue
            case .z4: z4 = newValue
            case .lt2Hr: lt2Hr = newValue
            case .lt2Pace: lt2Pace = newValue
            case .easyCap: easyCap = newValue
            case .subtHrLo: subtHrLo = newValue
            case .subtHrHi: subtHrHi = newValue
            }
        }
    }
}

extension ParamsGlobaux {
    /// Valeur d'un paramètre global.
    public subscript(cle: CleGlobale) -> Double {
        get {
            switch cle {
            case .refHr: refHr
            case .paceHrK: paceHrK
            case .ctlDays: ctlDays
            case .atlDays: atlDays
            case .subtPctLo: subtPctLo
            case .subtPctHi: subtPctHi
            }
        }
        set {
            switch cle {
            case .refHr: refHr = newValue
            case .paceHrK: paceHrK = newValue
            case .ctlDays: ctlDays = newValue
            case .atlDays: atlDays = newValue
            case .subtPctLo: subtPctLo = newValue
            case .subtPctHi: subtPctHi = newValue
            }
        }
    }
}

/// Paramètres par défaut : valeurs globales de 06 et aucune modification.
public func parametresDefaut() -> Parametres {
    Parametres(globaux: GLOBAUX_PAR_DEFAUT, modifs: [])
}

/// Un index des modifications, prêt à répondre pour une date donnée (ADR 0006).
public struct IndexParametres: Sendable {
    /// Modifications par paramètre, triées par (date d'effet, instant, identifiant).
    fileprivate let parCle: [CleDatee: [ModifIndexee]]

    /// Jeu des paramètres datés en vigueur à une date (D-006).
    public func auJour(_ date: DateCivile) -> ParamsDates {
        var resultat = DATES_PAR_DEFAUT
        for cle in CleDatee.allCases {
            guard let groupe = parCle[cle], let valeur = valeurEnVigueur(groupe, date) else { continue }
            resultat[cle] = valeur
        }
        return resultat
    }
}

/// Une modification et son instant d'enregistrement en millisecondes UTC.
fileprivate struct ModifIndexee: Sendable {
    let modif: ModifDatee
    let instant: Double
}

/// Indexe les modifications par paramètre, triées une seule fois. Chaque lecture est une recherche binaire.
/// Les clés inconnues sont ignorées (la validation les refuse). Lève RangeError sur une date ou un instant invalide.
public func indexerParametres(_ params: Parametres) throws -> IndexParametres {
    var parCle: [CleDatee: [ModifIndexee]] = [:]
    for modif in params.modifs {
        _ = try decomposerDate(modif.dateEffet)
        let indexee = ModifIndexee(modif: modif, instant: try instantUtc(modif.enregistreLe))
        guard let cle = CleDatee(rawValue: modif.cle) else { continue }
        parCle[cle, default: []].append(indexee)
    }
    for cle in parCle.keys {
        parCle[cle]?.sort(by: ordreChronologique)
    }
    return IndexParametres(parCle: parCle)
}

/// Valeurs des paramètres datés en vigueur à un jour donné (D-006, ADR 0005). La valeur retenue est celle de la
/// dernière modification dont la date d'effet est ≤ au jour. Avant la première modification, c'est la première
/// valeur qui s'applique. À même date d'effet, la modification enregistrée la plus récente l'emporte.
public func parametresAuJour(_ params: Parametres, _ date: DateCivile) throws -> ParamsDates {
    try indexerParametres(params).auJour(date)
}

/// Le groupe est trié. On cherche la dernière modification dont la date d'effet est ≤ au jour ; s'il n'y en a
/// aucune, c'est la première (D-006).
private func valeurEnVigueur(_ groupe: [ModifIndexee], _ date: DateCivile) -> Double? {
    var bas = 0
    var haut = groupe.count
    while bas < haut {
        let milieu = (bas + haut) >> 1
        if groupe[milieu].modif.dateEffet <= date {
            bas = milieu + 1
        } else {
            haut = milieu
        }
    }
    return groupe.isEmpty ? nil : groupe[max(bas - 1, 0)].modif.valeur
}

private func ordreChronologique(_ a: ModifIndexee, _ b: ModifIndexee) -> Bool {
    comparerChaines(a.modif.dateEffet, b.modif.dateEffet, a.instant, b.instant, a.modif.id, b.modif.id) < 0
}

/// Comparaison lexicographique de (date d'effet, instant, identifiant). Renvoie −1, 0 ou 1.
private func comparerChaines(_ dateA: String, _ dateB: String, _ instantA: Double, _ instantB: Double, _ idA: String, _ idB: String) -> Int {
    if dateA != dateB { return dateA < dateB ? -1 : 1 }
    if instantA != instantB { return instantA < instantB ? -1 : 1 }
    if idA != idB { return idA < idB ? -1 : 1 }
    return 0
}

/// Une modification de l'historique affiché par 06 : « ancienne → nouvelle valeur » (ancienne nulle pour la première).
public struct ModificationHistorique: Codable, Sendable, Equatable {
    public var id: String
    public var cle: String
    public var dateEffet: DateCivile
    @ChampNul public var ancienne: Double?
    @NombreOuNaN public var nouvelle: Double
    public var enregistreLe: String

    public init(id: String, cle: String, dateEffet: DateCivile, ancienne: Double?, nouvelle: Double, enregistreLe: String) {
        self.id = id
        self.cle = cle
        self.dateEffet = dateEffet
        self.ancienne = ancienne
        self.nouvelle = nouvelle
        self.enregistreLe = enregistreLe
    }
}

/// Les modifications triées par (paramètre, date d'effet, instant d'enregistrement, identifiant). L'instant se compare
/// en instants, non en texte. Les copies rendues ne partagent rien avec l'entrée.
public func trierModifs(_ modifs: [ModifDatee]) throws -> [ModifDatee] {
    let indexees = try modifs.enumerated().map { (indice: $0.offset, modif: $0.element, instant: try instantUtc($0.element.enregistreLe)) }
    return indexees.sorted { a, b in
        let cle = comparerTexte(a.modif.cle, b.modif.cle)
        if cle != 0 { return cle < 0 }
        let date = comparerTexte(a.modif.dateEffet, b.modif.dateEffet)
        if date != 0 { return date < 0 }
        if a.instant != b.instant { return a.instant < b.instant }
        let id = comparerTexte(a.modif.id, b.modif.id)
        if id != 0 { return id < 0 }
        return a.indice < b.indice // ordre d'entrée à égalité, comme Array.prototype.sort de JavaScript
    }.map(\.modif)
}

/// Historique des modifications pour l'affichage de 06 (D-006). `ancienne` est la valeur de la modification précédente
/// du même paramètre, dans l'ordre de `trierModifs` ; elle est nulle pour la première. La liste va de la date d'effet
/// la plus récente à la plus ancienne.
public func historiqueModifications(_ params: Parametres) throws -> [ModificationHistorique] {
    var precedente: [String: Double] = [:]
    let historique = try trierModifs(params.modifs).map { modif -> ModificationHistorique in
        let ancienne = precedente[modif.cle]
        precedente[modif.cle] = modif.valeur
        return ModificationHistorique(
            id: modif.id, cle: modif.cle, dateEffet: modif.dateEffet, ancienne: ancienne,
            nouvelle: modif.valeur, enregistreLe: modif.enregistreLe
        )
    }
    let indexees = try historique.enumerated().map { (indice: $0.offset, valeur: $0.element, instant: try instantUtc($0.element.enregistreLe)) }
    return indexees.sorted { a, b in
        let date = comparerTexte(b.valeur.dateEffet, a.valeur.dateEffet)
        if date != 0 { return date < 0 }
        if a.instant != b.instant { return b.instant < a.instant }
        let id = comparerTexte(b.valeur.id, a.valeur.id)
        if id != 0 { return id < 0 }
        return a.indice < b.indice
    }.map(\.valeur)
}

private func comparerTexte(_ a: String, _ b: String) -> Int {
    a < b ? -1 : (a > b ? 1 : 0)
}
