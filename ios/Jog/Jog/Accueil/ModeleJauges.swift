// Textes des lignes de jauge de l'accueil : volume (A2) et récupération (A5) ; 03 « Ligne de jauge », 04 « Accueil » ;
// D-026 ; point de décision 11 ; docs/implementation/refonte-accueil.md, lot 12. Aucun import SwiftUI : ce fichier se
// teste sans interface. Les calculs restent dans JogCore (LignesVolume, LignesRecuperation, Decision, VueRecuperation).
import Foundation
import JogCore

enum ModeleJauges {
    /// Une ligne de jauge, prête à afficher. `valeur` et `ecart` sont les textes rendus ; `echelle` borne la barre.
    struct Ligne: Identifiable, Equatable {
        let id: String
        let libelle: String
        let valeur: String
        let ecart: String
        let horsBande: Bool
        let echelle: ClosedRange<Double>
        let point: Double?
        let trait: Double?
        let bande: ClosedRange<Double>?
        let phrase: String?
        let accessibilite: String
    }

    // MARK: - Lignes

    /// Les trois lignes du volume (A2), dans l'ordre Semaine, 30 jours, année. `annee` est l'année de A.
    static func volume(_ l: LignesVolume, annee: Int) -> [Ligne] {
        let r = l.references

        let semaine = ligne(
            id: "semaine", libelle: "Semaine", jauge: l.semaine, gabarit: kilometres(1, reference: "d’habitude"),
            phrase: mention(l.semaine) ?? phraseSemaine(l.semaine, jour: r.jourDeSemaine)
        )
        let trenteJours = ligne(
            id: "trenteJours", libelle: "30 jours", jauge: l.trenteJours, gabarit: kilometres(0, reference: "d’habitude"),
            phrase: mention(l.trenteJours) ?? phraseTrenteJours(l.trenteJours)
        )
        let annee = ligne(
            id: "annee", libelle: String(annee), jauge: l.annee,
            gabarit: kilometres(0, reference: "l’an dernier"),
            phrase: phraseAnnee(r)
        )
        return [semaine, trenteJours, annee]
    }

    /// Les trois lignes de la récupération (A5) : VFC, FC de repos, sommeil. Rien sans nuit mesurée.
    static func recuperation(_ l: LignesRecuperation?) -> [Ligne] {
        guard let l else { return [] }
        let vfc = ligne(
            id: "vfc", libelle: "VFC", jauge: l.vfc,
            gabarit: Gabarit(
                texte: { ModeleApercu.nombre($0) + " ms" },
                lue: { ModeleApercu.nombre($0) + " millisecondes" },
                suffixeEcart: "", uniteEcart: "", reference: "ta norme"
            ),
            phrase: mention(l.vfc) ?? normeTexte(l.vfc.bande, unite: "ms")
        )
        let fcRepos = ligne(
            id: "fcRepos", libelle: "FC de repos", jauge: l.fcRepos,
            gabarit: Gabarit(
                texte: { ModeleApercu.nombre($0) + " bpm" },
                lue: { ModeleApercu.nombre($0) + " battements par minute" },
                suffixeEcart: "", uniteEcart: "", reference: "ta norme"
            ),
            phrase: mention(l.fcRepos) ?? normeTexte(l.fcRepos.bande, unite: "bpm")
        )
        let sommeil = ligne(
            id: "sommeil", libelle: "Sommeil", jauge: l.sommeil,
            gabarit: Gabarit(
                texte: { ModeleRecuperation.besoinTexte($0) },
                lue: { heuresLues($0) },
                suffixeEcart: "′", uniteEcart: "minutes", reference: "ton besoin"
            ),
            phrase: l.sommeil.trait.map { "besoin \(ModeleRecuperation.besoinTexte($0))" }
        )
        return [vfc, fcRepos, sommeil]
    }

    // MARK: - Pastilles

