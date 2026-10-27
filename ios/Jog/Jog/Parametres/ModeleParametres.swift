// Logique de la feuille Paramètres (06, D-006, D-016, D-017, D-019), sans SwiftUI : brouillon de saisie, conversion
// m:ss, construction et validation des paramètres à enregistrer (JogCore), suggestion de FC max, état des données.
// Tout ce qui se calcule est fait par JogCore ; ici on ne fait que traduire entre la saisie et les types du moteur.
import Foundation
import JogCore

/// Clé UserDefaults de « Ignorer » (D-019) : `cleSource:bpm`, propre à l'appareil.
let CLE_HRMAX_IGNOREE = "jog-hrmax-ignoree"

/// Un champ de la feuille : un paramètre daté (mesure de l'athlète) ou global (référence, constante du modèle).
enum ChampParametre: Hashable, Sendable {
    case datee(CleDatee)
    case globale(CleGlobale)

    /// Les champs par groupe, dans l'ordre de 06.
    static let groupesSeuil: [[ChampParametre]] = [
        [.datee(.hrMax), .datee(.hrRest), .datee(.easyCap)],
        [.datee(.lt2Hr), .datee(.lt2Pace), .globale(.refHr), .globale(.paceHrK)],
        [.datee(.subtHrLo), .datee(.subtHrHi), .globale(.subtPctLo), .globale(.subtPctHi)],
        [.datee(.z1), .datee(.z2), .datee(.z3), .datee(.z4)],
        [.globale(.ctlDays), .globale(.atlDays)],
    ]

    /// Clé telle que JogCore la nomme (validation, historique).
    init?(cle: String) {
        if let datee = CleDatee(rawValue: cle) {
            self = .datee(datee)
        } else if let globale = CleGlobale(rawValue: cle) {
            self = .globale(globale)
        } else {
            return nil
        }
    }

    var cle: String {
        switch self {
        case .datee(let c): c.rawValue
        case .globale(let c): c.rawValue
        }
    }

    /// Libellé de 06, « Champs ».
    var libelle: String {
        switch self {
        case .datee(.hrMax): "FC max"
        case .datee(.hrRest): "FC repos"
        case .datee(.easyCap): "Plafond des footings"
        case .datee(.lt2Hr): "FC au seuil"
        case .datee(.lt2Pace): "Allure au seuil"
        case .datee(.subtHrLo): "FC de fin de répétition, bas"
        case .datee(.subtHrHi): "FC de fin de répétition, haut"
        case .datee(.z1): "Zone 1, limite haute"
        case .datee(.z2): "Zone 2, limite haute"
        case .datee(.z3): "Zone 3, limite haute"
        case .datee(.z4): "Zone 4, limite haute"
        case .globale(.refHr): "FC de référence pour l’allure normalisée"
        case .globale(.paceHrK): "Coefficient allure ↔ FC"
        case .globale(.subtPctLo): "Part de sous-seuil, min"
        case .globale(.subtPctHi): "Part de sous-seuil, max"
        case .globale(.ctlDays): "Forme de fond (CTL)"
        case .globale(.atlDays): "Fatigue (ATL)"
        }
    }

    var unite: String {
        switch self {
        case .datee(.lt2Pace): "/km"
        case .datee(.z1), .datee(.z2), .datee(.z3), .datee(.z4): "% FC max"
        case .globale(.paceHrK): "s/km par bpm"
        case .globale(.subtPctLo), .globale(.subtPctHi): "%"
        case .globale(.ctlDays), .globale(.atlDays): "jours"
        case .datee(.hrMax), .datee(.hrRest), .datee(.easyCap), .datee(.lt2Hr), .datee(.subtHrLo), .datee(.subtHrHi),
             .globale(.refHr):
            "bpm"
        }
    }

    /// Valeur affichée avec son unité (historique, valeur en vigueur à J−1).
    func affiche(_ valeur: Double) -> String {
        if case .datee(.lt2Pace) = self {
            return "\(formatAllure(valeur)) /km"
        }
        return "\(texteNombre(valeur)) \(unite)"
    }
}

// MARK: - Saisie

/// Nombre tel qu'on le lit en français : virgule décimale, sans zéro inutile.
func texteNombre(_ valeur: Double) -> String {
    guard valeur.isFinite else { return "" }
    if valeur == valeur.rounded(), abs(valeur) < 1e15 {
        return String(Int(valeur))
    }
    return String(valeur).replacingOccurrences(of: ".", with: ",")
}

