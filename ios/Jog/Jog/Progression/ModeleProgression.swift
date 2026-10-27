// Logique d'affichage de l'onglet Progression (03, P1 à P5). Aucun import SwiftUI : ce fichier se teste sans interface.
// Les calculs restent dans JogCore ; ici, seulement des textes, des tons, des bornes d'axe et des géométries de repère.
import Foundation
import JogCore

/// Une ligne du comparateur, prête à afficher (P1).
struct LigneComparateur: Identifiable, Equatable, Sendable {
    let id: CleMesure
    let nom: String
    let valeurA: String
    let valeurB: String
    let ecart: String
    let ton: Ton
    let etat: String
    let libelleAccessible: String
}

/// Un groupe de lignes du comparateur (Volume, Sous-seuil, …), séparé par un filet.
struct GroupeComparateur: Identifiable, Equatable, Sendable {
    let id: String
    let titre: String
    let lignes: [LigneComparateur]
}

/// Choix du préréglage, dans l'ordre du sélecteur segmenté (03, P1).
enum ChoixComparaison: String, CaseIterable, Identifiable, Sendable {
    case precedentes, annee, personnalisees

    var id: String { rawValue }

    var libelleCourt: String {
        switch self {
        case .precedentes: "Précédentes"
        case .annee: "Il y a un an"
        case .personnalisees: "Dates"
        }
    }

    var libelleComplet: String {
        switch self {
        case .precedentes: "12 dernières semaines / 12 précédentes"
        case .annee: "12 dernières semaines / même période il y a un an"
        case .personnalisees: "Dates personnalisées"
        }
    }

    /// Le préréglage de JogCore, ou nil pour des dates saisies.
    var prereglage: Prereglage? {
        switch self {
        case .precedentes: .douzeSemainesPrecedentes
        case .annee: .douzeSemainesAnneePrecedente
        case .personnalisees: nil
        }
    }
}

/// Dates saisies du comparateur, mémorisées localement (03, P1 : « le préréglage et les dates sont mémorisés »).
struct DatesComparateur: Codable, Equatable, Sendable {
    var a: PeriodeDates
    var b: PeriodeDates
}

/// Une série de tendance (P2) : son titre, son format, ses bornes d'axe (08, « Règles des graphiques »).
enum SerieTendance: Sendable {
    case allure, ef, decouplage

    var titre: String {
        switch self {
        case .allure: "Allure sous-seuil"
        case .ef: "Efficacité en footing"
        case .decouplage: "Découplage en sortie longue"
        }
    }

    /// Le réglage d'axe de D-009 de cette série.
    var preset: CleDePreset {
        switch self {
        case .allure: .allure
        case .ef: .efficacite
        case .decouplage: .decouplage
        }
    }

    var note: String {
        switch self {
        case .allure: "Normalisée sur la FC de fin de répétition, lissée sur 4 semaines."
        case .ef: "Vitesse ÷ FC moyenne, lissée sur 4 semaines."
        case .decouplage: "Portions faciles, lissé sur 3 sorties ; sous 5 %, la base tient."
        }
    }
}

/// Un point de tendance : sa date pour l'axe, ses valeurs brute et lissée, et son libellé pour la lecture au doigt.
struct PointAffiche: Identifiable, Equatable, Sendable {
    let id: String
    let date: Date
    let brut: Double
    let lisse: Double
    let libelle: String
    /// Losange pour une sortie avec allure marathon (D-005), rond sinon.
    var losange = false
}

/// Les deux périodes du nuage (P3) : la référence choisie, et les 12 dernières semaines.
enum RoleNuage: String, Sendable {
    case reference, recente
}

/// Un point du nuage (P3), en valeurs de graphique et en texte.
struct PointNuage: Identifiable, Equatable, Sendable {
    let id: String
    let role: RoleNuage
    let allure: Double
    let fc: Double
    let libelle: String
}

/// Une répétition de la dernière séance (P4), prête à tracer.
struct RepetitionAffichee: Identifiable, Equatable, Sendable {
    let id: Int
    let n: Int
    let allure: Double
    let fcFin: Double
    let ecart: String
    let horsSousSeuil: Bool
    let raisons: String
    let libelleAccessible: String
}

/// Une ligne du niveau estimé (P5).
struct LigneNiveauAffichee: Identifiable, Equatable, Sendable {
    let id: Int
    let distance: String
    let equivalence: String
    let allure: String
    let record: String
    let dateRecord: String
    let ecart: String
    let bat: Bool
}

enum ModeleProgression {

