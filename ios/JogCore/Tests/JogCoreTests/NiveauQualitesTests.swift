import Foundation
import Testing
@testable import JogCore

// Lot 8 de la refonte de l'accueil (docs/implementation/refonte-accueil.md) : six qualités du radar de N1. Tests à la
// frontière publique `sixQualites`, sur des Vue dont les séances sont écrites ici. Règles citées : 04, « Six qualités » ;
// D-028 (fenêtre Q, référence Q₀ un an plus tôt, Régularité) ; D-015 (arrondi avant comparaison). Points de décision 6
// (moins de 24 semaines terminées : axes à « – ») et 9 (Résilience sans série VFC : « – »).
//
// Semaines : A = jeudi 2026-10-29, sa semaine commence le lundi 2026-10-26 (lundiA). « Semaine k » = la semaine terminée
// k semaines avant celle de A (k = 1 : la plus récente). Une séance de footing par semaine suffit à donner un km.

private let A: DateCivile = "2026-10-29"
private let lundiA: DateCivile = "2026-10-26"

/// Jour `decalage` après le lundi de la semaine k (k = 1 : la semaine terminée la plus récente). 6 = dimanche.
private func jourDeLaSemaine(_ k: Int, _ decalage: Int = 2) throws -> DateCivile {
    try ajouterJours(lundiA, -7 * k + decalage)
}

/// Séance de la Vue, de type donné. Les champs non renseignés sont absents.
private func seance(
    _ cle: String, _ date: DateCivile, _ type: TypeSeance, km: Double = 10, ef: Double? = nil,
    repetitions: [Repetition] = [], decouplage: Decouplage? = nil
) -> SeanceVue {
    let intrinseque = SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 1_000_000, nom: nil, marquage: .aucun, duree_min: 40, km: km,
        fcMoy: nil, allureMoy_skm: nil, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: 0, mp_min: 0,
        segmentsMp: [], repetitions: repetitions, format: nil, recup_s: nil, ef: ef, fcPic: nil, decouplage: decouplage,
        lignesDroites: false, distanceRef_km: nil, temps_s: nil
    )
    return SeanceVue(seance: Seance(intrinseque: intrinseque, type: type))
}

/// Répétition sous-seuil : allure en s/km, FC de fin en bpm. Avec fcFin égale à refHr, l'allure normalisée vaut l'allure.
private func repetition(allure: Double, fcFin: Double) -> Repetition {
    Repetition(n: 1, debut_s: 0, duree_s: 180, allure_skm: allure, fcFin: fcFin)
}

/// Vue dont l'historique commence le lundi de `semaines` semaines avant celle de A. J est le lendemain de A (D-022),
/// sauf `J` explicite (A dimanche, par exemple).
private func vueAvec(semaines: Int, J: DateCivile? = nil, _ seances: [SeanceVue]) throws -> Vue {
    var vue = try calculerVue(EntreeVue(
        intrinseques: [], parametres: parametresDefaut(), J: try J ?? ajouterJours(A, 1), derniereSynchro: nil
    ))
    vue.seances = seances
    vue.premierJour = try ajouterJours(lundiA, -7 * semaines)
    return vue
}

/// Une séance de footing par semaine terminée (k = 1 … semaines), de `km(k)` km et d'EF `ef(k)` si elle est donnée.
private func footingParSemaine(_ semaines: Int, km: (Int) -> Double, ef: (Int) -> Double? = { _ in nil }) throws -> [SeanceVue] {
    try (1...semaines).map { k in
        seance("f-\(k)", try jourDeLaSemaine(k), .footing, km: km(k), ef: ef(k))
    }
}

/// Axe d'une qualité, ou échec si le radar ne le porte pas.
private func axe(_ six: SixQualites, _ q: Qualite) throws -> AxeQualite {
    try #require(six.axes.first { $0.qualite == q })
}

/// Un kilométrage de 12 km par semaine dans la fenêtre Q, 10 km par semaine dans la référence Q₀ (k = 53 … 64), 10 partout
/// ailleurs : la seule source d'écart est le volume de Q.
private func volumeQ12Contre10(semaines: Int = 70) throws -> SixQualites {
    try calculerSixQualites(semaines: semaines, try footingParSemaine(semaines, km: { $0 <= 12 ? 12 : 10 }))
}