/// Espaces tolérées dans un nombre tapé : séparateurs de milliers, espaces fines et insécables comprises.
private let ESPACES_NOMBRE: Set<Character> = [" ", "\u{00A0}", "\u{202F}", "\u{2009}"]
/// Caractères d'un nombre tapé : chiffres, signe, virgule ou point. Rien d'autre (ni « 0x », ni « e », ni « inf »).
private let CARACTERES_NOMBRE: Set<Character> = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "-", ",", "."]

/// Lit un nombre tapé, en virgule ou en point. NaN si la saisie n'est pas un nombre décimal : un caractère hors de
/// `CARACTERES_NOMBRE`, un signe ailleurs qu'en tête, plus d'un séparateur décimal, ou aucun chiffre. La validation
/// signale alors le champ comme manquant ou invalide (06, règle 1).
func lireNombre(_ texte: String) -> Double {
    var propre = ""
    for caractere in texte where !ESPACES_NOMBRE.contains(caractere) {
        guard CARACTERES_NOMBRE.contains(caractere) else { return .nan }
        propre.append(caractere)
    }
    var corps = Substring(propre)
    if let signe = corps.first, signe == "+" || signe == "-" {
        corps = corps.dropFirst()
    }
    let separateurs = corps.filter { $0 == "," || $0 == "." }.count
    let chiffres = corps.count - separateurs
    guard separateurs <= 1, chiffres > 0, !corps.contains("+"), !corps.contains("-") else { return .nan }
    return Double(propre.replacingOccurrences(of: ",", with: ".")) ?? .nan
}

/// Allure au seuil tapée en m:ss (« 4:02 ») : secondes par km, ou nil si le format n'est pas m:ss (06).
func secondesDepuisAllure(_ texte: String) -> Double? {
    let morceaux = texte.trimmingCharacters(in: .whitespaces).split(separator: ":", omittingEmptySubsequences: false)
    guard morceaux.count == 2,
          !morceaux[0].isEmpty, morceaux[0].allSatisfy({ $0.isASCII && $0.isNumber }),
          morceaux[1].count == 2, morceaux[1].allSatisfy({ $0.isASCII && $0.isNumber }),
          let minutes = Int(morceaux[0]), let secondes = Int(morceaux[1]), secondes < 60
    else { return nil }
    return Double(minutes * 60 + secondes)
}

/// Valeurs par défaut de 06 : le jeu daté et le jeu global. Sans modification, `parametresAuJour` ne lève jamais.
func valeursParDefaut() -> (datees: ParamsDates, globaux: ParamsGlobaux) {
    let defaut = parametresDefaut()
    let datees = try! parametresAuJour(defaut, "2000-01-01")
    return (datees, defaut.globaux)
}

/// Valeurs saisies, telles qu'affichées dans les champs : une chaîne par champ.
struct Brouillon: Equatable, Sendable {
    private(set) var textes: [ChampParametre: String]

    init(datees: ParamsDates, globaux: ParamsGlobaux) {
        var textes: [ChampParametre: String] = [:]
        for cle in CleDatee.allCases {
            let valeur = datees[cle]
            textes[.datee(cle)] = cle == .lt2Pace ? formatAllure(valeur) : texteNombre(valeur)
        }
        for cle in CleGlobale.allCases {
            textes[.globale(cle)] = texteNombre(globaux[cle])
        }
        self.textes = textes
    }

    /// Le brouillon des valeurs par défaut.
    static func parDefaut() -> Brouillon {
        let (datees, globaux) = valeursParDefaut()
        return Brouillon(datees: datees, globaux: globaux)
    }

    func texte(_ champ: ChampParametre) -> String {
        textes[champ] ?? ""
    }

    mutating func definir(_ champ: ChampParametre, _ texte: String) {
        textes[champ] = texte
    }
}

// MARK: - Vérification et construction

/// Résultat de la vérification d'une saisie : les paramètres à enregistrer si elle est valide, sinon le champ fautif
/// (clé JogCore, ou « dateEffet ») et son message de 06.
struct Verification: Equatable, Sendable {
    let parametres: Parametres?
    let champ: String?
    let message: String?

    var valide: Bool { parametres != nil }

    static func refus(champ: String?, message: String) -> Verification {
        Verification(parametres: nil, champ: champ, message: message)
    }
}

