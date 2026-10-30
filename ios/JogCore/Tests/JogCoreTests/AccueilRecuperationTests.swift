import Foundation
import Testing
@testable import JogCore

// Lot 4 de la refonte de l'accueil (docs/implementation/refonte-accueil.md) : lignes de récupération (A5). Tests à la
// frontière publique `lignesRecuperation`, sur une VueRecuperation construite par `calculerRecuperation`. Données
// synthétiques écrites ici. Règles citées : 04 « Accueil › Récupération (lignes) », 04 « Récupération » (F7, N60,
// norme), D-023 (nuit non mesurée jamais comptée), D-026 (côté coloré par ligne, point de décision 4), D-015 (arrondi).

/// Jour A de la Vue (D-022 : la Vue se calcule le lendemain).
private let A: DateCivile = "2026-10-30"

/// Nuit de test : VFC (ms) et FC de sommeil optionnelles, durée endormie en minutes.
private func nuit(_ date: DateCivile, vfc: Double?, fc: Double?, sommeil: Double) -> NuitResumee {
    NuitResumee(
        date: date, debutUtc_ms: 0, finUtc_ms: 0, coucher_min: 0, sommeil_min: sommeil, leger_min: 0, profond_min: 0,
        paradoxal_min: 0, eveille_min: 0, vfcLn: vfc.map { Foundation.log($0) }, fcSommeil: fc, respiration: nil
    )
}

/// Nuits de la norme (N60 : A−66 à A−7), VFC alternée de 44,18 et 50 ms, FC alternée de 56 et 62 bpm : milieu VFC 47 ms
/// (moyenne géométrique exacte), bande VFC 44,3–49,8 ms, bande FC 56,15–61,85 bpm, soit 56–62 après arrondi.
private func nuitsNorme(_ n: Int = 22) throws -> [NuitResumee] {
    try (0..<n).map { k in
        nuit(try ajouterJours(A, -7 - k), vfc: k % 2 == 0 ? 44.18 : 50, fc: k % 2 == 0 ? 56 : 62, sommeil: 450)
    }
}

/// Nuits récentes (F7 : A−6 à A) : toutes identiques, pour que les moyennes soient connues.
private func nuitsRecentes(_ n: Int = 7, vfc: Double = 41, fc: Double = 54, sommeil: Double = 412) throws -> [NuitResumee] {
    try (0..<n).map { k in nuit(try ajouterJours(A, -k), vfc: vfc, fc: fc, sommeil: sommeil) }
}

/// Les trois lignes de A5 pour ces nuits, avec un besoin de sommeil de 7 h 30 (450 min) par défaut.
private func lignes(_ nuits: [NuitResumee], besoin: Double = 450) throws -> LignesRecuperation {
    let recuperation = try #require(try calculerRecuperation(nuits, derniereSession: nil, aujourdhui: A))
    return try #require(try lignesRecuperation(recuperation, besoinSommeil_min: besoin))
}

// MARK: - 04, Accueil › Récupération (lignes)

@Test func laVfcDesSeptNuitsSeCompareAuMilieuDeLaNorme() throws {
    // 04 : valeur = vfc7(A) = 41 ms ; trait = milieu de la norme = 47 ms ; bande = norme VFC 44–50 ms ; écart −6 ms.
    // 41 sort de la bande par le bas : la ligne est hors bande (VFC : côté bas seulement, point de décision 4).
    let vfc = try lignes(try nuitsNorme() + nuitsRecentes(vfc: 41)).vfc

    #expect(vfc.valeurAffichee == 41)
    #expect(vfc.trait == 47)
    #expect(vfc.bande == 44...50)
    #expect(vfc.ecart == -6)
    #expect(vfc.horsBande == true)
    #expect(vfc.enCours == nil)
}

@Test func laFcDeReposSeComparEAuMilieuDeLaNorme() throws {
    // 04 : valeur = fc7(A) = 54 bpm ; trait = moyenne de la norme = 59 bpm ; bande 56–62 bpm ; écart −5 bpm.
    let fc = try lignes(try nuitsNorme() + nuitsRecentes(fc: 54)).fcRepos

    #expect(fc.valeurAffichee == 54)
    #expect(fc.trait == 59)
    #expect(fc.bande == 56...62)
    #expect(fc.ecart == -5)
}

@Test func leSommeilSeComparteAuBesoinAvecUneBandeDeQuaranteCinqMinutes() throws {
    // 04 : valeur = moyenne des durées endormies de F7(A) = 412 min (6 h 52) ; trait = besoin 450 min (7 h 30) ;
    // bande = besoin − 45 à besoin, soit 405–450 ; écart −38 min. 412 est dans la bande.
    let sommeil = try lignes(try nuitsNorme() + nuitsRecentes(sommeil: 412)).sommeil

    #expect(sommeil.valeurAffichee == 412)
    #expect(sommeil.trait == 450)
    #expect(sommeil.bande == 405...450)
    #expect(sommeil.ecart == -38)
    #expect(sommeil.horsBande == false)
}

