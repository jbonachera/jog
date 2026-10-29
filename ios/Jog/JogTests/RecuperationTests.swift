// Tests de ModeleRecuperation (app, dossier Recuperation) : textes, tuiles et séries de la récupération (D-023, lot 10).
// Fixtures construites par code (nuitsExemple) : aucune donnée réelle. Le calendrier est explicite (fr_FR, Europe/Paris).
import Foundation
import Testing
import JogCore
@testable import Jog

private let aujourdhui: DateCivile = "2026-10-29"
private let besoin: Double = 450

private let calendrier: Calendar = {
    var calendrier = Calendar(identifier: .gregorian)
    calendrier.locale = Locale(identifier: "fr_FR")
    calendrier.timeZone = TimeZone(identifier: "Europe/Paris")!
    return calendrier
}()

/// La Vue de récupération de JogCore, pour un scénario de la maquette et la session de A éventuelle.
private func recuperation(_ scenario: ScenarioRecuperation, session: SessionSommeil? = nil) throws -> VueRecuperation {
    let nuits = try nuitsExemple(scenario, aujourdhui: aujourdhui)
    return try #require(try calculerRecuperation(nuits, derniereSession: session, aujourdhui: aujourdhui))
}

/// Session de la nuit de la veille de `date` au matin de `date` : de 23:04 à 06:05 (Paris, UTC+1), `sommeil` minutes
/// endormi et 20 minutes éveillé.
private func session(sommeil: Double, profond: Double = 60, paradoxal: Double = 90, date: DateCivile = aujourdhui) throws -> SessionSommeil {
    let debut = try instantUtc("\(try ajouterJours(date, -1))T22:04:00Z")
    let fin = debut + (sommeil + 20) * 60_000
    return SessionSommeil(
        date: date, debutUtc_ms: debut, finUtc_ms: fin, decalageDebut_min: 0,
        segments: [SegmentSommeil(debutUtc_ms: debut, finUtc_ms: fin, phase: .leger)],
        coucher_min: 304, sommeil_min: sommeil, leger_min: sommeil - profond - paradoxal,
        profond_min: profond, paradoxal_min: paradoxal, eveille_min: 20
    )
}

/// La Vue du fichier maquette de l'aperçu, avec la récupération donnée.
private func vueAvecRecuperation(_ recuperation: VueRecuperation) throws -> Vue {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Jog/Apercu/vue-maquette.json")
    var vue = try JSONDecoder().decode(Vue.self, from: Data(contentsOf: url))
    vue.recuperation = recuperation
    return vue
}

// MARK: - Carte (A5)

@Test func laCarteNormaleAfficheDansTaNormeEtTroisTuiles() throws {
    let carte = try #require(ModeleRecuperation.carte(try recuperation(.normal), besoin_min: besoin))
    #expect(carte.titre == "Dans ta norme")
    #expect(carte.pastille.texte == "OK")
    #expect(carte.pastille.ton == .bon)
    #expect(carte.tuiles.map(\.libelle) == ["VFC", "FC de repos", "Sommeil"])
    #expect(carte.tuiles.allSatisfy { $0.courbe.count == 14 })
}

@Test func lesBandesDeNormeSuiventLaNormeEtLeBesoin() throws {
    let carte = try #require(ModeleRecuperation.carte(try recuperation(.normal), besoin_min: besoin))
    let sommeil = try #require(carte.tuiles.first { $0.libelle == "Sommeil" })
    #expect(sommeil.bandeBas == besoin - 45)
    #expect(sommeil.bandeHaut == besoin)
    #expect(sommeil.norme == "besoin 7h30")
}

@Test func uneValeurAbsenteEcritUnTiret() throws {
    var r = try recuperation(.normal)
    r.point.vfc7_ms = nil
    let carte = try #require(ModeleRecuperation.carte(r, besoin_min: besoin))
    let vfc = try #require(carte.tuiles.first { $0.libelle == "VFC" })
    #expect(vfc.valeur == "–")
}

@Test func fatigueAfficheLeTitreDeLEtatDeJogCore() throws {
    let r = try recuperation(.fatigue)
    let carte = try #require(ModeleRecuperation.carte(r, besoin_min: besoin))
    #expect([EtatRecuperation.sousLaNorme, .basse].contains(r.etat))
    #expect(carte.titre == titreEtatRecuperation(r.etat))
    #expect(carte.phrase == r.phrase)
}

