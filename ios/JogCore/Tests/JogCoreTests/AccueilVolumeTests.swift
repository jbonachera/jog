import Testing
@testable import JogCore

// Lot 3 de la refonte de l'accueil (docs/implementation/refonte-accueil.md) : lignes du volume (A2).
// Tests à la frontière publique `lignesVolume`, sur des Vue construites par `calculerVue`. Données synthétiques écrites
// ici. Règles citées : 04 « Accueil › Volume », D-026 (même jour, norme, écart en %), D-022 (aujourd'hui inclus),
// D-015 (arrondi avant comparaison), 04 « Compteurs » (moyenne hebdomadaire de l'année).
//
// A = vue.J − 1 : la journée de calcul est la veille de J (D-022). Chaque test écrit A et J = A + 1.

/// Séance de test : distance et date, durée fixe de 40 min (elle compte dans les séances de l'année).
private func seance(_ cle: String, _ date: DateCivile, km: Double) -> SeanceIntrinseque {
    SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 1_000_000, nom: nil, marquage: .aucun, duree_min: 40, km: km,
        fcMoy: nil, allureMoy_skm: nil, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: 0, mp_min: 0,
        segmentsMp: [], repetitions: [], format: nil, recup_s: nil, ef: nil, fcPic: nil, decouplage: nil,
        lignesDroites: false, distanceRef_km: nil, temps_s: nil
    )
}

private func vueAvec(_ seances: [SeanceIntrinseque], J: DateCivile) throws -> Vue {
    try calculerVue(EntreeVue(intrinseques: seances, parametres: parametresDefaut(), J: J, derniereSynchro: nil))
}

// MARK: - 04, Accueil › Volume : ligne Semaine

@Test func laSemaineEnCoursSeCompareAuxSemainesHabituellesAuMemeJour() throws {
    // 04, « Accueil › Volume » et D-026 : A = jeudi 2026-10-29. Valeur = km du lundi au jeudi (A inclus, D-022).
    // Trait = moyenne, sur les 8 semaines terminées précédentes, des km du lundi au jeudi. Le vendredi (50 km chaque
    // semaine) n'entre pas. La 9e semaine (500 km) n'entre pas non plus : seules huit semaines comptent.
    let A = "2026-10-29"
    let lundi = try ajouterJours(A, -3)
    var seances: [SeanceIntrinseque] = []
    // Jeudis des huit semaines précédentes : 10, 12, … 24 km (moyenne 17, écart-type 4,58).
    for k in 1...8 {
        let jeudi = try ajouterJours(lundi, -7 * k + 3)
        seances.append(seance("jeudi-\(k)", jeudi, km: Double(8 + 2 * k)))
        seances.append(seance("vendredi-\(k)", try ajouterJours(jeudi, 1), km: 50))
    }
    seances.append(seance("neuvieme-semaine", try ajouterJours(lundi, -63), km: 500))
    seances.append(seance("lundi-courant", lundi, km: 12))
    seances.append(seance("jeudi-courant", A, km: 9))

    let lignes = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1)))

    #expect(lignes.semaine.valeur == 21)
    #expect(lignes.semaine.trait == 17)
    #expect(lignes.semaine.bande == 12.6...21.4)   // 17 ± 0,95 × 4,58, arrondi à 0,1
    #expect(lignes.semaine.ecart == 24)            // 21 ÷ 17 − 1 = +23,5 %, à l'unité
    #expect(lignes.semaine.horsBande == false)
    #expect(lignes.semaine.enCours == nil)
}

@Test func unLundiSansSeanceVautZeroEtSeComparaAuxLundis() throws {
    // 04 : A = lundi 2026-11-02, sans séance : valeur 0. Le trait est la moyenne des quatre lundis (10, 14, 12, 16).
    // La valeur 0 sort de la bande 10,9–15,1 : la ligne est hors bande.
    let A = "2026-11-02"
    let seances = [
        seance("lundi-1", try ajouterJours(A, -7), km: 10),
        seance("lundi-2", try ajouterJours(A, -14), km: 14),
        seance("lundi-3", try ajouterJours(A, -21), km: 12),
        seance("lundi-4", try ajouterJours(A, -28), km: 16),
    ]
    let lignes = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1)))

    #expect(lignes.semaine.valeur == 0)
    #expect(lignes.semaine.trait == 13)
    #expect(lignes.semaine.bande == 10.9...15.1)
    #expect(lignes.semaine.ecart == -100)
    #expect(lignes.semaine.horsBande == true)
}

