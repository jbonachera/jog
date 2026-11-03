// Assemblage de la Vue (ADR 0006, 0009). Traduit de src/core/vue.ts. Fonctions déterministes : aucune donnée n'est lue
// dans la base. `seancesIntrinseques` lit les flux un à un et ne garde que les séances ②a ; `calculerVue` ne voit jamais
// un flux. La mémorisation (clés SHA-256, MemoireSeances) est hors oracle : elle reprend la logique de vue.ts, pas ses
// octets (JSON.stringify n'a pas d'équivalent exact en Swift, et la clé n'est jamais comparée à celle du TypeScript).
import CryptoKit
import Foundation

/// Décimales des nombres de la Vue : 4 (ADR 0009, budget de taille). La décision, elle, est arrondie avant (D-015).
/// `arrondirDecimales(x, 4)` est le même calcul que `arrondir(x, 0.0001)` : le pas 0,0001 s'écrit 1 / 10⁴.
private let DECIMALES_VUE = 4

/// Raison affichée quand paceHrK ne peut pas être suggéré (06).
private let RAISON_SANS_SUGGESTION = "pas assez de données pour suggérer une valeur"

/// Décision d'une Vue sans séance : aucun verdict (05).
private let DECISION_VIDE = Decision(verdict: .aucun, phrase: "", signaux: [], fourchette: nil, simulateur: nil)

/// Séparateur des champs hachés (caractère de contrôle absent des textes du moteur).
private let SEPARATEUR_CHAMPS = "\u{1F}"

/// Une activité sans son flux : ce que le Worker lit dans la base, sans les échantillons (`Omit<ActivitePivot, 'flux'>`).
public struct PivotSansFlux: Codable, Sendable, Equatable {
    public var cleSource: String
    public var source: Source
    public var versionAdaptateur: String
    public var empreinteBrute: String
    public var debutUtc: Double
    public var decalageLocal_min: Double
    public var dateLocale: DateCivile
    public var duree_s: Double
    public var distance_m: Double
    public var nom: String?
    public var competition: Bool
    public var sousType: SousType
    public var pasFC_s: Double?
    public var tours: [Tour]
    /// Bundle de l'app source (HealthKit), absent pour les autres sources (migration-ios, décision 5).
    public var appSource: String?
    /// Nombre de mesures de FC, pour départager deux doublons (migration-ios, décision 3).
    public var nbMesuresFC: Int?
    /// Durée écoulée, pauses comprises (migration-ios, décision 3). Nil si inconnue, par exemple pour FIT ou Strava :
    /// les bornes de recouvrement retombent alors sur `duree_s`.
    public var dureeEcoulee_s: Double?

    public init(
        cleSource: String, source: Source, versionAdaptateur: String, empreinteBrute: String, debutUtc: Double,
        decalageLocal_min: Double, dateLocale: DateCivile, duree_s: Double, distance_m: Double, nom: String?,
        competition: Bool, sousType: SousType, pasFC_s: Double?, tours: [Tour],
        appSource: String? = nil, nbMesuresFC: Int? = nil, dureeEcoulee_s: Double? = nil
    ) {
        self.cleSource = cleSource
        self.source = source
        self.versionAdaptateur = versionAdaptateur
        self.empreinteBrute = empreinteBrute
        self.debutUtc = debutUtc
        self.decalageLocal_min = decalageLocal_min
        self.dateLocale = dateLocale
        self.duree_s = duree_s
        self.distance_m = distance_m
        self.nom = nom
        self.competition = competition
        self.sousType = sousType
        self.pasFC_s = pasFC_s
        self.tours = tours
        self.appSource = appSource
        self.nbMesuresFC = nbMesuresFC
        self.dureeEcoulee_s = dureeEcoulee_s
    }

    /// Le pivot d'une activité complète, sans son flux.
    public init(_ pivot: ActivitePivot) {
        self.init(
            cleSource: pivot.cleSource, source: pivot.source, versionAdaptateur: pivot.versionAdaptateur,
            empreinteBrute: pivot.empreinteBrute, debutUtc: pivot.debutUtc, decalageLocal_min: pivot.decalageLocal_min,
            dateLocale: pivot.dateLocale, duree_s: pivot.duree_s, distance_m: pivot.distance_m, nom: pivot.nom,
            competition: pivot.competition, sousType: pivot.sousType, pasFC_s: pivot.pasFC_s, tours: pivot.tours,
            appSource: pivot.appSource, nbMesuresFC: pivot.nbMesuresFC, dureeEcoulee_s: pivot.dureeEcoulee_s
        )
    }

