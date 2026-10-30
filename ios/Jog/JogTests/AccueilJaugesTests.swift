// Tests de ModeleJauges (app, dossier Accueil) : textes des lignes de volume et de récupération, pastilles (A2, A5 ;
// 03 « Ligne de jauge », 04 « Accueil » ; D-026 ; point de décision 11). Fixtures construites par code, sans donnée réelle.
import Foundation
import Testing
import JogCore
@testable import Jog

private let aujourdhui: DateCivile = "2026-10-29"

private let references = ReferencesVolume(
    jourDeSemaine: 4, bandeSemaine: 32...40, km30Precedents: 234, bande30: 210...255,
    anneeDerniere: 2025, kmAnDernierADate: 1660, kmParSemaineAnnee: 42, seancesAnnee: 117
)

/// Une ligne de jauge calculée par le moteur (ligneJauge), avec sa mention « en cours » éventuelle.
private func jauge(
    _ valeur: Double?, trait: Double?, bande: ClosedRange<Double>?, precision: Double,
    enCours: MentionEnCours? = nil, ecartEnPourcent: Bool = false, sens: SensHorsBande = .deuxCotes
) -> LigneJauge {
    var ligne = ligneJauge(
        valeur: valeur, trait: trait, bande: bande, precision: precision,
        ecartEnPourcent: ecartEnPourcent, sens: sens
    )
    ligne.enCours = enCours
    return ligne
}

/// Le volume de l'exemple : 37,4 km face à 36 (semaine), 248 km face à 234 (30 jours), 1 842 km face à 1 660 (année).
private var exempleVolume: LignesVolume {
    LignesVolume(
        semaine: jauge(37.4, trait: 36, bande: 32...40, precision: 0.1, ecartEnPourcent: true),
        trenteJours: jauge(248, trait: 234, bande: 210...255, precision: 1, ecartEnPourcent: true),
        annee: jauge(1842, trait: 1660, bande: nil, precision: 1, ecartEnPourcent: true),
        references: references
    )
}

/// La récupération de l'exemple : VFC 41 ms (norme 44–58), FC de repos 47 bpm (norme 44–48), sommeil 6 h 52 (besoin 7 h 30).
private var exempleRecuperation: LignesRecuperation {
    LignesRecuperation(
        vfc: jauge(41, trait: 47, bande: 44...58, precision: 1, sens: .basSeulement),
        fcRepos: jauge(47, trait: 46, bande: 44...48, precision: 1, sens: .hautSeulement),
        sommeil: jauge(412, trait: 450, bande: 405...450, precision: 1, sens: .basSeulement)
    )
}

private func ligne(_ lignes: [ModeleJauges.Ligne], _ id: String) throws -> ModeleJauges.Ligne {
    try #require(lignes.first { $0.id == id })
}

/// La Vue de récupération de JogCore pour le scénario normal (nuits de l'exemple).
private func vueRecuperation() throws -> VueRecuperation {
    let nuits = try nuitsExemple(.normal, aujourdhui: aujourdhui)
    return try #require(try calculerRecuperation(nuits, derniereSession: nil, aujourdhui: aujourdhui))
}

// MARK: - Volume (A2)

// 04, Accueil › Volume : la semaine affiche ses kilomètres à une décimale, et son écart en pourcentage.
@Test func laLigneSemaineAfficheSesKilometresEtSonEcartEnPourcent() throws {
    let semaine = try ligne(ModeleJauges.volume(exempleVolume, annee: 2026), "semaine")
    #expect(semaine.libelle == "Semaine")
    #expect(semaine.valeur == "37,4 km")
    #expect(semaine.ecart == "+4\u{00A0}%")
    #expect(semaine.trait == 36)
    #expect(semaine.bande == 32...40)
}

// 04, Accueil › Volume : le 30 jours et l'année sont des kilomètres entiers, avec l'espace des milliers.
@Test func lesValeursDuTrenteJoursEtDeLAnneeSontEntieres() throws {
    let lignes = ModeleJauges.volume(exempleVolume, annee: 2026)
    #expect(try ligne(lignes, "trenteJours").valeur == "248 km")
    #expect(try ligne(lignes, "trenteJours").ecart == "+6\u{00A0}%")
    #expect(try ligne(lignes, "annee").valeur == "1\u{00A0}842 km")
}

