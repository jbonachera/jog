import Foundation
import Testing
@testable import JogCore

// D-025 · D+ des séances (04 « Carte de séance »). Tous les flux sont construits ici, à 1 Hz : aucune donnée réelle.

/// Paramètres de test (même jeu que l'estimation des répétitions).
private let parametres = ParamsDates(
    hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92,
    lt2Hr: 172, lt2Pace: 240, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)

/// Grille à 1 Hz qui ne porte que l'altitude : seul `alt_m` et `t_s` servent au D+. `nil` : sans altitude.
private func grille(_ altitudes: [Double]?) -> GrilleSeance {
    let n = altitudes?.count ?? 600
    let nan = [Double](repeating: .nan, count: n)
    return GrilleSeance(
        n: n, t_s: (0..<n).map(Double.init), dt_s: [Double](repeating: 1, count: n), distance_m: nan,
        vitesse_ms: nan, fc_bpm: nan, fcMesuree_bpm: nan, fcLissee_bpm: nan, alt_m: altitudes
    )
}

/// Altitude d'une montée régulière de `hauteur` mètres en `duree` secondes, échantillons 0 … duree inclus.
private func montee(_ hauteur: Double, duree: Int) -> [Double] {
    (0...duree).map { hauteur * Double($0) / Double(duree) }
}

/// Bruit à 1 Hz : l.altitude alterne entre +amplitude et −amplitude à chaque seconde. Un bruit aléatoire ne se laisse pas
/// annuler par une moyenne de 30 s (environ 13 m sur 10 min, mesuré) : le test porte donc sur ce motif déterministe.
private func bruitAlterne(_ n: Int, amplitude: Double) -> [Double] {
    (0..<n).map { $0 % 2 == 0 ? amplitude : -amplitude }
}

// MARK: - Mesure

@Test func d025UneMonteeReguliereDe100mDonneCent() throws {
    // 04, Carte de séance › D+ : 100 m en 10 min, sans bruit, donnent 100 m.
    #expect(denivelePositif(grille(montee(100, duree: 600))) == 100)
}

@Test func d025LeBruitSurLePlatNeFaitPasDePlus() throws {
    // 04, Carte de séance › D+ : ±2 m à 1 Hz sur du plat, après lissage sur 30 s, restent sous 5 m.
    let dPlus = try #require(denivelePositif(grille(bruitAlterne(600, amplitude: 2))))
    #expect(dPlus < 5, "D+ du bruit : \(dPlus) m")
}

@Test func d025UnAllerRetourDunCoteDe50mDonneCinquanteALUnMetre() throws {
    // 04, Carte de séance › D+ : la montée compte, la descente ne retranche rien. Le sommet est lissé : à 1 m près.
    let aller = montee(50, duree: 300)
    let retour = (1...300).map { 50 - 50 * Double($0) / 300 }
    let dPlus = try #require(denivelePositif(grille(aller + retour)))
    #expect(abs(dPlus - 50) <= 1, "D+ de l'aller-retour : \(dPlus) m")
}

@Test func d025SansAltitudeOuToutNaNLeDPlusEstNul() throws {
    // 04, Carte de séance › D+ : sans altitude exploitable, pas de D+ (nil), et jamais un 0 mesuré.
    #expect(denivelePositif(grille(nil)) == nil)
    #expect(denivelePositif(grille([Double](repeating: .nan, count: 600))) == nil)
}

@Test func d025UnTrouDAltitudeEstSauteNonComptéCommeZero() throws {
    // 04, Carte de séance › D+ : un point manquant est sauté. Compté à zéro, le trou ferait remonter le D+ deux fois.
    var alt = montee(100, duree: 600)
    for i in 200...260 { alt[i] = .nan }
    #expect(denivelePositif(grille(alt)) == 100)
}

@Test func d025LeDPlusSArrondiAuMetreMiCheminLoinDeZero() throws {
    // D-015 : 50,5 m arrondit à 51 ; 50,4 m à 50.
    #expect(denivelePositif(grille(montee(50.5, duree: 505))) == 51)
    #expect(denivelePositif(grille(montee(50.4, duree: 504))) == 50)
}

// MARK: - Clés et sorties

@Test func d025LaCleDeSeanceChangeAvecLaVersionDuDenivele() throws {
    // D-025 : VERSION_DENIVELE entre dans la clé de mémorisation de ②a : une autre version, une autre clé.
    let empreinte = EmpreinteActivite(cleSource: "a", empreinteBrute: "empreinte-a", versionAdaptateur: "healthkit-1.1.0", appSource: "com.apple.health.TEST")
    #expect(cleDeSeance(empreinte, parametres) == cleDeSeance(empreinte, parametres, versionDenivele: VERSION_DENIVELE))
    #expect(cleDeSeance(empreinte, parametres, versionDenivele: 1) != cleDeSeance(empreinte, parametres, versionDenivele: 2))
}

