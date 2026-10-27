import Foundation
import Testing
@testable import JogCore

// Tests de l'estimation des répétitions sur la FC (D-021), écrits à la main. Tous les flux sont construits ici, à 1 Hz :
// aucune donnée réelle. Chaque test cite la règle D-021 qu'il vérifie, et les constantes par défaut (ReglagesEstimation).

/// Paramètres de test : subtHrLo 160 bpm (le seuil ne descend pas sous 155), lt2Hr 172, lt2Pace 240 s/km.
private let parametres = ParamsDates(
    hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92,
    lt2Hr: 172, lt2Pace: 240, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)

/// Un morceau de séance : `duree` secondes à FC `fc` et vitesse `vitesse` (m/s), en pente `pente` (Δalt/Δdist).
/// `pause` : le temps passe sans échantillon (pause de montre), comme dans la grille du pivot.
private struct Morceau {
    var duree: Int
    var fc: Float
    var vitesse: Float
    var pente: Float = 0
    var pause: Bool = false
}

/// Flux à 1 Hz construit morceau par morceau. `fcTrouee` : une FC sur sept manque (NaN). `altitude` : sans altitude si faux.
private func fluxConstruit(_ morceaux: [Morceau], fcTrouee: Bool = false, altitude: Bool = true) -> Flux {
    var temps: [Float] = []
    var distances: [Float] = []
    var fc: [Float] = []
    var vitesses: [Float] = []
    var altitudes: [Float] = []
    var t: Float = 0
    var distance: Float = 0
    var altitude_m: Float = 0
    for m in morceaux {
        if m.pause {
            t += Float(m.duree)
            continue
        }
        for _ in 0..<m.duree {
            temps.append(t)
            distances.append(distance)
            fc.append(fcTrouee && Int(t) % 7 == 3 ? Float.nan : m.fc)
            vitesses.append(m.vitesse)
            altitudes.append(altitude_m)
            distance += m.vitesse
            altitude_m += m.pente * m.vitesse
            t += 1
        }
    }
    return Flux(
        t_s: temps, dist_m: distances, fc_bpm: fc, alt_m: altitude ? altitudes : nil, vitesse_ms: vitesses
    )
}

/// Pivot construit à partir de morceaux. Par défaut, une séance de l'app Exercice d'Apple (HealthKit, analyse des tours
/// permise). `date` fixe la date locale de la séance.
private func pivotConstruit(
    _ morceaux: [Morceau],
    source: Source = .healthkit,
    appSource: String? = "com.apple.health.TEST",
    tours: [Tour] = [],
    date: DateCivile = "2026-10-10",
    fcTrouee: Bool = false,
    altitude: Bool = true
) -> ActivitePivot {
    let flux = fluxConstruit(morceaux, fcTrouee: fcTrouee, altitude: altitude)
    return ActivitePivot(
        cleSource: "test:estimation:\(date)", source: source, versionAdaptateur: "1.0.0", empreinteBrute: "test",
        debutUtc: 1_700_000_000_000, decalageLocal_min: 0, dateLocale: date,
        duree_s: Double(flux.t_s.count), distance_m: Double(flux.dist_m.last ?? 0), nom: "Séance fictive",
        competition: false, sousType: .route, pasFC_s: 1, flux: flux, tours: tours, appSource: appSource
    )
}

/// Pivot d'une autre app (WorkOutDoors) : aucune analyse des intervalles par les tours, donc l'estimation sur la FC
/// (D-021) est le seul détecteur. Les pivots de l'app Exercice passent d'abord par le chemin par l'allure, qui est existant.
private func pivotAutreApp(_ morceaux: [Morceau], date: DateCivile = "2026-10-10") -> ActivitePivot {
    pivotConstruit(morceaux, appSource: "net.workoutdoors.workoutdoors", date: date)
}

/// Fractionné construit : échauffement de 10 min à 135 bpm, `nombre` répétitions de `duree` s à `fcTravail` bpm et
/// `vitesseHaute` m/s, séparées de `recup` s à `fcRecup` bpm et `vitesseBasse` m/s, retour au calme de 10 min.
private func fractionne(
    nombre: Int = 6, duree: Int = 180, recup: Int = 120, fcTravail: Float = 175, fcRecup: Float = 130,
    vitesseHaute: Float = 4.35, vitesseBasse: Float = 2.78
) -> [Morceau] {
    var morceaux = [Morceau(duree: 600, fc: 135, vitesse: 3)]
    for k in 0..<nombre {
        morceaux.append(Morceau(duree: duree, fc: fcTravail, vitesse: vitesseHaute))
        if k < nombre - 1 {
            morceaux.append(Morceau(duree: recup, fc: fcRecup, vitesse: vitesseBasse))
        }
    }
    morceaux.append(Morceau(duree: 600, fc: 135, vitesse: 3))
    return morceaux
}

