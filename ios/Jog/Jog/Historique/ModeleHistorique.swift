// Logique d'affichage de l'onglet Historique (03, H1 et H2 ; 08). Aucun import SwiftUI : ce fichier se teste sans
// interface. Les sélections viennent de JogCore (selectionHistorique) ; ici, textes, tons, séries et bornes d'axe.
import Foundation
import JogCore

enum ModeleHistorique {
    static let tiret = ModeleApercu.tiret
    static let periodes: [PeriodeHistorique] = [.douze, .vingtSix, .toutes]

    // MARK: - Textes des périodes

    static func libelleSegment(_ periode: PeriodeHistorique) -> String {
        switch periode {
        case .douze: "12 sem."
        case .vingtSix: "26 sem."
        case .toutes: "Toutes"
        }
    }

    static func libellePeriode(_ periode: PeriodeHistorique) -> String {
        switch periode {
        case .douze: "12 dernières semaines"
        case .vingtSix: "26 dernières semaines"
        case .toutes: "Toutes les saisons"
        }
    }

    // MARK: - Types

    /// Un indicateur : un texte (la couleur ne porte jamais seule l'information, 03) et son ton.
    struct Indicateur: Equatable, Sendable {
        let texte: String
        let ton: Ton
        /// Précision en clair (« dans la cible ») : lue dans la feuille et annoncée, pas dans la ligne.
        let qualificatif: String?
    }

    /// Une course de la période, placée à sa date réelle.
    struct CourseAffichee: Identifiable, Equatable, Sendable {
        let id: String
        let date: Date
        let libelle: String
    }

    /// Une semaine de la vue tableau (H1), de la feuille de semaine (S1) et de ses détails.
    struct LigneSemaine: Identifiable, Equatable, Sendable {
        let id: DateCivile
        let date: Date?
        let titre: String
        let titreCourt: String
        let mois: String
        let enCours: Bool
        let km: Double
        let kmTexte: String
        let dureeTexte: String
        let kmParZone: [Zone: Double]
        let sousSeuil: Indicateur
        let seancesSousSeuil: String
        let charge: String
        let ratio: Indicateur
        let conformite: Indicateur
        let libelleFootings: String
        let types: [TypeSeance]
        let courses: [CourseAffichee]
        let resume: String
    }

    /// Une part de barre empilée : une semaine et une intensité (H1).
    struct BarreSemaine: Identifiable, Equatable, Sendable {
        let id: String
        let date: Date
        let zone: Zone
        let km: Double
    }

    /// Une séance de la feuille de semaine (03, H2).
    struct SeanceSemaine: Identifiable, Equatable, Sendable {
        let id: String
        let titre: String
        let detail: String
        let marquage: Marquage
        let libelleMarquage: String?
    }

    struct Donnees: Equatable, Sendable {
        let periode: PeriodeHistorique
        /// Les semaines de la période, de la plus ancienne à la plus récente (aucune semaine future).
        let chronologique: [LigneSemaine]
        let barres: [BarreSemaine]
        let courses: [CourseAffichee]
        let domaineKm: ClosedRange<Double>
        /// Position d'aujourd'hui sur l'axe, quand la semaine en cours fait partie de la période.
        let aujourdhui: Date?

        var estVide: Bool { chronologique.isEmpty }
    }

    // MARK: - Construction

    /// Domaine de l'axe des kilomètres : de zéro à un multiple de 20 km au moins égal à la semaine la plus chargée (20 km minimum).
    static func domaineKm(maxKm: Double) -> ClosedRange<Double> {
        0...max(20, (maxKm / 20).rounded(.up) * 20)
    }

    /// Les données de l'onglet, ou nil si le moteur ne peut pas les calculer.
    static func donnees(_ vue: Vue, _ periode: PeriodeHistorique) -> Donnees? {
        guard let selection = try? selectionHistorique(vue, periode),
              let lundiJour = try? lundiISO(vue.J) else { return nil }
        let typesParSemaine = typesParSemaine(vue)
        let lignes = selection.semaines
            .filter { $0.lundi <= lundiJour }
            .map { semaine in
                ligne(semaine, types: typesParSemaine[semaine.lundi] ?? [], plafond: selection.plafondFootingsBpm)
            }

        var barres: [BarreSemaine] = []
        for ligne in lignes {
            guard let date = ligne.date else { continue }
            for zone in Zone.allCases {
                let km = ligne.kmParZone[zone] ?? 0
                guard km.isFinite, km > 0 else { continue }
                barres.append(BarreSemaine(id: "\(ligne.id)-\(zone.libelle)", date: date, zone: zone, km: km))
            }
        }

        let maxKm = lignes.map(\.km).filter(\.isFinite).max() ?? 0

        return Donnees(
            periode: periode,
            chronologique: lignes,
            barres: barres,
            courses: lignes.flatMap(\.courses),
            domaineKm: domaineKm(maxKm: maxKm),
            aujourdhui: lignes.contains { $0.enCours } ? ModeleApercu.veille(vue.J).flatMap(ModeleApercu.date) : nil
        )
    }

