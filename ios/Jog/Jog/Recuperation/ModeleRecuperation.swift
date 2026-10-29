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