/// Début de la répétition k du fractionné de `fractionne()`, en secondes.
private func debutAttendu(_ k: Int, duree: Int = 180, recup: Int = 120) -> Double {
    Double(600 + k * (duree + recup))
}

/// Grille de la séance construite (étape ①).
private func grilleDe(_ pivot: ActivitePivot) throws -> GrilleSeance {
    try miseEnForme(pivot)
}

/// Plage estimée, en secondes depuis le début : (début, fin) du premier et du dernier échantillon.
private func intervalleSecondes(_ g: GrilleSeance, _ plage: Plage) -> (debut: Double, fin: Double) {
    (g.t_s[plage.a], g.t_s[plage.b] + g.dt_s[plage.b])
}

// MARK: - Fractionné sur plat : les bords sont justes à 15 s près

@Test func d021UnFractionneSurPlatDonneSixBlocsAuxBordsJustes() throws {
    // D-021 : 6 × 3 min à 175 bpm, récupération de 2 min à 130 bpm, vitesses haute et basse. Les six blocs sont trouvés,
    // et chaque bord est à 15 s au plus de la vérité (le recalage sur la rupture de vitesse porte les bords).
    let g = try grilleDe(pivotConstruit(fractionne()))
    let plages = estimerRepetitions(g, parametres)
    #expect(plages.count == 6)
    for (k, plage) in plages.enumerated() {
        let (debut, fin) = intervalleSecondes(g, plage)
        #expect(abs(debut - debutAttendu(k)) <= 15, "rép. \(k + 1) : début \(debut)")
        #expect(abs(fin - (debutAttendu(k) + 180)) <= 15, "rép. \(k + 1) : fin \(fin)")
    }
}

@Test func d021LeFractionneSurPlatPasseParLesTousLesCheminsDeLaSeance() throws {
    // D-021 : la séance d'une autre app a six répétitions estimées, marquées comme telles, au format « non détaillé »
    // (pas de « 6×3′ »), et classées séance qualité.
    let pivot = pivotAutreApp(fractionne())
    let seance = try calculerSeanceIntrinseque(pivot, parametres)
    #expect(seance.repetitionsEstimees == true)
    #expect(seance.repetitions.count == 6)
    #expect(seance.format == nil)
    #expect(seance.recup_s == 120)
    let classee = try classerSeances([seance])
    #expect(classee[0].type == .seanceQualite)
}

// MARK: - Côtes : détectées par la FC, là où l'allure échoue

@Test func d021DesCotesLentesSontDetecteesParLaFcAlorsQueLAllureEchoue() throws {
    // D-021 : côtes à 2,5 m/s (allure de 400 s/km) à 8 % de pente, FC de 170 ; récupération à plat à 3,5 m/s, FC de 130.
    // Le chemin par l'allure (cheminFlux) ne voit aucune répétition ; l'estimation sur la FC en trouve cinq.
    var morceaux = [Morceau(duree: 600, fc: 135, vitesse: 3)]
    for k in 0..<5 {
        morceaux.append(Morceau(duree: 180, fc: 170, vitesse: 2.5, pente: 0.08))
        if k < 4 { morceaux.append(Morceau(duree: 120, fc: 130, vitesse: 3.5)) }
    }
    morceaux.append(Morceau(duree: 600, fc: 135, vitesse: 3))
    let g = try grilleDe(pivotConstruit(morceaux))

    #expect(try detecterRepetitions(g, [], parametres).repetitions.isEmpty)
    let plages = estimerRepetitions(g, parametres)
    #expect(plages.count == 5)
    for (k, plage) in plages.enumerated() {
        let (debut, _) = intervalleSecondes(g, plage)
        #expect(abs(debut - debutAttendu(k)) <= 30, "côte \(k + 1) : début \(debut)")
    }
}

@Test func d021DesCotesSansAltitudeRestentDetecteesParLaFc() throws {
    // D-021 : sans altitude (alt_m nil), la détection reste sur la FC : les bords retombent sur la vitesse.
    let g = try grilleDe(pivotConstruit(fractionne(), altitude: false))
    #expect(g.alt_m == nil)
    #expect(estimerRepetitions(g, parametres).count == 6)
}