/// Calcul du radar sur une Vue portant ces séances, `semaines` semaines d'historique.
private func calculerSixQualites(
    semaines: Int, _ seances: [SeanceVue], milieux: [PointNormeVFC]? = nil, J: DateCivile? = nil
) throws -> SixQualites {
    try sixQualites(try vueAvec(semaines: semaines, J: J, seances), milieuxNormeVFC: milieux)
}

// MARK: - 04, Six qualités : fenêtres Q et Q₀

@Test func laFenetreQEstLes12SemainesTermineesLesPlusRecentes() throws {
    // 04, « Six qualités » et D-028 : Q = les 12 semaines terminées les plus récentes. La semaine qui contient A n'entre
    // pas, même avec une séance très longue le jour de A ; Q finit donc le dimanche précédant le lundi de A.
    var seances = try footingParSemaine(70, km: { _ in 10 })
    seances.append(seance("aujourdhui", A, .footing, km: 1_000))
    seances.append(seance("lundi-en-cours", try ajouterJours(lundiA, 0), .footing, km: 1_000))
    let six = try calculerSixQualites(semaines: 70, seances)

    #expect(six.Q?.0 == (try ajouterJours(lundiA, -84)))
    #expect(six.Q?.1 == (try ajouterJours(lundiA, -1)))
    #expect(try axe(six, .volume).maintenant == 10)
}

@Test func laSemaineDeAUnDimancheNEntrePasDansQ() throws {
    // D-026 : A dimanche, la semaine de A (lundi → dimanche) est en cours, pas terminée : elle n'entre pas dans Q.
    let dimanche: DateCivile = "2026-11-01"
    var seances = try footingParSemaine(70, km: { _ in 10 })
    seances.append(seance("dimanche", dimanche, .footing, km: 1_000))
    let six = try calculerSixQualites(semaines: 70, seances, J: try ajouterJours(dimanche, 1))

    #expect(six.Q?.1 == (try ajouterJours(lundiA, -1)))
    #expect(try axe(six, .volume).maintenant == 10)
}

@Test func laReferenceQEstLesMemesSemainesUnAnPlusTot() throws {
    // 04, « Six qualités » : Q₀ = les mêmes 12 semaines, 364 jours plus tôt (même jour de la semaine). Avec un an
    // d'historique, Q₀ n'est pas une repli : referencePremieresSemaines est faux.
    let six = try volumeQ12Contre10()

    #expect(six.Q0?.0 == (try ajouterJours(lundiA, -84 - 364)))
    #expect(six.Q0?.1 == (try ajouterJours(lundiA, -1 - 364)))
    #expect(six.referencePremieresSemaines == false)
}

// MARK: - 04, Six qualités : mesures et écarts

@Test func leVolumeEstLesKmParSemaineDeQFaceAQ0EnPourcent() throws {
    // 04 : Volume = km ÷ 12. Q : 12 km par semaine ; Q₀ : 10 km par semaine, soit +20 % (écart affiché en %).
    let six = try volumeQ12Contre10()
    let volume = try axe(six, .volume)

    #expect(volume.maintenant == 12)
    #expect(volume.reference == 10)
    #expect(volume.ecartAffiche == 20)
    #expect(volume.ecartOriente == 20)
}

@Test func uneAllureSeuilPasseDe240A231DonneUnProgresDeNeufSecondes() throws {
    // 04 : Seuil = moyenne des allures normalisées sous-seuil, meilleur si plus bas. 240 → 231 s/km : progrès de 9 ;
    // l'écart affiché garde le signe de la valeur (−9 s/km), l'écart orienté celui du progrès (+9).
    let refHr = parametresDefaut().globaux.refHr
    var seances = try footingParSemaine(70, km: { _ in 10 })
    for k in 1...12 {
        seances.append(seance("ss-\(k)", try jourDeLaSemaine(k), .sousSeuil, repetitions: [repetition(allure: 231, fcFin: refHr)]))
    }
    for k in 53...64 {
        seances.append(seance("ss-\(k)", try jourDeLaSemaine(k), .sousSeuil, repetitions: [repetition(allure: 240, fcFin: refHr)]))
    }
    let seuil = try axe(try calculerSixQualites(semaines: 70, seances), .seuil)

    #expect(seuil.maintenant == 231)
    #expect(seuil.reference == 240)
    #expect(seuil.ecartAffiche == -9)
    #expect(seuil.ecartOriente == 9)
}

