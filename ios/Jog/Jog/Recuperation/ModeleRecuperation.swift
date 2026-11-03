// Logique d'affichage de la récupération (D-023) : textes de la carte, tuiles, feuille « Cette nuit », tendances,
// sommeil des 14 dernières nuits et semaines de R6. Aucun import SwiftUI : ce fichier se teste sans interface. Les textes
// suivent 03 (A5, A6, R1 à R6) et la maquette recuperation.html ; les calculs restent dans JogCore.
import Foundation
import JogCore

enum ModeleRecuperation {
    static let messageSansNuit = "Aucune nuit mesurée dans Santé. Porte l’Apple Watch la nuit, avec le suivi du sommeil activé."

    /// Tuile de la carte (A5) : valeur du jour, norme, mini-courbe des 14 dernières moyennes sur 7 nuits et bande de norme.
    struct Tuile: Identifiable {
        let id: String
        let libelle: String
        let valeur: String
        let unite: String
        let norme: String
        let courbe: [Double?]
        /// Bande de norme : absente quand la norme n'est pas encore calculée.
        let bandeBas: Double?
        let bandeHaut: Double?
    }

    struct Carte {
        let titre: String
        let pastille: (texte: String, ton: Ton)
        let tuiles: [Tuile]
        let phrase: String
    }

    /// La carte de A5 pour la Vue de récupération. Nil sans nuit mesurée : la carte affiche alors `messageSansNuit`.
    static func carte(_ r: VueRecuperation?, besoin_min: Double) -> Carte? {
        guard let r else { return nil }
        let p = r.point
        let quatorze = r.serie.suffix(14)
        let tuiles = [
            Tuile(
                id: "vfc", libelle: "VFC", valeur: nombre(p.vfc7_ms), unite: "ms",
                norme: plage("norme", p.vfcBas, p.vfcHaut), courbe: quatorze.map(\.vfc7_ms),
                bandeBas: p.vfcBas, bandeHaut: p.vfcHaut
            ),
            Tuile(
                id: "fc-repos", libelle: "FC de repos", valeur: nombre(p.fc7), unite: "bpm",
                norme: plage("norme", p.fcBas, p.fcHaut), courbe: quatorze.map(\.fc7),
                bandeBas: p.fcBas, bandeHaut: p.fcHaut
            ),
            Tuile(
                id: "sommeil", libelle: "Sommeil", valeur: dureeCourte(p.sommeil7_min), unite: "",
                norme: "besoin \(dureeCourte(besoin_min))", courbe: quatorze.map(\.sommeil7_min),
                bandeBas: besoin_min - 45, bandeHaut: besoin_min
            ),
        ]
        return Carte(
            titre: r.titre, pastille: (libellePastille(r.etat), tonEtat(r.etat)), tuiles: tuiles, phrase: r.phrase
        )
    }

    /// Libellé VoiceOver combiné de la carte (A5) : état, puis chaque tuile, puis la phrase.
    static func libelleAccessible(_ carte: Carte) -> String {
        let tuiles = carte.tuiles.map(libelleAccessible).joined(separator: ", ")
        return "Récupération : \(carte.titre). \(tuiles). \(carte.phrase)"
    }

    /// Une tuile lue à voix haute : « VFC 52 millisecondes, norme 40 à 59 ».
    private static func libelleAccessible(_ tuile: Tuile) -> String {
        let unite = switch tuile.unite {
        case "ms": "millisecondes"
        case "bpm": "battements par minute"
        default: tuile.unite
        }
        let valeur = [tuile.valeur, unite].filter { !$0.isEmpty }.joined(separator: " ")
        return "\(tuile.libelle) \(valeur), \(tuile.norme.replacingOccurrences(of: "–", with: " à "))"
    }

    // MARK: - États

    static func tonEtat(_ e: EtatRecuperation) -> Ton {
        switch e {
        case .dansLaNorme: .bon
        case .sousLaNorme: .attention
        case .basse: .mauvais
        case .normeEnCours, .nuitsInsuffisantes: .neutre
        }
    }

