// Cartes de séance et en-têtes de semaine de l'accueil (S1, S2 ; 03 S1 et S2 ; 04 « Carte de séance » ; D-020 pour le
// marquage ; D-025 à D-027 ; points de décision 11, 15 et 16 ; docs/implementation/refonte-accueil.md, lot 13). Aucun import
// SwiftUI : ce fichier se teste sans interface. Les verdicts, jauges et totaux viennent de JogCore ; ici, seulement le texte.
import Foundation
import JogCore

/// Une option du marquage (D-020) : son titre de menu, et le marquage à enregistrer (nil pour « Retirer »).
struct OptionMarquage: Equatable, Sendable {
    let titre: String
    let valeur: MarquageUtilisateur?
}

enum ModeleSeances {
    /// Une carte de séance (S2) : titre, moment, méta, verdict, puis 2 ou 3 jauges dans l'ordre de 04.
    struct Carte: Identifiable, Equatable {
        let id: String
        let couleurType: Zone
        let titre: String
        let quand: String
        let meta: String
        let verdict: String
        let ton: Ton
        let jauges: [ModeleJauges.Ligne]
        let estDuJour: Bool
    }

    /// En-tête d'une semaine (S1) : titre, volume et durée, répartition des intensités (4 parts, somme 1), résumé.
    struct EnTete: Identifiable, Equatable {
        let id: DateCivile
        let titre: String
        let kmDuree: String
        let repartition: [Double]
        let resume: String
    }

    // MARK: - Cartes

    /// La carte de la séance `s`, avec son verdict et ses jauges calculés par JogCore (`c`). `J` est la coupure de la Vue :
    /// la date d'aujourd'hui est J − 1 (D-022). L'heure s'écrit dans le fuseau `fuseau`.
    static func carte(_ s: SeanceVue, _ c: CarteSeance, J: DateCivile, fuseau: TimeZone) -> Carte {
        let v = verdict(c.verdict)
        return Carte(
            id: s.cleSource,
            couleurType: zone(s.type),
            titre: titre(s),
            quand: quand(s, J: J, fuseau: fuseau),
            meta: meta(s),
            verdict: v.texte,
            ton: v.ton,
            jauges: c.jauges.map { jauge($0, type: s.type) },
            estDuJour: s.date == ModeleApercu.veille(J)
        )
    }

    /// Le verdict de JogCore, avec son ton (08 : la couleur ne porte jamais seule l'état).
    static func verdict(_ v: VerdictSeance) -> (texte: String, ton: Ton) {
        switch v {
        case let .ok(texte): return (texte, .bon)
        case let .surveiller(texte): return (texte, .attention)
        case let .alerte(texte): return (texte, .mauvais)
        case let .neutre(texte): return (texte, .neutre)
        }
    }

    /// La couleur de la barre de type (08) : facile pour les footings, allure marathon pour la sortie longue, sous-seuil, et
    /// au-dessus du seuil pour les séances qualité, les courses et les tests.
    static func zone(_ type: TypeSeance) -> Zone {
        switch type {
        case .footing, .footingLignesDroites: .facile
        case .sousSeuil: .sousSeuil
        case .sortieLongue: .marathon
        case .seanceQualite, .course, .test: .auDessus
        }
    }

    // MARK: - Écran Séance (S3)

    /// L'écran Séance (S3) : la carte S2 en tête, le tableau des répétitions (P4) pour une séance sous-seuil ou qualité, et
    /// les segments écrits en texte (03 S3 : v1 sans courbes).
    struct Ecran: Equatable {
        let carte: Carte
        let tableau: TableauAffiche?
        let segments: [String]
    }

    /// L'écran de la séance `s`, avec sa carte `c` (JogCore) et les paramètres datés (D-006) pour le tableau de P4.
    static func ecran(_ s: SeanceVue, _ c: CarteSeance, _ paramsAuJour: ParamsAuJour, J: DateCivile, fuseau: TimeZone) -> Ecran {
        let repetitions = s.type == .sousSeuil || s.type == .seanceQualite
        let tableau = repetitions && !s.repetitions.isEmpty
            ? ModeleProgression.tableauDerniere(seanceSousSeuil(s, paramsAuJour))
            : nil
        return Ecran(carte: carte(s, c, J: J, fuseau: fuseau), tableau: tableau, segments: segments(s))
    }

