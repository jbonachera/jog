import Testing
@testable import JogCore

// Bornes des axes (D-009). Les valeurs attendues se calculent à la main avec l'algorithme de domaine.ts : marge de 5 %,
// arrondi vers l'extérieur au pas, plage minimale, plancher hors valeurs négatives.

@Test func decouplageGardeLIntervalleDeLaPlage() {
    // Repères 0 et 5, valeurs 3 et 4,5 : la plage [0 ; 10] couvre tout ; la marge de 5 % pousse la borne haute à 10,5.
    let domaine = domaineAxe([3, 4.5], preset: .decouplage, reperes: [0, 5])
    #expect(domaine == 0...11)
}

@Test func etendueMinimaleEstCentreeSurLesDonnees() {
    // Allure : 300 et 310 s/km, étendue 10 < 20 : on centre à 305, pas de 5.
    let domaine = domaineAxe([300, 310], preset: .allure)
    #expect(domaine == 290...320)
}

@Test func fraicheurCouvreLesValeursNegatives() {
    let domaine = domaineAxe([-40, 20], preset: .fraicheur)
    #expect(domaine == -50...40)
}

@Test func unPlancherNeCoupePasUneValeurNegative() {
    // Un repère négatif lève le plancher : rien n'est coupé.
    let domaine = domaineAxe(ParamsDomaine(valeurs: [2], reperes: [-2], plageMin: .intervalle(0, 10), pas: 1, plancher: 0))
    #expect(domaine.lowerBound == -3)
}

@Test func leRatioSeCadreSurSaBande() {
    let domaine = domaineAxe([0.9, 1.1], preset: .ratio)
    #expect(domaine == 0.2...2.0)
}

@Test func sansValeurLaPlageMinimaleSertDeDomaine() {
    // Forme de fond sans donnée : étendue 30 centrée sur zéro, arrondie au pas de 10.
    #expect(domaineAxe([], preset: .formeFond) == -20...20)
    // Part de sous-seuil sans donnée : [0 ; 35] élargi puis arrondi au pas de 5, plancher à zéro.
    #expect(domaineAxe([], preset: .partSousSeuil) == 0...40)
}

@Test func leDomaineCouvreToutesLesValeursFinies() {
    let valeurs: [Double] = [1.42, 0.07, 3.3, -0.2, .nan, 2.9]
    let domaine = domaineAxe(valeurs, preset: .efficacite)
    for valeur in valeurs where valeur.isFinite {
        #expect(domaine.contains(valeur))
    }
}

@Test func lesPasDecimauxRestentPropres() {
    // 3 × 0,05 vaut 0,15 sans bruit binaire.
    #expect(multiple(3, 0.05) == 0.15)
    #expect(multiple(-1, 1) == -1)
    // Efficacité : 27 × 0,05 = 1,35 et 31 × 0,05 = 1,55, sans les décimales parasites.
    #expect(domaineAxe([1.4, 1.5], preset: .efficacite) == 1.35...1.55)
}

@Test func lesPresetsReprennentLaTableD009() {
    #expect(presetAxe(.fcFin).pas == 2)
    #expect(presetAxe(.allure).plageMin == .etendue(20))
    #expect(presetAxe(.decouplage).plancher == 0)
    #expect(presetAxe(.ratio).plageMin == .intervalle(0.4, 1.8))
    #expect(presetAxe(.partSousSeuil).plageMin == .intervalle(0, 35))
    #expect(presetAxe(.fraicheur).pas == 10)
}