    /// Texte de la pastille de l'état (la couleur ne porte jamais seule l'état, 08).
    static func libellePastille(_ e: EtatRecuperation) -> String {
        switch e {
        case .dansLaNorme: "OK"
        case .sousLaNorme: "À surveiller"
        case .basse: "Alerte"
        case .normeEnCours, .nuitsInsuffisantes: "Données insuffisantes"
        }
    }

    static func libelleIndicateur(_ e: EtatIndicateur) -> String {
        switch e {
        case .ok: "OK"
        case .surveiller: "À surveiller"
        case .alerte: "Alerte"
        case .insuffisant: "Données insuffisantes"
        case .contexte: "Contexte"
        }
    }

    /// « 3 sur 4 au vert » : les contextes ne comptent pas (R2).
    static func resumeIndicateurs(_ indicateurs: [IndicateurRecuperation]) -> String {
        let mesures = indicateurs.filter { $0.etat != .contexte }
        let ok = mesures.filter { $0.etat == .ok }.count
        return "\(ok) sur \(mesures.count) au vert"
    }

    // MARK: - Cette nuit (A6)

    struct Nuit {
        let duree: String
        let ecart: String
        let ecartTon: Ton
        let date: String
        let segments: [(debut: Date, fin: Date, phase: PhaseSommeil)]
        /// Début, milieu et fin de la session, « 23:04 ».
        let heures: [String]
        /// Libellé, valeur et unité : VFC, FC de repos, Profond, Paradoxal.
        let valeurs: [(String, String, String)]
    }

    /// La feuille « Cette nuit » (A6) pour la session de A. Nil si aucune session n'est retenue pour A.
    static func nuit(_ r: VueRecuperation, besoin_min: Double, calendrier: Calendar) -> Nuit? {
        guard let session = r.derniereSession else { return nil }
        let ecart = session.sommeil_min - besoin_min
        // Pastille orange au-delà de 45 min sous le besoin, après arrondi à la minute (D-015).
        let ecartArrondi = (try? arrondir(ecart, 1)) ?? ecart
        let ecartTon: Ton = ecartArrondi <= -RECUPERATION.sommeilSurveiller_min ? .attention : .neutre
        let debut = session.debutUtc_ms, fin = session.finUtc_ms
        let soir = ModeleApercu.veille(session.date).map(formatJourDate) ?? ModeleApercu.tiret
        return Nuit(
            duree: dureeEspacee(session.sommeil_min),
            ecart: "\(ModeleApercu.ecart(ecart)) min / besoin",
            ecartTon: ecartTon,
            date: "Nuit du \(soir) au \(formatJourDate(session.date))",
            segments: session.segments.map {
                (debut: instant($0.debutUtc_ms), fin: instant($0.finUtc_ms), phase: $0.phase)
            },
            heures: [debut, (debut + fin) / 2, fin].map { heure(instant($0), calendrier) },
            valeurs: [
                ("VFC", nombre(r.point.vfc_ms), "ms"),
                ("FC de repos", nombre(r.point.fc), "bpm"),
                ("Profond", nombre(session.profond_min), "min"),
                ("Paradoxal", nombre(session.paradoxal_min), "min"),
            ]
        )
    }

    // MARK: - Tendances (R3 et R4)

    struct PointTendance: Identifiable {
        let id: DateCivile
        let date: Date
        /// Mesure de la nuit ; nil si la montre n'a pas été portée.
        let nuit: Double?
        let moyenne7: Double?
        let bas: Double?
        let haut: Double?
    }