// 04, Accueil › Volume : une valeur absente s'écrit « – », et sans trait il n'y a pas d'écart.
@Test func uneValeurAbsenteS_ecritUnTiretSansEcart() throws {
    let vide = LignesVolume(
        semaine: jauge(nil, trait: nil, bande: nil, precision: 0.1),
        trenteJours: jauge(nil, trait: nil, bande: nil, precision: 1),
        annee: jauge(nil, trait: nil, bande: nil, precision: 1),
        references: references
    )
    let semaine = try ligne(ModeleJauges.volume(vide, annee: 2026), "semaine")
    #expect(semaine.valeur == "–")
    #expect(semaine.ecart == "")
}

// 04, Accueil › Volume : la ligne Année porte l'année de A.
@Test func laLigneAnneePorteLAnneeDeA() throws {
    let annee = try ligne(ModeleJauges.volume(exempleVolume, annee: 2026), "annee")
    #expect(annee.libelle == "2026")
}

// 04, Accueil › Volume : un écart négatif garde le vrai signe moins, un écart nul s'écrit sans signe.
@Test func lesEcartsDuVolumeGardentLeVraiSigneMoinsEtLeZeroSansSigne() throws {
    let lignes = LignesVolume(
        semaine: jauge(35.7, trait: 36, bande: 32...40, precision: 0.1, ecartEnPourcent: true),
        trenteJours: jauge(234, trait: 234, bande: 210...255, precision: 1, ecartEnPourcent: true),
        annee: jauge(1660, trait: 1660, bande: nil, precision: 1, ecartEnPourcent: true),
        references: references
    )
    let lues = ModeleJauges.volume(lignes, annee: 2026)
    #expect(try ligne(lues, "semaine").ecart == "−1\u{00A0}%")
    #expect(try ligne(lues, "trenteJours").ecart == "0\u{00A0}%")
}

// 03 A2 : la phrase de la semaine nomme le jour de A et la fourchette habituelle.
@Test func laPhraseDeLaSemaineNommeLeJourEtLaFourchette() throws {
    let semaine = try ligne(ModeleJauges.volume(exempleVolume, annee: 2026), "semaine")
    #expect(semaine.phrase == "à jeudi soir, d’habitude 32–40 km")
}

// 03 A2 : la phrase du 30 jours donne les 30 jours précédents et la norme habituelle.
@Test func laPhraseDuTrenteJoursDonneLesTrenteJoursPrecedents() throws {
    let trenteJours = try ligne(ModeleJauges.volume(exempleVolume, annee: 2026), "trenteJours")
    #expect(trenteJours.phrase == "30 j précédents 234 km, habituel 210–255")
}

// 03 A2 : la phrase de l'année donne l'an dernier à date, la moyenne hebdomadaire et les séances.
@Test func laPhraseDeLAnneeDonneLAnDernierADate() throws {
    let annee = try ligne(ModeleJauges.volume(exempleVolume, annee: 2026), "annee")
    #expect(annee.phrase == "2025 à date 1\u{00A0}660 km · 42 km/sem · 117 séances")
}

// 03 A2 : une seule séance s'écrit au singulier.
@Test func uneSeuleSeanceS_ecritAuSingulier() throws {
    var refs = references
    refs.seancesAnnee = 1
    let lignes = LignesVolume(
        semaine: exempleVolume.semaine, trenteJours: exempleVolume.trenteJours, annee: exempleVolume.annee, references: refs
    )
    let annee = try ligne(ModeleJauges.volume(lignes, annee: 2026), "annee")
    #expect(annee.phrase?.hasSuffix("· 1 séance") == true)
}

// D-026 : sans norme, la phrase dit l'avancement, et la ligne n'a ni bande ni trait.
@Test func uneNormeEnCoursSeDitDansLaPhrase() throws {
    let lignes = LignesVolume(
        semaine: jauge(37.4, trait: nil, bande: nil, precision: 0.1, enCours: MentionEnCours(n: 3, sur: 4)),
        trenteJours: exempleVolume.trenteJours, annee: exempleVolume.annee, references: references
    )
    let semaine = try ligne(ModeleJauges.volume(lignes, annee: 2026), "semaine")
    #expect(semaine.phrase == "Norme en cours (3 sur 4)")
    #expect(semaine.bande == nil)
    #expect(semaine.trait == nil)
}

