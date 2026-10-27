// Logique d'affichage de l'onglet Charge (03, C1 à C3) : séries, bornes d'axe, lectures au doigt, tableaux (D-011) et
// descriptions VoiceOver. Aucun import SwiftUI : ce fichier se teste sans interface. Les calculs restent dans JogCore
// (selecteurs-progressivite, selecteurs-minutes-ss, selecteurs-discipline) ; ici on ne fait que mettre en forme.
import Foundation
import JogCore

enum ModeleCharge {
    static let fenetres: [FenetreProgressivite] = [.semaines16, .mois12]

    static func libelleFenetre(_ fenetre: FenetreProgressivite) -> String {
        switch fenetre {
        case .semaines16: "16 semaines"
        case .mois12: "12 mois"
        }
    }

    static func libelleEtat(_ etat: EtatMesure) -> String {
        switch etat {
        case .ok: "maîtrisée"
        case .surveiller: "à surveiller"
        case .alerte: "alerte"
        }
    }

    /// Libellé de la bande cible, « cible 20–25 % » (03, C3).
    static func libelleCible(_ lo: Double, _ hi: Double) -> String {
        "cible \(ModeleApercu.nombre(lo))–\(ModeleApercu.nombre(hi))\u{00A0}%"
    }

    /// Domaine d'un axe de barres : il part toujours de zéro (08, « Règles des graphiques »).
    static func domaineDepuisZero(
        _ valeurs: [Double], pas: Double, etendueMin: Double, reperes: [Double] = []
    ) -> ClosedRange<Double> {
        domaineAxe(ParamsDomaine(
            valeurs: valeurs, reperes: reperes + [0], plageMin: .etendue(etendueMin), pas: pas, plancher: 0
        ))
    }

    /// Position entière (semaine) sous le doigt, bornée à la série ; sans doigt, la dernière semaine.
    static func rang(_ position: Double?, dans nombreDeSemaines: Int) -> Int? {
        guard nombreDeSemaines > 0 else { return nil }
        guard let position else { return nombreDeSemaines - 1 }
        return min(max(Int(position.rounded()), 0), nombreDeSemaines - 1)
    }

    // MARK: - C1 · Progressivité 7 j / 30 j

    struct PointRatio: Identifiable, Equatable, Sendable {
        let id: DateCivile
        let date: Date
        /// Rang du segment de jours qui se suivent : un jour sans ratio coupe la ligne.
        let segment: Int
        let s7: Double
        let chronic: Double
        let r: Double
        let etat: EtatMesure
    }

    struct Progressivite: Equatable, Sendable {
        let points: [PointRatio]
        /// Le dernier jour calculé, J−1 (« Hier » dans la lecture).
        let derniere: PointRatio?
        let domaineVolume: ClosedRange<Double>
        let domaineRatio: ClosedRange<Double>
    }

    /// Nil si le sélecteur échoue. Une liste de points vide : moins de 30 jours d'historique (D-007).
    static func progressivite(_ vue: Vue, _ fenetre: FenetreProgressivite) -> Progressivite? {
        guard let selection = try? selectionProgressivite(vue, fenetre) else { return nil }
        var points: [PointRatio] = []
        for segment in selection.segments.enumerated() {
            for point in segment.element {
                guard let date = ModeleApercu.date(point.date) else { continue }
                points.append(PointRatio(
                    id: point.date, date: date, segment: segment.offset,
                    s7: point.s7, chronic: point.chronic, r: point.r, etat: point.etat
                ))
            }
        }
        let derniere = points.first { $0.id == selection.derniere?.date }
        return Progressivite(
            points: points,
            derniere: derniere,
            domaineVolume: domaineDepuisZero(points.flatMap { [$0.s7, $0.chronic] }, pas: 10, etendueMin: 20),
            domaineRatio: domaineAxe(points.map(\.r), preset: .ratio, reperes: [0.8, 1.3, 1.5])
        )
    }

    /// Le jour sous le doigt, ou le plus proche ; sans doigt, le dernier jour calculé.
    static func point(_ modele: Progressivite, _ doigt: Date?) -> PointRatio? {
        guard let doigt else { return modele.derniere }
        return modele.points.min { abs($0.date.timeIntervalSince(doigt)) < abs($1.date.timeIntervalSince(doigt)) }
    }

    static func lectureProgressivite(_ point: PointRatio?, surDoigt: Bool) -> String {
        guard let point else { return "Pas encore de jour à lire." }
        let quand = surDoigt ? formatDate(point.id) : "Hier"
        return "\(quand) : \(ModeleApercu.nombre(point.s7, 1)) km sur 7 jours · moyenne sur 30 jours \(ModeleApercu.nombre(point.chronic, 1)) km · ratio \(ModeleApercu.nombre(point.r, 2))"
    }