/// Construit les paramètres à enregistrer à partir du brouillon, puis les valide à la date J (JogCore).
/// Une modification n'est ajoutée que pour un paramètre daté dont la valeur diffère de celle en vigueur à J (D-006) ;
/// les paramètres globaux remplacent les précédents, sans historique. L'ordre des contrôles suit 06 : d'abord la
/// présence de tous les champs (règle 1), puis le format de l'allure au seuil, puis le reste (JogCore).
func verifierSaisie(
    _ brouillon: Brouillon, base: Parametres, dateEffet: DateCivile, J: DateCivile, enregistreLe: String,
    nouvelId: @Sendable () -> String = { UUID().uuidString }
) -> Verification {
    for cle in CleGlobale.allCases where !lireNombre(brouillon.texte(.globale(cle))).isFinite {
        return .refus(champ: cle.rawValue, message: messageManquante(cle.rawValue))
    }
    for cle in CleDatee.allCases where cle != .lt2Pace && !lireNombre(brouillon.texte(.datee(cle))).isFinite {
        return .refus(champ: cle.rawValue, message: messageManquante(cle.rawValue))
    }
    let texteAllure = brouillon.texte(.datee(.lt2Pace))
    if texteAllure.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return .refus(champ: CleDatee.lt2Pace.rawValue, message: messageManquante(CleDatee.lt2Pace.rawValue))
    }
    guard let secondesAllure = secondesDepuisAllure(texteAllure) else {
        return .refus(champ: CleDatee.lt2Pace.rawValue, message: MESSAGE_FORMAT_ALLURE)
    }

    var datees: [CleDatee: Double] = [:]
    for cle in CleDatee.allCases {
        datees[cle] = cle == .lt2Pace ? secondesAllure : lireNombre(brouillon.texte(.datee(cle)))
    }
    var globaux = base.globaux
    for cle in CleGlobale.allCases {
        globaux[cle] = lireNombre(brouillon.texte(.globale(cle)))
    }

    guard let enVigueur = try? parametresAuJour(base, J) else {
        return .refus(champ: nil, message: "Les paramètres enregistrés ne se lisent pas.")
    }
    var modifs = base.modifs
    for cle in CleDatee.allCases where datees[cle] != enVigueur[cle] {
        modifs.append(ModifDatee(
            id: nouvelId(), cle: cle.rawValue, valeur: datees[cle] ?? .nan, dateEffet: dateEffet, enregistreLe: enregistreLe
        ))
    }

    let candidat = Parametres(globaux: globaux, modifs: modifs)
    switch validerParametres(candidat, J) {
    case .ok:
        return Verification(parametres: candidat, champ: nil, message: nil)
    case let .echec(champ, message):
        return .refus(champ: champ, message: message)
    }
}

/// Les paramètres de « Revenir aux valeurs par défaut » (06) : globaux par défaut, et pour chaque paramètre daté une
/// modification datée de J vers sa valeur par défaut. L'historique est conservé.
func parametresParDefaut(base: Parametres, J: DateCivile, enregistreLe: String, nouvelId: @Sendable () -> String = { UUID().uuidString }) -> Parametres {
    let (datees, globaux) = valeursParDefaut()
    var modifs = base.modifs
    for cle in CleDatee.allCases {
        modifs.append(ModifDatee(id: nouvelId(), cle: cle.rawValue, valeur: datees[cle], dateEffet: J, enregistreLe: enregistreLe))
    }
    return Parametres(globaux: globaux, modifs: modifs)
}

/// Les paramètres sans une modification (suppression d'une ligne de l'historique, 06).
func sansModification(_ id: String, de base: Parametres) -> Parametres {
    Parametres(globaux: base.globaux, modifs: base.modifs.filter { $0.id != id })
}

/// Message de 06 pour une saisie : `nil` si le champ n'est pas celui qui est fautif.
func messageChamp(_ verification: Verification?, _ champ: ChampParametre) -> String? {
    guard let verification, !verification.valide, verification.champ == champ.cle else { return nil }
    return verification.message
}

// MARK: - Dates

private func calendrierLocal() -> Calendar {
    var calendrier = Calendar(identifier: .gregorian)
    calendrier.timeZone = .current
    return calendrier
}

/// Jour civil local d'un instant (AAAA-MM-JJ).
func dateCivile(de instant: Date) -> DateCivile {
    let composantes = calendrierLocal().dateComponents([.year, .month, .day], from: instant)
    return String(format: "%04d-%02d-%02d", composantes.year ?? 0, composantes.month ?? 0, composantes.day ?? 0)
}

