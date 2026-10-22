import Testing
@testable import JogCore

// Tests de règles de la spec, écrits à la main (et non tirés de l'oracle). Chaque test cite la règle qu'il vérifie :
// D-015 (arrondi avant comparaison, docs/design/decisions.md), ADR 0007 (calendrier, docs/adr/0007-temps-calendrier.md)
// et D-006 (valeurs en vigueur des paramètres datés, docs/design/06-parametres.md).

// MARK: - D-015 : arrondi avant comparaison aux seuils

@Test func d015UneValeurAMiCheminSEloigneDeZero() throws {
    // D-015 : « On arrondit au plus proche, et une valeur à mi-chemin s'éloigne de zéro ».
    #expect(try arrondir(2.5, 1) == 3)
    #expect(try arrondir(-2.5, 1) == -3)
    #expect(try arrondir(0.5, 1) == 1)
}

@Test func d015LaValeurAfficheeEstCelleDuSeuil() throws {
    // D-015 : une progressivité de 1,3004 s'affiche 1,30, donc reste dans la bande OK (05), jusqu'à 1,3 inclus.
    let affichee = try arrondir(1.3004, PRECISION.progressivite)
    #expect(affichee == 1.3)
    #expect(affichee <= SEUILS.progressivite.okMax)
}

@Test func d015UnCinqAuCentiemeSansBruitBinaire() throws {
    // D-015 : 1,005 vaut 100,49999999999999 une fois mis à l'échelle, mais doit s'arrondir à 1,01 comme la règle l'écrit.
    #expect(try arrondir(1.005, 0.01) == 1.01)
}

@Test func d015UnPasNulOuNegatifNeDefinitPasDePrecision() {
    // D-015 : une précision est un pas décimal positif ; sinon l'arrondi lève une erreur.
    #expect(throws: RangeError.self) { try arrondir(1, 0) }
    #expect(throws: RangeError.self) { try arrondir(1, -1) }
}

@Test func d015LeQuirkDuPasTiersEstReproduitDuTypeScript() throws {
    // src/core/arrondi.ts : le pas 1/3 devient 333333333333 / 10^12 (toPrecision(12)), d'où 0,999999999999 pour 1.
    #expect(try arrondir(1, 1.0 / 3.0) == 0.999999999999)
}

// MARK: - ADR 0007 : temps et calendrier

@Test func adr0007UneSemaineEstTermineeSiSonDimancheEstAvantJ() throws {
    // ADR 0007 : une semaine est « terminée » si son dimanche est ≤ J−1, donc strictement avant J.
    #expect(try semaineTerminee("2026-10-12", "2026-10-19"))
    #expect(try !semaineTerminee("2026-10-12", "2026-10-18"))
}

@Test func adr0007LaSemaineVaDuLundiAuDimancheISO() throws {
    // ADR 0007 et 03 : la semaine est ISO, du lundi (0) au dimanche (6).
    #expect(try jourDeSemaine("2026-10-21") == 2)
    #expect(try lundiISO("2026-12-31") == "2026-12-28")
}

@Test func adr0007LaDateLocaleSuitLeDecalageDeLaSeance() throws {
    // ADR 0007 : dateLocale = date civile de debutUtc + decalageLocal_min. 00 h 30 UTC à −7 h donne la veille.
    let debut = try instantUtc("2026-10-25T00:30:00Z")
    #expect(try dateLocale(debut, -420) == "2026-10-24")
    #expect(try dateLocale(debut, 0) == "2026-10-25")
}

@Test func adr0007LesFenetresSeCalculentSurDesNumerosDeJour() throws {
    // ADR 0007 : les fenêtres sont des numéros de jour ; le changement d'heure du 29 mars 2026 ne change rien.
    #expect(try numeroJour("2026-03-29") - numeroJour("2026-03-28") == 1)
    #expect(try ajouterJours("2026-03-28", 7) == "2026-04-04")
}

@Test func adr0007UnInstantSansZEstRefuseEtLaFractionSeCompareEnInstants() throws {
    // ADR 0007 et types.ts : un instant doit finir par Z ; une fraction de seconde se compte en millisecondes.
    #expect(throws: RangeError.self) { try instantUtc("2026-04-10T18:00:00") }
    #expect(try instantUtc("2026-04-10T18:00:00.5Z") - instantUtc("2026-04-10T18:00:00Z") == 500)
}

// MARK: - D-006 : valeurs en vigueur des paramètres datés

/// Une modification de test ; l'instant d'enregistrement est fixé sauf quand il compte pour la règle.
private func modification(
    _ id: String, _ cle: String, _ valeur: Double, _ dateEffet: DateCivile,
    enregistreLe: String = "2026-01-01T10:00:00Z"
) -> ModifDatee {
    ModifDatee(id: id, cle: cle, valeur: valeur, dateEffet: dateEffet, enregistreLe: enregistreLe)
}

private func parametresAvec(_ modifs: ModifDatee...) -> Parametres {
    Parametres(globaux: parametresDefaut().globaux, modifs: modifs)
}

@Test func d006AvantLaPremiereModificationLaPremiereValeurEnregistreeSApplique() throws {
    // D-006 : avant la première modification, c'est la première valeur enregistrée qui s'applique.
    let params = parametresAvec(modification("a", "hrMax", 190, "2026-06-01"))
    #expect(try parametresAuJour(params, "2026-05-31").hrMax == 190)
    #expect(try parametresAuJour(params, "1999-01-01").hrMax == 190)
}

@Test func d006UneModificationSAppliqueDeSaDateEffetEtApres() throws {
    // D-006 : une séance du jour d prend la dernière modification dont la date d'effet est ≤ d (bornes incluses).
    let params = parametresAvec(
        modification("a", "hrMax", 188, "2026-01-15"),
        modification("b", "hrMax", 190, "2026-06-01")
    )
    #expect(try parametresAuJour(params, "2026-05-31").hrMax == 188)
    #expect(try parametresAuJour(params, "2026-06-01").hrMax == 190)
    #expect(try parametresAuJour(params, "2026-06-02").hrMax == 190)
}

@Test func d006TroisModificationsDuMemeParametreDansLOrdreDesDates() throws {
    // D-006 : la valeur en vigueur est celle de la dernière date d'effet atteinte, quel que soit l'ordre de saisie.
    let params = parametresAvec(
        modification("c", "hrMax", 192, "2026-08-01"),
        modification("a", "hrMax", 188, "2026-01-15"),
        modification("b", "hrMax", 190, "2026-03-01")
    )
    #expect(try parametresAuJour(params, "2026-01-14").hrMax == 188)
    #expect(try parametresAuJour(params, "2026-02-28").hrMax == 188)
    #expect(try parametresAuJour(params, "2026-03-01").hrMax == 190)
    #expect(try parametresAuJour(params, "2026-07-31").hrMax == 190)
    #expect(try parametresAuJour(params, "2026-08-01").hrMax == 192)
}

@Test func d006MemeDateEffetLaModificationLaPlusRecenteLEmporte() throws {
    // D-006 : deux modifications du même paramètre à la même date : la dernière enregistrée l'emporte.
    let ancienne = modification("a", "easyCap", 140, "2026-05-01", enregistreLe: "2026-05-01T10:00:00Z")
    let recente = modification("b", "easyCap", 143, "2026-05-01", enregistreLe: "2026-05-02T09:00:00Z")
    #expect(try parametresAuJour(parametresAvec(ancienne, recente), "2026-05-01").easyCap == 143)
    #expect(try parametresAuJour(parametresAvec(recente, ancienne), "2026-05-01").easyCap == 143)
}