@Test func sansVueLaCarteEstAbsente() {
    #expect(ModeleRecuperation.carte(nil, besoin_min: besoin) == nil)
}

@Test func lesTonsSuiventLEtatDeLaRecuperation() {
    #expect(ModeleRecuperation.tonEtat(.dansLaNorme) == .bon)
    #expect(ModeleRecuperation.tonEtat(.sousLaNorme) == .attention)
    #expect(ModeleRecuperation.tonEtat(.basse) == .mauvais)
    #expect(ModeleRecuperation.tonEtat(.normeEnCours) == .neutre)
    #expect(ModeleRecuperation.tonEtat(.nuitsInsuffisantes) == .neutre)
}

@Test func lesPastillesEtLesIndicateursOntLeurTexte() {
    #expect(ModeleRecuperation.libellePastille(.dansLaNorme) == "OK")
    #expect(ModeleRecuperation.libellePastille(.sousLaNorme) == "À surveiller")
    #expect(ModeleRecuperation.libellePastille(.basse) == "Alerte")
    #expect(ModeleRecuperation.libellePastille(.normeEnCours) == "Données insuffisantes")
    #expect(ModeleRecuperation.libelleIndicateur(.ok) == "OK")
    #expect(ModeleRecuperation.libelleIndicateur(.surveiller) == "À surveiller")
    #expect(ModeleRecuperation.libelleIndicateur(.alerte) == "Alerte")
    #expect(ModeleRecuperation.libelleIndicateur(.insuffisant) == "Données insuffisantes")
    #expect(ModeleRecuperation.libelleIndicateur(.contexte) == "Contexte")
}

@Test func lesIndicateursSeComptentSansLesContextes() {
    func indicateur(_ cle: CleIndicateur, _ etat: EtatIndicateur) -> IndicateurRecuperation {
        IndicateurRecuperation(cle: cle, nom: "", etat: etat, valeurTexte: "", detail: "", explication: "", reperes: [])
    }
    let indicateurs = [
        indicateur(.vfc, .ok), indicateur(.fcRepos, .ok), indicateur(.sommeil, .surveiller),
        indicateur(.regularite, .ok), indicateur(.respiration, .contexte),
    ]
    #expect(ModeleRecuperation.resumeIndicateurs(indicateurs) == "3 sur 4 au vert")
}

// MARK: - Nuit (A6)

@Test func unEcartDeMoinsQuaranteNeufMinutesEstEnAttention() throws {
    let r = try recuperation(.normal, session: try session(sommeil: 401))
    let nuit = try #require(ModeleRecuperation.nuit(r, besoin_min: besoin, calendrier: calendrier))
    #expect(nuit.ecart == "−49 min / besoin")
    #expect(nuit.ecartTon == .attention)
}

@Test func unEcartDeMoinsQuaranteQuatreMinutesEstNeutre() throws {
    let r = try recuperation(.normal, session: try session(sommeil: 406))
    let nuit = try #require(ModeleRecuperation.nuit(r, besoin_min: besoin, calendrier: calendrier))
    #expect(nuit.ecartTon == .neutre)
}

@Test func unEcartDeMoinsQuaranteCinqMinutesEstEnAttention() throws {
    let r = try recuperation(.normal, session: try session(sommeil: 405))
    let nuit = try #require(ModeleRecuperation.nuit(r, besoin_min: besoin, calendrier: calendrier))
    #expect(nuit.ecartTon == .attention)
}

@Test func laDateDeLaNuitEstEnFrancais() throws {
    // Le plan écrit « mar. 28 oct. au mer. 29 oct. » : ce sont les jours de la semaine du 29 oct. 2025. JogCore ne
    // garde une session que pour A (2026-10-29, un jeudi), d'où l'affectation directe.
    var r = try recuperation(.normal)
    r.derniereSession = try session(sommeil: 401, date: "2025-10-29")
    let nuit = try #require(ModeleRecuperation.nuit(r, besoin_min: besoin, calendrier: calendrier))
    #expect(nuit.date == "Nuit du mar. 28 oct. au mer. 29 oct.")
}