// MARK: - Séances qui ne sont pas du fractionné

@Test func d021UnFootingAvecArretsAuFeuNAPasDeBlocEtResteFooting() throws {
    // D-021 : arrêts de 30 à 60 s (vitesse nulle) à FC stable basse : aucun bloc, séance footing.
    let morceaux: [Morceau] = [
        Morceau(duree: 900, fc: 135, vitesse: 3),
        Morceau(duree: 40, fc: 132, vitesse: 0),
        Morceau(duree: 900, fc: 137, vitesse: 3),
        Morceau(duree: 60, fc: 133, vitesse: 0),
        Morceau(duree: 900, fc: 136, vitesse: 3),
        Morceau(duree: 30, fc: 131, vitesse: 0),
        Morceau(duree: 600, fc: 135, vitesse: 3),
    ]
    let pivot = pivotConstruit(morceaux)
    let g = try grilleDe(pivot)
    #expect(estimerRepetitions(g, parametres).isEmpty)
    let seance = try calculerSeanceIntrinseque(pivot, parametres)
    #expect(seance.repetitionsEstimees == nil)
    #expect(try classerSeances([seance])[0].type == .footing)
}

@Test func d021UnFootingVallonneNEstPasQualite() throws {
    // D-021 : un footing vallonné, FC qui oscille de ±8 bpm autour de 140 (easyCap) sur 5 min. Le seuil ne descend pas sous
    // subtHrLo − 5 (155) : aucun bloc, ni séance qualité. Limite connue : un vallonné dont les crêtes dépassent subtHrLo
    // d'environ 2 min peut former des blocs (la FC seule ne les distingue pas).
    var morceaux: [Morceau] = []
    for seconde in 0..<2400 {
        let fc = 140 + 8 * Float(sin(2 * Double.pi * Double(seconde) / 300))
        morceaux.append(Morceau(duree: 1, fc: fc, vitesse: 3))
    }
    let pivot = pivotAutreApp(morceaux)
    #expect(estimerRepetitions(try grilleDe(pivot), parametres).isEmpty)
    let seance = try calculerSeanceIntrinseque(pivot, parametres)
    #expect(seance.repetitionsEstimees == nil)
    #expect(try classerSeances([seance])[0].type != .seanceQualite)
}

@Test func d021UneSeuleMonteeSoutenueNEstPasQualite() throws {
    // D-021 : une montée soutenue de 15 min au-dessus du seuil est un seul bloc : moins de deux blocs, donc aucune
    // répétition estimée et pas de séance qualité.
    let morceaux: [Morceau] = [
        Morceau(duree: 600, fc: 135, vitesse: 3),
        Morceau(duree: 900, fc: 172, vitesse: 3.2),
        Morceau(duree: 600, fc: 135, vitesse: 3),
    ]
    let pivot = pivotConstruit(morceaux)
    #expect(estimerRepetitions(try grilleDe(pivot), parametres).isEmpty)
    let seance = try calculerSeanceIntrinseque(pivot, parametres)
    #expect(seance.repetitionsEstimees == nil)
    #expect(try classerSeances([seance])[0].type != .seanceQualite)
}

@Test func d021UneSeanceSansFcNeDonneAucuneEstimation() throws {
    // D-021 : sans FC, il n'y a ni seuil ni bloc : []. La séance n'est pas marquée estimée.
    let pivot = pivotConstruit(fractionne(), fcTrouee: false)
    var sansFc = pivot
    sansFc.flux.fc_bpm = nil
    let g = try grilleDe(sansFc)
    #expect(estimerRepetitions(g, parametres).isEmpty)
    #expect(try calculerSeanceIntrinseque(sansFc, parametres).repetitionsEstimees == nil)
}

// MARK: - Tolérance : NaN de FC, pauses, constantes réglables

@Test func d021LesNaNDeFcNeChangentPasLeResultat() throws {
    // D-021 : une mesure de FC sur sept manque (NaN) : la FC prolongée et lissée reste exploitable, six blocs.
    let g = try grilleDe(pivotConstruit(fractionne(), fcTrouee: true))
    #expect(estimerRepetitions(g, parametres).count == 6)
}