    /// L'activité complète, avec le flux lu.
    func avecFlux(_ flux: Flux) -> ActivitePivot {
        ActivitePivot(
            cleSource: cleSource, source: source, versionAdaptateur: versionAdaptateur, empreinteBrute: empreinteBrute,
            debutUtc: debutUtc, decalageLocal_min: decalageLocal_min, dateLocale: dateLocale, duree_s: duree_s,
            distance_m: distance_m, nom: nom, competition: competition, sousType: sousType, pasFC_s: pasFC_s,
            flux: flux, tours: tours, appSource: appSource, nbMesuresFC: nbMesuresFC, dureeEcoulee_s: dureeEcoulee_s
        )
    }
}

/// Ce qu'il faut pour identifier une activité dans les clés de mémorisation (ADR 0006).
public struct EmpreinteActivite: Sendable, Equatable {
    public var cleSource: String
    public var empreinteBrute: String
    public var versionAdaptateur: String
    /// Bundle de l'app source (migration-ios, décision 5). Nil pour les sources sans bundle (FIT, Strava).
    public var appSource: String?

    public init(cleSource: String, empreinteBrute: String, versionAdaptateur: String, appSource: String? = nil) {
        self.cleSource = cleSource
        self.empreinteBrute = empreinteBrute
        self.versionAdaptateur = versionAdaptateur
        self.appSource = appSource
    }

    public init(_ pivot: PivotSansFlux) {
        self.init(
            cleSource: pivot.cleSource, empreinteBrute: pivot.empreinteBrute,
            versionAdaptateur: pivot.versionAdaptateur, appSource: pivot.appSource
        )
    }

    public init(_ pivot: ActivitePivot) {
        self.init(
            cleSource: pivot.cleSource, empreinteBrute: pivot.empreinteBrute,
            versionAdaptateur: pivot.versionAdaptateur, appSource: pivot.appSource
        )
    }
}

/// Cache de l'étape ②a, indexé par clé de mémorisation (`cleDeSeance`). Le Worker le garde en mémoire et dans `derive`.
/// `seancesIntrinseques` y lit et y écrit : une clé présente dispense de lire le flux.
public struct MemoireSeances: Sendable {
    public var entrees: [String: SeanceIntrinseque]

    public init(entrees: [String: SeanceIntrinseque] = [:]) {
        self.entrees = entrees
    }
}

/// Le flux d'une activité est absent de la base : la séance est écartée de ②a (`EcartIntrinseque`).
public struct FluxAbsent: Error, Sendable, Equatable {
    public let cleSource: String

    public init(cleSource: String) { self.cleSource = cleSource }
}

/// Entrées de `calculerVue` : séances ②a des activités actives, paramètres, journée en cours et dernière synchro.
public struct EntreeVue: Codable, Sendable, Equatable {
    /// Séances ②a des activités actives, telles que `seancesIntrinseques` les rend.
    public var intrinseques: [SeanceIntrinseque]
    public var parametres: Parametres
    /// Journée en cours : elle n'entre dans aucun calcul (03).
    public var J: DateCivile
    public var derniereSynchro: String?
    /// Nuits résumées (D-023) ; nil quand l'app ne lit pas le sommeil, et alors la Vue n'a pas de `recuperation`.
    public var nuits: [NuitResumee]?
    /// Dernière session de sommeil (hypnogramme). Gardée dans la Vue seulement si sa date est A (J−1).
    public var derniereSession: SessionSommeil?

    public init(
        intrinseques: [SeanceIntrinseque], parametres: Parametres, J: DateCivile, derniereSynchro: String?,
        nuits: [NuitResumee]? = nil, derniereSession: SessionSommeil? = nil
    ) {
        self.intrinseques = intrinseques
        self.parametres = parametres
        self.J = J
        self.derniereSynchro = derniereSynchro
        self.nuits = nuits
        self.derniereSession = derniereSession
    }
}

// MARK: - Clés de mémorisation (ADR 0006, 0009)