    /// Les `nuits` derniers points de la série pour la VFC ou la FC de repos (56 ou 182 nuits). Une nuit absente garde sa bande.
    static func tendance(_ r: VueRecuperation, mesure: CleIndicateur, nuits: Int) -> [PointTendance] {
        guard mesure == .vfc || mesure == .fcRepos else { return [] }
        return r.serie.suffix(nuits).map { p in
            PointTendance(
                id: p.date,
                date: ModeleApercu.date(p.date) ?? .distantPast,
                nuit: mesure == .vfc ? p.vfc_ms : p.fc,
                moyenne7: mesure == .vfc ? p.vfc7_ms : p.fc7,
                bas: mesure == .vfc ? p.vfcBas : p.fcBas,
                haut: mesure == .vfc ? p.vfcHaut : p.fcHaut
            )
        }
    }

    /// La ligne de lecture de R3 et R4 : « Ce matin » par défaut, ou la nuit touchée au doigt.
    static func lectureTendance(_ p: PointTendance?, mesure: CleIndicateur, ceMatin: Bool) -> String {
        guard let p else { return ModeleApercu.tiret }
        let unite = mesure == .vfc ? "ms" : "bpm"
        let moyenne = "moy. 7 n. \(nombre(p.moyenne7))"
        if ceMatin {
            return "Ce matin : moy. 7 nuits \(avecUnite(p.moyenne7, unite)) · norme \(plage(nil, p.bas, p.haut))"
        }
        let mesureNuit = p.nuit.map { "nuit \(avecUnite($0, unite))" } ?? "pas de mesure (montre non portée)"
        return "Nuit du \(formatJourDate(p.id)) : \(mesureNuit) · \(moyenne) · norme \(plage(nil, p.bas, p.haut))"
    }

    // MARK: - Sommeil des 14 dernières nuits (R5)

    struct BarreSommeil: Identifiable {
        let id: DateCivile
        let absente: Bool
        /// Profond, paradoxal, léger, éveillé : de bas en haut sur la barre, en minutes.
        let phases: [(PhaseSommeil, Double)]

        /// Minutes d'une phase (0 pour une nuit absente).
        func minutes(_ phase: PhaseSommeil) -> Double {
            phases.first { $0.0 == phase }?.1 ?? 0
        }

        /// Temps endormi : profond, paradoxal et léger.
        var sommeil: Double {
            minutes(.profond) + minutes(.paradoxal) + minutes(.leger)
        }

        /// Hauteur de la barre : toutes les phases, éveillé compris.
        var total: Double {
            phases.reduce(0) { $0 + $1.1 }
        }
    }

    /// Les 14 nuits de A−13 à A (R5). Une nuit absente donne une barre vide, marquée « – ».
    static func sommeil14(_ r: VueRecuperation) -> [BarreSommeil] {
        let dates = (0..<14).reversed().compactMap { try? ajouterJours(r.aujourdhui, -$0) }
        return dates.map { date in
            guard let nuit = r.nuits.first(where: { $0.date == date }) else {
                return BarreSommeil(id: date, absente: true, phases: [])
            }
            return BarreSommeil(id: date, absente: false, phases: [
                (.profond, nuit.profond_min),
                (.paradoxal, nuit.paradoxal_min),
                (.leger, nuit.leger_min),
                (.eveille, nuit.eveille_min),
            ])
        }
    }

    // MARK: - Récupération et charge (R6)

    struct SemaineChargeRecup: Identifiable {
        let id: DateCivile
        let km: Double
        /// Écart moyen de la VFC à sa norme, en % ; nil sans norme cette semaine-là.
        let ecart: Double?
        let enCours: Bool
        /// Vrai si l'écart, arrondi au dixième, passe sous −8 % (orange, R6).
        let marque: Bool
    }

    /// Les 16 semaines de R6 : le volume vient de la Vue (0 si la semaine n'y figure pas), l'écart de la récupération.
    static func chargeEtRecuperation(_ vue: Vue) -> [SemaineChargeRecup] {
        guard let recuperation = vue.recuperation else { return [] }
        let derniere = recuperation.semaines.count - 1
        return recuperation.semaines.enumerated().map { indice, semaine in
            let km = vue.semaines.first(where: { $0.lundi == semaine.lundi })?.km ?? 0
            let marque = semaine.ecartVfc_pct.map { ecart in
                ((try? arrondir(ecart, 0.1)) ?? ecart) < RECUPERATION.ecartHebdoSignale_pct
            } ?? false
            return SemaineChargeRecup(
                id: semaine.lundi, km: km, ecart: semaine.ecartVfc_pct, enCours: indice == derniere, marque: marque
            )
        }
    }