    private static func ligne(_ s: SemaineHistorique, types: [TypeSeance], plafond: Double) -> LigneSemaine {
        let date = ModeleApercu.date(s.lundi)
        let repartition = s.kmParIntensite
        return LigneSemaine(
            id: s.lundi,
            date: date,
            titre: "Semaine du \(formatDate(s.lundi))",
            titreCourt: formatDate(s.lundi),
            mois: titreMois(s.lundi),
            enCours: s.enCours,
            km: s.km,
            kmTexte: ModeleApercu.nombre(s.km, 1),
            dureeTexte: formatDuree(s.min),
            kmParZone: [
                .facile: repartition.easy,
                .marathon: repartition.mp,
                .sousSeuil: repartition.subt,
                .auDessus: repartition.hard,
            ],
            sousSeuil: indicateurSousSeuil(s),
            seancesSousSeuil: ModeleApercu.nombre(s.nbSS),
            charge: ModeleApercu.nombre(s.charge),
            ratio: Indicateur(
                texte: s.ratioDimanche.map { ModeleApercu.nombre($0, 2) } ?? tiret,
                ton: ton(s.etatRatio),
                qualificatif: nil
            ),
            conformite: Indicateur(
                texte: ModeleApercu.pourcentageOuTiret(s.conformitePct),
                ton: ton(s.etatFootings),
                qualificatif: nil
            ),
            libelleFootings: "Footings ≤ \(ModeleApercu.nombre(plafond)) bpm",
            types: types,
            courses: s.courses.enumerated().compactMap { index, course in
                guard let instant = ModeleApercu.date(course.date) else { return nil }
                return CourseAffichee(
                    id: "\(course.date)-\(index)",
                    date: instant,
                    libelle: libelleCourse(course)
                )
            },
            resume: resume(s, titre: "Semaine du \(formatDate(s.lundi))")
        )
    }

    private static func indicateurSousSeuil(_ s: SemaineHistorique) -> Indicateur {
        switch s.etatCible {
        case .enCours?:
            Indicateur(texte: "en cours", ton: .neutre, qualificatif: nil)
        case .dansLaCible?:
            Indicateur(texte: ModeleApercu.pourcentageOuTiret(s.partSSPct), ton: .bon, qualificatif: "dans la cible")
        case .horsCible?:
            Indicateur(texte: ModeleApercu.pourcentageOuTiret(s.partSSPct), ton: .attention, qualificatif: "hors de la cible")
        case nil:
            Indicateur(texte: tiret, ton: .neutre, qualificatif: nil)
        }
    }

    private static func resume(_ s: SemaineHistorique, titre: String) -> String {
        let enCours = s.enCours ? ", en cours" : ""
        let sousSeuil = indicateurSousSeuil(s)
        let qualificatif = sousSeuil.qualificatif.map { ", \($0)" } ?? ""
        return [
            titre + enCours,
            "\(ModeleApercu.nombre(s.km, 1)) kilomètres",
            "durée \(formatDuree(s.min))",
            "sous-seuil \(sousSeuil.texte)\(qualificatif)",
            "ratio \(s.ratioDimanche.map { ModeleApercu.nombre($0, 2) } ?? tiret)",
        ].joined(separator: ", ")
    }

    private static func ton(_ etat: EtatMesure?) -> Ton {
        switch etat {
        case .ok?: .bon
        case .surveiller?: .attention
        case .alerte?: .mauvais
        case nil: .neutre
        }
    }

    /// Les types de séance présents dans chaque semaine, dans l'ordre d'apparition, sans doublon.
    private static func typesParSemaine(_ vue: Vue) -> [DateCivile: [TypeSeance]] {
        var parSemaine: [DateCivile: [TypeSeance]] = [:]
        for seance in vue.seances {
            guard let lundi = try? lundiISO(seance.date) else { continue }
            var types = parSemaine[lundi, default: []]
            if !types.contains(seance.type) {
                types.append(seance.type)
            }
            parSemaine[lundi] = types
        }
        return parSemaine
    }