// 04, Accueil › Volume et D-015 : 209 face à 200 vaut +4,5 %, arrondi directement à l'unité : « +5 % ».
@Test func unEcartDe209Contre200S_ecritPlusCinqPourCent() throws {
    let lignes = LignesVolume(
        semaine: jauge(37.4, trait: 36, bande: 32...40, precision: 0.1, ecartEnPourcent: true),
        trenteJours: jauge(209, trait: 200, bande: nil, precision: 1, ecartEnPourcent: true),
        annee: exempleVolume.annee, references: references
    )
    #expect(try ligne(ModeleJauges.volume(lignes, annee: 2026), "trenteJours").ecart == "+5\u{00A0}%")
}

// 04, Accueil › Volume et D-015 : 104,46 face à 100 vaut +4,46 %, arrondi à l'unité : « +4 % », sans passer par 4,5.
@Test func unEcartDe4Virgule46S_ecritPlusQuatrePourCent() throws {
    let lignes = LignesVolume(
        semaine: jauge(104.46, trait: 100, bande: nil, precision: 0.01, ecartEnPourcent: true),
        trenteJours: exempleVolume.trenteJours, annee: exempleVolume.annee, references: references
    )
    #expect(try ligne(ModeleJauges.volume(lignes, annee: 2026), "semaine").ecart == "+4\u{00A0}%")
}

// MARK: - Récupération (A5)

// 03 A5 : valeurs de la VFC, de la FC de repos et du sommeil, au format de la maquette.
@Test func lesValeursDeRecuperationSuiventLaMaquette() throws {
    let lignes = ModeleJauges.recuperation(exempleRecuperation)
    #expect(try ligne(lignes, "vfc").valeur == "41 ms")
    #expect(try ligne(lignes, "fcRepos").valeur == "47 bpm")
    #expect(try ligne(lignes, "sommeil").valeur == "6 h 52")
}

// 03 A5 : écarts de la maquette, signe moins vrai et prime pour les minutes.
@Test func lesEcartsDeRecuperationSuiventLaMaquette() throws {
    let lignes = ModeleJauges.recuperation(exempleRecuperation)
    #expect(try ligne(lignes, "vfc").ecart == "−6")
    #expect(try ligne(lignes, "fcRepos").ecart == "+1")
    #expect(try ligne(lignes, "sommeil").ecart == "−38′")
}

// 04, Accueil › Récupération : un écart nul s'écrit « 0 », sans signe.
@Test func unEcartNulDeRecuperationNAPasDeSigne() throws {
    let lignes = LignesRecuperation(
        vfc: jauge(41, trait: 41, bande: 44...58, precision: 1, sens: .basSeulement),
        fcRepos: exempleRecuperation.fcRepos,
        sommeil: exempleRecuperation.sommeil
    )
    #expect(try ligne(ModeleJauges.recuperation(lignes), "vfc").ecart == "0")
}

// 03 A5 : la phrase de la VFC donne la norme ; celle du sommeil donne le besoin.
@Test func lesPhrasesDeRecuperationDonnentLaNormeEtLeBesoin() throws {
    let lignes = ModeleJauges.recuperation(exempleRecuperation)
    #expect(try ligne(lignes, "vfc").phrase == "norme 44–58 ms")
    #expect(try ligne(lignes, "fcRepos").phrase == "norme 44–48 bpm")
    #expect(try ligne(lignes, "sommeil").phrase == "besoin 7 h 30")
}

// D-026 : une VFC sans norme porte « Norme en cours (n sur 21) » et pas de bande.
@Test func laVfcSansNormeAfficheNormeEnCoursSurVingtEtUn() throws {
    let lignes = LignesRecuperation(
        vfc: jauge(41, trait: nil, bande: nil, precision: 1, enCours: MentionEnCours(n: 3, sur: 21)),
        fcRepos: exempleRecuperation.fcRepos,
        sommeil: exempleRecuperation.sommeil
    )
    let vfc = try ligne(ModeleJauges.recuperation(lignes), "vfc")
    #expect(vfc.phrase == "Norme en cours (3 sur 21)")
    #expect(vfc.bande == nil)
    #expect(vfc.accessibilite == "VFC, 41 millisecondes, norme en cours (3 sur 21)")
}