@Test func moinsDeQuatreSemainesTermineesDonnentUneNormeEnCours() throws {
    // D-026, point de décision 3 : trois semaines terminées (la première commence au premier jour, le lundi d'il y a
    // trois semaines). Sans trait ni bande, la ligne affiche « Norme en cours (3 sur 4) ».
    let A = "2026-10-29"
    let seances = [
        seance("lundi-s3", try ajouterJours(A, -24), km: 5),
        seance("jeudi-s3", try ajouterJours(A, -21), km: 6),
        seance("jeudi-s2", try ajouterJours(A, -14), km: 6),
        seance("jeudi-s1", try ajouterJours(A, -7), km: 6),
        seance("aujourdhui", A, km: 4),
    ]
    let semaine = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).semaine

    #expect(semaine.enCours == MentionEnCours(n: 3, sur: 4))
    #expect(semaine.trait == nil)
    #expect(semaine.bande == nil)
    #expect(semaine.ecart == nil)
    #expect(semaine.valeur == 4)
}

@Test func aQuatreSemainesTermineesLaNormeEstDisponible() throws {
    // Borne D-026 : un échantillon de la taille du minimum (4) donne une norme. Sommes lundi–jeudi : 6, 6, 6, 5 ;
    // moyenne 5,75, arrondie à 5,8.
    let A = "2026-10-29"
    let seances = [
        seance("lundi-s4", try ajouterJours(A, -31), km: 5),
        seance("jeudi-s3", try ajouterJours(A, -21), km: 6),
        seance("jeudi-s2", try ajouterJours(A, -14), km: 6),
        seance("jeudi-s1", try ajouterJours(A, -7), km: 6),
        seance("aujourdhui", A, km: 4),
    ]
    let semaine = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).semaine

    #expect(semaine.enCours == nil)
    #expect(semaine.trait == 5.8)
}

// MARK: - 04, Accueil › Volume : ligne 30 jours

@Test func trenteJoursComparentLesTrenteDerniersAuxTrentePrecedents() throws {
    // 04, « Accueil › Volume » : valeur = km de A − 29 à A (7 : 5 km à A − 29 et 2 km à A) ; trait = km de A − 59 à
    // A − 30 (10 : 3 km à A − 59 et 7 km à A − 30). Le 100 km de A − 60 est avant le premier jour : il ne compte pas
    // dans le trait, et il fixe le premier jour, donc le trait existe. Écart (7 ÷ 10 − 1) = −30 %.
    let A = "2026-10-29"
    let seances = [
        seance("a-60", try ajouterJours(A, -60), km: 100),
        seance("a-59", try ajouterJours(A, -59), km: 3),
        seance("a-30", try ajouterJours(A, -30), km: 7),
        seance("a-29", try ajouterJours(A, -29), km: 5),
        seance("a", A, km: 2),
    ]
    let trenteJours = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).trenteJours

    #expect(trenteJours.valeur == 7)
    #expect(trenteJours.trait == 10)
    #expect(trenteJours.ecart == -30)
}

@Test func laNormeDesTrenteJoursNeComptePasLesFenetresAvantLePremierJour() throws {
    // D-026 et 04 : la norme porte sur les sommes glissantes de 30 jours terminées avant A, chacune seulement si les
    // 30 jours qui la précèdent existent. Premier jour : A − 65. Samples : 0, 4, 4, 4, 14, 14 (fenêtres de A − 6 à
    // A − 1). Moyenne 6,67, écart-type 5,38 : bande 1,6–11,8, arrondie à 2–12. Si la fenêtre de A − 7 entrait, la bande
    // serait −1 à 11 : le test le départage.
    let A = "2026-10-29"
    let seances = [
        seance("premier", try ajouterJours(A, -65), km: 0),
        seance("a-40", try ajouterJours(A, -40), km: 6),
        seance("a-5", try ajouterJours(A, -5), km: 4),
        seance("a-2", try ajouterJours(A, -2), km: 10),
    ]
    let trenteJours = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).trenteJours

    #expect(trenteJours.valeur == 14)
    #expect(trenteJours.trait == 6)
    #expect(trenteJours.bande == 2...12)
    #expect(trenteJours.ecart == 133)     // 14 ÷ 6 − 1 = +133 %
    #expect(trenteJours.enCours == nil)
}