/// Clé de mémorisation de ②a (ADR 0006) : hash de l'empreinte du fichier, de la version de l'adaptateur, de
/// `REGLES_VERSION`, des paramètres que ②a lit au jour de la séance et de `FORMAT_SEANCE`. `lt2Pace` figure dans la clé
/// (la détection des répétitions s'en sert). `subtHrHi` n'est lu qu'à ④, et `refHr` et `paceHrK` ne servent qu'à ⑤ :
/// aucun des trois n'entre dans la clé. `appSource` y entre s'il existe (migration-ios, décision 5). `cleSource` et la
/// date n'y entrent pas non plus : voir `identifiee`. Le marquage
/// saisi (D-020) y entre s'il existe : changer de marquage recalcule la séance. Sans marquage saisi, la clé est celle
/// d'avant D-020.
public func cleDeSeance(
    _ pivot: EmpreinteActivite, _ p: ParamsDates, marquage: MarquageUtilisateur? = nil,
    versionEstimation: Int = VERSION_ESTIMATION, versionDenivele: Int = VERSION_DENIVELE
) -> String {
    var champs = [
        pivot.empreinteBrute,
        pivot.versionAdaptateur,
        REGLES_VERSION,
        "hrMax=\(p.hrMax)",
        "z2=\(p.z2)",
        "lt2Hr=\(p.lt2Hr)",
        "lt2Pace=\(p.lt2Pace)",
        "subtHrLo=\(p.subtHrLo)",
        "FORMAT_SEANCE=\(FORMAT_SEANCE)",
        "VERSION_ESTIMATION=\(versionEstimation)",
        "VERSION_DENIVELE=\(versionDenivele)",
    ]
    // Le bundle de l'app source entre dans la clé (migration-ios, décision 5) : une séance HealthKit d'une autre app
    // n'a pas la même analyse. Absent pour FIT et Strava, la clé de ces sources reste celle d'avant.
    if let appSource = pivot.appSource {
        champs.append("appSource=\(appSource)")
    }
    if let marquage {
        champs.append("marquage=\(marquage.rawValue)")
    }
    return hacher(champs)
}

/// Empreinte des entrées de la Vue (ADR 0009, démarrage rapide) : activités actives (clé source et empreinte),
/// paramètres, date de dernière synchronisation, `REGLES_VERSION`, `VERSION_ESTIMATION` (D-021 : un changement du
/// détecteur change les séances sans changer `REGLES_VERSION`, qui reste celui du cœur partagé avec TypeScript) et
/// `VERSION_DENIVELE` (D-025 : une Vue en cache sans D+ n'est pas servie).
/// Deux appels aux mêmes entrées donnent la même empreinte, quel que soit leur ordre. Les globaux entrent en entier
/// (sérialisés triés) : un paramètre global ajouté plus tard ne sera pas oublié de l'empreinte.
public func empreinteEntrees(
    activites: [EmpreinteActivite], parametres: Parametres, derniereSynchro: String?,
    versionEstimation: Int = VERSION_ESTIMATION, versionDenivele: Int = VERSION_DENIVELE
) throws -> String {
    var champs: [String] = [
        "REGLES_VERSION=\(REGLES_VERSION)", "VERSION_ESTIMATION=\(versionEstimation)", "VERSION_DENIVELE=\(versionDenivele)",
    ]

    let triees = activites.sorted { $0.cleSource < $1.cleSource }
    champs.append("activites=\(triees.count)")
    for activite in triees {
        champs.append(contentsOf: [activite.cleSource, activite.empreinteBrute, activite.versionAdaptateur])
    }

    let encodeur = JSONEncoder()
    encodeur.outputFormatting = [.sortedKeys]
    champs.append("globaux=" + String(decoding: try encodeur.encode(parametres.globaux), as: UTF8.self))

    // Les modifications sont triées sur leur forme textuelle : l'ordre d'entrée n'a pas d'effet.
    let modifs = parametres.modifs
        .map { modif in
            [modif.id, modif.cle, "\(modif.valeur)", modif.dateEffet, modif.enregistreLe].joined(separator: SEPARATEUR_CHAMPS)
        }
        .sorted()
    champs.append("modifs=\(modifs.count)")
    champs.append(contentsOf: modifs)

    champs.append(derniereSynchro.map { "derniereSynchro=" + $0 } ?? "derniereSynchro=null")
    return hacher(champs)
}

/// SHA-256 hexadécimal des champs, séparés par SEPARATEUR_CHAMPS.
private func hacher(_ champs: [String]) -> String {
    let condensat = SHA256.hash(data: Data(champs.joined(separator: SEPARATEUR_CHAMPS).utf8))
    return condensat.map { octet in
        let hex = String(octet, radix: 16)
        return hex.count == 1 ? "0" + hex : hex
    }.joined()
}