@Test func d021UneCoupureDeMontreDansUneRecuperationNeCasseRien() throws {
    // D-021 : une pause de 60 s (temps écoulé sans échantillon) au milieu d'une récupération : six blocs toujours.
    var morceaux = fractionne()
    let indiceRecup = morceaux.firstIndex { $0.fc == 130 }!
    morceaux.insert(Morceau(duree: 60, fc: 0, vitesse: 0, pause: true), at: indiceRecup + 1)
    let g = try grilleDe(pivotConstruit(morceaux))
    #expect(estimerRepetitions(g, parametres).count == 6)
}

@Test func d021LesConstantesSontReglables() throws {
    // D-021 : la durée minimale d'un bloc se règle. À 400 s, les blocs de 180 s disparaissent ; à la valeur par défaut, six.
    let g = try grilleDe(pivotConstruit(fractionne()))
    #expect(estimerRepetitions(g, parametres).count == 6)
    var reglages = ReglagesEstimation.defaut
    reglages.dureeMinBloc_s = 400
    #expect(estimerRepetitions(g, parametres, reglages).isEmpty)
    #expect(ReglagesEstimation.defaut.dureeMinBloc_s == 120)
}

// MARK: - Sources, marquage des tours, verdict

@Test func d021UneSeanceExerciceAvecToursManuelsGardeLeCheminParLesTours() throws {
    // D-021 et décision 2 : une séance Exercice avec tours manuels garde l'analyse par les tours. Aucune répétition estimée.
    let morceaux: [Morceau] = [
        Morceau(duree: 300, fc: 120, vitesse: 3),
        Morceau(duree: 180, fc: 175, vitesse: 4.35),
        Morceau(duree: 60, fc: 120, vitesse: 2.8),
        Morceau(duree: 180, fc: 175, vitesse: 4.35),
        Morceau(duree: 60, fc: 120, vitesse: 2.8),
        Morceau(duree: 180, fc: 175, vitesse: 4.35),
        Morceau(duree: 240, fc: 120, vitesse: 3),
    ]
    let tours = [
        Tour(iDebut: 300, iFin: 479, declenchement: .manuel),
        Tour(iDebut: 540, iFin: 719, declenchement: .manuel),
        Tour(iDebut: 780, iFin: 959, declenchement: .manuel),
    ]
    let seance = try calculerSeanceIntrinseque(pivotConstruit(morceaux, tours: tours), parametres)
    #expect(seance.repetitions.count == 3)
    #expect(seance.format == "3×3′")
    #expect(seance.repetitionsEstimees == nil)
}

@Test func d021LesSeancesFitEtStravaNAppellentJamaisLEstimation() throws {
    // D-021 : une séance FIT ou Strava n'est jamais estimée, même quand le flux d'allure ne trouve rien et que la FC montre
    // des blocs (côtes lentes). Son chemin ne change pas. Le fractionné rapide, lui, reste détecté par l'allure (existant).
    var cotes = [Morceau(duree: 600, fc: 135, vitesse: 3)]
    for k in 0..<5 {
        cotes.append(Morceau(duree: 180, fc: 170, vitesse: 2.5, pente: 0.08))
        if k < 4 { cotes.append(Morceau(duree: 120, fc: 130, vitesse: 3.5)) }
    }
    cotes.append(Morceau(duree: 600, fc: 135, vitesse: 3))
    for source in [Source.fit, Source.stravaArchive] {
        let seance = try calculerSeanceIntrinseque(pivotConstruit(cotes, source: source, appSource: nil), parametres)
        #expect(seance.repetitionsEstimees == nil, "source \(source)")
        #expect(seance.repetitions.isEmpty, "source \(source) : le flux d'allure ne voit pas ces côtes")
        let rapide = try calculerSeanceIntrinseque(pivotConstruit(fractionne(), source: source, appSource: nil), parametres)
        #expect(rapide.repetitionsEstimees == nil, "source \(source) : fractionné rapide")
    }
}