@Test func laNormeDesTrenteJoursPorteSur365FenetresDontLaPremiereEstA365() throws {
    // 04 : les fenêtres se terminent entre A − 365 et A − 1. Une séance de 500 km au jour A − 365 est dans 30 fenêtres
    // (celles qui se terminent de A − 365 à A − 336). Moyenne 41,1, écart-type 137,3 : bande −89,4 à 171,6, arrondie
    // à −89 et 172. Si la première fenêtre était celle de A − 364, la borne haute tomberait à 168.
    // Le premier jour est à A − 430 : la fenêtre de A − 365 a alors ses 30 jours précédents (D-026).
    let A = "2026-10-29"
    let seances = [
        seance("premier", try ajouterJours(A, -430), km: 0),
        seance("il-y-a-365-jours", try ajouterJours(A, -365), km: 500),
        seance("a", A, km: 0),
    ]
    let trenteJours = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).trenteJours

    #expect(trenteJours.bande == -89...172)
}

@Test func sansTrenteJoursDHistoriqueLeTraitEstAbsent() throws {
    // 04 : le trait des 30 jours précédents exige que le premier jour soit au plus tard à A − 59. Ici il est à A − 30.
    let A = "2026-10-29"
    let seances = [
        seance("premier", try ajouterJours(A, -30), km: 8),
        seance("a", A, km: 2),
    ]
    let trenteJours = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).trenteJours

    #expect(trenteJours.trait == nil)
    #expect(trenteJours.ecart == nil)
    #expect(trenteJours.valeur == 2)      // le 8 km de A − 30 est hors des 30 jours de la valeur (A − 29 à A)
}

@Test func moinsDeQuatreFenetresDeTrenteJoursDonnentUneNormeEnCours() throws {
    // D-026 : une seule fenêtre terminée (A − 1) a 30 jours d'historique. La norme est « en cours (1 sur 4) ».
    let A = "2026-10-29"
    let seances = [
        seance("a-60", try ajouterJours(A, -60), km: 100),
        seance("a-29", try ajouterJours(A, -29), km: 5),
        seance("a-30", try ajouterJours(A, -30), km: 7),
        seance("a-59", try ajouterJours(A, -59), km: 3),
        seance("a", A, km: 2),
    ]
    let trenteJours = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).trenteJours

    #expect(trenteJours.enCours == MentionEnCours(n: 1, sur: 4))
    #expect(trenteJours.bande == nil)
}

// MARK: - 04, Accueil › Volume : ligne Année

@Test func lAnneeSeComparesAuMemeJourDeLAnneeDerniere() throws {
    // 04, « Accueil › Volume » : A = 2026-10-29. Valeur = km du 1er janvier à A : 10 + 5 = 15. Trait = km de 2025 du
    // 1er janvier au 29 octobre : 1 + 20 + 5 = 26 (le 100 km du 5 novembre 2025 n'entre pas). Écart (15 ÷ 26 − 1) = −42 %.
    // Aucune bande pour l'année.
    let A = "2026-10-29"
    let seances = [
        seance("2025-01-01", "2025-01-01", km: 1),
        seance("2025-01-10", "2025-01-10", km: 20),
        seance("2025-10-29", "2025-10-29", km: 5),
        seance("2025-11-05", "2025-11-05", km: 100),
        seance("2026-01-05", "2026-01-05", km: 10),
        seance("aujourdhui", A, km: 5),
    ]
    let annee = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).annee

    #expect(annee.valeur == 15)
    #expect(annee.trait == 26)
    #expect(annee.ecart == -42)
    #expect(annee.bande == nil)
    #expect(annee.enCours == nil)
}