@Test func laDateSuitLeCalendrierDeLaNuitDAujourdhui() throws {
    let nuit = try #require(ModeleRecuperation.nuit(try recuperation(.normal, session: try session(sommeil: 401)), besoin_min: besoin, calendrier: calendrier))
    #expect(nuit.date == "Nuit du mer. 28 oct. au jeu. 29 oct.")
}

@Test func lHypnogrammeASixHeuresCroissantesDuDebutALaFin() throws {
    let r = try recuperation(.normal, session: try session(sommeil: 401))
    let nuit = try #require(ModeleRecuperation.nuit(r, besoin_min: besoin, calendrier: calendrier))
    #expect(nuit.heures.count == 3)
    #expect(nuit.heures.first == "23:04")
    #expect(nuit.heures.last == "06:05")
}

@Test func laNuitQuatreValeursDansLOrdre() throws {
    let r = try recuperation(.normal, session: try session(sommeil: 401, profond: 60, paradoxal: 90))
    let nuit = try #require(ModeleRecuperation.nuit(r, besoin_min: besoin, calendrier: calendrier))
    #expect(nuit.valeurs.map { $0.0 } == ["VFC", "FC de repos", "Profond", "Paradoxal"])
    #expect(nuit.valeurs.map { $0.2 } == ["ms", "bpm", "min", "min"])
    #expect(nuit.valeurs[2].1 == "60")
    #expect(nuit.valeurs[3].1 == "90")
}

@Test func sansSessionDeLaNuitIlNYAPasDeNuit() throws {
    let r = try recuperation(.normal)
    #expect(ModeleRecuperation.nuit(r, besoin_min: besoin, calendrier: calendrier) == nil)
}

// MARK: - Tendance (R3 et R4)

@Test func laTendanceDonneUnPointParNuitEtGardeLaBandeDesNuitsAbsentes() throws {
    let r = try recuperation(.normal)
    let points = ModeleRecuperation.tendance(r, mesure: .vfc, nuits: 56)
    #expect(points.count == 56)
    let absente = try #require(points.first(where: { $0.nuit == nil }))
    #expect(absente.bas != nil && absente.haut != nil)
    #expect(ModeleRecuperation.lectureTendance(absente, mesure: .vfc, ceMatin: false).contains("pas de mesure (montre non portée)"))
}

@Test func laTendanceDesSixMoisDonne182Points() throws {
    let r = try recuperation(.normal)
    #expect(ModeleRecuperation.tendance(r, mesure: .fcRepos, nuits: 182).count == 182)
}

@Test func laLectureDuMatinDonneLaMoyenneEtLaNorme() throws {
    let r = try recuperation(.normal)
    let dernier = try #require(ModeleRecuperation.tendance(r, mesure: .vfc, nuits: 56).last)
    #expect(ModeleRecuperation.lectureTendance(dernier, mesure: .vfc, ceMatin: true) == "Ce matin : moy. 7 nuits 54 ms · norme 50–60")
}

// MARK: - Sommeil (R5)

@Test func sommeil14DonneQuatorzeBarresDontLaSommeDesPhasesEstLeSommeilPlusLEveil() throws {
    let r = try recuperation(.normal)
    let barres = ModeleRecuperation.sommeil14(r)
    #expect(barres.count == 14)
    #expect(barres.last?.id == aujourdhui)
    for barre in barres where !barre.absente {
        let nuit = try #require(r.nuits.first(where: { $0.date == barre.id }))
        let total = barre.phases.reduce(0) { $0 + $1.1 }
        #expect(abs(total - (nuit.sommeil_min + nuit.eveille_min)) < 1e-6)
    }
}

// MARK: - Récupération et charge (R6)

@Test func seizeSemainesDontLaDerniereEstEnCours() throws {
    let semaines = ModeleRecuperation.chargeEtRecuperation(try vueAvecRecuperation(try recuperation(.normal)))
    #expect(semaines.count == 16)
    #expect(semaines.map(\.enCours) == Array(repeating: false, count: 15) + [true])
    #expect(semaines.last?.id == "2026-10-26")
}