@Test func lEfficaciteEstLaMoyenneDesEfDesFootingsEnPourcent() throws {
    // 04 : Efficacité = moyenne des EF des footings, en %, meilleure si plus haute. 0,84 face à 0,80 : +5 %.
    let seances = try footingParSemaine(70, km: { _ in 10 }, ef: { $0 <= 12 ? 0.84 : (53...64).contains($0) ? 0.80 : nil })
    let efficacite = try axe(try calculerSixQualites(semaines: 70, seances), .efficacite)

    #expect(efficacite.ecartAffiche == 5)
    #expect(efficacite.ecartOriente == 5)
}

@Test func unEcartDEfficaciteBrutDe25PourCentAfficheTroisPourCent() throws {
    // D-015 : l'écart d'Efficacité est en % et s'arrondit à l'unité (PRECISION.qualiteEfficacitePct), pas à 0,01 (EF brute).
    // 0,82 face à 0,80 : +2,5 %, affiché +3.
    let seances = try footingParSemaine(70, km: { _ in 10 }, ef: { $0 <= 12 ? 0.82 : (53...64).contains($0) ? 0.80 : nil })
    let efficacite = try axe(try calculerSixQualites(semaines: 70, seances), .efficacite)

    #expect(efficacite.ecartAffiche == 3)
    #expect(efficacite.ecartOriente == 3)
}

@Test func lEnduranceEstLaMoyenneDesDecouplagesUtilisablesEnPointsMeilleureSiPlusBas() throws {
    // 04 : Endurance = moyenne des découplages des sorties longues utilisables, meilleure si plus basse, en points de %.
    // 3 % face à 5 % : progrès de 2 points. Un découplage absent n'entre pas.
    func sortie(_ k: Int, _ valeur: Double?) throws -> SeanceVue {
        seance("sl-\(k)", try jourDeLaSemaine(k), .sortieLongue, decouplage: Decouplage(
            valeur: valeur, retenu_min: 70, total_min: 90, avecMp: false
        ))
    }
    var seances = try footingParSemaine(70, km: { _ in 10 })
    for k in 1...12 { seances.append(try sortie(k, 3)) }
    for k in 53...64 { seances.append(try sortie(k, 5)) }
    seances.append(try sortie(20, nil))
    let endurance = try axe(try calculerSixQualites(semaines: 70, seances), .endurance)

    #expect(endurance.ecartAffiche == -2)
    #expect(endurance.ecartOriente == 2)
}

@Test func laRegulariteEstLaPartDesSemainesAvecAuMoinsQuatreSeances() throws {
    // 04 : Régularité = part des 12 semaines avec au moins 4 séances, en points de %. Q : 6 semaines sur 12 (50 %) ;
    // Q₀ : 12 sur 12 (100 %) ; écart −50 points, meilleur si plus haut, donc recul de 50.
    var seances = try footingParSemaine(70, km: { _ in 10 })
    for k in 1...6 {
        for j in 0..<3 { seances.append(seance("r-\(k)-\(j)", try jourDeLaSemaine(k, j), .footing)) }
    }
    for k in 53...64 {
        for j in 0..<4 { seances.append(seance("r0-\(k)-\(j)", try jourDeLaSemaine(k, j), .footing)) }
    }
    let regularite = try axe(try calculerSixQualites(semaines: 70, seances), .regularite)

    #expect(regularite.maintenant == 50)
    #expect(regularite.reference == 100)
    #expect(regularite.ecartAffiche == -50)
    #expect(regularite.ecartOriente == -50)
}

// MARK: - 04, Six qualités : rayon et Emax

@Test func leRayonVautUnDemiSansEcart() throws {
    // 04 : rayon = 0,5 + 0,5 × borne(E ÷ Emax, −1, 1). E = 0 : l'anneau de l'an dernier.
    let six = try calculerSixQualites(semaines: 64, try footingParSemaine(64, km: { _ in 10 }))
    #expect(try axe(six, .volume).rayon == 0.5)
}

