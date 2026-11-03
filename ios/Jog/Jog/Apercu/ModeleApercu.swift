// Logique d'affichage de l'onglet Aperçu : textes, états, séries et bornes d'axe. Aucun import SwiftUI : ce fichier se
// teste sans interface. Les textes suivent 03, 05 et 08 ; les calculs restent dans JogCore.
import Foundation
import JogCore

/// Ton d'affichage. La couche SwiftUI le traduit en token Fjord (`Bon`, `Attention`, `Mauvais`, `Encre2`, accent).
enum Ton: Equatable, Sendable {
    case bon, attention, mauvais, neutre, accent
}

/// Une séance du jour, avec ce qu'il faut à son menu de marquage.
struct SeanceAffichee: Identifiable, Equatable, Sendable {
    let id: String
    let titre: String
    let marquage: Marquage
}

/// Les quatre intensités, dans l'ordre de la rampe (08).
enum Zone: CaseIterable, Hashable, Sendable {
    case facile, marathon, sousSeuil, auDessus

    var libelle: String {
        switch self {
        case .facile: "Facile"
        case .marathon: "Allure marathon"
        case .sousSeuil: "Sous-seuil"
        case .auDessus: "Au-dessus du seuil"
        }
    }
}

enum ModeleApercu {
    static let tiret = "–"
    static let moins = "−"
    static let joursCourts = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]

    // MARK: - Nombres et dates

    static func nombre(_ valeur: Double, _ decimales: Int = 0) -> String {
        (try? formatNombre(valeur, decimales)) ?? tiret
    }

    /// Écart signé (+22,6 ou −18). Sans valeur affichable, un tiret.
    static func ecart(_ valeur: Double, _ decimales: Int = 0) -> String {
        (try? formatEcart(valeur, decimales)) ?? tiret
    }

    /// Pourcentage, avec l'espace insécable de la rédaction (22 %), à `decimales` près.
    static func pourcentage(_ valeur: Double, _ decimales: Int = 0) -> String {
        (try? formatPourcentage(valeur, decimales)) ?? tiret
    }

    /// Le même pourcentage, ou un tiret sans valeur.
    static func pourcentageOuTiret(_ valeur: Double?, _ decimales: Int = 0) -> String {
        valeur.map { pourcentage($0, decimales) } ?? tiret
    }

    /// Signe seul d'une différence (« + » ou « − »), vide pour zéro.
    static func signeTexte(_ valeur: Double) -> String {
        if valeur > 0 { return "+" }
        if valeur < 0 { return moins }
        return ""
    }

    /// Nombre signé à `decimales` près, avec une unité optionnelle : « +3,7 s/km ». Sans valeur affichable, un tiret.
    static func signe(_ valeur: Double, _ decimales: Int = 0, unite: String = "") -> String {
        guard let texte = try? formatEcart(valeur, decimales) else { return tiret }
        return texte + unite
    }

    /// Écart en pourcentage, signé, avec l'espace insécable de la rédaction (+15 %).
    static func ecartPourcentage(_ pourcent: Double) -> String {
        ecart(pourcent) + "\u{00A0}%"
    }

    static func pluriel(_ n: Int, _ singulier: String, _ pluriel: String) -> String {
        "\(n) \(n == 1 ? singulier : pluriel)"
    }

    /// Date civile au midi UTC : un axe ou une infobulle ne glisse pas d'un jour selon le fuseau.
    static func date(_ civile: DateCivile) -> Date? {
        guard let n = try? numeroJour(civile) else { return nil }
        return Date(timeIntervalSince1970: Double(n) * 86_400 + 43_200)
    }

    static func jourCourt(_ civile: DateCivile) -> String {
        guard let index = try? jourDeSemaine(civile) else { return tiret }
        return joursCourts[index]
    }

    static func quantieme(_ civile: DateCivile) -> String {
        guard let dc = try? decomposerDate(civile) else { return tiret }
        return String(dc.jour)
    }

    /// « Dernière synchronisation : 27 oct. à 10:12 », à partir de l'ISO 8601 de la Vue, en heure locale. Nil si absente.
    static func texteDerniereSynchro(_ iso: String?) -> String? {
        guard let iso, let instant = instantISO(iso) else { return nil }
        let jour = formatDate(aujourdhuiCivil(maintenant: instant))
        let composantes = Calendar.current.dateComponents([.hour, .minute], from: instant)
        let heure = String(format: "%02ld:%02ld", composantes.hour ?? 0, composantes.minute ?? 0)
        return "Dernière synchronisation : \(jour) à \(heure)"
    }

    /// Un instant ISO 8601, avec ou sans fractions de seconde (le moteur écrit « 2026-10-27T10:12:03.512Z »).
    static func instantISO(_ texte: String) -> Date? {
        if let instant = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(texte) {
            return instant
        }
        return try? Date.ISO8601FormatStyle().parse(texte)
    }

    /// Dernier jour compté pour une Vue de coupure `J` : aujourd'hui (D-022).
    static func veille(_ J: DateCivile) -> DateCivile? {
        try? ajouterJours(J, -1)
    }

    static func libelleType(_ type: TypeSeance) -> String {
        switch type {
        case .footing: "Footing"
        case .footingLignesDroites: "Footing + lignes droites"
        case .sousSeuil: "Sous-seuil"
        case .seanceQualite: "Séance qualité"
        case .sortieLongue: "Sortie longue"
        case .course: "Course"
        case .test: "Test"
        }
    }

    // MARK: - Verdict et signaux

    static func surtitre(J: DateCivile) -> String {
        guard let veille = veille(J) else { return "Décision volume" }
        return "Décision volume · données jusqu’au \(formatJourDate(veille))"
    }

    static func titreVerdict(_ verdict: Verdict) -> String {
        switch verdict {
        case .augmenter: "Augmenter le volume"
        case .maintenir: "Maintenir le volume"
        case .alleger: "Alléger le volume"
        case .aucun: "Pas encore de verdict"
        }
    }

    static func tonVerdict(_ verdict: Verdict) -> Ton {
        switch verdict {
        case .augmenter: .bon
        case .maintenir: .attention
        case .alleger: .mauvais
        case .aucun: .neutre
        }
    }

    static func tonEtat(_ etat: EtatSignal) -> Ton {
        switch etat {
        case .ok: .bon
        case .surveiller: .attention
        case .alerte: .mauvais
        case .insuffisant: .neutre
        }
    }

    /// Texte de la pastille. La couleur ne porte jamais seule l'état (08).
    static func libelleEtat(_ etat: EtatSignal) -> String {
        switch etat {
        case .ok: "OK"
        case .surveiller: "À surveiller"
        case .alerte: "Alerte"
        case .insuffisant: "Données insuffisantes"
        }
    }

    static func valeurSignal(_ signal: Signal) -> String {
        signal.valeurTexte.isEmpty ? tiret : signal.valeurTexte
    }

    static func resumeSignaux(_ signaux: [Signal]) -> String {
        let ok = signaux.filter { $0.etat == .ok }.count
        return "\(ok) sur \(signaux.count) au vert"
    }

    /// Libellé accessible d'un signal : nom, état et valeur, dans cet ordre.
    static func libelleAccessibleSignal(_ signal: Signal) -> String {
        "\(signal.nom), \(libelleEtat(signal.etat)), \(valeurSignal(signal)). \(signal.explication)"
    }

    static func fourchetteTexte(_ fourchette: Fourchette) -> String {
        "\(nombre(fourchette.min))–\(nombre(fourchette.max)) km"
    }

    /// Ligne sous la fourchette : la référence de calcul, et le rappel que ce n'est pas un plan (05).
    static func referenceTexte(_ fourchette: Fourchette, palier: Palier) -> String {
        let reference = nombre(fourchette.reference)
        let source: String
        switch fourchette.sourceReference {
        case .palier:
            source = "Référence : le palier de \(reference) km tenu \(nombre(palier.semaines)) semaines."
        case .moyenne30j:
            source = "Référence : la moyenne des 30 derniers jours, \(reference) km par 7 jours."
        }
        return source + " Une borne calculée sur le réalisé, pas un plan."
    }

    // MARK: - Simulateur

    struct ResultatAffiche: Equatable, Sendable {
        let ratio: String
        let tonRatio: Ton
        let fraicheur: String
        let tonFraicheur: Ton
        let phrase: String
    }

    /// Résultats du simulateur pour un volume donné. Nil si le moteur refuse le calcul.
    static func simulation(km: Double, simulateur: Simulateur, fourchette: Fourchette) -> ResultatAffiche? {
        guard let resultat = try? simuler(km, simulateur, fourchette) else { return nil }
        let ratio: String
        if let valeur = resultat.ratioProjete {
            ratio = (try? formatNombre(valeur, 2)) ?? tiret
        } else {
            ratio = tiret
        }
        return ResultatAffiche(
            ratio: ratio,
            tonRatio: tonEtat(resultat.etatRatio),
            fraicheur: ecart(resultat.fraicheur7j),
            tonFraicheur: tonEtat(resultat.etatFraicheur),
            phrase: resultat.phrase
        )
    }

    // MARK: - Forme et fatigue (A4)

    struct PointForme: Identifiable, Equatable, Sendable {
        let id: String
        let date: Date
        let forme: Double
        let fatigue: Double
        let fraicheur: Double
    }

    /// Un point sur deux, en partant du dernier jour (03, A4).
    static func pointsForme(_ serie: [PointCharge]) -> [PointForme] {
        let indices = Array(stride(from: serie.count - 1, through: 0, by: -2)).reversed()
        return indices.compactMap { index in
            let point = serie[index]
            guard let instant = date(point.date) else { return nil }
            return PointForme(id: point.date, date: instant, forme: point.ctl, fatigue: point.atl, fraicheur: point.tsb)
        }
    }

    /// Tout ce que l'écran A4 affiche, calculé une fois par Vue : points, bornes (D-009), tableaux et description VoiceOver.
    struct FormeFatigue: Equatable, Sendable {
        let points: [PointForme]
        let notes: [String]
        let domaineForme: ClosedRange<Double>
        let domaineFraicheur: ClosedRange<Double>
        let donneesForme: DonneesAccessibles
        let donneesFraicheur: DonneesAccessibles
        let resume: String
    }

    static func formeFatigue(_ vue: Vue) -> FormeFatigue {
        let points = pointsForme(vue.serieCharge)
        let domaineForme = domaineAxe(points.flatMap { [$0.forme, $0.fatigue] }, preset: .formeFond)
        // Les repères de la zone productive (−25 à −10) et le zéro restent visibles même si la série est plate.
        let domaineFraicheur = domaineAxe(points.map(\.fraicheur), preset: .fraicheur, reperes: [-25, -10, 0])
        let resume = "Un point sur deux, de la plus ancienne date à la plus récente."
        return FormeFatigue(
            points: points,
            notes: notesForme(vue),
            domaineForme: domaineForme,
            domaineFraicheur: domaineFraicheur,
            donneesForme: donneesForme(points, domaine: domaineForme, resume: resume),
            donneesFraicheur: donneesFraicheur(
                points, domaine: domaineFraicheur,
                resume: "Zone productive de −25 à −10. Sous −25 : surcharge. Au-dessus de +5 : frais."
            ),
            resume: resume
        )
    }

    /// Données VoiceOver du graphique forme et fatigue : deux séries, un axe Y commun (08, règle 1).
    static func donneesForme(_ points: [PointForme], domaine: ClosedRange<Double>, resume: String) -> DonneesAccessibles {
        DonneesAccessibles(
            titre: "Forme de fond et fatigue",
            resume: resume,
            axeX: "Jour",
            axeY: "Forme et fatigue",
            unite: "",
            libelles: points.map { formatDate($0.id) },
            series: [
                DonneesAccessibles.Serie(nom: "Forme de fond", valeurs: points.map { Optional($0.forme) }),
                DonneesAccessibles.Serie(nom: "Fatigue", valeurs: points.map { Optional($0.fatigue) }),
            ],
            domaineY: domaine,
            continu: true
        )
    }

    /// Données VoiceOver du graphique de fraîcheur (TSB) : une série, la zone productive est dans le résumé.
    static func donneesFraicheur(_ points: [PointForme], domaine: ClosedRange<Double>, resume: String) -> DonneesAccessibles {
        DonneesAccessibles(
            titre: "Fraîcheur",
            resume: resume,
            axeX: "Jour",
            axeY: "Fraîcheur",
            unite: "",
            libelles: points.map { formatDate($0.id) },
            series: [DonneesAccessibles.Serie(nom: "Fraîcheur", valeurs: points.map { Optional($0.fraicheur) })],
            domaineY: domaine,
            continu: true
        )
    }

    /// Lecture de la fraîcheur du jour (A4, 05). La mesure est arrondie à l'unité (D-015), puis jugée par `etatFraicheur`
    /// de JogCore : surcharge (alerte), sous-charge (à surveiller), sinon la zone productive ou l'équilibre (sous −10 : productive).
    static func lectureFraicheur(_ tsb: Double) -> String {
        guard tsb.isFinite, let arrondie = try? arrondirDecimales(tsb, 0) else { return tiret }
        switch etatFraicheur(arrondie) {
        case .alerte: return "surcharge"
        case .surveiller: return "fraîcheur, sous-charge"
        case .ok: return arrondie < -10 ? "charge productive" : "équilibre"
        case .insuffisant: return tiret
        }
    }

    /// La note de A4 : définitions et lecture du jour (03, A4).
    static func notesForme(_ vue: Vue) -> [String] {
        let globaux = vue.parametresEnVigueur.globaux
        let dernier = vue.serieCharge.last
        let lecture: String
        if let dernier {
            lecture = "Aujourd’hui : forme \(nombre(dernier.ctl)), fatigue \(nombre(dernier.atl)), fraîcheur \(ecart(dernier.tsb)), soit \(lectureFraicheur(dernier.tsb)). Seule la tendance compte."
        } else {
            lecture = "Pas encore assez d’historique pour lire la forme du jour."
        }
        return [
            "Forme de fond (CTL) : moyenne de la charge quotidienne sur \(nombre(globaux.ctlDays)) jours. Elle monte lentement avec la régularité.",
            "Fatigue (ATL) : même calcul sur \(nombre(globaux.atlDays)) jours. Elle réagit vite aux grosses séances.",
            "Fraîcheur (TSB) = forme − fatigue. De −10 à −25 (zone teintée), on charge et on progresse. Sous −25 : surcharge. Au-dessus de +5 : frais, mais le stimulus baisse si ça dure.",
            lecture,
        ]
    }
}