    // MARK: - Dates

    /// Calendrier grégorien en UTC. Les dates de la Vue se lisent et se saisissent sans décalage selon le fuseau.
    static let calendrierUTC: Calendar = {
        var calendrier = Calendar(identifier: .gregorian)
        calendrier.timeZone = TimeZone(identifier: "UTC") ?? .current
        return calendrier
    }()

    /// Date civile d'un instant lu en UTC (le midi UTC de `ModeleApercu.date`, par exemple).
    static func civile(_ date: Date) -> DateCivile {
        let composantes = calendrierUTC.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04ld-%02ld-%02ld", composantes.year ?? 1970, composantes.month ?? 1, composantes.day ?? 1)
    }

    /// Bornes de saisie des dates : du premier jour de l'historique à hier (03, P1).
    static func bornes(premierJour: DateCivile?, J: DateCivile) -> ClosedRange<Date>? {
        guard let premier = premierJour,
              let veille = ModeleApercu.veille(J),
              let debut = ModeleApercu.date(premier),
              let fin = ModeleApercu.date(veille),
              debut <= fin
        else { return nil }
        return debut...fin
    }

    static func texteDates(_ periode: PeriodeBornee) -> String {
        guard let debut = periode.debut, let fin = periode.fin else { return "pas d’historique" }
        return "\(formatDate(debut)) – \(formatDate(fin))"
    }

    static func texteDates(_ periode: PeriodeDates) -> String {
        "\(formatDate(periode.debut)) – \(formatDate(periode.fin))"
    }

    /// Message d'une période invalide : elle ne se recalcule pas (03, P1).
    static func messageErreur(_ erreur: ErreurPeriodeInvalide) -> String {
        let nom = erreur.periode.rawValue
        switch erreur.raison {
        case .ordre: return "La période \(nom) finit avant son début. Corrigez les dates pour la comparer."
        case .date: return "Une date de la période \(nom) n’existe pas."
        }
    }

    // MARK: - Comparateur (P1)

    /// Les lignes du tableau, regroupées dans l'ordre de JogCore (03, P1).
    static func groupes(_ comparaison: Comparaison) -> [GroupeComparateur] {
        var groupes: [GroupeComparateur] = []
        for mesure in comparaison.mesures {
            let ligne = ligne(mesure)
            if let dernier = groupes.last, dernier.titre == mesure.groupe.rawValue {
                groupes[groupes.count - 1] = GroupeComparateur(
                    id: dernier.id, titre: dernier.titre, lignes: dernier.lignes + [ligne]
                )
            } else {
                groupes.append(GroupeComparateur(id: mesure.groupe.rawValue, titre: mesure.groupe.rawValue, lignes: [ligne]))
            }
        }
        return groupes
    }

    static func ligne(_ mesure: Mesure) -> LigneComparateur {
        let a = valeur(mesure.cle, mesure.a)
        let b = valeur(mesure.cle, mesure.b)
        let ecart = texteEcart(mesure)
        let etat = libelleEtat(mesure.etat)
        return LigneComparateur(
            id: mesure.cle, nom: mesure.nom, valeurA: a, valeurB: b, ecart: ecart,
            ton: tonEtat(mesure.etat), etat: etat,
            libelleAccessible: "\(mesure.nom) : A \(a), B \(b), écart \(ecart), \(etat)"
        )
    }

    /// Une valeur de mesure, dans l'unité affichée (08, « Rédaction »). Absente : ModeleApercu.tiret.
    static func valeur(_ cle: CleMesure, _ valeur: Double?) -> String {
        guard let v = valeur, v.isFinite else { return ModeleApercu.tiret }
        switch cle {
        case .km, .seances, .formeMoy, .formeMax: return ModeleApercu.nombre(v, 1)
        case .heures: return formatDuree(v * 60)
        case .minutesSS, .fcFin: return ModeleApercu.nombre(v)
        case .partSS, .footings: return ModeleApercu.pourcentage(v, 0)
        case .decouplage: return ModeleApercu.pourcentage(v, 1)
        case .allure: return formatAllure(v)
        case .ef, .picRatio: return ModeleApercu.nombre(v, 2)
        case .test5: return formatTempsCourse(v)
        }
    }