@Test func d025LEmpreinteDeLaVueChangeAvecLaVersionDuDenivele() throws {
    // D-025 : le démarrage rapide ne sert pas une Vue calculée sans D+ : l'empreinte des entrées suit VERSION_DENIVELE.
    let activites = [EmpreinteActivite(cleSource: "a", empreinteBrute: "e", versionAdaptateur: "1.0.0")]
    let reglages = parametresDefaut()
    let courante = try empreinteEntrees(activites: activites, parametres: reglages, derniereSynchro: nil)
    #expect(try empreinteEntrees(activites: activites, parametres: reglages, derniereSynchro: nil, versionDenivele: VERSION_DENIVELE + 1) != courante)
}

@Test func d025UneSeanceAvecAltitudePorteLeDPlusEtSaCleLeSerialise() throws {
    // D-025 : ②a calcule le D+ depuis le flux d'altitude du pivot, et la séance le porte jusqu'à la Vue.
    let pivot = pivotAvecAltitude(montee(100, duree: 600))
    let intrinseque = try calculerSeanceIntrinseque(pivot, parametres)
    #expect(intrinseque.dPlus_m == 100)
}

@Test func d025UneSeanceSansAltitudeNeSerialisePasLaCle() throws {
    // D-025 : sans altitude, `dPlus_m` est absent du JSON de la Vue (clé omise, pas null).
    let sansAltitude = try calculerSeanceIntrinseque(pivotAvecAltitude(nil), parametres)
    guard case let .object(champs) = try JSONValue(encodant: SeanceVue(seance: Seance(intrinseque: sansAltitude, type: .footing))) else {
        Issue.record("SeanceVue n est pas un objet JSON")
        return
    }
    #expect(champs["dPlus_m"] == nil)
}

// MARK: - Pivot

/// Pivot d'une séance de 10 min à 1 Hz, avec ou sans flux d'altitude (`altitudes`), construit par code.
private func pivotAvecAltitude(_ altitudes: [Double]?) -> ActivitePivot {
    let n = altitudes?.count ?? 601
    let temps = (0..<n).map { Float($0) }
    let distance = (0..<n).map { Float(Double($0) * 3) }
    let flux = Flux(
        t_s: temps, dist_m: distance, fc_bpm: nil,
        alt_m: altitudes?.map { Float($0) }, vitesse_ms: nil
    )
    return ActivitePivot(
        cleSource: "test:denivele", source: .healthkit, versionAdaptateur: "1.0.0", empreinteBrute: "test",
        debutUtc: 1_700_000_000_000, decalageLocal_min: 0, dateLocale: "2026-10-10",
        duree_s: Double(n - 1), distance_m: Double((n - 1) * 3), nom: "Sortie fictive",
        competition: false, sousType: .route, pasFC_s: nil, flux: flux, tours: [], appSource: "com.apple.health.TEST"
    )
}

// MARK: - Rétrocompatibilité du cache (lot 5, VERSION_DENIVELE)

/// Retire la clé `dPlus_m` du JSON encodé, comme le ferait un cache écrit avant le D+ (D-025).
private func sansCleDPlus(_ donnees: Data) throws -> Data {
    let racine = try JSONSerialization.jsonObject(with: donnees)
    guard var champs = racine as? [String: Any] else {
        throw ErreurHarnais("JSON attendu : un objet")
    }
    champs.removeValue(forKey: "dPlus_m")
    return try JSONSerialization.data(withJSONObject: champs)
}

@Test func d025UnCacheSansDPlusSeDecodeSansErreur() throws {
    // lot 5, VERSION_DENIVELE : une SeanceIntrinseque, une Seance et une SeanceVue écrites avec D+ puis relues sans `dPlus_m`
    // se décodent sans erreur, avec dPlus_m == nil.
    let intrinseque = try calculerSeanceIntrinseque(pivotAvecAltitude(montee(100, duree: 600)), parametres)
    try #require(intrinseque.dPlus_m == 100)
    let seance = Seance(intrinseque: intrinseque, type: .footing)
    let vue = SeanceVue(seance: seance)
    try #require(seance.dPlus_m == 100 && vue.dPlus_m == 100)

    let encodeur = JSONEncoder()
    let intrinsequeAncienne = try sansCleDPlus(encodeur.encode(intrinseque))
    let seanceAncienne = try sansCleDPlus(encodeur.encode(seance))
    let vueAncienne = try sansCleDPlus(encodeur.encode(vue))
    #expect(!String(decoding: intrinsequeAncienne, as: UTF8.self).contains("dPlus_m"))
    #expect(!String(decoding: seanceAncienne, as: UTF8.self).contains("dPlus_m"))
    #expect(!String(decoding: vueAncienne, as: UTF8.self).contains("dPlus_m"))

    let decodeur = JSONDecoder()
    let relueIntrinseque = try decodeur.decode(SeanceIntrinseque.self, from: intrinsequeAncienne)
    let relueSeance = try decodeur.decode(Seance.self, from: seanceAncienne)
    let relueVue = try decodeur.decode(SeanceVue.self, from: vueAncienne)
    #expect(relueIntrinseque.dPlus_m == nil)
    #expect(relueSeance.dPlus_m == nil)
    #expect(relueVue.dPlus_m == nil)
}