@Test func unSommeilDeQuaranteCinqMinutesSousLeBesoinEstHorsBande() throws {
    // 04 : borne de la bande de sommeil. 404 min est à 46 min du besoin (hors bande) ; 405 min est à 45 min (dedans).
    let sousLaBande = try lignes(try nuitsNorme() + nuitsRecentes(sommeil: 404)).sommeil
    #expect(sousLaBande.ecart == -46)
    #expect(sousLaBande.horsBande == true)

    let surLaBande = try lignes(try nuitsNorme() + nuitsRecentes(sommeil: 405)).sommeil
    #expect(surLaBande.horsBande == false)
}

@Test func uneVfcAuBasDeLaBandeAffichee() throws {
    // D-015 : la comparaison à la bande se fait sur la valeur affichée. 44 ms est sur le bas de la bande 44–50 (dedans) ;
    // 43 ms est hors bande.
    let dedans = try lignes(try nuitsNorme() + nuitsRecentes(vfc: 44)).vfc
    #expect(dedans.horsBande == false)

    let dehors = try lignes(try nuitsNorme() + nuitsRecentes(vfc: 43)).vfc
    #expect(dehors.horsBande == true)
}

@Test func uneVfcHauteOuUnSommeilAuDessusDuBesoinNeSontPasColores() throws {
    // 04 et point de décision 4 : la VFC ne colore que sous la norme, et le sommeil ne colore que sous le besoin.
    // VFC 60 ms (au-dessus de 50) et sommeil 500 min (au-dessus de 450) : lignes non colorées, écarts positifs.
    let lignesHautes = try lignes(try nuitsNorme() + nuitsRecentes(vfc: 60, sommeil: 500))

    #expect(lignesHautes.vfc.horsBande == false)
    #expect(lignesHautes.vfc.ecart == 13)
    #expect(lignesHautes.sommeil.horsBande == false)
    #expect(lignesHautes.sommeil.ecart == 50)
}

@Test func uneFcDeReposHauteEstHorsBande() throws {
    // 04 et point de décision 4 : la FC de repos ne colore que si elle est au-dessus de la norme. 65 bpm > 62 : colorée.
    // La même ligne à 54 bpm, sous la norme, n'est pas colorée (testée ci-dessus).
    let fc = try lignes(try nuitsNorme() + nuitsRecentes(fc: 65)).fcRepos

    #expect(fc.ecart == 6)
    #expect(fc.horsBande == true)
}

@Test func quatreNuitsSuffisentPourUneValeurEtMoinsDeQuatreDonnentAucune() throws {
    // 04 « Récupération » : vfc7, fc7 et la moyenne de sommeil exigent 4 nuits dans F7 (A−6 à A). Avec 4 nuits, les
    // valeurs existent ; avec 3, elles sont absentes, et la ligne n'a ni écart ni sortie de bande.
    let quatre = try lignes(try nuitsNorme() + nuitsRecentes(4, vfc: 41, sommeil: 412))
    #expect(quatre.vfc.valeurAffichee == 41)
    #expect(quatre.sommeil.valeurAffichee == 412)

    let trois = try lignes(try nuitsNorme() + nuitsRecentes(3, vfc: 41, sommeil: 412))
    #expect(trois.vfc.valeurAffichee == nil)
    #expect(trois.fcRepos.valeurAffichee == nil)
    #expect(trois.sommeil.valeurAffichee == nil)
    #expect(trois.sommeil.ecart == nil)
    #expect(trois.vfc.horsBande == false)
    #expect(trois.sommeil.horsBande == false)
    // Le besoin et la norme ne dépendent pas de F7 : le trait reste.
    #expect(trois.sommeil.trait == 450)
    #expect(trois.vfc.trait == 47)
}

@Test func sansNormeLaVfcAUneNormeEnCoursEtPasDeTrait() throws {
    // 04 « Récupération » : norme absente sans 21 nuits mesurées dans N60 (10 ici). VFC : « Norme en cours (10 sur 21) »,
    // sans trait ni bande ; la valeur reste affichée.
    let rangees = try lignes(try nuitsNorme(10) + nuitsRecentes(vfc: 41))
    let vfc = rangees.vfc

    #expect(vfc.valeurAffichee == 41)
    #expect(vfc.trait == nil)
    #expect(vfc.bande == nil)
    #expect(vfc.ecart == nil)
    #expect(vfc.horsBande == false)
    #expect(vfc.enCours == MentionEnCours(n: 10, sur: 21))

    // 04 « Récupération » : norme absente → FC sans trait ni bande.
    let fc = rangees.fcRepos
    #expect(fc.trait == nil)
    #expect(fc.bande == nil)
    #expect(fc.ecart == nil)
    #expect(fc.horsBande == false)
    #expect(fc.enCours == nil)
}

@Test func sansRecuperationIlNYADePasDeLignes() {
    // 04 : sans bloc de récupération (aucune nuit mesurée), il n'y a pas de lignes.
    #expect(try lignesRecuperation(nil, besoinSommeil_min: 450) == nil)
}
