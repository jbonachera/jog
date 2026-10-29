import Foundation
import Testing
@testable import JogCore

// Sessions de sommeil (D-023, docs/design/decisions.md ; docs/implementation/recuperation.md, lot 1). Tests à la
// frontière publique `sessionsDeSommeil`, fixtures construites par code, fuseau Europe/Paris. Aucune donnée réelle.

private let paris = TimeZone(identifier: "Europe/Paris")!
private let montre = "com.apple.health.montre"
private let tierce = "com.exemple.sommeil"

/// Un instant local de Paris, à partir de « AAAA-MM-JJ » et « HH:mm ». Le calendrier est celui de Foundation, sans rapport
/// avec le code testé.
private func local(_ jour: String, _ heure: String) -> Date {
    var calendrier = Calendar(identifier: .gregorian)
    calendrier.timeZone = paris
    let j = jour.split(separator: "-").map { Int($0)! }
    let h = heure.split(separator: ":").map { Int($0)! }
    let composantes = DateComponents(year: j[0], month: j[1], day: j[2], hour: h[0], minute: h[1])
    return calendrier.date(from: composantes)!
}

private func echantillon(_ debut: Date, _ fin: Date, _ valeur: Int, source: String = montre) -> EchantillonSommeilBrut {
    EchantillonSommeilBrut(debut: debut, fin: fin, valeur: valeur, source: source, appareil: nil)
}

/// La nuit du 28 au 29 octobre 2026, mesurée par la montre : léger 23:00–01:00, profond 01:00–02:00, paradoxal
/// 02:00–03:00, éveillé 03:00–03:10, léger 03:10–07:00.
private func nuitMontre() -> [EchantillonSommeilBrut] {
    [
        echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "01:00"), 3),
        echantillon(local("2026-10-29", "01:00"), local("2026-10-29", "02:00"), 4),
        echantillon(local("2026-10-29", "02:00"), local("2026-10-29", "03:00"), 5),
        echantillon(local("2026-10-29", "03:00"), local("2026-10-29", "03:10"), 2),
        echantillon(local("2026-10-29", "03:10"), local("2026-10-29", "07:00"), 3),
    ]
}

@Suite struct RecuperationSessions {
    @Test func d023LaNuitCompleteDonneUneSessionDatee() throws {
        // D-023 : une session est datée du jour civil de son réveil ; le sommeil compte les phases endormies, l'éveil à part.
        let sessions = sessionsDeSommeil(nuitMontre(), fuseau: paris)
        #expect(sessions.count == 1)
        let session = try #require(sessions.first)
        #expect(session.date == "2026-10-29")
        #expect(session.sommeil_min == 470)
        #expect(session.leger_min == 350)
        #expect(session.profond_min == 60)
        #expect(session.paradoxal_min == 60)
        #expect(session.eveille_min == 10)
        #expect(session.coucher_min == 300)
        // Le retour à l'heure d'hiver a eu lieu le 25 oct. 2026 : à 23:00 le 28, Paris est en CET (+1 h), soit 60 min.
        #expect(session.decalageDebut_min == 60)
        #expect(session.segments.map(\.phase) == [.leger, .profond, .paradoxal, .eveille, .leger])
        #expect(zip(session.segments, session.segments.dropFirst()).allSatisfy { $0.finUtc_ms <= $1.debutUtc_ms })
    }

    @Test func d023LesEchantillonsAuLitNeDeplacentPasLaSession() throws {
        // D-023 : « Les échantillons « au lit » sont ignorés » : un « au lit » de 22:30 à 07:30 ne change rien.
        var avecAuLit = nuitMontre()
        avecAuLit.append(echantillon(local("2026-10-28", "22:30"), local("2026-10-29", "07:30"), 0))
        #expect(sessionsDeSommeil(avecAuLit, fuseau: paris) == sessionsDeSommeil(nuitMontre(), fuseau: paris))
        let session = try #require(sessionsDeSommeil(avecAuLit, fuseau: paris).first)
        #expect(session.sommeil_min == 470)
    }