@Test func leRayonVautUnQuandLEcartEstLEcartMaximumDeLHistorique() throws {
    // 04 : Emax = plus grand |écart orienté à un an| observé. Ici Q (12 km) face à Q₀ (10 km) donne +20 % : c'est le seul
    // écart observé, donc Emax = 20 et le rayon vaut 1.
    let six = try calculerSixQualites(semaines: 64, try footingParSemaine(64, km: { $0 <= 12 ? 12 : 10 }))
    #expect(try axe(six, .volume).rayon == 1)
}

@Test func leRayonVautZeroQuandLeRecuEgaleLEcartMaximumDeLHistorique() throws {
    // 04 : rayon 0 quand E = −Emax. Q = 8 km (face à 10 km) donne −20 %, et une fenêtre antérieure (12 km face à 10) donne
    // +20 %, donc Emax = 20 et le rayon de Q vaut 0.
    let six = try calculerSixQualites(semaines: 76, try footingParSemaine(76, km: { k in
        k <= 12 ? 8 : (k <= 24 ? 12 : 10)
    }))
    #expect(try axe(six, .volume).rayon == 0)
}

@Test func leRayonSeLitSurLEcartRapporteALEcartMaximumDeLHistorique() throws {
    // 04 : Q = 11 km face à 10 km : +10 %. Une fenêtre antérieure (12 km face à 10) donne +20 %, Emax = 20, rayon 0,75.
    let six = try calculerSixQualites(semaines: 76, try footingParSemaine(76, km: { k in
        k <= 12 ? 11 : (k <= 52 ? 12 : 10)
    }))
    #expect(try axe(six, .volume).rayon == 0.75)
}

@Test func leEmaxNeDescendPasSousSonMinimum() throws {
    // 04 : Emax est au moins 5 % pour le volume. Un écart observé de 2 % donne Emax = 5, donc un rayon de 0,7.
    let six = try calculerSixQualites(semaines: 64, try footingParSemaine(64, km: { $0 <= 12 ? 10.2 : 10 }))
    let rayon = try axe(six, .volume).rayon
    #expect(abs(rayon - 0.7) < 1e-9)
}

@Test func unEcartQuiSArrondiAZeroEstNeutre() throws {
    // D-015 : l'écart se compare arrondi. 10,04 km face à 10 : +0,4 %, arrondi à 0 : anneau de l'an dernier, écart nul.
    let six = try calculerSixQualites(semaines: 64, try footingParSemaine(64, km: { $0 <= 12 ? 10.04 : 10 }))
    let volume = try axe(six, .volume)

    #expect(volume.ecartOriente == 0)
    #expect(volume.rayon == 0.5)
}

// MARK: - 04 et point de décision 6 : historique court

@Test func moinsDe24SemainesTermineesDonnentDesAxesVidesEtLaReferenceDesPremieresSemaines() throws {
    // Point de décision 6 : avec moins de 24 semaines terminées, Q et Q₀ se recouvrent : axes à « – » et rayon 0,5.
    // Q₀ est alors les 12 premières semaines terminées (referencePremieresSemaines).
    let six = try calculerSixQualites(semaines: 20, try footingParSemaine(20, km: { _ in 10 }))

    #expect(six.referencePremieresSemaines == true)
    #expect(six.axes.count == Qualite.allCases.count)
    for axe in six.axes {
        #expect(axe.maintenant == nil)
        #expect(axe.ecartAffiche == nil)
        #expect(axe.rayon == 0.5)
    }
}

@Test func avecVingtQuatreSemainesLaReferenceEstLes12PremieresEtLesAxesSontCalcules() throws {
    // Point de décision 6 : dès que Q et Q₀ sont disjoints (24 semaines terminées), les axes sont calculés face aux
    // 12 premières semaines, signalées par referencePremieresSemaines. 30 semaines : Q = k 1…12 (12 km), Q₀ = k 19…30 (10 km).
    let six = try calculerSixQualites(semaines: 30, try footingParSemaine(30, km: { $0 <= 12 ? 12 : 10 }))
    let volume = try axe(six, .volume)

    #expect(six.referencePremieresSemaines == true)
    #expect(volume.maintenant == 12)
    #expect(volume.reference == 10)
    #expect(volume.ecartAffiche == 20)
    #expect(six.Q0?.0 == (try ajouterJours(lundiA, -7 * 30)))
    #expect(six.Q0?.1 == (try ajouterJours(lundiA, -7 * 19 + 6)))
}