// MARK: - Vue vide

extension Vue {
    /// Une Vue sans données : l'Aperçu affiche alors « Pas encore de verdict ».
    static func vide(J: DateCivile) -> Vue {
        let vide = Compteurs(
            annee: VolumeAnnee(km: 0, duree_min: 0, nbSeances: 0, ecart: nil, historiquePrecedent: false, serie: [], moyenneHebdo_km: 0),
            jours30: Volume(km: 0, duree_min: 0, nbSeances: 0, ecart: nil, historiquePrecedent: false, serie: []),
            jours7: Volume(km: 0, duree_min: 0, nbSeances: 0, ecart: nil, historiquePrecedent: false, serie: [])
        )
        return Vue(
            formatVersion: FORMAT_VUE,
            reglesVersion: REGLES_VERSION,
            J: J,
            derniereSynchro: nil,
            parametresEnVigueur: ParametresEnVigueur(
                globaux: ParamsGlobaux(refHr: 0, paceHrK: 0, ctlDays: 42, atlDays: 7, subtPctLo: 0, subtPctHi: 0),
                datesAJm1: ParamsDates(
                    hrMax: 0, hrRest: 0, z1: 0, z2: 0, z3: 0, z4: 0, lt2Hr: 0, lt2Pace: 0,
                    easyCap: 0, subtHrLo: 0, subtHrHi: 0
                ),
                modifs: [],
                suggestionPaceHrK: nil,
                raisonAbsenceSuggestion: nil,
                suggestionHrMax: nil
            ),
            seances: [],
            jours: JoursVue(
                date: [], km: [], min: [], charge: [],
                minutes: MinutesColonnes(easy: [], mp: [], subt: [], hard: []),
                types: []
            ),
            premierJour: nil,
            serieCharge: [],
            ratio: SerieRatioVue(date: [], s7: [], chronic: [], r: []),
            semaines: [],
            palier: Palier(semaines: 0, reference_km: 0),
            compteurs: vide,
            decision: Decision(
                verdict: .aucun,
                phrase: "Il faut 30 jours d’historique pour comparer la semaine au mois.",
                signaux: [],
                fourchette: nil,
                simulateur: nil
            )
        )
    }
}