    /// Le besoin de sommeil écrit « 7 h 30 » (feuille et réglages).
    static func besoinTexte(_ min: Double) -> String {
        dureeEspacee(min)
    }

    // MARK: - Onglet Récupération (lot 12, R1 à R7)

    /// Sections de l'onglet, dans l'ordre de 03 : R1 état, R2 signaux, R3 VFC, R4 FC de repos, R5 sommeil, R6 charge et
    /// récupération, R7 méthode. Sans nuit mesurée, il ne reste que le message (A5).
    enum SectionRecuperation: Hashable, Sendable {
        case etat, signaux, vfc, fcRepos, sommeil, chargeRecuperation, methode, sansNuit
    }

    static func sections(_ r: VueRecuperation?) -> [SectionRecuperation] {
        guard r != nil else { return [.sansNuit] }
        return [.etat, .signaux, .vfc, .fcRepos, .sommeil, .chargeRecuperation, .methode]
    }

    /// Surtitre de R1 (maquette, « Ce matin »).
    static let surtitre = "Ce matin · moyenne des 7 dernières nuits face à ta norme de 60 jours"

    /// Mention de source, sous la méthode (R7, maquette).
    static let sourceTexte = "Source : Apple Santé (HealthKit). Pas de score sur 100 : chaque valeur est affichée face à sa propre norme."

    /// Note de norme de la feuille d'un indicateur qui a une norme (R2).
    static let noteNorme = "Norme : 60 nuits précédentes, plus ou moins un écart-type environ."

    /// Les cinq indicateurs de R2 de la Vue, au besoin de l'app (JogCore, 04).
    static func indicateurs(_ r: VueRecuperation, besoin_min: Double) throws -> [IndicateurRecuperation] {
        try indicateursRecuperation(point: r.point, nuits: r.nuits, aujourdhui: r.aujourdhui, besoin_min: besoin_min)
    }

    /// Ton d'une pastille d'indicateur : vert, orange, rouge ; données insuffisantes et contexte restent neutres.
    static func tonIndicateur(_ e: EtatIndicateur) -> Ton {
        switch e {
        case .ok: .bon
        case .surveiller: .attention
        case .alerte: .mauvais
        case .insuffisant, .contexte: .neutre
        }
    }

    /// « valeur · détail » d'une ligne de R2 ; sans détail, la valeur seule.
    static func valeurEtDetail(_ indicateur: IndicateurRecuperation) -> String {
        indicateur.detail.isEmpty ? indicateur.valeurTexte : "\(indicateur.valeurTexte) · \(indicateur.detail)"
    }

    /// Feuille d'un indicateur (R2) : valeur, pastille, détail, explication, repères et note de norme.
    struct FeuilleIndicateur: Equatable {
        struct Repere: Equatable {
            let libelle: String
            let ton: Ton
            let texte: String
        }

        let nom: String
        let valeur: String
        let pastille: String
        let ton: Ton
        let detail: String
        let explication: String
        /// Nil s'il n'y a pas de repère (contexte) : la feuille n'a alors pas de bloc « Repères ».
        let reperes: [Repere]?
        /// Note de norme, affichée sur la feuille de chaque indicateur.
        let note: String
    }

    static func feuille(_ indicateur: IndicateurRecuperation) -> FeuilleIndicateur {
        let reperes = indicateur.reperes.isEmpty ? nil : indicateur.reperes.map {
            FeuilleIndicateur.Repere(libelle: libelleIndicateur($0.etat), ton: tonIndicateur($0.etat), texte: $0.texte)
        }
        return FeuilleIndicateur(
            nom: indicateur.nom, valeur: indicateur.valeurTexte, pastille: libelleIndicateur(indicateur.etat),
            ton: tonIndicateur(indicateur.etat), detail: indicateur.detail, explication: indicateur.explication,
            reperes: reperes, note: noteNorme
        )
    }