@Test func sansHistoriqueTousLesAxesSontVides() throws {
    // Sans séance, pas de premier jour : aucun axe ne se calcule.
    let six = try sixQualites(try vueAvec(semaines: 0, []))

    #expect(six.axes.allSatisfy { $0.maintenant == nil && $0.rayon == 0.5 })
    #expect(six.Q == nil)
}

// MARK: - 04, Six qualités : Résilience (point de décision 9)

@Test func laResilienceLitLeMilieuDeLaNormeAuDimancheDeFinDeFenetre() throws {
    // 04 : Résilience = milieu de la norme VFC au dernier jour de la fenêtre (le dimanche de la semaine k = 1 pour Q,
    // celui de la semaine k = 53 pour Q₀, la plus récente de Q₀). 50 ms face à 40 ms : +10, meilleur si plus haut.
    let milieux = [
        PointNormeVFC(date: try jourDeLaSemaine(1, 6), milieu_ms: 50),
        PointNormeVFC(date: try jourDeLaSemaine(53, 6), milieu_ms: 40),
    ]
    let six = try calculerSixQualites(semaines: 70, try footingParSemaine(70, km: { _ in 10 }), milieux: milieux)
    let resilience = try axe(six, .resilience)

    #expect(resilience.maintenant == 50)
    #expect(resilience.reference == 40)
    #expect(resilience.ecartAffiche == 10)
}

@Test func sansSerieVFCLaResilienceEstVideEtSonRayonAuCentre() throws {
    // Point de décision 9 : sans série VFC, la Résilience est à « – » et son rayon vaut 0,5.
    let six = try calculerSixQualites(semaines: 70, try footingParSemaine(70, km: { _ in 10 }))
    let resilience = try axe(six, .resilience)

    #expect(resilience.maintenant == nil)
    #expect(resilience.rayon == 0.5)
}

// MARK: - Relecture : bornes, plafonnement, semaine partielle, arrondi, Q₀ vides

@Test func vingtTroisSemainesTermineesDonnentDesAxesVidesEtUnRayonCentre() throws {
    // Point de décision 6 : 23 semaines terminées, Q et Q₀ se recouvrent encore : tous les axes sont à « – », rayon 0,5.
    let six = try calculerSixQualites(semaines: 23, try footingParSemaine(23, km: { _ in 10 }))

    #expect(six.referencePremieresSemaines == true)
    for axe in six.axes {
        #expect(axe.maintenant == nil)
        #expect(axe.reference == nil)
        #expect(axe.ecartOriente == nil)
        #expect(axe.rayon == 0.5)
    }
}

@Test func vingtQuatreSemainesTermineesCalculentLesAxesAvecLaReferenceDesPremieresSemaines() throws {
    // Point de décision 6 : 24 semaines terminées, Q = k 1…12 (12 km), Q₀ = k 13…24 (10 km), disjointes : axes calculés,
    // referencePremieresSemaines vrai.
    let six = try calculerSixQualites(semaines: 24, try footingParSemaine(24, km: { $0 <= 12 ? 12 : 10 }))
    let volume = try axe(six, .volume)

    #expect(six.referencePremieresSemaines == true)
    #expect(volume.maintenant == 12)
    #expect(volume.reference == 10)
    #expect(volume.ecartAffiche == 20)
}

@Test func unEcartCourantAuRecuMaximalDonneUnRayonNul() throws {
    // 04 : rayon = 0 quand E = −Emax. Q (9 km) face à Q₀ (10 km) : −10 %. La fenêtre courante fait partie de l'historique
    // d'Emax, donc Emax vaut 10 (au-dessus du plancher de 5 %) et le rayon tombe à 0 sans sortir de [0 ; 1].
    let six = try calculerSixQualites(semaines: 64, try footingParSemaine(64, km: { $0 <= 12 ? 9 : 10 }))
    let volume = try axe(six, .volume)

    #expect(volume.ecartOriente == -10)
    #expect(volume.rayon == 0)
}