// 03 A5 : sans bloc de récupération, aucune ligne.
@Test func sansNuitAucuneLigneDeRecuperation() {
    #expect(ModeleJauges.recuperation(nil).isEmpty)
}

// D-026 et 04 : une VFC absente s'écrit « – », sans écart, et se lit « valeur absente ».
@Test func uneVfcAbsenteS_ecritUnTiretSansEcartEtSeLitValeurAbsente() throws {
    let lignes = LignesRecuperation(
        vfc: jauge(nil, trait: 47, bande: 44...58, precision: 1, sens: .basSeulement),
        fcRepos: exempleRecuperation.fcRepos,
        sommeil: exempleRecuperation.sommeil
    )
    let vfc = try ligne(ModeleJauges.recuperation(lignes), "vfc")
    #expect(vfc.valeur == "–")
    #expect(vfc.ecart == "")
    #expect(vfc.horsBande == false)
    #expect(vfc.accessibilite == "VFC, valeur absente")
}

// MARK: - Accessibilité

// Plan, lot 12, test 8 : la VFC se lit avec sa valeur en toutes lettres et son écart à la norme.
@Test func laVfcSeLitAvecSaValeurEtSonEcartALaNorme() throws {
    let vfc = try ligne(ModeleJauges.recuperation(exempleRecuperation), "vfc")
    #expect(vfc.accessibilite == "VFC, 41 millisecondes, 6 de moins que ta norme")
}

// 03 A2 : le volume se lit en pourcentages face à l'habitude, ou face à l'an dernier pour l'année.
@Test func lAccessibiliteDuVolumeDitLesPourcentsFaceAHabitude() throws {
    let lignes = ModeleJauges.volume(exempleVolume, annee: 2026)
    #expect(try ligne(lignes, "semaine").accessibilite == "Semaine, 37,4 kilomètres, 4 pour cent de plus que d’habitude")
    #expect(try ligne(lignes, "annee").accessibilite == "2026, 1\u{00A0}842 kilomètres, 11 pour cent de plus que l’an dernier")
}

// 03 A5 : le sommeil se lit en heures et minutes, face au besoin.
@Test func lAccessibiliteDuSommeilDitLHeureEtLeBesoin() throws {
    let sommeil = try ligne(ModeleJauges.recuperation(exempleRecuperation), "sommeil")
    #expect(sommeil.accessibilite == "Sommeil, 6 heures 52, 38 minutes de moins que ton besoin")
}

// MARK: - Échelle et point

