// Tests de la logique de la feuille Paramètres (06, D-006, D-019), dossier Parametres. Fichier HORS de la cible
// JogTests, comme TransitionsAppTests : `@testable import Jog` compile une fois le fichier ajouté à une cible hôte.
// Les cas ne testent que ModeleParametres.swift et JogCore.
import Testing
import Foundation
import JogCore
@testable import Jog

private let J: DateCivile = "2026-10-27"
private let MAINTENANT = "2026-10-27T08:00:00Z"

private func brouillon(_ modifie: [ChampParametre: String] = [:]) -> Brouillon {
    var b = Brouillon.parDefaut()
    for (champ, texte) in modifie {
        b.definir(champ, texte)
    }
    return b
}

private func verifier(_ b: Brouillon, base: Parametres = parametresDefaut(), dateEffet: DateCivile = J) -> Verification {
    verifierSaisie(b, base: base, dateEffet: dateEffet, J: J, enregistreLe: MAINTENANT, nouvelId: { "id-test" })
}

@Test func allureMSSEnSecondes() {
    #expect(secondesDepuisAllure("4:02") == 242)
    #expect(secondesDepuisAllure("3:58") == 238)
    #expect(secondesDepuisAllure("4:2") == nil)
    #expect(secondesDepuisAllure("4:60") == nil)
    #expect(secondesDepuisAllure("4-02") == nil)
    #expect(secondesDepuisAllure("") == nil)
}

@Test func nombreTapeEnFrancais() {
    #expect(texteNombre(1.1) == "1,1")
    #expect(texteNombre(188) == "188")
    #expect(lireNombre("1,1") == 1.1)
    #expect(lireNombre("1.1") == 1.1)
    #expect(lireNombre("abc").isNaN)
    #expect(lireNombre("-2,5") == -2.5)
    #expect(lireNombre("1\u{202F}200") == 1200)
}

@Test func lireNombreRefuseToutCeQuiNEstPasUnDecimal() {
    // Hexadécimal, exposant, infini, double signe, double séparateur, texte vide : NaN, jamais un nombre.
    for saisie in ["0x1A", "0x10", "1e3", "inf", "nan", "+-1", "1,2,3", "1..2", "+", ".", "", "1 2a"] {
        #expect(lireNombre(saisie).isNaN, "\(saisie)")
    }
}

@Test func hexadecimalEstRefuseDansLaSaisie() {
    let resultat = verifier(brouillon([.datee(.hrMax): "0x10"]))
    #expect(resultat.champ == "hrMax")
    #expect(resultat.message == "Valeur manquante ou invalide : FC max.")
}

@Test func presenceDeTousLesChampsAvantLeFormatDeLAllure() {
    // Un champ vide passe avant une allure mal formée, même si l'allure vient avant dans le formulaire (06, règle 1).
    let resultat = verifier(brouillon([.datee(.lt2Pace): "4:0x", .datee(.hrMax): ""]))
    #expect(resultat.champ == "hrMax")
    #expect(resultat.message == "Valeur manquante ou invalide : FC max.")
}

@Test func allureVideEstUneValeurManquante() {
    let resultat = verifier(brouillon([.datee(.lt2Pace): "  "]))
    #expect(resultat.champ == "lt2Pace")
    #expect(resultat.message == "Valeur manquante ou invalide : Allure au seuil.")
}

@Test func brouillonParDefautAfficheLesValeursDeDepart() {
    let b = Brouillon.parDefaut()
    #expect(b.texte(.datee(.lt2Pace)) == "3:58")
    #expect(b.texte(.datee(.hrMax)) == "188")
    #expect(b.texte(.globale(.paceHrK)) == "1,1")
}

@Test func saisieInchangeneAjouteAucuneModification() {
    let resultat = verifier(brouillon())
    #expect(resultat.valide)
    #expect(resultat.parametres?.modifs.isEmpty == true)
}