    /// Les lignes de toutes les semaines de l'historique, par lundi. Calculées une fois par Vue (`CacheAccueil`) : la
    /// feuille de semaine (S1) les lit sans refaire l'historique à chaque rendu.
    static func lignesParLundi(_ vue: Vue) -> [DateCivile: LigneSemaine] {
        guard let chronologique = donnees(vue, .toutes)?.chronologique else { return [:] }
        return Dictionary(chronologique.map { ($0.id, $0) }, uniquingKeysWith: { premiere, _ in premiere })
    }

    /// La ligne de la semaine du lundi `lundi`, pour sa feuille (S1). Une semaine sans ligne (aucune séance) reçoit une
    /// ligne vide, avec les mêmes libellés que les autres.
    static func semaine(_ lignes: [DateCivile: LigneSemaine], vue: Vue, lundi: DateCivile) -> LigneSemaine {
        lignes[lundi] ?? ligneVide(vue, lundi: lundi)
    }

    /// Une semaine sans séance : tous les chiffres à zéro, aucun type, aucune course.
    static func ligneVide(_ vue: Vue, lundi: DateCivile) -> LigneSemaine {
        let zero = Minutes(easy: 0, mp: 0, subt: 0, hard: 0)
        let vide = SemaineHistorique(
            lundi: lundi, enCours: (try? lundiISO(vue.J)) == lundi, km: 0, min: 0, minutes: zero, kmParIntensite: zero,
            partSSPct: nil, etatCible: nil, nbSS: 0, charge: 0, ratioDimanche: nil, etatRatio: nil, monotonie: nil,
            contrainte: nil, conformitePct: nil, etatFootings: nil, courses: []
        )
        return ligne(vide, types: [], plafond: vue.parametresEnVigueur.datesAJm1.easyCap)
    }

    /// Les séances d'une semaine, dans l'ordre de la Vue (chronologique).
    static func seances(_ vue: Vue, lundi: DateCivile) -> [SeanceSemaine] {
        var resultat: [SeanceSemaine] = []
        for seance in vue.seances where (try? lundiISO(seance.date)) == lundi {
            var libelle = ModeleApercu.libelleType(seance.type)
            if let format = seance.format {
                libelle += " " + format
            }
            var morceaux = [formatDuree(seance.duree_min), "\(ModeleApercu.nombre(seance.km, 1)) km"]
            if let fc = seance.fcMoy {
                morceaux.append("\(ModeleApercu.nombre(fc)) bpm")
            }
            // D-021 : répétitions estimées sur la vitesse et la FC, sans détail par tours.
            if seance.repetitionsEstimees == true {
                morceaux.append("répétitions estimées sur la vitesse et la FC")
            }
            resultat.append(SeanceSemaine(
                id: seance.cleSource,
                titre: "\(ModeleApercu.jourCourt(seance.date)) \(ModeleApercu.quantieme(seance.date)) · \(libelle)",
                detail: morceaux.joined(separator: " · "),
                marquage: seance.marquage,
                libelleMarquage: ModeleSeances.libelleMarquage(seance.marquage)
            ))
        }
        return resultat
    }

    // MARK: - Lectures

    /// Les deux lignes de la lecture au doigt (H1) : titre de la semaine, puis ses chiffres.
    static func lecture(_ ligne: LigneSemaine) -> (titre: String, detail: String) {
        var titre = ligne.titre
        if ligne.enCours {
            titre += " · en cours"
        }
        for course in ligne.courses {
            titre += " · \(course.libelle)"
        }
        let detail = "\(ligne.kmTexte) km · \(ligne.dureeTexte) · SS \(ligne.sousSeuil.texte) · ratio \(ligne.ratio.texte)"
        return (titre, detail)
    }

    /// La semaine la plus proche d'une date (lecture au doigt sur le graphique).
    static func semaine(proche date: Date, dans lignes: [LigneSemaine]) -> LigneSemaine? {
        lignes
            .compactMap { ligne in ligne.date.map { (ligne, abs($0.timeIntervalSince(date))) } }
            .min { $0.1 < $1.1 }?
            .0
    }

    /// Titre d'un mois, en-tête de section de S1 : « Octobre 2026».
    static func titreMois(_ lundi: DateCivile) -> String {
        guard let date = ModeleApercu.date(lundi) else { return lundi }
        let texte = date.formatted(.dateTime.month(.wide).year().locale(Locale(identifier: "fr_FR")))
        return String(texte.prefix(1)).uppercased() + String(texte.dropFirst())
    }

    static func libelleCourse(_ course: CourseHistorique) -> String {
        let distance = course.distance ?? "Course"
        guard let temps = course.temps else { return distance }
        return "\(distance) · \(temps)"
    }

}