@Test func d021LeVerdictNeDependPasDesRepetitionsEstimees() throws {
    // D-021 : les répétitions estimées n'entrent ni dans la réponse à l'effort (signal 3), ni dans les répétitions hors
    // sous-seuil (signal 4), ni dans le nuage (P3). Même Vue avec et sans elles : signaux identiques.
    let J: DateCivile = "2026-10-20"
    // Neuf séances sous-seuil (minimum du signal 3), dans les 21 derniers jours.
    let sousSeuil = try [1, 3, 5, 7, 9, 11, 13, 15, 17].enumerated().map { (k, jour) in
        sousSeuilSynthetique("ss\(k)", try dateDe(J, -jour), allure: 300 + Double(k))
    }
    let footings = try [2, 4, 6, 8].enumerated().map { (k, jour) in
        footingSynthetique("f\(k)", try dateDe(J, -jour))
    }
    let qualites = try classeesEnSeance([
        pivotAutreApp(fractionne(), date: "2026-10-10"),
        pivotAutreApp(fractionne(nombre: 5), date: "2026-10-08"),
    ])
    let sans = try calculerVue(EntreeVue(intrinseques: sousSeuil + footings, parametres: parametresDefaut(), J: J, derniereSynchro: nil))
    let avec = try calculerVue(EntreeVue(intrinseques: sousSeuil + footings + qualites, parametres: parametresDefaut(), J: J, derniereSynchro: nil))

    #expect(avec.seances.filter { $0.type == .seanceQualite }.count == 2)
    for cle in [CleSignal.reponse, .horsSousSeuil] {
        let attendu = sans.decision.signaux.first { $0.cle == cle }
        #expect(avec.decision.signaux.first { $0.cle == cle } == attendu, "signal \(cle)")
        #expect(attendu?.etat != .insuffisant, "signal \(cle) : la Vue de référence doit le calculer")
    }
    let nuageAvec = try nuage(avec, .annee)
    let nuageSans = try nuage(sans, .annee)
    #expect(nuageAvec.recente.nombre == nuageSans.recente.nombre)
    #expect(nuageAvec.recente.nombre > 0)
}

@Test func d021LaDerniereSeanceExposeLIndicationEstimees() throws {
    // D-021 : P4 prend la dernière séance sous-seuil ou qualité ; une séance qualité estimée le signale par `estimees`.
    let J: DateCivile = "2026-10-20"
    let qualite = try classeesEnSeance([pivotAutreApp(fractionne(), date: "2026-10-18")])
    let vue = try calculerVue(EntreeVue(intrinseques: qualite, parametres: parametresDefaut(), J: J, derniereSynchro: nil))
    let derniere = derniereSeanceSousSeuil(vue, { _ in parametres })
    #expect(derniere?.estimees == true)
    #expect(derniere?.date == "2026-10-18")
}

// MARK: - Classement : hors signal des footings

@Test func d021UneSeanceQualiteNEntreDansLeSignalDesFootings() throws {
    // D-021 : une séance qualité estimée n'est pas un footing : le signal des footings est le même avec et sans elle,
    // même si sa FC moyenne dépasse le plafond.
    let J: DateCivile = "2026-10-20"
    let footings = try [2, 4, 6, 8].enumerated().map { (k, jour) in
        footingSynthetique("f\(k)", try dateDe(J, -jour), fcMoy: 130)
    }
    let qualite = try classeesEnSeance([pivotAutreApp(fractionne(), date: "2026-10-18")])
    #expect(qualite[0].repetitionsEstimees == true)
    let sans = try calculerVue(EntreeVue(intrinseques: footings, parametres: parametresDefaut(), J: J, derniereSynchro: nil))
    let avec = try calculerVue(EntreeVue(intrinseques: footings + qualite, parametres: parametresDefaut(), J: J, derniereSynchro: nil))
    #expect(avec.decision.signaux.first { $0.cle == .footings } == sans.decision.signaux.first { $0.cle == .footings })
    #expect(sans.decision.signaux.first { $0.cle == .footings }?.valeur == 100)
    #expect(avec.semaines.map(\.nbFootings) == sans.semaines.map(\.nbFootings))
}

// MARK: - Vue complète sur un pivot HealthKit « WorkOutDoors » construit

@Test func d021UneVueCompleteSurUnPivotWorkOutDoorsConstruit() throws {
    // D-021 : une séance d'une autre app (WorkOutDoors, sans tour) avec des étapes à FC haute : séance qualité estimée,
    // présente dans la Vue, sans altérer le verdict d'une Vue vide de répétitions.
    let J: DateCivile = "2026-10-20"
    let pivot = pivotConstruit(
        fractionne(), appSource: "net.workoutdoors.workoutdoors", date: "2026-10-18"
    )
    let seances = try classeesEnSeance([pivot])
    let vue = try calculerVue(EntreeVue(intrinseques: seances, parametres: parametresDefaut(), J: J, derniereSynchro: nil))
    #expect(vue.seances.count == 1)
    #expect(vue.seances[0].type == .seanceQualite)
    #expect(vue.seances[0].repetitionsEstimees == true)
    #expect(vue.seances[0].repetitions.count == 6)
    #expect(vue.seances[0].format == nil)
    #expect(vue.seances[0].duree_min > 0)
    #expect(vue.seances[0].charge > 0)
}