    /// Les segments de la séance, en texte : minutes à allure marathon (sortie longue), lignes droites (footing).
    static func segments(_ s: SeanceVue) -> [String] {
        var segments: [String] = []
        if s.mp_min.isFinite, s.mp_min > 0 {
            segments.append("\(duree(s.mp_min)) à allure marathon")
        }
        if s.lignesDroites {
            segments.append("Lignes droites")
        }
        return segments
    }

    // MARK: - En-têtes de semaine

    /// L'en-tête de la semaine `s` (S1). `seances` sert à nommer la course de la semaine (point de décision 15) ; J est la
    /// coupure de la Vue (A = J − 1).
    static func enTete(_ s: SemaineAccueil, J: DateCivile, seances: [SeanceVue]) -> EnTete {
        let courses = s.courses.compactMap { cle in seances.first { $0.cleSource == cle } }
        return EnTete(
            id: s.lundi,
            titre: titreSemaine(s, J: J),
            kmDuree: "\(ModeleApercu.nombre(s.km, 1)) km · \(duree(s.min))",
            repartition: partsTemps(s.minutes),
            resume: resume(s, courses: courses)
        )
    }

    /// « Cette semaine » pour la semaine de A ; sinon « Sem. du 20 oct. », avec l'année hors de l'année de A (point 16).
    private static func titreSemaine(_ s: SemaineAccueil, J: DateCivile) -> String {
        if s.enCours { return "Cette semaine" }
        let texte = "Sem. du \(formatDate(s.lundi))"
        let aujourdhui = ModeleApercu.veille(J) ?? J
        return annee(s.lundi) == annee(aujourdhui) ? texte : "\(texte) \(annee(s.lundi))"
    }

    /// « 3 séances · 1 seuil · 40′ sous-seuil (21 %) », suivi de « dont course 10 km · 37:40 » (point 15) ; « aucune séance »
    /// sans séance. Le détail du sous-seuil n'apparaît que s'il y en a.
    private static func resume(_ s: SemaineAccueil, courses: [SeanceVue]) -> String {
        guard s.nbSeances > 0 else { return "aucune séance" }
        var morceaux = [ModeleApercu.pluriel(s.nbSeances, "séance", "séances")]
        if s.nbSousSeuil > 0 {
            morceaux.append(ModeleApercu.pluriel(s.nbSousSeuil, "seuil", "seuils"))
            var sousSeuil = "\(ModeleApercu.nombre(s.minSS))′ sous-seuil"
            if let part = s.partSS { sousSeuil += " (\(ModeleApercu.pourcentage(part * 100)))" }
            morceaux.append(sousSeuil)
        }
        morceaux += courses.map(texteCourse)
        return morceaux.joined(separator: " · ")
    }

    /// « dont course 10 km · 37:40 » : la distance puis le temps de la course de la semaine.
    private static func texteCourse(_ s: SeanceVue) -> String {
        var morceaux = ["dont course" + (distance(s.distanceRef_km).map { " " + $0 } ?? "")]
        if let temps = s.temps_s { morceaux.append(formatTempsCourse(temps)) }
        return morceaux.joined(separator: " · ")
    }

    /// Les quatre intensités en parts (Facile, Allure marathon, Sous-seuil, Au-dessus), somme 1 ; quatre zéros sans minute.
    static func partsTemps(_ minutes: Minutes) -> [Double] {
        let valeurs = [minutes.easy, minutes.mp, minutes.subt, minutes.hard].map { $0.isFinite && $0 > 0 ? $0 : 0 }
        let total = valeurs.reduce(0, +)
        guard total > 0 else { return [0, 0, 0, 0] }
        return valeurs.map { $0 / total }
    }

    // MARK: - Textes d'une carte

    /// « Footing », « Sous-seuil 5×8′ » (format de la séance), « Sortie longue », « Course · 10 km », « Test 5 km ».
    static func titre(_ s: SeanceVue) -> String {
        switch s.type {
        case .sousSeuil:
            return "Sous-seuil" + (s.format.map { " " + $0 } ?? "")
        case .course:
            return "Course" + (distance(s.distanceRef_km).map { " · " + $0 } ?? "")
        case .test:
            return "Test" + (distance(s.distanceRef_km).map { " " + $0 } ?? "")
        case .footing, .footingLignesDroites, .sortieLongue, .seanceQualite:
            return ModeleApercu.libelleType(s.type)
        }
    }