@Test func changerUnParametreDateAjouteUneModificationDatee() throws {
    let resultat = verifier(brouillon([.datee(.hrMax): "190"]), dateEffet: "2026-10-20")
    let parametres = try #require(resultat.parametres)
    #expect(parametres.modifs.count == 1)
    #expect(parametres.modifs.first?.cle == "hrMax")
    #expect(parametres.modifs.first?.valeur == 190)
    #expect(parametres.modifs.first?.dateEffet == "2026-10-20")
}

@Test func unParametreGlobalRemplaceSansHistorique() throws {
    let resultat = verifier(brouillon([.globale(.paceHrK): "1,2"]))
    let parametres = try #require(resultat.parametres)
    #expect(parametres.globaux.paceHrK == 1.2)
    #expect(parametres.modifs.isEmpty)
}

@Test func allureMalFormeeSignaleLeChamp() {
    let resultat = verifier(brouillon([.datee(.lt2Pace): "4:0x"]))
    #expect(resultat.champ == "lt2Pace")
    #expect(resultat.message == MESSAGE_FORMAT_ALLURE)
    #expect(!resultat.valide)
}

@Test func champVideSignaleValeurManquante() {
    let resultat = verifier(brouillon([.datee(.hrMax): ""]))
    #expect(resultat.champ == "hrMax")
    #expect(resultat.message == "Valeur manquante ou invalide : FC max.")
}

@Test func dateEffetFutureEstRefusee() {
    let resultat = verifier(brouillon([.datee(.hrMax): "190"]), dateEffet: "2026-10-28")
    #expect(resultat.champ == "dateEffet")
    #expect(resultat.message == MESSAGE_FUTUR)
}

@Test func zonesQuiNecroissentSontRefusees() {
    let resultat = verifier(brouillon([.datee(.z2): "60"]))
    #expect(resultat.champ == "z2")
    #expect(resultat.message == MESSAGE_BORNES)
}

@Test func coefficientHorsBornesEstRefuse() {
    let resultat = verifier(brouillon([.globale(.paceHrK): "3,5"]))
    #expect(resultat.champ == "paceHrK")
    #expect(resultat.message == MESSAGE_PACE_HR_K)
}

@Test func messageNeFuitQueSurLeChampFautif() {
    let resultat = verifier(brouillon([.datee(.hrMax): ""]))
    #expect(messageChamp(resultat, .datee(.hrMax)) == "Valeur manquante ou invalide : FC max.")
    #expect(messageChamp(resultat, .datee(.hrRest)) == nil)
}

@Test func supprimerUneModificationLaRetire() {
    let base = Parametres(globaux: parametresDefaut().globaux, modifs: [
        ModifDatee(id: "a", cle: "hrMax", valeur: 190, dateEffet: "2026-10-01", enregistreLe: MAINTENANT),
        ModifDatee(id: "b", cle: "hrMax", valeur: 192, dateEffet: "2026-10-10", enregistreLe: MAINTENANT),
    ])
    #expect(sansModification("b", de: base).modifs.map(\.id) == ["a"])
}

@Test func revenirAuxDefautsDatePourChaqueParametreDate() throws {
    let base = Parametres(globaux: GlobauxTest.modifies, modifs: [])
    let nouveaux = parametresParDefaut(base: base, J: J, enregistreLe: MAINTENANT, nouvelId: { UUID().uuidString })
    #expect(nouveaux.globaux == parametresDefaut().globaux)
    #expect(nouveaux.modifs.count == CleDatee.allCases.count)
    #expect(nouveaux.modifs.allSatisfy { $0.dateEffet == J })
    #expect(try parametresAuJour(nouveaux, J).hrMax == 188)
}

private enum GlobauxTest {
    static let modifies = ParamsGlobaux(refHr: 150, paceHrK: 1.5, ctlDays: 30, atlDays: 5, subtPctLo: 10, subtPctHi: 30)
}

@Test func zonesEnBpmSurLaFCMaxSaisie() {
    let zones = lignesZones(brouillon())
    #expect(zones.map(\.texte) == [
        "jusqu’à 128 bpm", "de 128 à 147 bpm", "de 147 à 160 bpm", "de 160 à 173 bpm", "de 173 à 188 bpm",
    ])
}