// MARK: - Étape ②a mémorisée

/// Séance écartée du calcul de ②a : son flux manque, ou sa lecture ou son calcul échoue. Journalisée, sans bloquer le reste.
public struct EcartIntrinseque: Sendable, Equatable {
    public var cleSource: String
    public var detail: String

    public init(cleSource: String, detail: String) {
        self.cleSource = cleSource
        self.detail = detail
    }
}

/// Résultat de `seancesIntrinseques` : les séances calculées, et celles qui ont été écartées.
public struct ResultatIntrinseques: Sendable, Equatable {
    public var seances: [SeanceIntrinseque]
    public var ecartees: [EcartIntrinseque]

    public init(seances: [SeanceIntrinseque] = [], ecartees: [EcartIntrinseque] = []) {
        self.seances = seances
        self.ecartees = ecartees
    }
}

/// Étape ②a pour chaque activité datée strictement avant J (ADR 0006). Si une clé de mémorisation est présente dans
/// `memoire`, la séance est reprise sans lire le flux. Sinon le flux est demandé à `lireFlux`, utilisé, puis oublié, et
/// la séance est rangée dans `memoire`. Les paramètres sont ceux du jour de la séance (D-006). Une activité dont le flux
/// manque, ou dont la lecture ou le calcul échoue, est écartée (`ecartees`) : elle ne bloque pas les autres. Seule
/// l'annulation se propage. `marquages` (D-020) : marquage saisi par clé source ; une activité absente de ce
/// dictionnaire garde son marquage déduit. Les flux sont lus et calculés `parallelisme` à la fois, de la séance la plus
/// récente à la plus ancienne (D-032) ; le résultat garde l'ordre de `activites`. `progression` reçoit (traitees, total) :
/// le premier appel annonce 0 sur le total, puis un appel par séance relue.
public func seancesIntrinseques(
    activites: [PivotSansFlux],
    lireFlux: @escaping @Sendable (String) async throws -> Flux?,
    parametres: Parametres,
    J: DateCivile,
    memoire: inout MemoireSeances,
    marquages: [String: MarquageUtilisateur] = [:],
    parallelisme: Int = 4,
    progression: @escaping @Sendable (Int, Int) async -> Void = { _, _ in }
) async throws -> ResultatIntrinseques {
    let parametresDates = try indexerParametres(parametres)
    let aTraiter = activites.filter { $0.dateLocale < J }
    var issues = [SeanceIntrinseque?](repeating: nil, count: aTraiter.count)
    var ecarts: [Int: EcartIntrinseque] = [:]
    // Séances à relire : (indice, clé, pivot, paramètres, marquage), de la plus récente à la plus ancienne.
    var aLire: [(Int, String, PivotSansFlux, ParamsDates, MarquageUtilisateur?)] = []
    for (i, pivot) in aTraiter.enumerated() {
        let p = parametresDates.auJour(pivot.dateLocale)
        let marquage = marquages[pivot.cleSource]
        let cle = cleDeSeance(EmpreinteActivite(pivot), p, marquage: marquage)
        if let memorisee = memoire.entrees[cle] {
            issues[i] = identifiee(memorisee, pivot)
        } else {
            aLire.append((i, cle, pivot, p, marquage))
        }
    }
    aLire.sort { $0.2.debutUtc > $1.2.debutUtc }
    await progression(0, aLire.count)
    try await withThrowingTaskGroup(of: (Int, String, SeanceIntrinseque?, EcartIntrinseque?).self) { groupe in
        var suivante = aLire.makeIterator()
        func lancer() {
            guard let (i, cle, pivot, p, marquage) = suivante.next() else { return }
            groupe.addTask {
                do {
                    guard let flux = try await lireFlux(pivot.cleSource) else { throw FluxAbsent(cleSource: pivot.cleSource) }
                    let calculee = try calculerSeanceIntrinseque(pivot.avecFlux(flux), p, marquageUtilisateur: marquage)
                    return (i, cle, calculee, nil)
                } catch let annulation as CancellationError {
                    throw annulation
                } catch {
                    let detail = error is FluxAbsent ? "flux absent" : String(describing: error)
                    return (i, cle, nil, EcartIntrinseque(cleSource: pivot.cleSource, detail: detail))
                }
            }
        }
        for _ in 0..<max(parallelisme, 1) { lancer() }
        var traitees = 0
        while let (i, cle, calculee, ecart) = try await groupe.next() {
            if let calculee {
                memoire.entrees[cle] = calculee
                issues[i] = identifiee(calculee, aTraiter[i])
            }
            ecarts[i] = ecart
            traitees += 1
            if traitees < aLire.count { await progression(traitees, aLire.count) }
            lancer()
        }
    }
    return ResultatIntrinseques(
        seances: issues.compactMap { $0 },
        ecartees: ecarts.keys.sorted().compactMap { ecarts[$0] }
    )
}