    /// « auj. 12:15 » pour la séance de A ; « mer. 28 · 18:05 » dans l'année ; « lun. 20 oct. 2025 · 18:05 » au-delà d'un an.
    static func quand(_ s: SeanceVue, J: DateCivile, fuseau: TimeZone) -> String {
        let aujourdhui = ModeleApercu.veille(J) ?? J
        let hhmm = heure(s.debutUtc, fuseau)
        if s.date == aujourdhui {
            return hhmm.map { "auj. \($0)" } ?? "auj."
        }
        let jour: String
        if ecartJours(aujourdhui, s.date) > ACCUEIL.joursIlYAUnAn {
            jour = "\(formatJourDate(s.date)) \(annee(s.date))"
        } else {
            jour = "\(ModeleApercu.jourCourt(s.date)) \(ModeleApercu.quantieme(s.date))"
        }
        return hhmm.map { "\(jour) · \($0)" } ?? jour
    }

    /// « 10,2 km · 58 min · 5:41/km » ; sous-seuil : l'allure des répétitions (« rép. 3:52/km ») ; course : « 37:40 · 3:46/km ».
    static func meta(_ s: SeanceVue) -> String {
        let km = "\(ModeleApercu.nombre(s.km, 1)) km"
        switch s.type {
        case .course, .test:
            let temps = s.temps_s.map(formatTempsCourse)
            return joint([temps, allure(s.allureMoy_skm ?? tempsParKm(s)).map { "\($0)/km" }])
        case .sousSeuil:
            return joint([km, duree(s.duree_min), allureRepetitions(s).map { "rép. \($0)/km" }])
        case .footing, .footingLignesDroites, .sortieLongue, .seanceQualite:
            return joint([km, duree(s.duree_min), allure(s.allureMoy_skm).map { "\($0)/km" }])
        }
    }

    /// Une durée : « 58 min » sous l'heure, puis « 1 h 07 ».
    static func duree(_ minutes: Double) -> String {
        guard minutes.isFinite, minutes >= 0 else { return ModeleApercu.tiret }
        let total = Int(minutes.rounded())
        guard total >= 60 else { return "\(total) min" }
        return "\(total / 60) h \(String(format: "%02ld", total % 60))"
    }

    // MARK: - Jauges

    /// Une jauge de la carte : texte, écart et phrase, par la mise en forme de la ligne de jauge (lot 12).
    private static func jauge(_ j: JaugeSeance, type: TypeSeance) -> ModeleJauges.Ligne {
        let gabarit = gabarit(j.cle)
        return ModeleJauges.ligne(
            id: String(describing: j.cle), libelle: libelleJauge(j.cle), jauge: j.ligne, gabarit: gabarit,
            phrase: ModeleJauges.mention(j.ligne) ?? phraseHabituelle(j, type: type, gabarit)
        )
    }

    /// « 4 footings des 8 dernières semaines, habituel 135–139 bpm » (point de décision 11) : la taille de l'échantillon
    /// et sa description, puis la bande. Sans taille (VDOT, pas de norme), seule la bande, comme avant.
    private static func phraseHabituelle(_ j: JaugeSeance, type: TypeSeance, _ gabarit: ModeleJauges.Gabarit) -> String? {
        let bande = habituel(j.ligne.bande, gabarit)
        guard let n = j.ligne.n, let echantillon = descripteurEchantillon(type, j.cle), let bande else { return bande }
        return "\(n) \(echantillon), \(bande)"
    }

    /// Ce que désigne l'échantillon d'une jauge, au pluriel (n ≥ 2 pour toute norme), selon le type et la jauge (D-025).
    private static func descripteurEchantillon(_ type: TypeSeance, _ cle: CleJauge) -> String? {
        let semaines = "\(ACCUEIL.joursEchantillonSeance / 7) dernières semaines"
        switch (type, cle) {
        case (.course, _), (.test, _):
            return cle == .fcMoy ? "courses de même distance" : "séances sous-seuil des \(semaines)"
        case (.sousSeuil, _):
            return "séances sous-seuil précédentes"
        case (.sortieLongue, _):
            return "sorties longues des \(semaines)"
        case (.seanceQualite, _):
            return "séances de qualité des \(semaines)"
        case (.footing, _), (.footingLignesDroites, _):
            return "footings des \(semaines)"
        }
    }