    /// Pastille du verdict (A2) : « Maintenir · 62–66 km / 7 j », ou « Pas encore de verdict » avant 30 jours.
    static func pastilleVerdict(_ d: Decision) -> (texte: String, ton: Ton) {
        let ton = ModeleApercu.tonVerdict(d.verdict)
        let verbe: String
        switch d.verdict {
        case .aucun: return (ModeleApercu.titreVerdict(.aucun), ton)
        case .augmenter: verbe = "Augmenter"
        case .maintenir: verbe = "Maintenir"
        case .alleger: verbe = "Alléger"
        }
        guard let f = d.fourchette else { return (verbe, ton) }
        return ("\(verbe) · \(ModeleApercu.nombre(f.min))–\(ModeleApercu.nombre(f.max)) km / 7 j", ton)
    }

    /// Pastille de la récupération (A5) : les cinq états de 03, ou le message sans nuit mesurée.
    static func pastilleRecuperation(_ r: VueRecuperation?) -> (texte: String, ton: Ton) {
        guard let r else { return (messageSansNuit, .neutre) }
        return (libelleEtat(r.etat), ModeleRecuperation.tonEtat(r.etat))
    }

    // MARK: - Textes

    private static let messageSansNuit = "Aucune nuit mesurée dans Santé. Porte l’Apple Watch la nuit, avec le suivi du sommeil activé."
    private static let jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

    /// Volume en kilomètres, avec l'écart en pourcentage face à la référence.
    private static func kilometres(_ decimales: Int, reference: String) -> Gabarit {
        Gabarit(
            texte: { ModeleApercu.nombre($0, decimales) + " km" },
            lue: { ModeleApercu.nombre($0, decimales) + " kilomètres" },
            suffixeEcart: "\u{00A0}%", uniteEcart: "pour cent", reference: reference
        )
    }

    /// « norme 44–58 ms », sans bande, nil.
    private static func normeTexte(_ bande: ClosedRange<Double>?, unite: String) -> String? {
        bande.map { "norme \(ModeleApercu.nombre($0.lowerBound))–\(ModeleApercu.nombre($0.upperBound)) \(unite)" }
    }

    private static func libelleEtat(_ e: EtatRecuperation) -> String {
        switch e {
        case .dansLaNorme: "Dans ta norme"
        case .sousLaNorme: "Sous ta norme"
        case .basse: "Récupération basse"
        case .normeEnCours: "Norme en cours"
        case .nuitsInsuffisantes: "Pas assez de nuits"
        }
    }

    /// Ce qui se dit d'une ligne : son format d'affichage, sa lecture à voix haute, et la référence de son écart.
    private struct Gabarit {
        let texte: (Double) -> String
        let lue: (Double) -> String
        let suffixeEcart: String
        let uniteEcart: String
        let reference: String
    }

    private static func ligne(id: String, libelle: String, jauge: LigneJauge, gabarit: Gabarit, phrase: String?) -> Ligne {
        let echelle = echelle(jauge)
        let valeur = jauge.valeurAffichee.map(gabarit.texte) ?? ModeleApercu.tiret
        let valeurLue = jauge.valeurAffichee.map(gabarit.lue) ?? "valeur absente"
        return Ligne(
            id: id, libelle: libelle, valeur: valeur,
            ecart: jauge.ecart.map { ModeleApercu.signe($0, 0, unite: gabarit.suffixeEcart) } ?? "",
            horsBande: jauge.horsBande, echelle: echelle, point: jauge.valeurAffichee,
            trait: jauge.trait, bande: jauge.bande, phrase: phrase,
            accessibilite: accessibilite(libelle: libelle, valeurLue: valeurLue, jauge: jauge, gabarit: gabarit)
        )
    }