// 03 « Ligne de jauge » : l'échelle contient la valeur, le trait et la bande de chaque ligne.
@Test func lEchelleContientLaValeurLeTraitEtLaBande() throws {
    let lignes = ModeleJauges.volume(exempleVolume, annee: 2026) + ModeleJauges.recuperation(exempleRecuperation)
    for l in lignes {
        if let point = l.point { #expect(l.echelle.contains(point), "\(l.id) : le point hors de l'échelle") }
        if let trait = l.trait { #expect(l.echelle.contains(trait), "\(l.id) : le trait hors de l'échelle") }
        if let bande = l.bande {
            #expect(l.echelle.contains(bande.lowerBound) && l.echelle.contains(bande.upperBound), "\(l.id) : la bande hors de l'échelle")
        }
    }
    #expect(try ligne(lignes, "semaine").point == 37.4)
}

// 03 « Ligne de jauge » : une échelle n'est jamais nulle, même quand toutes les valeurs sont égales ou absentes.
@Test func lEchelleNeSeReduitJamaisAUnPoint() throws {
    let zero = LignesVolume(
        semaine: jauge(0, trait: 0, bande: 0...0, precision: 0.1),
        trenteJours: jauge(nil, trait: nil, bande: nil, precision: 1),
        annee: jauge(nil, trait: nil, bande: nil, precision: 1),
        references: references
    )
    for l in ModeleJauges.volume(zero, annee: 2026) {
        #expect(l.echelle.upperBound > l.echelle.lowerBound, "\(l.id) : échelle nulle")
    }
}

// 03 « Ligne de jauge » : l'échelle a pour bornes la plus basse et la plus haute valeur affichée, bande et trait compris,
// plus une marge de la moitié de l'étendue (ACCUEIL.margeEchelleJauge). Trente jours : 210 à 255, trait 234, valeur 248.
@Test func lEchelleAUnBornesExactesAvecSaMarge() throws {
    let lignes = ModeleJauges.volume(exempleVolume, annee: 2026)
    // Étendue 255 − 210 = 45, marge 22,5 : 210 − 22,5 = 187,5 et 255 + 22,5 = 277,5.
    #expect(try ligne(lignes, "trenteJours").echelle == 187.5...277.5)
}

// D-026 : une valeur absente n'a pas de point à placer sur la barre.
@Test func valeurAbsenteNAPasDePoint() throws {
    let lignes = LignesVolume(
        semaine: jauge(nil, trait: 36, bande: 32...40, precision: 0.1),
        trenteJours: exempleVolume.trenteJours, annee: exempleVolume.annee, references: references
    )
    let semaine = try ligne(ModeleJauges.volume(lignes, annee: 2026), "semaine")
    #expect(semaine.point == nil)
    #expect(semaine.echelle.contains(36))
}

// MARK: - Pastilles

// D-026 / 05 : la pastille du verdict donne le verbe, la fourchette sur 7 jours et le ton du verdict.
@Test func laPastilleDuVerdictAfficheLaFourchetteSurSeptJours() {
    let decision = Decision(
        verdict: .maintenir, phrase: "", signaux: [],
        fourchette: Fourchette(min: 62, max: 66, reference: 64, sourceReference: .moyenne30j), simulateur: nil
    )
    let pastille = ModeleJauges.pastilleVerdict(decision)
    #expect(pastille.texte == "Maintenir · 62–66 km / 7 j")
    #expect(pastille.ton == .attention)
}

// 05 : sans verdict (avant 30 jours), la pastille reste neutre.
@Test func sansVerdictLaPastilleDitPasEncoreDeVerdict() {
    let decision = Decision(verdict: .aucun, phrase: "", signaux: [], fourchette: nil, simulateur: nil)
    let pastille = ModeleJauges.pastilleVerdict(decision)
    #expect(pastille.texte == "Pas encore de verdict")
    #expect(pastille.ton == .neutre)
}

// 05 : augmenter est vert, alléger est rouge.
@Test func lesVerdictsOntLeTonDeLeurDirection() {
    let augmenter = Decision(verdict: .augmenter, phrase: "", signaux: [], fourchette: nil, simulateur: nil)
    let alleger = Decision(verdict: .alleger, phrase: "", signaux: [], fourchette: nil, simulateur: nil)
    #expect(ModeleJauges.pastilleVerdict(augmenter).ton == .bon)
    #expect(ModeleJauges.pastilleVerdict(alleger).ton == .mauvais)
}

// 03 A5 : la pastille de récupération porte les cinq états, la couleur ne portant jamais seule l'état (08).
@Test func laPastilleDeRecuperationDitLEtatEnCinqFormes() throws {
    let base = try vueRecuperation()
    let attendus: [(EtatRecuperation, String, Ton)] = [
        (.dansLaNorme, "Dans ta norme", .bon),
        (.sousLaNorme, "Sous ta norme", .attention),
        (.basse, "Récupération basse", .mauvais),
        (.normeEnCours, "Norme en cours", .neutre),
        (.nuitsInsuffisantes, "Pas assez de nuits", .neutre),
    ]
    for (etat, texte, ton) in attendus {
        var vue = base
        vue.etat = etat
        let pastille = ModeleJauges.pastilleRecuperation(vue)
        #expect(pastille.texte == texte)
        #expect(pastille.ton == ton)
    }
}

// 03 A5 : sans aucune nuit mesurée, la pastille porte le message de Santé.
@Test func sansNuitLaPastilleDitQuAucuneNuitNEstMesuree() {
    let pastille = ModeleJauges.pastilleRecuperation(nil)
    #expect(pastille.texte == "Aucune nuit mesurée dans Santé. Porte l’Apple Watch la nuit, avec le suivi du sommeil activé.")
    #expect(pastille.ton == .neutre)
}