    /// Écart tel qu'il s'affiche (D-015) : allure en s/km, points pour les pourcentages, h:mm, m:ss pour un test.
    static func texteEcart(_ mesure: Mesure) -> String {
        guard let ecart = mesure.ecartAffiche else { return ModeleApercu.tiret }
        if mesure.etat == .egal { return "=" }
        switch mesure.cle {
        case .allure:
            return ModeleApercu.signe(ecart, 0, unite: " s/km")
        case .partSS, .footings:
            return (try? formatEcartPoints(ecart, 0)) ?? ModeleApercu.tiret
        case .decouplage:
            return (try? formatEcartPoints(ecart, 1)) ?? ModeleApercu.tiret
        case .heures:
            let minutes = ecart * 60
            return ModeleApercu.signeTexte(minutes) + formatDuree(abs(minutes))
        case .test5:
            return ModeleApercu.signeTexte(ecart) + formatTempsCourse(abs(ecart))
        case .km:
            return ModeleApercu.signe(ecart, 1, unite: " km")
        case .seances:
            return ModeleApercu.signe(ecart, 1)
        case .minutesSS:
            return ModeleApercu.signe(ecart, 0, unite: " min")
        case .fcFin:
            return ModeleApercu.signe(ecart, 0, unite: " bpm")
        case .ef, .picRatio:
            return ModeleApercu.signe(ecart, 2)
        case .formeMoy, .formeMax:
            return ModeleApercu.signe(ecart, 0)
        }
    }

    static func tonEtat(_ etat: EtatEcart) -> Ton {
        switch etat {
        case .mieux: .bon
        case .moinsBien: .attention
        case .neutre, .egal: .neutre
        }
    }

    static func libelleEtat(_ etat: EtatEcart) -> String {
        switch etat {
        case .mieux: "meilleur sur B"
        case .moinsBien: "moins bien sur B"
        case .neutre: "sans sens de progression"
        case .egal: "identique"
        }
    }

    /// La mention « historique partiel » : A est plus courte que B de plus de 6 jours (03, P1).
    static func texteHistoriquePartiel(_ comparaison: Comparaison) -> String? {
        guard comparaison.historiquePartiel else { return nil }
        return "Historique partiel : A ne couvre que \(Int(comparaison.a.jours)) jours, contre \(Int(comparaison.b.jours)) pour B."
    }

    // MARK: - Tendances (P2)

    static func valeurTendance(_ serie: SerieTendance, _ v: Double) -> String {
        switch serie {
        case .allure: formatAllure(v) + "/km"
        case .ef: ModeleApercu.nombre(v, 2)
        case .decouplage: ModeleApercu.pourcentage(v, 1)
        }
    }

    /// L'écart depuis le début de la série, avec son signe. Le ton vient de `bonSens`, jugé par JogCore.
    static func ecartTendance(_ serie: SerieTendance, ecart: Double?) -> String {
        guard let ecart, ecart.isFinite else { return ModeleApercu.tiret }
        switch serie {
        case .allure: return ModeleApercu.signe(ecart, 0, unite: " s/km")
        case .ef: return ModeleApercu.signe(ecart, 2)
        case .decouplage: return (try? formatEcartPoints(ecart, 1)) ?? ModeleApercu.tiret
        }
    }

    static func tonTendance(_ bonSens: Bool?) -> Ton {
        switch bonSens {
        case .some(true): .bon
        case .some(false): .attention
        case .none: .neutre
        }
    }

    /// Bornes de l'axe Y d'une série (D-009) : le découplage ne descend pas sous 0.
    static func domaineTendance(_ serie: SerieTendance, _ valeurs: [Double], reperes: [Double] = []) -> ClosedRange<Double> {
        domaineAxe(valeurs, preset: serie.preset, reperes: reperes)
    }

    static func pointsSemaines(_ serie: [PointSemaine], _ valeurTexte: (Double) -> String) -> [PointAffiche] {
        serie.compactMap { point in
            guard let date = ModeleApercu.date(point.lundi) else { return nil }
            return PointAffiche(
                id: point.lundi, date: date, brut: point.brut, lisse: point.lisse,
                libelle: "\(formatSemaine(point.lundi)) : \(valeurTexte(point.brut))"
            )
        }
    }

    static func pointsSorties(_ serie: [PointSortie], _ valeurTexte: (Double) -> String) -> [PointAffiche] {
        serie.compactMap { point in
            guard let date = ModeleApercu.date(point.date) else { return nil }
            return PointAffiche(
                id: point.date, date: date, brut: point.brut, lisse: point.lisse,
                libelle: "\(formatJourDate(point.date)) : \(valeurTexte(point.brut))",
                losange: point.forme == .losange
            )
        }
    }