    static func tableauVolume(_ points: [PointRatio]) -> TableauAffiche {
        TableauAffiche(
            entetes: ["Date", "7 derniers jours (km)", "Moyenne 30 jours (km)"],
            lignes: points.map { [formatDate($0.id), ModeleApercu.nombre($0.s7, 1), ModeleApercu.nombre($0.chronic, 1)] }
        )
    }

    static func tableauRatio(_ points: [PointRatio]) -> TableauAffiche {
        TableauAffiche(
            entetes: ["Date", "Ratio 7 j / 30 j", "Lecture"],
            lignes: points.map { [formatDate($0.id), ModeleApercu.nombre($0.r, 2), libelleEtat($0.etat)] }
        )
    }

    static func donneesVolume(_ modele: Progressivite) -> DonneesAccessibles {
        DonneesAccessibles(
            titre: "Volume des 7 derniers jours et moyenne sur 30 jours",
            resume: "Barres : kilomètres des 7 derniers jours à chaque date. Courbe : moyenne hebdomadaire des 30 derniers jours.",
            axeX: "Jour",
            axeY: "Kilomètres",
            unite: "km",
            libelles: modele.points.map { formatDate($0.id) },
            series: [
                DonneesAccessibles.Serie(nom: "7 derniers jours", valeurs: modele.points.map { Optional($0.s7) }),
                DonneesAccessibles.Serie(nom: "Moyenne 30 jours", valeurs: modele.points.map { Optional($0.chronic) }),
            ],
            domaineY: modele.domaineVolume,
            continu: true
        )
    }

    static func donneesRatio(_ modele: Progressivite) -> DonneesAccessibles {
        DonneesAccessibles(
            titre: "Ratio 7 jours sur 30 jours",
            resume: "Bande de 0,8 à 1,3 : progression maîtrisée. Ligne de vigilance à 1,5.",
            axeX: "Jour",
            axeY: "Ratio",
            unite: "",
            libelles: modele.points.map { formatDate($0.id) },
            series: [DonneesAccessibles.Serie(nom: "Ratio", valeurs: modele.points.map { Optional($0.r) })],
            domaineY: modele.domaineRatio,
            continu: true
        )
    }

    // MARK: - C2 · Minutes de sous-seuil par semaine

    struct SemaineSousSeuil: Identifiable, Equatable, Sendable {
        /// Rang dans la série, 0 pour la plus ancienne : c'est la position sur l'axe.
        let id: Int
        let lundi: DateCivile
        let minutes: Double
        let seances: Int
    }

    struct MinutesSousSeuil: Equatable, Sendable {
        let semaines: [SemaineSousSeuil]
        let moyenne4: Double?
        /// Positions des semaines étiquetées, une toutes les 5 semaines.
        let etiquettes: [Double]
        let domaine: ClosedRange<Double>
    }

    static func minutesSousSeuil(_ vue: Vue) -> MinutesSousSeuil {
        let selection = selectionMinutesSS(vue)
        let semaines = selection.semaines.enumerated().map { rang in
            SemaineSousSeuil(
                id: rang.offset,
                lundi: rang.element.lundi,
                minutes: rang.element.minutesSS,
                seances: Int(rang.element.nbSS.rounded())
            )
        }
        let repereMoyenne = selection.moyenne4.map { [$0] } ?? []
        return MinutesSousSeuil(
            semaines: semaines,
            moyenne4: selection.moyenne4,
            etiquettes: selection.indicesEtiquetes.map { Double($0) },
            domaine: domaineDepuisZero(semaines.map(\.minutes) + repereMoyenne, pas: 20, etendueMin: 40)
        )
    }

    static func lectureMinutes(_ modele: MinutesSousSeuil, _ position: Double?) -> String {
        guard let rang = rang(position, dans: modele.semaines.count) else { return "Pas encore de semaine terminée." }
        let semaine = modele.semaines[rang]
        let prefixe = position == nil ? "Dernière semaine terminée, " : ""
        return "\(prefixe)\(formatSemaine(semaine.lundi)) : \(ModeleApercu.nombre(semaine.minutes)) min de sous-seuil · \(ModeleApercu.pluriel(semaine.seances, "séance", "séances"))"
    }

    static func libelleMoyenne(_ moyenne: Double) -> String {
        "moyenne 4 sem. : \(ModeleApercu.nombre(moyenne)) min"
    }

    static func tableauMinutes(_ modele: MinutesSousSeuil) -> TableauAffiche {
        TableauAffiche(
            entetes: ["Semaine du", "Minutes de sous-seuil", "Séances"],
            lignes: modele.semaines.map { [formatDate($0.lundi), ModeleApercu.nombre($0.minutes), String($0.seances)] }
        )
    }

    static func donneesMinutes(_ modele: MinutesSousSeuil) -> DonneesAccessibles {
        DonneesAccessibles(
            titre: "Minutes de sous-seuil par semaine",
            resume: "Les 26 dernières semaines terminées, une barre par semaine. Ligne : moyenne des 4 dernières semaines.",
            axeX: "Semaine",
            axeY: "Minutes",
            unite: "min",
            libelles: modele.semaines.map { formatSemaine($0.lundi) },
            series: [DonneesAccessibles.Serie(nom: "Minutes de sous-seuil", valeurs: modele.semaines.map { Optional($0.minutes) })],
            domaineY: modele.domaine,
            continu: false
        )
    }