@Test func uneSemainePartielleDeDebutNEntrePasNiDansQNiDansQ0() throws {
    // 04 et D-026 : premierJour est un mercredi. La semaine partielle (mercredi → dimanche) n'est pas terminée : ses
    // séances (1 000 km) n'entrent ni dans Q ni dans Q₀. Q₀ commence le lundi suivant le premier jour (lundiA − 448 ici).
    let mercredi = try ajouterJours(lundiA, -7 * 70 + 2)
    var seances = try footingParSemaine(69, km: { _ in 10 })
    seances.append(seance("partielle-mer", mercredi, .footing, km: 1_000))
    seances.append(seance("partielle-dim", try ajouterJours(lundiA, -7 * 70 + 6), .footing, km: 1_000))
    var vue = try vueAvec(semaines: 70, seances)
    vue.premierJour = mercredi
    let six = try sixQualites(vue)
    let volume = try axe(six, .volume)

    #expect(volume.maintenant == 10)
    #expect(volume.reference == 10)
    #expect(six.Q0?.0 == (try ajouterJours(lundiA, -448)))
    #expect(six.referencePremieresSemaines == false)
}

@Test func unEcartDeSeuilDeUneDemiSecondeSAfficheUneSecondeLoinDeZero() throws {
    // D-015 : 0,5 s/km à mi-chemin s'éloigne de zéro. Seuil 239,5 face à 240 : progrès de 0,5, affiché −1, orienté +1.
    let refHr = parametresDefaut().globaux.refHr
    var seances = try footingParSemaine(70, km: { _ in 10 })
    for k in 1...12 {
        seances.append(seance("ss-\(k)", try jourDeLaSemaine(k), .sousSeuil, repetitions: [repetition(allure: 239.5, fcFin: refHr)]))
    }
    for k in 53...64 {
        seances.append(seance("ss-\(k)", try jourDeLaSemaine(k), .sousSeuil, repetitions: [repetition(allure: 240, fcFin: refHr)]))
    }
    let seuil = try axe(try calculerSixQualites(semaines: 70, seances), .seuil)

    #expect(seuil.ecartAffiche == -1)
    #expect(seuil.ecartOriente == 1)
}

@Test func unEcartDeSeuilArrondiAZeroGardeDesMoyennesDifferentes() throws {
    // D-015 : Seuil 239,6 face à 240 : brut −0,4 s/km, arrondi à 0. L'écart est nul alors que les moyennes ne le sont pas.
    let refHr = parametresDefaut().globaux.refHr
    var seances = try footingParSemaine(70, km: { _ in 10 })
    for k in 1...12 {
        seances.append(seance("ss-\(k)", try jourDeLaSemaine(k), .sousSeuil, repetitions: [repetition(allure: 239.6, fcFin: refHr)]))
    }
    for k in 53...64 {
        seances.append(seance("ss-\(k)", try jourDeLaSemaine(k), .sousSeuil, repetitions: [repetition(allure: 240, fcFin: refHr)]))
    }
    let seuil = try axe(try calculerSixQualites(semaines: 70, seances), .seuil)

    #expect(abs((seuil.maintenant ?? 0) - (seuil.reference ?? 0)) > 0.1)
    #expect(seuil.ecartAffiche == 0)
    #expect(seuil.ecartOriente == 0)
    #expect(seuil.rayon == 0.5)
}

@Test func unEcartDEnduranceArrondiAZeroGardeDesMoyennesDifferentes() throws {
    // D-015 : Endurance 3,04 face à 3,0 : brut 0,04 point, arrondi au dixième à 0. Écart nul, moyennes différentes.
    func sortie(_ k: Int, _ valeur: Double) throws -> SeanceVue {
        seance("sl-\(k)", try jourDeLaSemaine(k), .sortieLongue, decouplage: Decouplage(
            valeur: valeur, retenu_min: 70, total_min: 90, avecMp: false
        ))
    }
    var seances = try footingParSemaine(70, km: { _ in 10 })
    for k in 1...12 { seances.append(try sortie(k, 3.04)) }
    for k in 53...64 { seances.append(try sortie(k, 3.0)) }
    let endurance = try axe(try calculerSixQualites(semaines: 70, seances), .endurance)

    #expect(abs((endurance.maintenant ?? 0) - (endurance.reference ?? 0)) > 0.01)
    #expect(endurance.ecartAffiche == 0)
    #expect(endurance.ecartOriente == 0)
}

