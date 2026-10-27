// Tests de TransitionsApp (app, dossier Etat). Fichier HORS de la cible JogTests : celle-ci n'est pas hébergée par
// l'app (pas de TEST_HOST ni de dépendance sur Jog), donc les symboles de l'app ne s'y lient pas. Pour l'exécuter :
// ajouter ce fichier à la cible JogTests dans Xcode, et configurer la cible hôte (TEST_HOST = Jog). Le fichier
// compile avec `@testable import Jog`. Les cas ne dépendent que de TransitionsApp et de Vue.
import Testing
import JogCore
@testable import Jog

@Test func sansAutorisationAvantLeLancementOnMontreLAccueil() {
    let etat = TransitionsApp.suivant(.chargement, .lancement(autorisationDemandee: false, vue: nil))
    #expect(etat == .premiereOuverture)
}

@Test func uneVueMemoriseeAfficheToutDeSuite() {
    let vue = Vue.vide(J: "2026-10-20")
    let etat = TransitionsApp.suivant(.chargement, .lancement(autorisationDemandee: true, vue: vue))
    #expect(etat == .pret(vue))
}

@Test func autoriseSansVueMemoriseeOnImporte() {
    let etat = TransitionsApp.suivant(.chargement, .lancement(autorisationDemandee: true, vue: nil))
    #expect(etat == .importEnCours(traitees: 0, total: 0))
}

@Test func lAutorisationAccordeeLanceLImport() {
    let etat = TransitionsApp.suivant(.premiereOuverture, .autorisationAccordee)
    #expect(etat == .importEnCours(traitees: 0, total: 0))
}

@Test func uneAutorisationEchoueeAfficheLErreurSansVue() {
    let etat = TransitionsApp.suivant(.premiereOuverture, .autorisationEchouee("indisponible"))
    #expect(etat == .erreur(message: "indisponible", vue: nil))
}

@Test func laProgressionMetAJourLImportMaisPasUneVueAffichee() {
    let import0 = TransitionsApp.suivant(.importEnCours(traitees: 0, total: 0), .progression(traitees: 3, total: 12))
    #expect(import0 == .importEnCours(traitees: 3, total: 12))

    let vue = Vue.vide(J: "2026-10-20")
    let pret = TransitionsApp.suivant(.pret(vue), .progression(traitees: 3, total: 12))
    #expect(pret == .pret(vue))
}

@Test func laVueCalculeeAfficheLApercu() {
    let vue = Vue.vide(J: "2026-10-20")
    let etat = TransitionsApp.suivant(.importEnCours(traitees: 5, total: 5), .vueCalculee(vue))
    #expect(etat == .pret(vue))
}

@Test func uneErreurPendantUneVueGardeLaVueSousLeBandeau() {
    let vue = Vue.vide(J: "2026-10-20")
    let etat = TransitionsApp.suivant(.pret(vue), .echec("réseau"))
    #expect(etat == .erreur(message: "réseau", vue: vue))
}

@Test func uneErreurPendantLImportNeMontreAucuneVue() {
    let etat = TransitionsApp.suivant(.importEnCours(traitees: 1, total: 4), .echec("réseau"))
    #expect(etat == .erreur(message: "réseau", vue: nil))
}

@Test func reessayerRevientALaVueGardee() {
    let vue = Vue.vide(J: "2026-10-20")
    let etat = TransitionsApp.suivant(.erreur(message: "réseau", vue: vue), .reessayer)
    #expect(etat == .pret(vue))
}

@Test func reessayerSansVueRelanceLImport() {
    let etat = TransitionsApp.suivant(.erreur(message: "réseau", vue: nil), .reessayer)
    #expect(etat == .importEnCours(traitees: 0, total: 0))
}

@Test func unEvenementSansObjetNeChangePasLEtat() {
    #expect(TransitionsApp.suivant(.premiereOuverture, .reessayer) == .premiereOuverture)
    #expect(TransitionsApp.suivant(.chargement, .autorisationAccordee) == .chargement)
    #expect(TransitionsApp.suivant(.chargement, .progression(traitees: 1, total: 2)) == .chargement)
}