/// Une séance mémorisée est rattachée à l'activité qui la demande. La clé ne couvre ni `cleSource` ni la date
/// (`dateLocale`) : deux activités de même empreinte partagent la clé, pas leur identité.
private func identifiee(_ seance: SeanceIntrinseque, _ pivot: PivotSansFlux) -> SeanceIntrinseque {
    var resultat = seance
    resultat.cleSource = pivot.cleSource
    resultat.date = pivot.dateLocale
    resultat.debutUtc = pivot.debutUtc
    return resultat
}

// MARK: - Assemblage de la Vue

/// Étapes ③ à ⑥ (ADR 0006), sur les valeurs brutes. Les sommes suivent l'ordre des séances classées.
/// `calculerVue` en est la version qu'on affiche, arrondie à l'assemblage.
public func calculerVueBrute(_ entree: EntreeVue) throws -> Vue {
    let brute = try assemblerVue(entree)
    return try avecSuggestion(brute, brute)
}

/// La Vue telle que l'interface la reçoit (ADR 0009) : les nombres des séances, des jours, des séries, des semaines et
/// des compteurs sont arrondis à 4 décimales. La décision, déjà formatée et calculée sur les valeurs brutes, n'est pas
/// arrondie une seconde fois.
public func calculerVue(_ entree: EntreeVue) throws -> Vue {
    // La FC max se calcule sur la Vue brute, sans suggestion : elle ne lit que les pics, les séances et les paramètres
    // datés, qui sont les mêmes dans les deux Vues (voir `avecSuggestion`).
    let brute = try assemblerVue(entree)
    let finale = arrondirVueFinale(brute)
    // La suggestion paceHrK se calcule sur la Vue finale, celle que l'interface reçoit (D-004).
    return try avecSuggestion(finale, brute)
}

/// Les étapes ③ à ⑥ sans suggestion : la Vue assemblée, aux valeurs brutes.
private func assemblerVue(_ entree: EntreeVue) throws -> Vue {
    let parametres = entree.parametres
    let J = entree.J
    let parametresDates = try indexerParametres(parametres)
    let veille = try ajouterJours(J, -1)

    // Les dates AAAA-MM-JJ se comparent comme des textes. La journée en cours n'entre jamais dans la Vue.
    let retenues = entree.intrinseques.filter { $0.date <= veille }
    let seances = try classerSeances(retenues)
    let premiere = seances.first
    let premierJour = premiere?.date
    let jours = try premiere.map { try agregerJours(seances, $0.date, veille) } ?? []

    let serie = try serieCharge(jours, OptionsCharge(ctlDays: parametres.globaux.ctlDays, atlDays: parametres.globaux.atlDays))
    let ratio = try serieRatio(jours)
    let semainesVue = try semaines(jours, seances, J, parametres)
    let palierVue = try palier(semainesVue)
    let compteursVue = try compteurs(jours, seances, J)

    // La récupération ne dépend que des nuits et de A = J−1 : elle est absente sans nuits (goldens, D-023).
    let recuperation = try entree.nuits.flatMap {
        try calculerRecuperation($0, derniereSession: entree.derniereSession, aujourdhui: veille)
    }

    let decision: Decision
    if premiere == nil {
        decision = DECISION_VIDE
    } else {
        decision = try decider(EntreesDecision(
            J: J,
            premierJour: premierJour,
            serieCharge: serie,
            ratio: ratio,
            joursKm: jours.map { JourKm(date: $0.date, km: $0.km, charge: $0.charge) },
            semaines: semainesVue.map { SemaineEntree(lundi: $0.lundi, statut: $0.statut, km: $0.km) },
            palier: palierVue,
            seances: seances,
            globaux: parametres.globaux,
            parametres: parametres,
            recuperation: recuperation
        ))
    }

    return Vue(
        formatVersion: FORMAT_VUE,
        reglesVersion: REGLES_VERSION,
        J: J,
        derniereSynchro: entree.derniereSynchro,
        parametresEnVigueur: ParametresEnVigueur(
            globaux: parametres.globaux,
            datesAJm1: parametresDates.auJour(veille),
            modifs: try trierModifs(parametres.modifs),
            // Remplis par `avecSuggestion`, à partir de la Vue elle-même.
            suggestionPaceHrK: nil,
            raisonAbsenceSuggestion: nil,
            suggestionHrMax: nil
        ),
        seances: seances.map { SeanceVue(seance: $0) },
        jours: enColonnesJours(jours),
        premierJour: premierJour,
        serieCharge: serie,
        ratio: enColonnesRatio(ratio),
        semaines: semainesVue,
        palier: palierVue,
        compteurs: compteursVue,
        decision: decision,
        recuperation: recuperation
    )
}

