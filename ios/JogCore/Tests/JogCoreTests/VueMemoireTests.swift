import Testing
@testable import JogCore

// Tests de règles de la mémorisation de ②a (ADR 0006) et de l'empreinte des entrées de la Vue (ADR 0009). Les clés
// sont propres à Swift (hors oracle) : seul leur comportement est testé, jamais leurs octets.

private let J: DateCivile = "2026-09-10"

/// Une activité synthétique, datée de `date`. Deux activités de même `empreinte` partagent la clé de mémorisation.
private func activite(_ cle: String, _ date: DateCivile, empreinte: String? = nil) -> PivotSansFlux {
    PivotSansFlux(
        cleSource: cle, source: .fit, versionAdaptateur: "1.0.0", empreinteBrute: empreinte ?? "empreinte-\(cle)",
        debutUtc: 1_000_000, decalageLocal_min: 0, dateLocale: date, duree_s: 600, distance_m: 3000, nom: nil,
        competition: false, sousType: .route, pasFC_s: nil, tours: []
    )
}

/// Un flux synthétique d'une minute, à 3 m/s, sans FC.
private func fluxSynthetique() -> Flux {
    let t = (0..<600).map { Float($0) }
    return Flux(t_s: t, dist_m: t.map { $0 * 3 }, fc_bpm: nil, alt_m: nil, vitesse_ms: nil)
}

/// Une modification de paramètre datée, enregistrée avant toutes les activités du test.
private func modification(_ cle: String, _ valeur: Double, effet: DateCivile) -> ModifDatee {
    ModifDatee(id: "m-\(cle)", cle: cle, valeur: valeur, dateEffet: effet, enregistreLe: "2026-08-01T10:00:00Z")
}

@Test func adr0006LaMemoireEvitDeRelireLeFlux() async throws {
    // ADR 0006 : une clé présente dans la mémoire dispense de lire le flux. Au second calcul, aucune lecture.
    let activites = [activite("a", "2026-09-01"), activite("b", "2026-09-02")]
    var memoire = MemoireSeances()
    var lectures = 0
    let premier = try await seancesIntrinseques(
        activites: activites, lireFlux: { _ in lectures += 1; return fluxSynthetique() },
        parametres: parametresDefaut(), J: J, memoire: &memoire
    )
    #expect(lectures == 2)

    let second = try await seancesIntrinseques(
        activites: activites, lireFlux: { _ in lectures += 1; return fluxSynthetique() },
        parametres: parametresDefaut(), J: J, memoire: &memoire
    )
    #expect(lectures == 2, "aucun flux relu au second calcul")
    #expect(second == premier, "une séance reprise de la mémoire est celle qu'on a calculée")
}

@Test func adr0006UneActiviteDeMemeEmpreinteGardeSonIdentite() async throws {
    // ADR 0006 : la clé ne couvre ni cleSource ni la date. Deux activités de même empreinte partagent la séance calculée,
    // mais chacune garde sa clé source et sa date.
    var memoire = MemoireSeances()
    var lectures = 0
    _ = try await seancesIntrinseques(
        activites: [activite("a", "2026-09-01", empreinte: "meme")], lireFlux: { _ in lectures += 1; return fluxSynthetique() },
        parametres: parametresDefaut(), J: J, memoire: &memoire
    )
    let reprise = try await seancesIntrinseques(
        activites: [activite("b", "2026-09-03", empreinte: "meme")], lireFlux: { _ in lectures += 1; return fluxSynthetique() },
        parametres: parametresDefaut(), J: J, memoire: &memoire
    )
    #expect(lectures == 1)
    #expect(reprise.map(\.cleSource) == ["b"])
    #expect(reprise.map(\.date) == ["2026-09-03"])
}