@Test func sansSortieLongueEnQ0LEnduranceNAPasDEcart() throws {
    // Plan, test 7 : Q₀ sans sortie longue : pas de référence, donc pas d'écart orienté et anneau à 0,5.
    func sortie(_ k: Int) throws -> SeanceVue {
        seance("sl-\(k)", try jourDeLaSemaine(k), .sortieLongue, decouplage: Decouplage(
            valeur: 3, retenu_min: 70, total_min: 90, avecMp: false
        ))
    }
    var seances = try footingParSemaine(70, km: { _ in 10 })
    for k in 1...12 { seances.append(try sortie(k)) }
    let endurance = try axe(try calculerSixQualites(semaines: 70, seances), .endurance)

    #expect(endurance.maintenant == 3)
    #expect(endurance.reference == nil)
    #expect(endurance.ecartOriente == nil)
    #expect(endurance.rayon == 0.5)
}

@Test func unVolumeDeReferenceANulNAPasDEcart() throws {
    // Plan, test 7 : Q₀ à 0 km : le Volume s'exprime en % de la référence, qui est nulle. Pas d'écart orienté.
    let seances = try footingParSemaine(70, km: { k in k <= 12 ? 12 : ((53...64).contains(k) ? 0 : 10) })
    let volume = try axe(try calculerSixQualites(semaines: 70, seances), .volume)

    #expect(volume.maintenant == 12)
    #expect(volume.reference == 0)
    #expect(volume.ecartOriente == nil)
}

// MARK: - Performance (lot 8, budget < 5 ms en release)

/// Durée d'un `Duration`, en millisecondes.
private func millisecondes(_ duree: Duration) -> Double {
    Double(duree.components.seconds) * 1_000 + Double(duree.components.attoseconds) * 1e-15
}

/// Lancement : JOG_PERF=1 swift test -c release --disable-sandbox --scratch-path /tmp/jogcore-A --filter mesure
@Test(.enabled(if: ProcessInfo.processInfo.environment["JOG_PERF"] == "1"))
func mesureSixQualites() throws {
    // 2 000 séances sur 4 ans (1 460 jours), types en rotation, FC, EF et découplage variés, un dimanche sur deux de VFC.
    let debut: DateCivile = "2022-11-01"
    let types: [TypeSeance] = [.footing, .sousSeuil, .sortieLongue, .seanceQualite, .footingLignesDroites]
    var seances: [SeanceVue] = []
    for k in 0..<2_000 {
        let date = try ajouterJours(debut, k * 1_460 / 2_000)
        let type = types[k % types.count]
        let reps = type == .sousSeuil ? [repetition(allure: 300 + Double(k % 7), fcFin: 160 + Double(k % 12))] : []
        seances.append(seance("s-\(k)", date, type, km: 5 + Double(k % 15), ef: 0.8 + Double(k % 9) / 100,
                               repetitions: reps,
                               decouplage: type == .sortieLongue ? Decouplage(
                                   valeur: Double(k % 10), retenu_min: 70, total_min: 90, avecMp: false
                               ) : nil))
    }
    let fin = try ajouterJours(debut, 1_460)
    let milieux = try (0..<209).map { PointNormeVFC(date: try ajouterJours(debut, 6 + 7 * $0), milieu_ms: 40 + Double($0 % 20)) }
    var vue = try calculerVue(EntreeVue(
        intrinseques: [], parametres: parametresDefaut(), J: try ajouterJours(fin, 1), derniereSynchro: nil
    ))
    vue.seances = seances
    vue.premierJour = debut

    for _ in 0..<3 {
        _ = try sixQualites(vue, milieuxNormeVFC: milieux)
    }
    let depart = ContinuousClock.now
    for _ in 0..<20 {
        _ = try sixQualites(vue, milieuxNormeVFC: milieux)
    }
    let moyenne = millisecondes(ContinuousClock.now - depart) / 20
    print(String(format: "sixQualites (2 000 séances, 4 ans, moyenne sur 20 itérations) : %.3f ms", moyenne))
    #expect(moyenne < 5)
}