/// Midi local du jour civil, pour un sélecteur de date. nil si la date n'est pas AAAA-MM-JJ.
func instantDe(_ civile: DateCivile) -> Date? {
    let morceaux = civile.split(separator: "-").compactMap { Int($0) }
    guard morceaux.count == 3 else { return nil }
    var composantes = DateComponents()
    composantes.year = morceaux[0]
    composantes.month = morceaux[1]
    composantes.day = morceaux[2]
    composantes.hour = 12
    return calendrierLocal().date(from: composantes)
}

// MARK: - Affichage des valeurs

/// Historique de 06 : une ligne par modification, de la plus récente à la plus ancienne.
struct LigneHistorique: Identifiable, Equatable, Sendable {
    let id: String
    let titre: String
    let detail: String
}

func lignesHistorique(_ base: Parametres) -> [LigneHistorique] {
    guard let historique = try? historiqueModifications(base) else { return [] }
    return historique.compactMap { modif -> LigneHistorique? in
        guard let champ = ChampParametre(cle: modif.cle) else { return nil }
        let ancienne = modif.ancienne.map { champ.affiche($0) } ?? "valeur initiale"
        return LigneHistorique(
            id: modif.id,
            titre: "\(champ.libelle) : \(ancienne) → \(champ.affiche(modif.nouvelle))",
            detail: "à partir du \(formatDateAnnee(modif.dateEffet))"
        )
    }
}

/// Valeur d'un paramètre daté en vigueur à J−1 (Vue.parametresEnVigueur), pour l'indication sous le champ.
func valeurJm1(_ champ: ChampParametre, _ parametres: ParametresEnVigueur) -> String? {
    guard case let .datee(cle) = champ else { return nil }
    return champ.affiche(parametres.datesAJm1[cle])
}

/// Ligne du tableau des zones (06) : bornes en bpm, calculées sur la FC max saisie.
struct LigneZone: Equatable, Sendable {
    let nom: String
    let texte: String
}

/// Tableau des zones en bpm, mis à jour pendant la saisie. Vide tant que la saisie n'est pas un jeu complet de nombres.
func lignesZones(_ brouillon: Brouillon) -> [LigneZone] {
    let hrMax = lireNombre(brouillon.texte(.datee(.hrMax)))
    let limites = [CleDatee.z1, .z2, .z3, .z4].map { lireNombre(brouillon.texte(.datee($0))) }
    guard hrMax.isFinite, hrMax > 0, limites.allSatisfy(\.isFinite) else { return [] }
    let bpm = limites.map { Int(($0 * hrMax / 100).rounded()) }
    let maxBpm = Int(hrMax.rounded())
    return [
        LigneZone(nom: "Zone 1", texte: "jusqu’à \(bpm[0]) bpm"),
        LigneZone(nom: "Zone 2", texte: "de \(bpm[0]) à \(bpm[1]) bpm"),
        LigneZone(nom: "Zone 3", texte: "de \(bpm[1]) à \(bpm[2]) bpm"),
        LigneZone(nom: "Zone 4", texte: "de \(bpm[2]) à \(bpm[3]) bpm"),
        LigneZone(nom: "Zone 5", texte: "de \(bpm[3]) à \(maxBpm) bpm"),
    ]
}

// MARK: - Suggestions

/// Texte de la suggestion de paceHrK (D-004), ou la raison de son absence (06).
func texteSuggestionPaceHrK(_ parametres: ParametresEnVigueur) -> String {
    if let suggestion = parametres.suggestionPaceHrK {
        let texte = (try? formatNombre(suggestion, 2)) ?? texteNombre(suggestion)
        return "Valeur suggérée d’après vos séances : \(texte) s/km par bpm."
    }
    return "Pas de suggestion : \(parametres.raisonAbsenceSuggestion ?? "données insuffisantes")."
}

/// Clé de « Ignorer » pour une suggestion : une autre séance ou une autre valeur la fait réapparaître (D-019).
func cleIgnoree(_ suggestion: SuggestionHrMax) -> String {
    "\(suggestion.cleSource):\(Int(suggestion.bpm))"
}

/// Encart « FC max observée » (D-019), ou nil si la proposition a été ignorée sur cet appareil.
struct EncartFCMax: Equatable, Sendable {
    let titre: String
    let phrase: String
    /// Phrase d'alerte quand l'écart dépasse ECART_SUSPECT_HRMAX_BPM.
    let alerte: String?
    let libelleUtiliser: String
}