@Test func lesKilometresViennentDeLaVueEtValentZeroSiLaSemaineManque() throws {
    let vue = try vueAvecRecuperation(try recuperation(.normal))
    let semaines = ModeleRecuperation.chargeEtRecuperation(vue)
    let km = try #require(vue.semaines.first(where: { $0.lundi == "2026-10-19" })?.km)
    #expect(semaines[14].km == km)
    #expect(semaines[15].km == 0)
}

@Test func laMarqueSigneLesSemainesSousMoinsHuitPourCentArrondiAuDixieme() throws {
    var r = try recuperation(.normal)
    r.semaines[12].ecartVfc_pct = -8.04
    r.semaines[13].ecartVfc_pct = -8.0
    r.semaines[14].ecartVfc_pct = -8.1
    let semaines = ModeleRecuperation.chargeEtRecuperation(try vueAvecRecuperation(r))
    #expect(!semaines[12].marque)
    #expect(!semaines[13].marque)
    #expect(semaines[14].marque)
    #expect(semaines[14].ecart == -8.1)
}

// MARK: - Besoin

@Test func leBesoinSEcritEnHeuresEtMinutes() {
    #expect(ModeleRecuperation.besoinTexte(450) == "7 h 30")
}

// MARK: - Sections de l'onglet Récupération (lot 12, R1 à R7)

@Test func lesSectionsDeLaRecuperationSuiventLOrdreDeR1AR7() throws {
    let r = try recuperation(.normal)
    #expect(ModeleRecuperation.sections(r) == [.etat, .signaux, .vfc, .fcRepos, .sommeil, .chargeRecuperation, .methode])
}

@Test func sansNuitLesSectionsSeReduisentAuMessageSansNuit() {
    #expect(ModeleRecuperation.sections(nil) == [.sansNuit])
}

// MARK: - Textes de R1, R2 et R7 (maquette recuperation.html)

@Test func lesTextesDuSurtitreEtDeLaSourceSontCeuxDeLaMaquette() {
    #expect(ModeleRecuperation.surtitre == "Ce matin · moyenne des 7 dernières nuits face à ta norme de 60 jours")
    #expect(ModeleRecuperation.sourceTexte == "Source : Apple Santé (HealthKit). Pas de score sur 100 : chaque valeur est affichée face à sa propre norme.")
}

@Test func laMethodeDonneQuatreParagraphesExactsDansLOrdre() {
    let paragraphes = ModeleRecuperation.methode
    #expect(paragraphes.map(\.titre) == ["Mesure.", "Norme.", "État", "Sommeil."])
    #expect(paragraphes.map(\.texte) == [
        "Mesure. L’Apple Watch relève la VFC (SDNN, pas RMSSD) plusieurs fois pendant le sommeil. On fait la moyenne de la nuit, en logarithme. La FC de repos est la FC moyenne pendant le sommeil, pas la valeur du jour donnée par Santé.",
        "Norme. Moyenne des 60 nuits précédentes, plus ou moins un écart-type environ, recalculée chaque matin. Il faut au moins 21 nuits mesurées. Avant cela, l’écran affiche « Norme en cours de calcul ».",
        "État, figé au réveil :",
        "Sommeil. C’est un contexte, pas une entrée de l’état. Repère : besoin réglable, 7 h 30 par défaut. Une nuit sans montre est ignorée, jamais comptée à zéro.",
    ])
}

@Test func lesPucesDeLEtatSontLesTroisEtatsDeLaMethode() {
    #expect(ModeleRecuperation.methode[2].puces == [
        "Dans ta norme : VFC sur 7 nuits dans la bande.",
        "Sous ta norme : VFC sur 7 nuits sous la bande.",
        "Basse : VFC sous la bande et FC de repos au-dessus de la sienne.",
    ])
    #expect(ModeleRecuperation.methode.filter { !$0.puces.isEmpty }.count == 1)
}

@Test func lesTonsDesIndicateursSuiventLEtatSansPrendreLaCouleurSeule() {
    #expect(ModeleRecuperation.tonIndicateur(.ok) == .bon)
    #expect(ModeleRecuperation.tonIndicateur(.surveiller) == .attention)
    #expect(ModeleRecuperation.tonIndicateur(.alerte) == .mauvais)
    #expect(ModeleRecuperation.tonIndicateur(.insuffisant) == .neutre)
    #expect(ModeleRecuperation.tonIndicateur(.contexte) == .neutre)
}
