import Foundation
import Testing
@testable import JogCore

// Test local sur les vrais exports du spike (local-data/, ignoré par git). Il saute s'il n'y a pas ce dossier. Il ne lit
// que la structure : seules des assertions de cohérence, jamais de valeur ni de coordonnée, rien n'est copié ni écrit.

/// Racine du dépôt, déduite de l'emplacement de ce fichier (ios/JogCore/Tests/JogCoreTests/).
private func dossierLocalData() -> URL {
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { url.deleteLastPathComponent() }
    return url.appendingPathComponent("local-data")
}

private let dossierLocalExiste = FileManager.default.fileExists(atPath: dossierLocalData().path)

private func chargerExport(_ nom: String) throws -> SeanceBrute {
    let donnees = try Data(contentsOf: dossierLocalData().appendingPathComponent(nom))
    return try decodeurSeanceBrute().decode(SeanceBrute.self, from: donnees)
}

private let parametresLocaux = ParamsDates(
    hrMax: 188, hrRest: 46, z1: 68, z2: 78, z3: 85, z4: 92,
    lt2Hr: 172, lt2Pace: 238, easyCap: 140, subtHrLo: 160, subtHrHi: 168
)

@Test(.enabled(if: dossierLocalExiste))
func entrainementPersonnaliseDuSpikeFournitSesEtapesDeTravailMaisPasDeSerie() throws {
    // Constat (07 règle 2 : répétitions séparées de récupérations de 2 min au plus) : les quatre étapes de travail sont
    // des tours actifs, et chacune dure au moins 2 min et finit à FC ≥ subtHrLo − 5. Mais leurs récupérations durent
    // environ 6 min 48 (seule la dernière fait 89 s) : le moteur ne forme donc aucune série. Décision produit à prendre.
    let brute = try chargerExport("spike-2026-07-03-1.json")
    let pivot = try #require(try adapterSeance(brute, decalageAppareil_min: 120))
    let seance = try calculerSeanceIntrinseque(pivot, parametresLocaux)
    let attendu = (brute.workoutActivities ?? [])
        .compactMap { $0.metadata?["WOIntervalStepKeyPath"] }
        .filter { $0.hasPrefix("1.") && $0.hasSuffix(".0") }
        .count
    let travail = pivot.tours.filter { $0.intensite == .actif }
    #expect(travail.count == attendu)
    #expect(travail.allSatisfy { $0.iFin - $0.iDebut >= 119 })
    let ecarts = zip(travail, travail.dropFirst()).map { Double($1.iDebut - $0.iFin) }
    #expect(ecarts.allSatisfy { $0 > RECUPERATION_MAX_S })
    #expect(seance.repetitions.isEmpty)
}

@Test(.enabled(if: dossierLocalExiste))
func footingsLibresDuSpikeNAontAucuneRepetition() throws {
    for nom in ["spike-2026-10-20-1.json", "spike-2026-10-22-1.json"] {
        let brute = try chargerExport(nom)
        let pivot = try #require(try adapterSeance(brute, decalageAppareil_min: 120))
        let seance = try calculerSeanceIntrinseque(pivot, parametresLocaux)
        #expect(seance.repetitions.isEmpty, "répétitions trouvées dans \(nom)")
        #expect(pivot.tours.allSatisfy { $0.declenchement != .manuel && $0.declenchement != .inconnu })
    }
}

@Test(.enabled(if: dossierLocalExiste))
func distanceDuSpikeEstCoherenteAvecLeTotalHealthKit() throws {
    for nom in ["spike-2026-07-03-1.json", "spike-2026-10-20-1.json", "spike-2026-10-22-1.json"] {
        let brute = try chargerExport(nom)
        let totalHK = try #require(brute.totaux?.distanceMetres)
        let pivot = try #require(try adapterSeance(brute, decalageAppareil_min: 120))
        #expect(abs(pivot.distance_m - totalHK) / totalHK < 0.03, "écart de distance trop grand dans \(nom)")
    }
}

@Test(.enabled(if: dossierLocalExiste))
func lesSeancesWorkOutDoorsSontIgnoreesDuSpike() throws {
    for nom in ["spike-2026-10-17-1.json", "spike-2026-10-18-1.json", "spike-2026-10-18-2.json"] {
        let brute = try chargerExport(nom)
        #expect(try adapterSeance(brute, decalageAppareil_min: 120) == nil, "\(nom) n'est pas écartée")
    }
}