    static func tableauTendance(_ points: [PointAffiche], _ valeurTexte: (Double) -> String) -> TableauAffiche {
        TableauAffiche(
            entetes: ["Date", "Mesurée", "Lissée"],
            lignes: points.map { [formatDate($0.id), valeurTexte($0.brut), valeurTexte($0.lisse)] }
        )
    }

    // MARK: - Nuage (P3)

    /// Bornes de l'axe des allures (P3 et P4) : pas de 5 s/km, étendue d'au moins 20 s/km. L'axe est inversé à l'affichage.
    static func domaineAllure(_ valeurs: [Double], reperes: [Double] = []) -> ClosedRange<Double> {
        domaineAxe(valeurs, preset: .allure, reperes: reperes)
    }

    /// Bornes de l'axe des FC de fin (P3) : pas de 2 bpm, étendue d'au moins 10 bpm, bande de FC incluse.
    static func domaineFC(_ valeurs: [Double], bande: (lo: Double, hi: Double)) -> ClosedRange<Double> {
        domaineAxe(valeurs, preset: .fcFin, reperes: [bande.lo, bande.hi])
    }

    static func pointsNuage(_ periode: PeriodeRepetitions, role: RoleNuage) -> [PointNuage] {
        periode.points.enumerated().compactMap { index, point in
            guard point.allure_skm.isFinite, point.fcFin.isFinite else { return nil }
            let format = point.format.map { " · \($0)" } ?? ""
            return PointNuage(
                id: "\(role.rawValue)-\(index)",
                role: role,
                allure: point.allure_skm,
                fc: point.fcFin,
                libelle: "\(formatJourDate(point.date))\(format) · rép. \(Int(point.n)) · \(formatAllure(point.allure_skm))/km · \(ModeleApercu.nombre(point.fcFin)) bpm"
            )
        }
    }

    /// Nom d'une période du nuage, pour la légende et le tableau.
    static func nomPeriode(_ role: RoleNuage, _ type: PeriodeNuage) -> String {
        switch role {
        case .reference: type == .annee ? "Il y a un an" : "12 sem. précédentes"
        case .recente: "12 dernières sem."
        }
    }

    /// Centre d'une période, si ses deux moyennes existent (03, P3).
    static func centre(_ periode: PeriodeRepetitions) -> (allure: Double, fc: Double)? {
        guard let allure = periode.centre.allure_skm, let fc = periode.centre.fcFin else { return nil }
        return (allure, fc)
    }

    /// Les deux extrémités de la pointe de la flèche du centre de référence vers le centre récent (03, P3).
    /// Les longueurs se mesurent en fraction de chaque axe, pour que la pointe ne se déforme pas ; le résultat est en
    /// unités de données. Vide si les centres coïncident.
    static func pointeDeFleche(
        de depart: (x: Double, y: Double), vers arrivee: (x: Double, y: Double),
        etendueX: Double, etendueY: Double
    ) -> [(x: Double, y: Double)] {
        let dx = (arrivee.x - depart.x) / etendueX
        let dy = (arrivee.y - depart.y) / etendueY
        let longueur = (dx * dx + dy * dy).squareRoot()
        guard longueur > 0 else { return [] }
        let ux = dx / longueur
        let uy = dy / longueur
        let taille = 0.05
        // Ailes de la pointe : décalées de la base, en fraction d'axe, puis reconverties en données.
        let baseX = -ux * taille
        let baseY = -uy * taille
        let aileX = -uy * taille * 0.6
        let aileY = ux * taille * 0.6
        return [(baseX + aileX, baseY + aileY), (baseX - aileX, baseY - aileY)].map { decalage in
            (x: arrivee.x + decalage.0 * etendueX, y: arrivee.y + decalage.1 * etendueY)
        }
    }

    /// Écart entre les deux périodes, ramené à la FC de référence (03, P3 : « 16 s/km plus rapide »).
    static func texteEcartNuage(_ ecart: Double?) -> String {
        guard let ecart, ecart.isFinite else { return "pas assez de répétitions pour comparer" }
        let arrondi = ecart.rounded()
        if arrondi == 0 { return "même allure à FC égale" }
        return arrondi > 0 ? "\(Int(arrondi)) s/km plus rapide" : "\(Int(-arrondi)) s/km plus lent"
    }

    static func tableauNuage(_ nuage: Nuage) -> TableauAffiche {
        let groupes: [(RoleNuage, PeriodeRepetitions)] = [(.reference, nuage.reference), (.recente, nuage.recente)]
        let lignes: [[String]] = groupes.flatMap { role, periode in
            pointsNuage(periode, role: role).map { point in
                [nomPeriode(role, nuage.periode), point.libelle]
            }
        }
        return TableauAffiche(entetes: ["Période", "Répétition"], lignes: lignes)
    }