// MARK: - Ce qui reste compatible : décodage ancien, champ nul

@Test func d021UnJsonAncienSansChampDecodeEnNil() throws {
    // D-021 : les séances mémorisées avant ce champ n'ont pas la clé `repetitionsEstimees` : elles se relisent, en nil.
    let seance = sousSeuilSynthetique("ancienne", "2026-10-01", allure: 300)
    let donnees = try JSONEncoder().encode(seance)
    var objet = try JSONSerialization.jsonObject(with: donnees) as! [String: Any]
    #expect(objet["repetitionsEstimees"] is NSNull)
    objet.removeValue(forKey: "repetitionsEstimees")
    let ancien = try JSONSerialization.data(withJSONObject: objet)
    let relue = try JSONDecoder().decode(SeanceIntrinseque.self, from: ancien)
    #expect(relue.repetitionsEstimees == nil)
    #expect(relue == seance)
}

@Test func d021LeChampEstEcritNullQuandIlNEstPasEstime() throws {
    // D-021 : nil s'écrit null (convention de sérialisation), true s'écrit true et se relit.
    let estimee = try classeesEnSeance([pivotAutreApp(fractionne())])[0]
    let json = try JSONValue(encodant: estimee)
    #expect(json.champs?["repetitionsEstimees"] == .bool(true))
    let sansEstimation = sousSeuilSynthetique("pas-estimee", "2026-10-01", allure: 300)
    let jsonSans = try JSONValue(encodant: sansEstimation)
    #expect(jsonSans.champs?["repetitionsEstimees"] == JSONValue.null)
}

// MARK: - Outils de construction des séances de Vue

private extension JSONValue {
    /// Champs d'un objet JSON, nil pour un autre type de valeur.
    var champs: [String: JSONValue]? {
        if case let .object(valeurs) = self { return valeurs }
        return nil
    }
}

/// Date civile décalée de `jours` par rapport à `date`.
private func dateDe(_ date: DateCivile, _ jours: Int) throws -> DateCivile {
    try dateDepuisNumero(try numeroJour(date) + jours)
}

/// Séance sous-seuil synthétique : quatre répétitions de six minutes à allure `allure` (s/km) et FC de fin de 165 bpm.
private func sousSeuilSynthetique(_ cle: String, _ date: DateCivile, allure: Double) -> SeanceIntrinseque {
    let repetitions = (0..<4).map { k in
        Repetition(n: Double(k + 1), debut_s: Double(k * 480), duree_s: 360, allure_skm: allure, fcFin: 165)
    }
    return SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 1_000_000, nom: nil, marquage: .aucun, duree_min: 60, km: 10,
        fcMoy: 150, allureMoy_skm: allure, minutes: Minutes(easy: 0, mp: 0, subt: 60, hard: 0),
        charge: 60 * POIDS_CHARGE.subt, mp_min: 0, segmentsMp: [], repetitions: repetitions, format: "4×6′",
        recup_s: 120, ef: nil, fcPic: nil, decouplage: nil, lignesDroites: false, distanceRef_km: nil, temps_s: nil
    )
}

/// Footing synthétique : une heure, FC moyenne `fcMoy` (bpm), sans répétition.
private func footingSynthetique(_ cle: String, _ date: DateCivile, fcMoy: Double = 130) -> SeanceIntrinseque {
    SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 1_000_000, nom: nil, marquage: .aucun, duree_min: 60, km: 10,
        fcMoy: fcMoy, allureMoy_skm: 360, minutes: Minutes(easy: 60, mp: 0, subt: 0, hard: 0),
        charge: 60 * POIDS_CHARGE.easy, mp_min: 0, segmentsMp: [], repetitions: [], format: nil, recup_s: nil,
        ef: nil, fcPic: nil, decouplage: nil, lignesDroites: false, distanceRef_km: nil, temps_s: nil
    )
}

/// Séances intrinsèques de pivots, telles que la Vue les reçoit.
private func classeesEnSeance(_ pivots: [ActivitePivot]) throws -> [SeanceIntrinseque] {
    try pivots.map { try calculerSeanceIntrinseque($0, parametres) }
}