@Test func leTraitDeLAnneeSArrete29FevrierAu28FevrierDeLAnneeDerniere() throws {
    // 04 : A = 29 février 2028. Le même jour de 2027 n'existe pas : le trait va jusqu'au 28 février 2027.
    // Trait = 1 + 3 = 4 (le 50 km du 1er mars 2027 n'entre pas), valeur = 4 : écart 0 %.
    let A = "2028-02-29"
    let seances = [
        seance("2027-01-01", "2027-01-01", km: 1),
        seance("2027-02-28", "2027-02-28", km: 3),
        seance("2027-03-01", "2027-03-01", km: 50),
        seance("aujourdhui", A, km: 4),
    ]
    let annee = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).annee

    #expect(annee.trait == 4)
    #expect(annee.ecart == 0)
}

@Test func sansHistoriqueDeLAnneeDerniereLeTraitEstAbsent() throws {
    // 04 : pas d'historique l'an dernier (premier jour en 2026) : trait et écart sont « – ».
    let A = "2026-10-29"
    let seances = [seance("mars", "2026-03-01", km: 5)]
    let annee = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).annee

    #expect(annee.valeur == 5)
    #expect(annee.trait == nil)
    #expect(annee.ecart == nil)
}

@Test func lEcartEnPourcentSArrondisAlUniteMiCheminLoinDeZero() throws {
    // 04 : écart = (valeur ÷ trait − 1) × 100, arrondi à l'unité, mi-chemin loin de zéro (D-015) : +4,5 → +5 ; −4,5 → −5.
    let A = "2026-10-29"
    let hausse = try lignesVolume(try vueAvec([
        seance("2025-01-01", "2025-01-01", km: 200),
        seance("2026-01-01", "2026-01-01", km: 209),
    ], J: try ajouterJours(A, 1))).annee
    #expect(hausse.ecart == 5)

    let baisse = try lignesVolume(try vueAvec([
        seance("2025-01-01", "2025-01-01", km: 200),
        seance("2026-01-01", "2026-01-01", km: 191),
    ], J: try ajouterJours(A, 1))).annee
    #expect(baisse.ecart == -5)
}

// MARK: - Références des phrases (A2)

@Test func lesReferencesDeLAnneeDonnentLAnneeDerniereEtSonTrait() throws {
    // A2 : « 2025 à date 1 660 km » : l'année précédente et son total à la même date.
    let A = "2026-10-29"
    let seances = [
        seance("2025-01-01", "2025-01-01", km: 1),
        seance("2025-10-29", "2025-10-29", km: 5),
        seance("2025-01-10", "2025-01-10", km: 20),
        seance("2026-01-05", "2026-01-05", km: 10),
        seance("aujourdhui", A, km: 5),
    ]
    let references = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).references

    #expect(references.anneeDerniere == 2025)
    #expect(references.kmAnDernierADate == 26)
}

@Test func lesReferencesDuJourEtDeLAnneeCommentent() throws {
    // A2 : « à jeudi soir » (A = jeudi 2026-10-29 : 4) ; « 42 km/sem · 117 séances » : km ÷ jours écoulés × 7 et nombre
    // de séances de l'année. 2026 : 302 jours écoulés (1er janvier au 29 octobre), 604 km → 14 km/sem. 2 séances.
    let A = "2026-10-29"
    let seances = [
        seance("2026-01-01", "2026-01-01", km: 304),
        seance("aujourdhui", A, km: 300),
    ]
    let references = try lignesVolume(try vueAvec(seances, J: try ajouterJours(A, 1))).references

    #expect(references.jourDeSemaine == 4)
    #expect(references.kmParSemaineAnnee == 14)
    #expect(references.seancesAnnee == 2)
}

// MARK: - Sans séance

@Test func sansSeanceLesLignesSontEnCoursSansTrait() throws {
    // D-026 : sans historique, les deux lignes à norme sont « en cours (0 sur 4) », sans trait ; l'année n'a pas de trait.
    let lignes = try lignesVolume(try vueAvec([], J: "2026-10-30"))

    #expect(lignes.semaine.valeur == 0)
    #expect(lignes.semaine.enCours == MentionEnCours(n: 0, sur: 4))
    #expect(lignes.semaine.trait == nil)
    #expect(lignes.trenteJours.enCours == MentionEnCours(n: 0, sur: 4))
    #expect(lignes.annee.valeur == 0)
    #expect(lignes.annee.trait == nil)
    #expect(lignes.references.seancesAnnee == 0)
}