/// Ajoute à la Vue la suggestion paceHrK (D-004) et, à défaut, sa raison (06), puis la FC max observée (D-019).
/// paceHrK se calcule sur `vue`, la Vue telle que l'interface la reçoit, à J−1. La FC max se calcule sur `brute`, la
/// même Vue aux valeurs non arrondies : arrondir le pic à 4 décimales puis au bpm ferait passer 190,49996 à 191
/// (double arrondi, D-015). `brute` et `vue` ont les mêmes J, paramètres et dates : seuls les pics diffèrent.
private func avecSuggestion(_ vue: Vue, _ brute: Vue) throws -> Vue {
    let valeur = try suggestionPaceHrK(vue)
    var resultat = vue
    resultat.parametresEnVigueur.suggestionPaceHrK = valeur
    resultat.parametresEnVigueur.raisonAbsenceSuggestion = valeur == nil ? RAISON_SANS_SUGGESTION : nil
    resultat.parametresEnVigueur.suggestionHrMax = try suggestionHrMax(brute)
    return resultat
}

/// Les jours en colonnes : `date[i]` est le jour de chaque valeur (ADR 0009, budget de taille).
private func enColonnesJours(_ jours: [JourAgrege]) -> JoursVue {
    JoursVue(
        date: jours.map(\.date),
        km: jours.map(\.km),
        min: jours.map(\.min),
        charge: jours.map(\.charge),
        minutes: MinutesColonnes(
            easy: jours.map { $0.minutes.easy },
            mp: jours.map { $0.minutes.mp },
            subt: jours.map { $0.minutes.subt },
            hard: jours.map { $0.minutes.hard }
        ),
        types: jours.map(\.types)
    )
}

private func enColonnesRatio(_ ratio: [PointRatio]) -> SerieRatioVue {
    SerieRatioVue(
        date: ratio.map(\.date),
        s7: ratio.map(\.s7),
        chronic: ratio.map(\.chronic),
        r: ratio.map(\.r)
    )
}

// MARK: - Arrondi de la Vue (ADR 0009)

/// Arrondi à 4 décimales d'un nombre de la Vue. `arrondirDecimales(_, 4)` ne lève jamais : le repli sur `x` est inatteignable.
@inline(__always)
private func arrondiVue(_ x: Double) -> Double {
    (try? arrondirDecimales(x, DECIMALES_VUE)) ?? x
}

/// Arrondit chaque nombre de la Vue finale, champ par champ (équivalent de `arrondirProfond` de vue.ts). Les chaînes,
/// les booléens et les dates ne bougent pas. Deux exceptions, comme dans vue.ts : `ratio.r` et `semaines.ratioDimanche`
/// gardent leur précision, leur comparaison (D-015) se fait à 0,01 près.
private func arrondirVueFinale(_ brute: Vue) -> Vue {
    var finale = brute
    finale.seances = brute.seances.map(arrondiSeanceVue)
    finale.jours = arrondiJours(brute.jours)
    finale.serieCharge = brute.serieCharge.map(arrondiPointCharge)
    finale.ratio = arrondiSerieRatio(brute.ratio)
    finale.semaines = brute.semaines.map(arrondiSemaine)
    finale.palier = arrondiPalier(brute.palier)
    finale.compteurs = arrondiCompteurs(brute.compteurs)
    finale.recuperation = brute.recuperation.map(arrondiRecuperation)
    return finale
}