    /// Un paragraphe de R7 : le titre en gras, puis la suite, et les puces de l'état.
    struct ParagrapheMethode: Equatable {
        let titre: String
        let suite: String
        let puces: [String]

        var texte: String { titre + suite }
    }

    /// Les 4 paragraphes de « Comment c’est calculé », recopiés de la maquette recuperation.html.
    static let methode: [ParagrapheMethode] = [
        ParagrapheMethode(
            titre: "Mesure.",
            suite: " L’Apple Watch relève la VFC (SDNN, pas RMSSD) plusieurs fois pendant le sommeil. On fait la moyenne de la nuit, en logarithme. La FC de repos est la FC moyenne pendant le sommeil, pas la valeur du jour donnée par Santé.",
            puces: []
        ),
        ParagrapheMethode(
            titre: "Norme.",
            suite: " Moyenne des 60 nuits précédentes, plus ou moins un écart-type environ, recalculée chaque matin. Il faut au moins 21 nuits mesurées. Avant cela, l’écran affiche « Norme en cours de calcul ».",
            puces: []
        ),
        ParagrapheMethode(
            titre: "État",
            suite: ", figé au réveil :",
            puces: [
                "Dans ta norme : VFC sur 7 nuits dans la bande.",
                "Sous ta norme : VFC sur 7 nuits sous la bande.",
                "Basse : VFC sous la bande et FC de repos au-dessus de la sienne.",
            ]
        ),
        ParagrapheMethode(
            titre: "Sommeil.",
            suite: " C’est un contexte, pas une entrée de l’état. Repère : besoin réglable, 7 h 30 par défaut. Une nuit sans montre est ignorée, jamais comptée à zéro.",
            puces: []
        ),
    ]

    // MARK: - Graphiques R3 à R6 (lot 13)

    /// Fenêtre de R3 et R4 : 8 semaines (56 nuits) ou 6 mois (la série de JogCore, 182 nuits au plus).
    enum FenetreTendance: CaseIterable, Hashable {
        case huitSemaines, sixMois

        var nuits: Int {
            switch self {
            case .huitSemaines: 56
            case .sixMois: RECUPERATION.nuitsSerie
            }
        }

        var libelle: String {
            switch self {
            case .huitSemaines: "8 semaines"
            case .sixMois: "6 mois"
            }
        }
    }

    /// Un point d'une série : la date civile (identité) et sa date sur l'axe.
    struct Repere: Identifiable {
        let id: DateCivile
        let date: Date
        let valeur: Double
    }

    /// Bande de norme d'une nuit (R3, R4) : de `bas` à `haut`.
    struct Bande: Identifiable {
        let id: DateCivile
        let date: Date
        let bas: Double
        let haut: Double
    }

    /// Modèle de R3 ou R4 : les nuits, les moyennes en segments (une absence coupe la courbe), les bandes, les bornes de
    /// l'axe Y (D-009).
    struct Tendance {
        let points: [PointTendance]
        let nuits: [Repere]
        let moyennes: [[Repere]]
        let bandes: [Bande]
        let domaine: ClosedRange<Double>
    }

    /// Pas de l'axe Y de R3 (5 ms) et de R4 (2 bpm).
    static func pasTendance(_ mesure: CleIndicateur) -> Double {
        mesure == .vfc ? 5 : 2
    }