    /// Date courte de la semaine repérée par sa position, pour l'axe.
    static func etiquette(_ modele: MinutesSousSeuil, _ position: Double) -> String? {
        let rang = Int(position.rounded())
        guard modele.semaines.indices.contains(rang) else { return nil }
        return formatDate(modele.semaines[rang].lundi)
    }

    // MARK: - C3 · Discipline NSA

    struct SemaineCible: Identifiable, Equatable, Sendable {
        let id: Int
        let lundi: DateCivile
        /// Nul si la semaine n'a aucune minute.
        let partPct: Double?
        let dansCible: Bool?
    }

    struct Discipline: Equatable, Sendable {
        let semaines: [SemaineCible]
        let cibleLo: Double
        let cibleHi: Double
        let domaine: ClosedRange<Double>
        /// Positions des semaines étiquetées, une toutes les 5 semaines, en partant de la plus récente.
        let etiquettes: [Double]
        let footings: String
        let monotonie: String
    }

    /// Nil si le sélecteur échoue.
    static func discipline(_ vue: Vue) -> Discipline? {
        guard let selection = try? selectionDiscipline(vue) else { return nil }
        let semaines = selection.semaines.enumerated().map { rang in
            SemaineCible(
                id: rang.offset,
                lundi: rang.element.lundi,
                partPct: rang.element.partPct,
                dansCible: rang.element.dansCible
            )
        }
        let lo = selection.cible.lo
        let hi = selection.cible.hi
        let note = selection.note
        let monotonie = note.monotonieMoyenne.map {
            "Monotonie de Foster moyenne \(ModeleApercu.nombre($0, 1)) : élevée par construction en NSA, à lire avec la charge et non comme une alerte isolée."
        } ?? "Monotonie de Foster : pas encore de valeur."
        return Discipline(
            semaines: semaines,
            cibleLo: lo,
            cibleHi: hi,
            domaine: domaineAxe(semaines.compactMap(\.partPct) + [lo, hi], preset: .partSousSeuil),
            etiquettes: semaines.indices.filter { (semaines.count - 1 - $0) % 5 == 0 }.map { Double($0) },
            footings: "Footings sous \(ModeleApercu.nombre(note.plafondBpm)) bpm : \(ModeleApercu.pourcentageOuTiret(note.footingsSousPlafondPct)) sur \(ModeleApercu.pluriel(Int(note.semaines.rounded()), "semaine", "semaines")).",
            monotonie: monotonie
        )
    }

    static func lectureDiscipline(_ modele: Discipline, _ position: Double?) -> String {
        guard let rang = rang(position, dans: modele.semaines.count) else { return "Pas encore de semaine terminée." }
        let semaine = modele.semaines[rang]
        let prefixe = position == nil ? "Dernière semaine terminée, " : ""
        guard let part = semaine.partPct else {
            return "\(prefixe)\(formatSemaine(semaine.lundi)) : aucune minute enregistrée."
        }
        let verdict = semaine.dansCible == true ? "dans la cible" : "hors cible"
        return "\(prefixe)\(formatSemaine(semaine.lundi)) : \(ModeleApercu.pourcentage(part)) du temps en sous-seuil · \(verdict)"
    }

    static func tableauDiscipline(_ modele: Discipline) -> TableauAffiche {
        TableauAffiche(
            entetes: ["Semaine du", "Part en sous-seuil", "Cible"],
            lignes: modele.semaines.map { semaine in
                let cible = semaine.dansCible.map { $0 ? "dans la cible" : "hors cible" } ?? ModeleApercu.tiret
                return [formatDate(semaine.lundi), ModeleApercu.pourcentageOuTiret(semaine.partPct), cible]
            }
        )
    }

    static func donneesDiscipline(_ modele: Discipline) -> DonneesAccessibles {
        DonneesAccessibles(
            titre: "Part du temps en sous-seuil par semaine",
            resume: "Les 30 dernières semaines terminées. Bande cible \(libelleCible(modele.cibleLo, modele.cibleHi)).",
            axeX: "Semaine",
            axeY: "Part du temps",
            unite: "%",
            libelles: modele.semaines.map { formatSemaine($0.lundi) },
            series: [DonneesAccessibles.Serie(nom: "Part en sous-seuil", valeurs: modele.semaines.map(\.partPct))],
            domaineY: modele.domaine,
            continu: false
        )
    }

    /// Date courte de la semaine repérée par sa position, pour l'axe.
    static func etiquette(_ modele: Discipline, _ position: Double) -> String? {
        let rang = Int(position.rounded())
        guard modele.semaines.indices.contains(rang) else { return nil }
        return formatDate(modele.semaines[rang].lundi)
    }
}