/// Arrondit les nombres du bloc récupération (D-023). L'état, le titre et la phrase ne bougent pas : ils sont calculés
/// sur les valeurs brutes. `point` reste égal à `serie.last`, arrondis tous deux de la même façon.
private func arrondiRecuperation(_ r: VueRecuperation) -> VueRecuperation {
    var f = r
    f.point = arrondiPointRecuperation(r.point)
    f.serie = r.serie.map(arrondiPointRecuperation)
    f.nuits = r.nuits.map(arrondiNuitResumee)
    f.derniereSession = r.derniereSession.map(arrondiSessionSommeil)
    f.semaines = r.semaines.map { semaine in
        var s = semaine
        s.ecartVfc_pct = semaine.ecartVfc_pct.map(arrondiVue)
        return s
    }
    return f
}

private func arrondiPointRecuperation(_ p: PointRecuperation) -> PointRecuperation {
    var r = p
    r.vfc_ms = p.vfc_ms.map(arrondiVue)
    r.vfc7_ms = p.vfc7_ms.map(arrondiVue)
    r.vfcBas = p.vfcBas.map(arrondiVue)
    r.vfcHaut = p.vfcHaut.map(arrondiVue)
    r.vfcMilieu = p.vfcMilieu.map(arrondiVue)
    r.fc = p.fc.map(arrondiVue)
    r.fc7 = p.fc7.map(arrondiVue)
    r.fcBas = p.fcBas.map(arrondiVue)
    r.fcHaut = p.fcHaut.map(arrondiVue)
    r.fcMilieu = p.fcMilieu.map(arrondiVue)
    r.sommeil_min = p.sommeil_min.map(arrondiVue)
    r.sommeil7_min = p.sommeil7_min.map(arrondiVue)
    return r
}

private func arrondiNuitResumee(_ n: NuitResumee) -> NuitResumee {
    var r = n
    r.debutUtc_ms = arrondiVue(n.debutUtc_ms)
    r.finUtc_ms = arrondiVue(n.finUtc_ms)
    r.coucher_min = arrondiVue(n.coucher_min)
    r.sommeil_min = arrondiVue(n.sommeil_min)
    r.leger_min = arrondiVue(n.leger_min)
    r.profond_min = arrondiVue(n.profond_min)
    r.paradoxal_min = arrondiVue(n.paradoxal_min)
    r.eveille_min = arrondiVue(n.eveille_min)
    r.vfcLn = n.vfcLn.map(arrondiVue)
    r.fcSommeil = n.fcSommeil.map(arrondiVue)
    r.respiration = n.respiration.map(arrondiVue)
    return r
}

private func arrondiSessionSommeil(_ s: SessionSommeil) -> SessionSommeil {
    var r = s
    r.debutUtc_ms = arrondiVue(s.debutUtc_ms)
    r.finUtc_ms = arrondiVue(s.finUtc_ms)
    r.segments = s.segments.map { segment in
        var g = segment
        g.debutUtc_ms = arrondiVue(segment.debutUtc_ms)
        g.finUtc_ms = arrondiVue(segment.finUtc_ms)
        return g
    }
    r.coucher_min = arrondiVue(s.coucher_min)
    r.sommeil_min = arrondiVue(s.sommeil_min)
    r.leger_min = arrondiVue(s.leger_min)
    r.profond_min = arrondiVue(s.profond_min)
    r.paradoxal_min = arrondiVue(s.paradoxal_min)
    r.eveille_min = arrondiVue(s.eveille_min)
    return r
}

private func arrondiSeanceVue(_ s: SeanceVue) -> SeanceVue {
    var r = s
    r.debutUtc = arrondiVue(s.debutUtc)
    r.duree_min = arrondiVue(s.duree_min)
    r.km = arrondiVue(s.km)
    r.fcMoy = s.fcMoy.map(arrondiVue)
    r.allureMoy_skm = s.allureMoy_skm.map(arrondiVue)
    r.minutes = arrondiMinutes(s.minutes)
    r.charge = arrondiVue(s.charge)
    r.mp_min = arrondiVue(s.mp_min)
    r.repetitions = s.repetitions.map(arrondiRepetition)
    r.recup_s = s.recup_s.map(arrondiVue)
    r.ef = s.ef.map(arrondiVue)
    r.fcPic = s.fcPic.map(arrondiVue)
    r.decouplage = s.decouplage.map(arrondiDecouplage)
    r.distanceRef_km = s.distanceRef_km.map(arrondiVue)
    r.temps_s = s.temps_s.map(arrondiVue)
    return r
}