    @Test func d023LeCoucherSeMesureDepuis18hLaVeilleDuReveil() throws {
        // D-023 et 04 « Récupération » : l'heure de coucher se compte depuis 18:00 locale la veille du réveil.
        let nuit = [echantillon(local("2026-10-29", "00:30"), local("2026-10-29", "07:00"), 3)]
        let session = try #require(sessionsDeSommeil(nuit, fuseau: paris).first)
        #expect(session.coucher_min == 390)
    }

    @Test func d023UneSiesteLaJourneeNeRemplacePasLaNuit() throws {
        // D-023 : « pour chaque date, on garde la session la plus longue » : la sieste du 29 ne prend pas la place de la nuit.
        var avecSieste = nuitMontre()
        avecSieste.append(echantillon(local("2026-10-29", "14:00"), local("2026-10-29", "14:40"), 3))
        let sessions = sessionsDeSommeil(avecSieste, fuseau: paris)
        #expect(sessions.count == 1)
        let session = try #require(sessions.first)
        #expect(session.date == "2026-10-29")
        #expect(session.sommeil_min == 470)
    }

    @Test func d023UneSiesteSeuleDeMoinsDeTroisHeuresNeFaitPasDeSession() {
        // D-023 : une nuit compte au moins 3 h endormi ; une sieste de 90 min seule, un jour sans nuit, n'en fait pas.
        let sieste = [echantillon(local("2026-10-20", "13:00"), local("2026-10-20", "14:30"), 3)]
        #expect(sessionsDeSommeil(sieste, fuseau: paris) == [])
    }