    static func modeleTendance(_ r: VueRecuperation, mesure: CleIndicateur, fenetre: FenetreTendance) -> Tendance {
        let points = tendance(r, mesure: mesure, nuits: fenetre.nuits)
        let valeurs = points.flatMap { [$0.nuit, $0.moyenne7, $0.bas, $0.haut] }.compactMap { $0 }
        // D-009 : au pas de 5 ms pour la VFC, de 2 bpm pour la FC ; la plage minimale de la VFC est de 20 ms.
        let domaine = mesure == .vfc
            ? domaineAxe(ParamsDomaine(valeurs: valeurs, plageMin: .etendue(20), pas: pasTendance(mesure)))
            : domaineAxe(valeurs, preset: .fcFin)
        let nuits = points.compactMap { p in p.nuit.map { Repere(id: p.id, date: p.date, valeur: $0) } }
        var segments: [[Repere]] = [[]]
        for p in points {
            if let moyenne = p.moyenne7 {
                segments[segments.count - 1].append(Repere(id: p.id, date: p.date, valeur: moyenne))
            } else if !(segments.last?.isEmpty ?? true) {
                segments.append([])
            }
        }
        let bandes = points.compactMap { p -> Bande? in
            guard let bas = p.bas, let haut = p.haut else { return nil }
            return Bande(id: p.id, date: p.date, bas: bas, haut: haut)
        }
        return Tendance(
            points: points, nuits: nuits, moyennes: segments.filter { !$0.isEmpty }, bandes: bandes, domaine: domaine,
        )
    }

    /// Dernier point ayant une moyenne 7 nuits (le point final marqué de R3 et R4).
    static func pointFinal(_ tendance: Tendance) -> Repere? {
        tendance.moyennes.last?.last
    }

    /// Une tranche de barre de R5 : une phase d'une nuit, de `debut` à `fin` en minutes depuis le bas de la barre.
    struct TrancheBarre: Identifiable {
        let id: String
        let date: Date
        let debut: Double
        let fin: Double
        let phase: PhaseSommeil
    }

    /// Les tranches des nuits mesurées de R5, de bas en haut (profond, paradoxal, léger, éveillé). Une nuit absente n'en a pas.
    static func tranches(_ barres: [BarreSommeil]) -> [TrancheBarre] {
        var resultat: [TrancheBarre] = []
        for barre in barres where !barre.absente {
            guard let date = ModeleApercu.date(barre.id) else { continue }
            var bas = 0.0
            for (phase, minutes) in barre.phases {
                resultat.append(TrancheBarre(id: "\(barre.id)-\(phase.rawValue)", date: date, debut: bas, fin: bas + minutes, phase: phase))
                bas += minutes
            }
        }
        return resultat
    }

    /// Axe Y de R5 : de 0 à 10 h au moins, au-delà si une nuit dépasse (pas de 2 h).
    static func domaineSommeil(_ barres: [BarreSommeil]) -> ClosedRange<Double> {
        let maximum = barres.map(\.total).max() ?? 0
        return 0...max(600, (maximum / 120).rounded(.up) * 120)
    }

    /// Durée des lectures de R5 : « 1 h 40 » sans coupure entre l'heure et les minutes (espaces insécables).
    private static func dureeLecture(_ minutes: Double) -> String {
        dureeEspacee(minutes).replacingOccurrences(of: " ", with: "\u{00A0}")
    }

    /// La ligne de lecture de R5 : moyenne des nuits mesurées, « Moyenne 14 nuits : 7 h 02 · profond 58 min · paradoxal 1 h 31 ».
    static func lectureSommeil(_ barres: [BarreSommeil]) -> String {
        let mesurees = barres.filter { !$0.absente }
        guard !mesurees.isEmpty else { return ModeleApercu.tiret }
        let n = Double(mesurees.count)
        let sommeil = mesurees.reduce(0) { $0 + $1.sommeil } / n
        let profond = mesurees.reduce(0) { $0 + $1.minutes(.profond) } / n
        let paradoxal = mesurees.reduce(0) { $0 + $1.minutes(.paradoxal) } / n
        return "Moyenne \(barres.count) nuits : \(dureeLecture(sommeil)) · profond \(nombre(profond)) min · paradoxal \(dureeLecture(paradoxal))"
    }