@Test func adr0006UnParametreLuParLa2aRelitLeFlux() async throws {
    // ADR 0006 : lt2Pace entre dans la clé. Un lt2Pace modifié avant la séance relance la lecture du flux.
    // subtHrHi n'est lu qu'à ④ : le modifier ne relit rien.
    let activites = [activite("a", "2026-09-01")]
    var memoire = MemoireSeances()
    var lectures = 0
    _ = try await seancesIntrinseques(
        activites: activites, lireFlux: { _ in lectures += 1; return fluxSynthetique() },
        parametres: parametresDefaut(), J: J, memoire: &memoire
    )

    let parametresSubt = Parametres(
        globaux: parametresDefaut().globaux, modifs: [modification("subtHrHi", 175, effet: "2026-08-01")]
    )
    _ = try await seancesIntrinseques(
        activites: activites, lireFlux: { _ in lectures += 1; return fluxSynthetique() },
        parametres: parametresSubt, J: J, memoire: &memoire
    )
    #expect(lectures == 1, "subtHrHi n'entre pas dans la clé")

    let parametresLt2 = Parametres(
        globaux: parametresDefaut().globaux, modifs: [modification("lt2Pace", 240, effet: "2026-08-01")]
    )
    _ = try await seancesIntrinseques(
        activites: activites, lireFlux: { _ in lectures += 1; return fluxSynthetique() },
        parametres: parametresLt2, J: J, memoire: &memoire
    )
    #expect(lectures == 2, "lt2Pace entre dans la clé")
}

@Test func regle03UneActiviteDeJOuFutureNEstPasLue() async throws {
    // 03 : seules les activités datées avant J sont calculées : leur flux n'est jamais demandé.
    var memoireVide = MemoireSeances()
    var lectures = 0
    let resultat = try await seancesIntrinseques(
        activites: [activite("aujourdhui", J), activite("demain", "2026-09-11")],
        lireFlux: { _ in lectures += 1; return fluxSynthetique() },
        parametres: parametresDefaut(), J: J, memoire: &memoireVide
    )
    #expect(resultat.isEmpty)
    #expect(lectures == 0)
}

@Test func unFluxAbsentFaitEchouerLeCalcul() async throws {
    // Une activité sans flux fait échouer le calcul de ②a (vue.ts : « flux absent pour … »).
    await #expect(throws: FluxAbsent(cleSource: "a")) {
        var memoireVide = MemoireSeances()
        _ = try await seancesIntrinseques(
            activites: [activite("a", "2026-09-01")], lireFlux: { _ in nil },
            parametres: parametresDefaut(), J: J, memoire: &memoireVide
        )
    }
}

@Test func adr0009EmpreinteDesEntreesNeDependQueDeLeurContenu() throws {
    // ADR 0009 : l'empreinte des entrées ne dépend ni de l'ordre des activités, ni de la copie des entrées, mais
    // change avec la dernière synchronisation.
    let a = EmpreinteActivite(cleSource: "a", empreinteBrute: "e1", versionAdaptateur: "1.0.0")
    let b = EmpreinteActivite(cleSource: "b", empreinteBrute: "e2", versionAdaptateur: "1.0.0")
    let parametres = parametresDefaut()
    let empreinte = try empreinteEntrees(activites: [a, b], parametres: parametres, derniereSynchro: "2026-09-10T08:00:00Z")
    #expect(try empreinteEntrees(activites: [b, a], parametres: parametres, derniereSynchro: "2026-09-10T08:00:00Z") == empreinte)
    #expect(try empreinteEntrees(activites: [a, b], parametres: parametres, derniereSynchro: "2026-09-11T08:00:00Z") != empreinte)
}

@Test func adr0009EmpreinteChangeAvecUnParametreGlobal() throws {
    // ADR 0009 : les globaux entrent en entier : un paramètre global modifié change l'empreinte.
    let parametres = parametresDefaut()
    var autres = parametres
    autres.globaux.ctlDays = parametres.globaux.ctlDays + 1
    let avant = try empreinteEntrees(activites: [], parametres: parametres, derniereSynchro: nil)
    #expect(try empreinteEntrees(activites: [], parametres: autres, derniereSynchro: nil) != avant)
}