@Test func historiqueAfficheLaValeurDeDepartPuisLesChangements() {
    let base = Parametres(globaux: parametresDefaut().globaux, modifs: [
        ModifDatee(id: "a", cle: "hrMax", valeur: 190, dateEffet: "2026-10-01", enregistreLe: MAINTENANT),
    ])
    let lignes = lignesHistorique(base)
    #expect(lignes.count == 1)
    #expect(lignes.first?.titre == "FC max : valeur initiale → 190 bpm")
}

@Test func allureAfficheeEnMSSParKm() {
    #expect(ChampParametre.datee(.lt2Pace).affiche(238) == "3:58 /km")
    #expect(ChampParametre(cle: "z3") == .datee(.z3))
    #expect(ChampParametre(cle: "inconnu") == nil)
}

@Test func dateCivileAllerRetour() throws {
    let instant = try #require(instantDe("2026-03-05"))
    #expect(dateCivile(de: instant) == "2026-03-05")
    #expect(instantDe("pas une date") == nil)
}

@Test func derniereSynchroJamaisSansDate() {
    #expect(libelleDerniereSynchro(nil) == "Jamais")
    #expect(libelleDerniereSynchro("nimporte quoi") == "Jamais")
}

private func suggestion(ecart: Bool = false, nom: String? = "Sortie") -> SuggestionHrMax {
    SuggestionHrMax(bpm: 192, date: "2026-10-10", cleSource: "a", nom: nom, km: 12.3, ecartSuspect: ecart)
}

@Test func encartFCMaxDecritLaSeanceEtLesBoutons() throws {
    let encart = try #require(encartFCMax(suggestion(), hrMaxVeille: 188, ignoree: ""))
    #expect(encart.phrase.hasPrefix("192 bpm tenus 15 s le "))
    #expect(encart.phrase.contains("« Sortie »"))
    #expect(encart.phrase.hasSuffix("au-dessus de votre réglage de 188 bpm."))
    #expect(encart.alerte == nil)
    #expect(encart.libelleUtiliser.hasPrefix("Utiliser 192 bpm à partir du "))
}

@Test func encartFCMaxSansNomEtAvecEcartSuspect() throws {
    let encart = try #require(encartFCMax(suggestion(ecart: true, nom: nil), hrMaxVeille: 170, ignoree: ""))
    #expect(encart.phrase.contains("(12,3\u{00A0}km)"))
    #expect(encart.alerte != nil)
}

@Test func ignorerMasqueLaPropositionSurLeMemeCouple() {
    #expect(encartFCMax(suggestion(), hrMaxVeille: 188, ignoree: "a:192") == nil)
    #expect(encartFCMax(suggestion(), hrMaxVeille: 188, ignoree: "a:193") != nil)
}

@Test func utiliserAjouteUneSeuleModificationDateeDeLaSeance() throws {
    let base = Parametres(globaux: GlobauxTest.modifies, modifs: [
        ModifDatee(id: "a", cle: "hrMax", valeur: 185, dateEffet: "2026-01-01", enregistreLe: MAINTENANT),
    ])
    let nouveaux = ajouterFCMaxObservee(suggestion(), base: base, enregistreLe: MAINTENANT, nouvelId: { "id-fc" })

    #expect(nouveaux.modifs.count == 2)
    #expect(nouveaux.modifs.first == base.modifs.first)
    let ajoutee = try #require(nouveaux.modifs.last)
    #expect(ajoutee.cle == "hrMax")
    #expect(ajoutee.valeur == 192)
    #expect(ajoutee.dateEffet == "2026-10-10")
    #expect(ajoutee.id == "id-fc")
    #expect(nouveaux.globaux == base.globaux)
    #expect(try parametresAuJour(nouveaux, J).hrMax == 192)
}

@Test func etatDonneesCompteLesRaisons() {
    let etat = EtatDonnees(
        reglesVersion: "1.1.0", seancesImportees: 40, ecartees: 2, raisonsIgnorees: [.doublon, .doublon, .autreSource],
        echecs: 1, derniereSynchro: nil
    )
    #expect(etat.ignorees[.doublon] == 2)
    #expect(etat.ignorees[.autreSource] == 1)
    #expect(etat.ignorees[.illisible] == nil)
}