    /// La lecture d'une nuit touchée au doigt (R5) : la durée, les phases, l'éveillé en minutes.
    static func lectureNuit(_ barre: BarreSommeil) -> String {
        let quand = "Nuit du \(formatJourDate(barre.id))"
        guard !barre.absente else { return "\(quand) : pas de mesure (montre non portée)" }
        return "\(quand) : \(dureeLecture(barre.sommeil)) · profond \(nombre(barre.minutes(.profond))) min · paradoxal \(dureeLecture(barre.minutes(.paradoxal))) · éveillé \(nombre(barre.minutes(.eveille))) min"
    }

    /// Un point de l'écart de R6 : la semaine (centre sur l'axe), son écart, et la marque orange sous −8 %.
    struct PointEcart: Identifiable {
        let id: DateCivile
        let date: Date
        let valeur: Double
        let marque: Bool
    }

    /// Les écarts de R6 en segments continus : une semaine sans norme coupe la courbe.
    static func segmentsEcart(_ semaines: [SemaineChargeRecup]) -> [[PointEcart]] {
        var segments: [[PointEcart]] = [[]]
        for semaine in semaines {
            if let ecart = semaine.ecart {
                let date = Date(timeIntervalSince1970: centreSemaine(semaine.id))
                segments[segments.count - 1].append(PointEcart(id: semaine.id, date: date, valeur: ecart, marque: semaine.marque))
            } else if !(segments.last?.isEmpty ?? true) {
                segments.append([])
            }
        }
        return segments.filter { !$0.isEmpty }
    }

    /// Axe Y de R6 pour les kilomètres : de 0 au moins 50 km, par pas de 50.
    static func domaineKm(_ semaines: [SemaineChargeRecup]) -> ClosedRange<Double> {
        domaineAxe(ParamsDomaine(valeurs: semaines.map(\.km), plageMin: .intervalle(0, 50), pas: 50, plancher: 0))
    }

    /// Axe Y de R6 pour l'écart de la VFC : au moins −8 % à +8 %, par pas de 5 % (le seuil −8 % reste visible).
    static func domaineEcart(_ semaines: [SemaineChargeRecup]) -> ClosedRange<Double> {
        domaineAxe(ParamsDomaine(valeurs: semaines.compactMap(\.ecart), plageMin: .intervalle(-8, 8), pas: 5))
    }

    /// La lecture de R6 : « Semaine en cours : 62 km · VFC −3 % face à la norme », ou la semaine touchée au doigt.
    static func lectureCharge(_ semaine: SemaineChargeRecup?) -> String {
        guard let semaine else { return ModeleApercu.tiret }
        let quand = semaine.enCours ? "Semaine en cours" : "Semaine du \(formatDate(semaine.id))"
        let ecart = semaine.ecart.map(ModeleApercu.ecartPourcentage) ?? ModeleApercu.tiret
        return "\(quand) : \(nombre(semaine.km)) km · VFC \(ecart) face à la norme"
    }

    /// Note de R6 (03, R6 ; maquette) : la charge n'est plus absorbée quand le volume monte et la VFC reste basse.
    static let noteCharge = "Quand le volume monte et que la VFC passe sous sa norme plusieurs semaines de suite, la charge n’est plus absorbée. Une baisse isolée d’une nuit ne veut rien dire."

    /// Instant d'une date civile à midi UTC (ModeleApercu.date) : position d'une nuit sur l'axe des jours.
    static func temps(_ jour: DateCivile) -> Double {
        ModeleApercu.date(jour)?.timeIntervalSince1970 ?? 0
    }

    /// Domaine de l'axe des nuits : chaque nuit occupe un jour, centré sur midi.
    static func domaineNuits(_ jours: [DateCivile]) -> ClosedRange<Double> {
        guard let premier = jours.first, let dernier = jours.last else { return 0...1 }
        return (temps(premier) - 43_200)...(temps(dernier) + 43_200)
    }