    // MARK: - Dernière séance (P4)

    static func repetitions(_ seance: DerniereSeance) -> [RepetitionAffichee] {
        seance.repetitions.enumerated().compactMap { index, rep in
            guard rep.allure_skm.isFinite, rep.fcFin.isFinite else { return nil }
            let ecart = rep.ecartMoyenne_skm.map { ModeleApercu.signe($0, 0, unite: " s") } ?? ModeleApercu.tiret
            let raisons = rep.raisons.joined(separator: ", ")
            let statut = rep.horsSousSeuil ? "hors sous-seuil : \(raisons)" : "dans le sous-seuil"
            return RepetitionAffichee(
                id: index,
                n: Int(rep.n),
                allure: rep.allure_skm,
                fcFin: rep.fcFin,
                ecart: ecart,
                horsSousSeuil: rep.horsSousSeuil,
                raisons: raisons,
                libelleAccessible: "Répétition \(Int(rep.n)), \(formatAllure(rep.allure_skm)) par km, écart à la moyenne \(ecart), FC de fin \(ModeleApercu.nombre(rep.fcFin)) bpm, \(statut)"
            )
        }
    }

    /// La répétition sous le doigt. Sa position est un réel de l'axe : elle s'arrondit au numéro entier et se borne à la
    /// séance (D-015, comme `ModeleCharge.rang`). Sans position, nil.
    static func repetitionLue(_ repetitions: [RepetitionAffichee], position: Double?) -> RepetitionAffichee? {
        guard let position, position.isFinite, let premiere = repetitions.map(\.n).min(), let derniere = repetitions.map(\.n).max() else {
            return nil
        }
        let numero = min(max(Int(position.rounded()), premiere), derniere)
        return repetitions.min { abs($0.n - numero) < abs($1.n - numero) }
    }

    /// Le sous-titre : date, format et récupération (03, P4).
    static func sousTitreDerniere(_ seance: DerniereSeance) -> String {
        var morceaux = [formatDate(seance.date)]
        if let format = seance.format { morceaux.append(format) }
        if let recup = seance.recup_s, recup.isFinite {
            let minutes = Int(recup) / 60
            let secondes = Int(recup) % 60
            morceaux.append(secondes == 0 ? "récup. \(minutes) min" : "récup. \(minutes) min \(secondes) s")
        }
        return morceaux.joined(separator: " · ")
    }

    static func tableauDerniere(_ seance: DerniereSeance) -> TableauAffiche {
        TableauAffiche(
            entetes: ["Rép.", "Allure", "Écart à la moyenne", "FC fin", "Hors sous-seuil"],
            lignes: repetitions(seance).map { rep in
                [
                    "#\(rep.n)",
                    formatAllure(rep.allure) + "/km",
                    rep.ecart,
                    ModeleApercu.nombre(rep.fcFin),
                    rep.horsSousSeuil ? "oui" : "non",
                ]
            }
        )
    }

    // MARK: - Niveau estimé (P5)

    static func lignesNiveau(_ lignes: [LigneNiveau]) -> [LigneNiveauAffichee] {
        lignes.enumerated().map { index, ligne in
            let ecart: String
            if let e = ligne.ecart_s {
                ecart = e == 0 ? "=" : ModeleApercu.signeTexte(e) + formatTempsCourse(abs(e))
            } else {
                ecart = ModeleApercu.tiret
            }
            return LigneNiveauAffichee(
                id: index,
                distance: ligne.libelle,
                equivalence: formatTempsCourse(ligne.equivalence_s),
                allure: formatAllure(ligne.allure_skm) + "/km",
                record: ligne.record.map { formatTempsCourse($0.temps_s) } ?? ModeleApercu.tiret,
                dateRecord: ligne.libelleDateRecord,
                ecart: ecart,
                bat: ligne.bat
            )
        }
    }

    /// Le sous-titre de P5 : la source et la nuance « un niveau, pas une prédiction » (03, P5).
    static func sousTitreNiveau(_ source: SourceNiveau) -> String {
        let nature = source.type == .test ? "test" : "course"
        return "Équivalences de Riegel depuis le \(nature) de 5 km du \(formatDate(source.date)) (\(formatTempsCourse(source.temps_s))). Un niveau, pas une prédiction : sur longue distance, le volume compte aussi."
    }

}