    private static func libelleJauge(_ cle: CleJauge) -> String {
        switch cle {
        case .fcMoy: "FC moy."
        case .ef: "Efficacité"
        case .fcFinRepetitions: "FC fin"
        case .allureNorm: "Allure"
        case .decouplage: "Découpl."
        case .dPlus: "D+"
        case .vdot: "VDOT"
        case .charge: "Charge"
        }
    }

    /// Ce qui se dit et s'écrit d'une jauge : le format de la valeur, de l'écart et des bornes (D-015).
    private static func gabarit(_ cle: CleJauge) -> ModeleJauges.Gabarit {
        switch cle {
        case .fcMoy, .fcFinRepetitions:
            return ModeleJauges.Gabarit(
                texte: { ModeleApercu.nombre($0) + " bpm" },
                lue: { ModeleApercu.nombre($0) + " battements par minute" },
                suffixeEcart: "", uniteEcart: "", reference: "d’habitude",
                decimalesEcart: 0, borne: { ModeleApercu.nombre($0) }, uniteBande: " bpm"
            )
        case .ef:
            return ModeleJauges.Gabarit(
                texte: { ModeleApercu.nombre($0, 2) }, lue: { ModeleApercu.nombre($0, 2) },
                suffixeEcart: "", uniteEcart: "", reference: "d’habitude",
                decimalesEcart: 2, borne: { ModeleApercu.nombre($0, 2) }, uniteBande: ""
            )
        case .allureNorm:
            return ModeleJauges.Gabarit(
                texte: { formatAllure($0) }, lue: { formatAllure($0) + " par kilomètre" },
                suffixeEcart: " s", uniteEcart: "secondes", reference: "d’habitude",
                decimalesEcart: 0, borne: { formatAllure($0) }, uniteBande: ""
            )
        case .decouplage:
            return ModeleJauges.Gabarit(
                texte: { ModeleApercu.nombre($0, 1) + "\u{00A0}%" }, lue: { ModeleApercu.nombre($0, 1) + " pour cent" },
                suffixeEcart: "", uniteEcart: "points", reference: "d’habitude",
                decimalesEcart: 1, borne: { ModeleApercu.nombre($0, 1) }, uniteBande: "\u{00A0}%"
            )
        case .dPlus:
            return ModeleJauges.Gabarit(
                texte: { ModeleApercu.nombre($0) + " m" }, lue: { ModeleApercu.nombre($0) + " mètres" },
                suffixeEcart: " m", uniteEcart: "mètres", reference: "d’habitude",
                decimalesEcart: 0, borne: { ModeleApercu.nombre($0) }, uniteBande: " m"
            )
        case .vdot:
            return ModeleJauges.Gabarit(
                texte: { ModeleApercu.nombre($0, 1) }, lue: { ModeleApercu.nombre($0, 1) },
                suffixeEcart: "", uniteEcart: "", reference: "d’habitude",
                decimalesEcart: 1, borne: { ModeleApercu.nombre($0, 1) }, uniteBande: ""
            )
        case .charge:
            // Pas d'écart (point de décision 5) : la valeur est un rapport à la moyenne des sous-seuil.
            return ModeleJauges.Gabarit(
                texte: { ModeleApercu.nombre($0, 1) + "×" }, lue: { ModeleApercu.nombre($0, 1) + " fois la norme" },
                suffixeEcart: "", uniteEcart: "", reference: "la norme",
                decimalesEcart: 1, borne: { ModeleApercu.nombre($0, 1) }, uniteBande: "×"
            )
        }
    }

    /// « habituel 132–140 bpm » : la bande de la norme, sans nombre d'échantillon (nil sans bande).
    private static func habituel(_ bande: ClosedRange<Double>?, _ gabarit: ModeleJauges.Gabarit) -> String? {
        bande.map { "habituel \(gabarit.borne($0.lowerBound))–\(gabarit.borne($0.upperBound))\(gabarit.uniteBande)" }
    }

    // MARK: - Mise en forme commune

    /// Le titre d'une distance de course : « 5 km », « 10 km », « semi-marathon », « marathon », sinon le kilométrage.
    private static func distance(_ km: Double?) -> String? {
        guard let km, km.isFinite, km > 0 else { return nil }
        switch distanceCourse(km) {
        case .cinqKm: return "5 km"
        case .dixKm: return "10 km"
        case .semi: return "semi-marathon"
        case .marathon: return "marathon"
        case let .autre(autre): return "\(ModeleApercu.nombre(autre, 1)) km"
        }
    }