    @Test func d023LeSeuilDe180MinutesEndormiDecideDUneSession() throws {
        // D-023 : une nuit compte au moins 180 min endormi. 179 min n'en font pas une session ; 180 min exactement en font une.
        let presque = [echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "01:59"), 3)]
        #expect(sessionsDeSommeil(presque, fuseau: paris) == [])

        let juste = [echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "02:00"), 3)]
        let session = try #require(sessionsDeSommeil(juste, fuseau: paris).first)
        #expect(session.sommeil_min == 180)
    }

    @Test func d023UnTrouDeSoixanteUneMinutesOuvreDeuxSessionsLaPlusLongueGardee() throws {
        // D-023 : sessions séparées au-delà de 60 min. Trou de 61 min : deux sessions, la plus longue (299 min) gardée.
        let apresTrouDe61 = [
            echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "01:00"), 3),
            echantillon(local("2026-10-29", "02:01"), local("2026-10-29", "07:00"), 3),
        ]
        let gardee = sessionsDeSommeil(apresTrouDe61, fuseau: paris)
        #expect(gardee.count == 1)
        #expect(try #require(gardee.first).sommeil_min == 299)

        // Trou de 60 min : une seule session, sans scinder la nuit.
        let apresTrouDe60 = [
            echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "01:00"), 3),
            echantillon(local("2026-10-29", "02:00"), local("2026-10-29", "07:00"), 3),
        ]
        let unique = sessionsDeSommeil(apresTrouDe60, fuseau: paris)
        #expect(unique.count == 1)
        #expect(try #require(unique.first).sommeil_min == 420)
    }

    @Test func d023UnRecouvrementDansLaMemeSourceEstRogneLePremierCommenceLEmporte() throws {
        // D-023 : « un recouvrement au sein de la source est rogné : le premier commencé l'emporte ». Léger 23:00–03:00,
        // profond 01:00–07:00 : le profond est rogné à 03:00. Le sommeil vaut 23:00–07:00, soit 480 min, sans doublon.
        let chevauchement = [
            echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "03:00"), 3),
            echantillon(local("2026-10-29", "01:00"), local("2026-10-29", "07:00"), 4),
        ]
        let session = try #require(sessionsDeSommeil(chevauchement, fuseau: paris).first)
        #expect(session.sommeil_min == 480)
        #expect(session.leger_min == 240)
        #expect(session.profond_min == 240)
        #expect(session.segments.count == 2)
    }

    @Test func d023LaSourceAvecPhasesPrimeSurLesAutresSansDoublerLeSommeil() throws {
        // D-023 : quand plusieurs sources se recouvrent, on garde celle qui donne des phases (l'Apple Watch).
        var deuxSources = nuitMontre()
        deuxSources.append(echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "07:00"), 1, source: tierce))
        let sessions = sessionsDeSommeil(deuxSources, fuseau: paris)
        #expect(sessions.count == 1)
        #expect(try #require(sessions.first).sommeil_min == 470)
    }

    @Test func d023LaWatchAvecPhasesPrimeSurUneSourceTiercePlusLongueSansPhases() throws {
        // D-023 : une source qui donne des phases l'emporte sur une source tierce de plus grande durée (600 min) qui n'en
        // donne pas, valeur 1 seule. On garde la Watch : 470 min endormi, et non 600.
        var avecTierce = nuitMontre()
        avecTierce.append(echantillon(local("2026-10-28", "22:00"), local("2026-10-29", "08:00"), 1, source: tierce))
        let session = try #require(sessionsDeSommeil(avecTierce, fuseau: paris).first)
        #expect(session.sommeil_min == 470)
        #expect(session.leger_min == 350)
    }

    @Test func d023SansPhasesLaSourceALaPlusGrandeDureeEndormieEstRetenue() throws {
        // D-023 : sans aucune valeur 3, 4 ou 5, on garde la source à la plus grande durée endormie : la tierce (480 min),
        // et non la montre (300 min).
        let sansPhases = [
            echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "04:00"), 1, source: montre),
            echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "07:00"), 1, source: tierce),
        ]
        let session = try #require(sessionsDeSommeil(sansPhases, fuseau: paris).first)
        #expect(session.sommeil_min == 480)
    }

    @Test func d023EgaliteDeDureeLaPlusPetiteChaineSourceEstRetenue() throws {
        // D-023 : à égalité de durée endormie (480 min chacune), la plus petite chaîne `source` l'emporte : « com.exemple.a »
        // (23:00–07:00) sur « com.exemple.b » (22:00–06:00), quel que soit l'ordre du tableau.
        let egalite = [
            echantillon(local("2026-10-28", "22:00"), local("2026-10-29", "06:00"), 1, source: "com.exemple.b"),
            echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "07:00"), 1, source: "com.exemple.a"),
        ]
        let session = try #require(sessionsDeSommeil(egalite, fuseau: paris).first)
        #expect(session.debutUtc_ms == local("2026-10-28", "23:00").timeIntervalSince1970 * 1000)
        #expect(session.sommeil_min == 480)
    }

    @Test func d023LHeureDhiverNeRetirePasUneHeureDeDureeReelle() throws {
        // D-023 : les durées se calculent sur les instants. Le 24 au 25 octobre 2026, la nuit dure 9 h réelles, et le
        // coucher (18:00 le 24, encore en CEST) se mesure à 300 min : 23:00 CEST moins 18:00 CEST.
        let nuit = [echantillon(local("2026-10-24", "23:00"), local("2026-10-25", "07:00"), 3)]
        let session = try #require(sessionsDeSommeil(nuit, fuseau: paris).first)
        #expect(session.sommeil_min == 540)
        #expect(session.date == "2026-10-25")
        #expect(session.coucher_min == 300)
    }

    @Test func d023LEndormiNonPreciseCompteEnLegerEtDansLeSommeil() throws {
        // D-023 et 04 : la valeur 1 (« endormi non précisé ») compte en léger et dans le sommeil.
        let nuit = [echantillon(local("2026-10-28", "23:00"), local("2026-10-29", "07:00"), 1, source: tierce)]
        let session = try #require(sessionsDeSommeil(nuit, fuseau: paris).first)
        #expect(session.leger_min == 480)
        #expect(session.sommeil_min == 480)
    }

    @Test func d023UneListeVideDonneAucuneSession() {
        // D-023 : sans échantillon, il n'y a aucune session.
        #expect(sessionsDeSommeil([], fuseau: paris) == [])
    }
}