    /// Libellé, valeur lue, puis la mention en cours ou l'écart à la référence, séparés par des virgules.
    private static func accessibilite(libelle: String, valeurLue: String, jauge: LigneJauge, gabarit: Gabarit) -> String {
        if let mention = jauge.enCours {
            return "\(libelle), \(valeurLue), norme en cours (\(mention.n) sur \(mention.sur))"
        }
        guard let ecart = ecartLu(jauge.ecart, gabarit) else { return "\(libelle), \(valeurLue)" }
        return "\(libelle), \(valeurLue), \(ecart)"
    }

    /// « 6 de moins que ta norme », « 4 pour cent de plus que d’habitude », « comme ta norme » pour un écart nul.
    private static func ecartLu(_ ecart: Double?, _ gabarit: Gabarit) -> String? {
        guard let ecart else { return nil }
        guard ecart != 0 else { return "comme \(gabarit.reference)" }
        let unite = gabarit.uniteEcart.isEmpty ? "" : " \(gabarit.uniteEcart)"
        let sens = ecart > 0 ? "de plus" : "de moins"
        return "\(ModeleApercu.nombre(abs(ecart)))\(unite) \(sens) que \(gabarit.reference)"
    }

    /// Échelle de la barre : l'étendue des valeurs affichées, avec une marge (ACCUEIL), sans
    /// descendre sous zéro. Jamais nulle : une étendue vide reçoit la marge minimale.
    private static func echelle(_ jauge: LigneJauge) -> ClosedRange<Double> {
        let points = [jauge.valeurAffichee, jauge.trait, jauge.bande?.lowerBound, jauge.bande?.upperBound].compactMap { $0 }
        guard let bas = points.min(), let haut = points.max() else { return 0...1 }
        let marge = max((haut - bas) * ACCUEIL.margeEchelleJauge, ACCUEIL.etendueMinEchelleJauge)
        return max(0, bas - marge)...(haut + marge)
    }

    /// Mention « Norme en cours (n sur m) » d'une ligne dont l'échantillon est trop petit (D-026), sinon nil.
    private static func mention(_ jauge: LigneJauge) -> String? {
        jauge.enCours.map { "Norme en cours (\($0.n) sur \($0.sur))" }
    }

    /// « à jeudi soir, d’habitude 32–40 km » ; sans bande (pas encore de norme), nil.
    private static func phraseSemaine(_ jauge: LigneJauge, jour: Int) -> String? {
        guard let bande = jauge.bande, (1...7).contains(jour) else { return nil }
        return "à \(jours[jour - 1]) soir, d’habitude \(ModeleApercu.nombre(bande.lowerBound))–\(ModeleApercu.nombre(bande.upperBound)) km"
    }

    /// « 30 j précédents 234 km, habituel 210–255 » ; sans trait ou sans bande, nil.
    private static func phraseTrenteJours(_ jauge: LigneJauge) -> String? {
        guard let trait = jauge.trait, let bande = jauge.bande else { return nil }
        return "30 j précédents \(ModeleApercu.nombre(trait)) km, habituel \(ModeleApercu.nombre(bande.lowerBound))–\(ModeleApercu.nombre(bande.upperBound))"
    }

    /// « 2025 à date 1 660 km · 42 km/sem · 117 séances ».
    private static func phraseAnnee(_ r: ReferencesVolume) -> String {
        let aDate = r.kmAnDernierADate.map { "\(ModeleApercu.nombre($0)) km" } ?? ModeleApercu.tiret
        let semaine = "\(ModeleApercu.nombre(r.kmParSemaineAnnee)) km/sem"
        let seances = ModeleApercu.pluriel(r.seancesAnnee, "séance", "séances")
        return "\(r.anneeDerniere) à date \(aDate) · \(semaine) · \(seances)"
    }

    /// Une durée en heures et minutes, lue : « 6 heures 52 », « 7 heures ».
    private static func heuresLues(_ minutes: Double) -> String {
        guard minutes.isFinite else { return "valeur absente" }
        let total = Int(minutes.rounded())
        let heures = total / 60
        let reste = total - heures * 60
        return reste == 0 ? "\(heures) heures" : "\(heures) heures \(reste)"
    }
}