    /// L'heure de début, dans le fuseau donné (HH:mm), ou nil sans instant.
    private static func heure(_ debutUtc: Double, _ fuseau: TimeZone) -> String? {
        guard debutUtc.isFinite else { return nil }
        var calendrier = Calendar(identifier: .gregorian)
        calendrier.timeZone = fuseau
        let composantes = calendrier.dateComponents([.hour, .minute], from: Date(timeIntervalSince1970: debutUtc / 1000))
        return String(format: "%02ld:%02ld", composantes.hour ?? 0, composantes.minute ?? 0)
    }

    /// Jours entre deux dates civiles (a − b) ; 0 si une date est invalide.
    private static func ecartJours(_ a: DateCivile, _ b: DateCivile) -> Int {
        guard let na = try? numeroJour(a), let nb = try? numeroJour(b) else { return 0 }
        return na - nb
    }

    private static func annee(_ d: DateCivile) -> String {
        String(d.prefix(4))
    }

    /// Allure (secondes par kilomètre) écrite m:ss, nil sans valeur.
    private static func allure(_ secondesParKm: Double?) -> String? {
        guard let secondesParKm, secondesParKm.isFinite, secondesParKm > 0 else { return nil }
        return formatAllure(secondesParKm)
    }

    /// Allure moyenne des répétitions (les valeurs nulles ou absentes ne comptent pas), nil sans répétition.
    private static func allureRepetitions(_ s: SeanceVue) -> String? {
        let allures = s.repetitions.map(\.allure_skm).filter { $0.isFinite && $0 > 0 }
        guard !allures.isEmpty else { return nil }
        return formatAllure(allures.reduce(0, +) / Double(allures.count))
    }

    /// Allure d'une course à partir de son temps et de sa distance, nil si l'un manque.
    private static func tempsParKm(_ s: SeanceVue) -> Double? {
        guard let temps = s.temps_s, s.km > 0 else { return nil }
        return temps / s.km
    }

    /// Les morceaux présents, séparés par « · ».
    private static func joint(_ morceaux: [String?]) -> String {
        morceaux.compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: - Marquage (D-020)

    /// « Course » ou « Test » pour une séance marquée, nil sinon : c'est le texte de la pastille.
    static func libelleMarquage(_ marquage: Marquage) -> String? {
        switch marquage {
        case .course: "Course"
        case .test: "Test"
        case .aucun, .inconnu: nil
        }
    }

    /// En tête du menu : le marquage actuel de la séance.
    static func libelleMarquageActuel(_ marquage: Marquage) -> String {
        "Marquage actuel : \(libelleMarquage(marquage) ?? "aucun")"
    }

    /// Les actions du menu, selon l'état courant (D-020). Une séance marquée propose l'autre marquage et le retrait.
    static func optionsMarquage(_ courant: Marquage) -> [OptionMarquage] {
        let course = OptionMarquage(titre: "Marquer comme course", valeur: .course)
        let test = OptionMarquage(titre: "Marquer comme test", valeur: .test)
        let retirer = OptionMarquage(titre: "Retirer le marquage", valeur: nil)
        switch courant {
        case .course: return [test, retirer]
        case .test: return [course, retirer]
        case .aucun, .inconnu: return [course, test]
        }
    }

    /// Une entrée du menu de marquage de S3 (D-020) : son titre, le marquage transmis, et l'action qui le relaie avec la clé
    /// de la séance.
    struct ActionMarquage {
        let titre: String
        let valeur: MarquageUtilisateur?
        let action: () -> Void
    }

    /// Les entrées du menu de marquage de S3 pour la séance `cleSource`, selon son marquage courant (`optionsMarquage`).
    /// Chaque action appelle `surMarquage(cleSource, valeur)`.
    static func menuMarquage(
        cleSource: String, courant: Marquage, surMarquage: @escaping (String, MarquageUtilisateur?) -> Void
    ) -> [ActionMarquage] {
        optionsMarquage(courant).map { option in
            ActionMarquage(titre: option.titre, valeur: option.valeur, action: { surMarquage(cleSource, option.valeur) })
        }
    }

    /// Le titre d'une action VoiceOver : celui du menu, suivi du nom de la séance quand le jour en compte plusieurs.
    static func libelleAction(_ option: OptionMarquage, seance: SeanceAffichee, plusieurs: Bool) -> String {
        plusieurs ? "\(option.titre) : \(seance.titre)" : option.titre
    }
}
