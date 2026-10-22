// Logique d'affichage de l'onglet Aperçu : textes, états, séries et bornes d'axe. Aucun import SwiftUI : ce fichier se
// teste sans interface. Les textes suivent 03, 05 et 08 ; les calculs restent dans JogCore.
import Foundation
import JogCore

/// Ton d'affichage. La couche SwiftUI le traduit en token Fjord (`Bon`, `Attention`, `Mauvais`, `Encre2`).
enum Ton: Equatable, Sendable {
    case bon, attention, mauvais, neutre
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
    static let joursCourts = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]

    // MARK: - Nombres et dates

    static func nombre(_ valeur: Double, _ decimales: Int = 0) -> String {
        (try? formatNombre(valeur, decimales)) ?? tiret
    }

    /// Écart signé (+22,6 ou −18). Sans valeur affichable, un tiret.
    static func ecart(_ valeur: Double, _ decimales: Int = 0) -> String {
        (try? formatEcart(valeur, decimales)) ?? tiret
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

    static func veille(_ J: DateCivile) -> DateCivile? {
        try? ajouterJours(J, -1)
    }

    static func libelleType(_ type: TypeSeance) -> String {
        switch type {
        case .footing: "Footing"
        case .footingLignesDroites: "Footing + lignes droites"
        case .sousSeuil: "Sous-seuil"
        case .sortieLongue: "Sortie longue"
        case .course: "Course"
        case .test: "Test"
        }
    }

    // MARK: - Verdict et signaux

    static func surtitre(J: DateCivile) -> String {
        guard let veille = veille(J) else { return "Décision volume" }
        return "Décision volume · données arrêtées au \(formatJourDate(veille)) au soir"
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

    // MARK: - Volume réalisé (A2)

    struct Comparaison: Equatable, Sendable {
        let pastille: String
        let ton: Ton
        let note: String
    }

    struct BarreAffichee: Identifiable, Equatable, Sendable {
        let id: String
        let date: Date
        let km: Double
        let sousSeuil: Bool
        let description: String
    }

    struct Compteur: Identifiable, Equatable, Sendable {
        let id: String
        let titre: String
        let plage: String
        let km: String
        let detail: String
        let comparaison: Comparaison
        let barres: [BarreAffichee]
        let libelleAccessible: String
    }

    static func compteurs(_ compteurs: Compteurs, J: DateCivile) -> [Compteur] {
        let annee = compteurs.annee
        let anneeCompteur = compteur(
            id: "annee",
            titre: "Année \(J.prefix(4))",
            J: J,
            km: annee.km,
            dureeMin: annee.duree_min,
            seances: annee.nbSeances,
            comparaison: Comparaison(pastille: "\(nombre(annee.moyenneHebdo_km, 1)) km/sem.", ton: .neutre, note: "en moyenne"),
            serie: annee.serie,
            hebdo: true
        )
        let trenteJours = compteurs.jours30
        let trente = compteur(
            id: "30-jours",
            titre: "30 derniers jours",
            J: J,
            km: trenteJours.km,
            dureeMin: trenteJours.duree_min,
            seances: trenteJours.nbSeances,
            comparaison: comparaisonEcart(trenteJours.ecart, historique: trenteJours.historiquePrecedent, note: "vs 30 j d’avant"),
            serie: trenteJours.serie,
            hebdo: false
        )
        let septJours = compteurs.jours7
        let sept = compteur(
            id: "7-jours",
            titre: "7 derniers jours",
            J: J,
            km: septJours.km,
            dureeMin: septJours.duree_min,
            seances: septJours.nbSeances,
            comparaison: comparaisonEcart(septJours.ecart, historique: septJours.historiquePrecedent, note: "vs 7 j d’avant"),
            serie: septJours.serie,
            hebdo: false
        )
        return [anneeCompteur, trente, sept]
    }

    private static func comparaisonEcart(_ ecart: Double?, historique: Bool, note: String) -> Comparaison {
        guard historique, let ecart, ecart.isFinite else {
            return Comparaison(pastille: "pas d’historique", ton: .neutre, note: "")
        }
        // Pastille orange au-delà de 30 % d’écart, neutre sinon (03, A2).
        return Comparaison(
            pastille: ecartPourcentage(ecart * 100),
            ton: abs(ecart) > 0.3 ? .attention : .neutre,
            note: note
        )
    }

    private static func compteur(
        id: String, titre: String, J: DateCivile, km: Double, dureeMin: Double, seances: Double,
        comparaison: Comparaison, serie: [BarreVolume], hebdo: Bool
    ) -> Compteur {
        let debut = serie.first?.date ?? J
        let fin = veille(J) ?? J
        let plage = "\(formatDate(debut)) – \(formatDate(fin))"
        let barresAffichees = barres(serie, hebdo: hebdo)
        let kmTexte = nombre(km)
        let detail = "\(formatDuree(dureeMin)) · \(pluriel(Int(seances.rounded()), "séance", "séances"))"
        var accessible = "\(titre), du \(plage), \(kmTexte) km, \(detail)"
        if comparaison.note.isEmpty {
            accessible += ", \(comparaison.pastille)"
        } else {
            accessible += ", \(comparaison.pastille) \(comparaison.note)"
        }
        return Compteur(
            id: id, titre: titre, plage: plage, km: kmTexte, detail: detail,
            comparaison: comparaison, barres: barresAffichees, libelleAccessible: accessible
        )
    }

    private static func barres(_ serie: [BarreVolume], hebdo: Bool) -> [BarreAffichee] {
        serie.compactMap { barre in
            guard let instant = date(barre.date) else { return nil }
            let libelle: String
            if barre.km <= 0 {
                libelle = "Repos"
            } else {
                libelle = barre.type.map(libelleType) ?? "Séance"
            }
            let description = hebdo
                ? "semaine du \(formatDate(barre.date)) · \(nombre(barre.km, 1)) km"
                : "\(formatJourDate(barre.date)) · \(libelle) · \(nombre(barre.km, 1)) km"
            return BarreAffichee(
                id: barre.date,
                date: instant,
                km: barre.km,
                sousSeuil: !hebdo && barre.type == .sousSeuil,
                description: description
            )
        }
    }

    // MARK: - Sept derniers jours (A3)

    struct SegmentIntensite: Equatable, Sendable {
        let zone: Zone
        let minutes: Double
        let fraction: Double
    }

    struct LigneJour: Identifiable, Equatable, Sendable {
        let id: String
        let jourCourt: String
        let quantieme: String
        let titre: String
        let estRepos: Bool
        let detail: String?
        let repartition: [SegmentIntensite]
        let libelleAccessible: String
    }

    struct SeptJours: Equatable, Sendable {
        let resume: String
        let lignes: [LigneJour]
    }

    /// Les jours de J−1 à J−7, le plus récent en premier (03, A3). Les jours sans séance sont des repos.
    static func septDerniersJours(_ vue: Vue) -> SeptJours {
        let jours = (1...7).compactMap { try? ajouterJours(vue.J, -$0) }
        let lignes: [LigneJour] = jours.compactMap { jour in
            guard let index = vue.jours.date.firstIndex(of: jour) else { return nil }
            return ligneJour(jour, index: index, vue: vue)
        }
        let seancesSemaine = vue.seances.filter { jours.contains($0.date) }
        let km = jours.compactMap { jour in vue.jours.date.firstIndex(of: jour).map { vue.jours.km[$0] } }.reduce(0, +)
        let subtMin = jours.compactMap { jour in vue.jours.date.firstIndex(of: jour).map { vue.jours.minutes.subt[$0] } }.reduce(0, +)
        let resume = "\(pluriel(seancesSemaine.count, "séance", "séances")) · \(nombre(km, 1)) km · \(nombre(subtMin)) min de sous-seuil"
        return SeptJours(resume: resume, lignes: lignes)
    }

    private static func ligneJour(_ jour: DateCivile, index: Int, vue: Vue) -> LigneJour {
        let seances = vue.seances.filter { $0.date == jour }
        let estRepos = seances.isEmpty
        let titre = estRepos ? "Repos" : seances.map { $0.nom ?? libelleType($0.type) }.joined(separator: " + ")
        var morceaux: [String] = []
        if !estRepos {
            let km = vue.jours.km[index]
            morceaux.append("\(formatDuree(vue.jours.min[index])) · \(nombre(km, 1)) km")
            if let fc = seances.compactMap(\.fcMoy).first {
                morceaux.append("\(nombre(fc)) bpm")
            }
            let allures = seances.filter { $0.type == .sousSeuil }
                .flatMap(\.repetitions).map(\.allure_skm).filter { $0.isFinite && $0 > 0 }
            if !allures.isEmpty {
                let moyenne = allures.reduce(0, +) / Double(allures.count)
                morceaux.append("\(formatAllure(moyenne))/km en rép.")
            }
        }
        let detail = morceaux.isEmpty ? nil : morceaux.joined(separator: " · ")
        let segments = repartition(
            easy: vue.jours.minutes.easy[index], mp: vue.jours.minutes.mp[index],
            subt: vue.jours.minutes.subt[index], hard: vue.jours.minutes.hard[index]
        )
        var accessible = "\(jourCourt(jour)) \(quantieme(jour)), \(titre)"
        if let detail { accessible += ", \(detail)" }
        return LigneJour(
            id: jour, jourCourt: jourCourt(jour), quantieme: quantieme(jour), titre: titre,
            estRepos: estRepos, detail: detail, repartition: segments,
            libelleAccessible: accessible
        )
    }

    static func repartition(easy: Double, mp: Double, subt: Double, hard: Double) -> [SegmentIntensite] {
        let valeurs: [(Zone, Double)] = [(.facile, easy), (.marathon, mp), (.sousSeuil, subt), (.auDessus, hard)]
        let utiles = valeurs.filter { $0.1.isFinite && $0.1 > 0 }
        let total = utiles.reduce(0) { $0 + $1.1 }
        guard total > 0 else { return [] }
        return utiles.map { SegmentIntensite(zone: $0.0, minutes: $0.1, fraction: $0.1 / total) }
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

    static func lectureFraicheur(_ tsb: Double) -> String {
        if tsb < -25 { return "surcharge" }
        if tsb < -10 { return "charge productive" }
        if tsb <= 5 { return "équilibre" }
        return "fraîcheur, sous-charge"
    }

    /// Bornes d'un axe (08, « Règles des graphiques ») : étendue minimale, marge de 5 % et arrondi vers l'extérieur.
    static func domaineAxe(
        _ valeurs: [Double], pas: Double, etendueMin: Double, reperes: [Double] = [], marge: Double = 0.05
    ) -> ClosedRange<Double> {
        let finies = (valeurs + reperes).filter { $0.isFinite }
        guard let minimum = finies.min(), let maximum = finies.max() else { return 0...etendueMin }
        var bas = minimum
        var haut = maximum
        if haut - bas < etendueMin {
            let centre = (bas + haut) / 2
            bas = centre - etendueMin / 2
            haut = centre + etendueMin / 2
        }
        let ecartMarge = (haut - bas) * marge
        bas = ((bas - ecartMarge) / pas).rounded(.down) * pas
        haut = ((haut + ecartMarge) / pas).rounded(.up) * pas
        return bas...haut
    }

    static func graduations(_ domaine: ClosedRange<Double>, pas: Double) -> [Double] {
        stride(from: domaine.lowerBound, through: domaine.upperBound, by: pas).map { $0 }
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