func encartFCMax(_ suggestion: SuggestionHrMax, hrMaxVeille: Double, ignoree: String) -> EncartFCMax? {
    guard ignoree != cleIgnoree(suggestion) else { return nil }
    let km = "\((try? formatNombre(suggestion.km, 1)) ?? texteNombre(suggestion.km))\u{00A0}km"
    let detail = suggestion.nom.map { "« \($0) », \(km)" } ?? km
    let phrase = "\(Int(suggestion.bpm)) bpm tenus 15 s le \(formatDateAnnee(suggestion.date)) (\(detail)), "
        + "au-dessus de votre réglage de \(texteNombre(hrMaxVeille)) bpm."
    return EncartFCMax(
        titre: "FC max observée",
        phrase: phrase,
        alerte: suggestion.ecartSuspect ? "Écart important : vérifiez qu’il ne s’agit pas d’un artefact du capteur." : nil,
        libelleUtiliser: "Utiliser \(Int(suggestion.bpm)) bpm à partir du \(formatDate(suggestion.date))"
    )
}

/// « Utiliser » (D-019, ADR 0013 §47) : les paramètres stockés plus UNE modification de FC max, datée de la séance.
/// Le formulaire en cours n'entre pas en jeu ; rien d'autre ne change.
func ajouterFCMaxObservee(
    _ suggestion: SuggestionHrMax, base: Parametres, enregistreLe: String,
    nouvelId: () -> String = { UUID().uuidString }
) -> Parametres {
    var modifs = base.modifs
    modifs.append(ModifDatee(
        id: nouvelId(), cle: CleDatee.hrMax.rawValue, valeur: suggestion.bpm, dateEffet: suggestion.date,
        enregistreLe: enregistreLe
    ))
    return Parametres(globaux: base.globaux, modifs: modifs)
}

// MARK: - État des données (D-017, adapté)

/// Ce que la feuille affiche de l'état des données : versions, compteurs et dernière synchronisation.
struct EtatDonnees: Equatable, Sendable {
    let reglesVersion: String
    let seancesImportees: Int
    /// Séances écartées du dernier calcul (sans flux, flux illisible).
    let ecartees: Int
    /// Séances ignorées à l'import, par raison (doublon, autre source, pas une course…).
    let ignorees: [RaisonIgnoree: Int]
    /// Séances refusées par l'adaptateur ou dont la lecture a été rejetée.
    let echecs: Int
    let derniereSynchro: String?

    init(reglesVersion: String, seancesImportees: Int, ecartees: Int, raisonsIgnorees: [RaisonIgnoree], echecs: Int, derniereSynchro: String?) {
        self.reglesVersion = reglesVersion
        self.seancesImportees = seancesImportees
        self.ecartees = ecartees
        self.ignorees = Dictionary(raisonsIgnorees.map { ($0, 1) }, uniquingKeysWith: +)
        self.echecs = echecs
        self.derniereSynchro = derniereSynchro
    }
}

func libelleRaison(_ raison: RaisonIgnoree) -> String {
    switch raison {
    case .doublon: "doublon"
    case .pasUneCourse: "pas une course"
    case .illisible: "illisible"
    case .autreSource: "autre source"
    }
}

/// Dernière synchronisation, en heure locale (« 27 oct. 2026, 10:00 »). « Jamais » sans synchronisation réussie.
func libelleDerniereSynchro(_ iso: String?) -> String {
    guard let iso else { return "Jamais" }
    let instant = (try? Date.ISO8601FormatStyle().parse(iso))
        ?? (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(iso))
    guard let instant else { return "Jamais" }
    return instant.formatted(.dateTime.day().month(.abbreviated).year().hour().minute().locale(Locale(identifier: "fr_FR")))
}

// MARK: - Erreurs d'enregistrement

/// Échecs de l'écran Paramètres, avec le message de 06 quand il existe.
enum ErreurParametres: LocalizedError {
    case indisponible
    case ecriture(String)
    /// Le recalcul a échoué et les paramètres précédents ont été rétablis.
    case recalcul
    case suppression(String)

    var errorDescription: String? {
        switch self {
        case .indisponible: "Les données de l’app ne sont pas disponibles."
        case let .ecriture(detail): "Impossible d’enregistrer les paramètres : \(detail)"
        case .recalcul: "Le recalcul a échoué : les paramètres précédents sont conservés."
        case let .suppression(detail): "Impossible de supprimer les données : \(detail)"
        }
    }
}