private func arrondiMinutes(_ m: Minutes) -> Minutes {
    Minutes(easy: arrondiVue(m.easy), mp: arrondiVue(m.mp), subt: arrondiVue(m.subt), hard: arrondiVue(m.hard))
}

private func arrondiRepetition(_ rep: Repetition) -> Repetition {
    var r = rep
    r.n = arrondiVue(rep.n)
    r.debut_s = arrondiVue(rep.debut_s)
    r.duree_s = arrondiVue(rep.duree_s)
    r.allure_skm = arrondiVue(rep.allure_skm)
    r.fcFin = arrondiVue(rep.fcFin)
    return r
}

private func arrondiDecouplage(_ d: Decouplage) -> Decouplage {
    var r = d
    r.valeur = d.valeur.map(arrondiVue)
    r.retenu_min = arrondiVue(d.retenu_min)
    r.total_min = arrondiVue(d.total_min)
    return r
}

private func arrondiJours(_ j: JoursVue) -> JoursVue {
    var r = j
    r.km = j.km.map(arrondiVue)
    r.min = j.min.map(arrondiVue)
    r.charge = j.charge.map(arrondiVue)
    r.minutes = MinutesColonnes(
        easy: j.minutes.easy.map(arrondiVue),
        mp: j.minutes.mp.map(arrondiVue),
        subt: j.minutes.subt.map(arrondiVue),
        hard: j.minutes.hard.map(arrondiVue)
    )
    return r
}

private func arrondiPointCharge(_ p: PointCharge) -> PointCharge {
    var r = p
    r.ctl = arrondiVue(p.ctl)
    r.atl = arrondiVue(p.atl)
    r.tsb = arrondiVue(p.tsb)
    return r
}

private func arrondiSerieRatio(_ s: SerieRatioVue) -> SerieRatioVue {
    var r = s
    r.s7 = s.s7.map(arrondiVue)
    r.chronic = s.chronic.map(arrondiVue)
    return r
}

private func arrondiSemaine(_ sem: SemaineVue) -> SemaineVue {
    var r = sem
    r.km = arrondiVue(sem.km)
    r.min = arrondiVue(sem.min)
    r.minutes = arrondiMinutes(sem.minutes)
    r.partSS = sem.partSS.map(arrondiVue)
    r.nbSS = arrondiVue(sem.nbSS)
    r.charge = arrondiVue(sem.charge)
    r.monotonie = sem.monotonie.map(arrondiVue)
    r.contrainte = sem.contrainte.map(arrondiVue)
    r.conformiteFootings = sem.conformiteFootings.map(arrondiVue)
    r.nbFootings = arrondiVue(sem.nbFootings)
    r.nbFootingsConformes = arrondiVue(sem.nbFootingsConformes)
    // ratioDimanche garde sa précision : son état est jugé à 0,01 près (D-015), un double arrondi le fausserait.
    return r
}

private func arrondiPalier(_ p: Palier) -> Palier {
    Palier(semaines: arrondiVue(p.semaines), reference_km: arrondiVue(p.reference_km))
}

private func arrondiBarres(_ barres: [BarreVolume]) -> [BarreVolume] {
    barres.map { b in
        var r = b
        r.km = arrondiVue(b.km)
        return r
    }
}

private func arrondiCompteurs(_ c: Compteurs) -> Compteurs {
    var r = c
    r.annee = arrondiVolumeAnnee(c.annee)
    r.jours30 = arrondiVolume(c.jours30)
    r.jours7 = arrondiVolume(c.jours7)
    return r
}

private func arrondiVolume(_ v: Volume) -> Volume {
    var r = v
    r.km = arrondiVue(v.km)
    r.duree_min = arrondiVue(v.duree_min)
    r.nbSeances = arrondiVue(v.nbSeances)
    r.ecart = v.ecart.map(arrondiVue)
    r.serie = arrondiBarres(v.serie)
    return r
}

private func arrondiVolumeAnnee(_ v: VolumeAnnee) -> VolumeAnnee {
    var r = v
    r.km = arrondiVue(v.km)
    r.duree_min = arrondiVue(v.duree_min)
    r.nbSeances = arrondiVue(v.nbSeances)
    r.ecart = v.ecart.map(arrondiVue)
    r.serie = arrondiBarres(v.serie)
    r.moyenneHebdo_km = arrondiVue(v.moyenneHebdo_km)
    return r
}