    /// Centre d'une semaine (lundi à dimanche) : jeudi à midi UTC. Les barres de R6 y sont centrées.
    static func centreSemaine(_ lundi: DateCivile) -> Double {
        temps(lundi) + 3 * 86_400
    }

    /// Marge du bord du tracé, en plus de la demi-étiquette : le dernier libellé, centré sur sa position, reste dans la carte.
    static let margeBordAxe: CGFloat = 8

    /// Domaine prolongé à droite de `marge` pt sur un axe de `longueur` pt : le dernier libellé, centré sur sa position,
    /// ne sort pas du tracé.
    static func domaineAvecMarge(_ domaine: ClosedRange<Double>, longueur: CGFloat, marge: CGFloat) -> ClosedRange<Double> {
        guard longueur > 0 else { return domaine }
        let etendue = domaine.upperBound - domaine.lowerBound
        return domaine.lowerBound...(domaine.upperBound + Double(marge) * etendue / Double(longueur))
    }

    /// Domaine de l'axe des semaines : chaque semaine occupe sept jours, du lundi 0 h au lundi suivant 0 h.
    static func domaineSemaines(_ lundis: [DateCivile]) -> ClosedRange<Double> {
        guard let premier = lundis.first, let dernier = lundis.last else { return 0...1 }
        return (temps(premier) - 43_200)...(temps(dernier) - 43_200 + 7 * 86_400)
    }

    static func etiquetteHeures(_ minutes: Double) -> String {
        ModeleApercu.nombre(minutes / 60) + " h"
    }

    static func etiquetteEcart(_ pourcent: Double) -> String {
        ModeleApercu.ecartPourcentage(pourcent)
    }

    /// Étiquette d'une nuit sur l'axe de R5 : « mer. 21 ».
    static func etiquetteNuit(_ jour: DateCivile) -> String {
        "\(ModeleApercu.jourCourt(jour)) \(ModeleApercu.quantieme(jour))"
    }

    static func etiquetteSemaine(_ lundi: DateCivile) -> String {
        formatDate(lundi)
    }

    // MARK: - Aides

    private static func nombre(_ valeur: Double?, _ decimales: Int = 0) -> String {
        valeur.map { ModeleApercu.nombre($0, decimales) } ?? ModeleApercu.tiret
    }

    private static func avecUnite(_ valeur: Double?, _ unite: String) -> String {
        valeur.map { "\(ModeleApercu.nombre($0)) \(unite)" } ?? ModeleApercu.tiret
    }

    /// « norme 40–59 » ; sans l'une des bornes, un tiret. Le préfixe est vide pour la lecture de tendance.
    private static func plage(_ prefixe: String?, _ bas: Double?, _ haut: Double?) -> String {
        guard let bas, let haut else {
            return prefixe.map { "\($0) \(ModeleApercu.tiret)" } ?? ModeleApercu.tiret
        }
        let texte = "\(ModeleApercu.nombre(bas))–\(ModeleApercu.nombre(haut))"
        return prefixe.map { "\($0) \(texte)" } ?? texte
    }

    /// Durée des tuiles : « 6h52 ».
    private static func dureeCourte(_ minutes: Double?) -> String {
        guard let minutes, minutes.isFinite else { return ModeleApercu.tiret }
        return formatDuree(minutes)
    }

    /// Durée des textes : « 6 h 52 ».
    private static func dureeEspacee(_ minutes: Double) -> String {
        guard minutes.isFinite else { return ModeleApercu.tiret }
        return formatDuree(minutes).replacingOccurrences(of: "h", with: " h ")
    }

    private static func instant(_ ms: Double) -> Date {
        Date(timeIntervalSince1970: ms / 1000)
    }

    private static func heure(_ date: Date, _ calendrier: Calendar) -> String {
        let composantes = calendrier.dateComponents([.hour, .minute], from: date)
        return String(format: "%02ld:%02ld", composantes.hour ?? 0, composantes.minute ?? 0)
    }
}
