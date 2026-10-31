// Tests de ModeleNiveau (app, dossier Accueil) : en-tête, axes du radar, géométrie, courses N2 et courbe (03 N1, N2 ;
// 04, « VDOT et niveau », « Six qualités », « Records » ; D-027, D-028 ; points de décision 6, 9 et 14 ; lot 15).
// Fixtures construites par code, sans donnée réelle. Les records viennent de recordsParDistance (JogCore), comme pour P5.
import Foundation
import CoreGraphics
import Testing
import JogCore
@testable import Jog
@testable import JogCore

private let espace = "\u{00A0}"

/// Les six axes de l'exemple de la maquette : Volume +14 %, Seuil −9 s/km, Efficacité +3 %, Endurance +0,8 pt (moins bien),
/// Régularité +8 pt, Résilience −1 ms (moins bien).
private func qualites(referencePremieresSemaines: Bool = false, Q: (DateCivile, DateCivile)? = nil,
                      Q0: (DateCivile, DateCivile)? = nil) -> SixQualites {
    SixQualites(
        axes: [
            AxeQualite(qualite: .volume, maintenant: 40, reference: 35, ecartOriente: 14, ecartAffiche: 14, rayon: 0.7),
            AxeQualite(qualite: .seuil, maintenant: 231, reference: 240, ecartOriente: 9, ecartAffiche: -9, rayon: 0.78),
            AxeQualite(qualite: .efficacite, maintenant: 1.03, reference: 1.0, ecartOriente: 3, ecartAffiche: 3, rayon: 0.6),
            AxeQualite(qualite: .endurance, maintenant: 4.2, reference: 3.4, ecartOriente: -0.8, ecartAffiche: 0.8, rayon: 0.4),
            AxeQualite(qualite: .regularite, maintenant: 75, reference: 67, ecartOriente: 8, ecartAffiche: 8, rayon: 0.66),
            AxeQualite(qualite: .resilience, maintenant: 46, reference: 47, ecartOriente: -1, ecartAffiche: -1, rayon: 0.47),
        ],
        referencePremieresSemaines: referencePremieresSemaines, Q: Q, Q0: Q0
    )
}

private let niveau = VueNiveau(valeur: 54.2, ilYAUnAn: 52.1, ecart: 2.1, fixePar: "2026-10-12-10km")

private func axe(_ nom: String, _ axes: [ModeleNiveau.Axe]) -> ModeleNiveau.Axe {
    axes.first { $0.nom == nom }!
}

// MARK: - En-tête

// 03 N1 ; 04, « VDOT et niveau » ; maquette (`niveau`) : 54,2, il y a un an 52,1, +2,1 en vert
@Test func lEnTeteAfficheLeNiveauSonAnneeAvantEtLEcartEnVert() {
    let tete = ModeleNiveau.enTete(niveau, qualites())
    #expect(tete.titre == "Niveau (VDOT)")
    #expect(tete.valeur == "54,2")
    #expect(tete.ilYAUnAn == "52,1")
    #expect(tete.ecart == "+2,1")
    #expect(tete.ton == .bon)
    #expect(tete.sousTitre == nil)
}

// 03 N1 : sans niveau, le titre dit ce qui manque, sans valeur
@Test func sansNiveauLEnTeteDitNiveauEnCoursSansValeur() {
    let vide = VueNiveau(valeur: nil, ilYAUnAn: nil, ecart: nil, fixePar: nil)
    let tete = ModeleNiveau.enTete(vide, qualites())
    #expect(tete.titre == "Niveau en cours : cours un test 5 km")
    #expect(tete.valeur == nil)
    #expect(tete.ilYAUnAn == nil)
    #expect(tete.ecart == nil)
    #expect(tete.ton == .neutre)
}

// D-015 : un écart négatif est orange ; un écart nul est neutre et s'écrit « 0,0 »
@Test func unEcartNegatifEstOrangeEtUnEcartNulEstNeutre() {
    let baisse = VueNiveau(valeur: 52.1, ilYAUnAn: 53.6, ecart: -1.5, fixePar: nil)
    #expect(ModeleNiveau.enTete(baisse, qualites()).ecart == "−1,5")
    #expect(ModeleNiveau.enTete(baisse, qualites()).ton == .attention)

    let stable = VueNiveau(valeur: 52.1, ilYAUnAn: 52.1, ecart: 0, fixePar: nil)
    #expect(ModeleNiveau.enTete(stable, qualites()).ecart == "0,0")
    #expect(ModeleNiveau.enTete(stable, qualites()).ton == .neutre)
}

// point de décision 6 : le sous-titre apparaît quand Q et Q₀ sont disjoints, pas avant
@Test func lesDeuxFenetresDisjointesDonnentLeSousTitreDeLaReferenceDeRepli() {
    let disjointes = qualites(
        referencePremieresSemaines: true,
        Q: ("2026-07-06", "2026-09-27"), Q0: ("2026-01-05", "2026-03-29")
    )
    #expect(ModeleNiveau.enTete(niveau, disjointes).sousTitre == "face à tes 12 premières semaines")

    let recouvrement = qualites(
        referencePremieresSemaines: true,
        Q: ("2026-01-05", "2026-03-29"), Q0: ("2026-01-05", "2026-03-29")
    )
    #expect(ModeleNiveau.enTete(niveau, recouvrement).sousTitre == nil)
}

// MARK: - Axes du radar

// 03 N1 : ordre horaire depuis le haut, écarts dans l'unité de chaque qualité (D-015)
@Test func lesAxesSuiventLOrdreHoraireAvecLesEcartsEnUnite() {
    let axes = ModeleNiveau.axes(qualites())
    #expect(axes.map(\.nom) == ["Volume", "Seuil", "Efficacité", "Endurance", "Régularité", "Résilience"])
    #expect(axes.map(\.ecart) == [
        "+14\(espace)%", "−9\(espace)s/km", "+3\(espace)%", "+0,8\(espace)pt", "+8\(espace)pt", "−1\(espace)ms",
    ])
}

// 03 N1 : vert dans le bon sens (ecartOriente), orange sinon, neutre si nul ou sans donnée
@Test func letonDesAxesSuitLeSensDuProgres() {
    let axes = ModeleNiveau.axes(qualites())
    #expect(axes.map(\.ton) == [.bon, .bon, .bon, .attention, .bon, .attention])

    let nul = SixQualites(
        axes: [AxeQualite(qualite: .volume, maintenant: 35, reference: 35, ecartOriente: 0, ecartAffiche: 0, rayon: 0.5)],
        referencePremieresSemaines: false, Q: nil, Q0: nil
    )
    #expect(ModeleNiveau.axes(nul)[0].ton == .neutre)
    #expect(ModeleNiveau.axes(nul)[0].ecart == "0\(espace)%")
}

// maquette (`QUAL[].m`) : la mesure de la bulle, puis « face à il y a un an » avec l'écart
@Test func laBulleDUnAxeDitSaMesureEtSaComparaison() {
    let volume = axe("Volume", ModeleNiveau.axes(qualites()))
    #expect(volume.mesure == "Km par semaine en moyenne")
    #expect(volume.comparaison == "+14\(espace)% face à il y a un an")

    let seuil = axe("Seuil", ModeleNiveau.axes(qualites()))
    #expect(seuil.mesure == "Allure sous-seuil normalisée à ta FC de référence")
}

// D-015 : le ton d'un axe suit l'écart arrondi à la précision affichée. Volume 0,4 → « 0 % » neutre ; 0,5 → « +1 % » vert.
// Endurance −0,04 pt → neutre ; −0,05 pt → orange.
@Test func lesBornesDuTonDUnAxeSuiventLArrondiAffiche() {
    let volume = SixQualites(
        axes: [
            AxeQualite(qualite: .volume, maintenant: 35.4, reference: 35, ecartOriente: 0.4, ecartAffiche: 0.4, rayon: 0.5),
            AxeQualite(qualite: .volume, maintenant: 35.5, reference: 35, ecartOriente: 0.5, ecartAffiche: 0.5, rayon: 0.5),
        ],
        referencePremieresSemaines: false, Q: nil, Q0: nil
    )
    let axes = ModeleNiveau.axes(volume)
    #expect(axes[0].ecart == "0\(espace)%")
    #expect(axes[0].ton == .neutre)
    #expect(axes[1].ecart == "+1\(espace)%")
    #expect(axes[1].ton == .bon)

    let endurance = SixQualites(
        axes: [
            AxeQualite(qualite: .endurance, maintenant: 3.36, reference: 3.4, ecartOriente: -0.04, ecartAffiche: 0.04, rayon: 0.5),
            AxeQualite(qualite: .endurance, maintenant: 3.35, reference: 3.4, ecartOriente: -0.05, ecartAffiche: 0.05, rayon: 0.5),
        ],
        referencePremieresSemaines: false, Q: nil, Q0: nil
    )
    let axesEndurance = ModeleNiveau.axes(endurance)
    #expect(axesEndurance[0].ton == .neutre)
    #expect(axesEndurance[1].ton == .attention)
}

// 03 N1 : accessibilité de l'axe, « nom, écart face à il y a un an »
@Test func lAccessibiliteDUnAxeLitLeNomEtLEcart() {
    let seuil = axe("Seuil", ModeleNiveau.axes(qualites()))
    #expect(seuil.accessibilite == "Seuil, −9\(espace)s/km face à il y a un an")
}

// point de décision 6 : sans écart (Q et Q₀ se recouvrent), « – », neutre, rayon de l'axe conservé
@Test func unAxeSansEcartAfficheUnTiretEtUneAccessibiliteSansComparaison() {
    let sans = SixQualites(
        axes: [AxeQualite(qualite: .seuil, maintenant: nil, reference: nil, ecartOriente: nil, ecartAffiche: nil, rayon: 0.5)],
        referencePremieresSemaines: true, Q: nil, Q0: nil
    )
    let seuil = ModeleNiveau.axes(sans)[0]
    #expect(seuil.ecart == "–")
    #expect(seuil.ton == .neutre)
    #expect(seuil.rayon == 0.5)
    #expect(seuil.accessibilite == "Seuil, pas encore de comparaison")
}

// MARK: - Géométrie

// 03 N1 : rayon 0,5 sur les six axes → hexagone régulier sur l'anneau du milieu ; premier sommet en haut
@Test func unRayonDeMilieuDonneUnHexagoneRegulierAvecLePremierSommetEnHaut() {
    let demi = ModeleNiveau.axes(SixQualites(
        axes: Qualite.allCases.map { AxeQualite(qualite: $0, maintenant: nil, reference: nil, ecartOriente: nil, ecartAffiche: nil, rayon: 0.5) },
        referencePremieresSemaines: false, Q: nil, Q0: nil
    ))
    let sommets = ModeleNiveau.sommets(demi, centre: CGPoint(x: 100, y: 100), rayon: 100)
    #expect(sommets.count == 6)
    #expect(abs(sommets[0].x - 100) < 1e-9 && abs(sommets[0].y - 50) < 1e-9)
    for sommet in sommets {
        let distance = hypot(sommet.x - 100, sommet.y - 100)
        #expect(abs(distance - 50) < 1e-9)
    }
    let cotes = sommets.indices.map { i -> Double in
        let suivant = sommets[(i + 1) % sommets.count]
        return hypot(suivant.x - sommets[i].x, suivant.y - sommets[i].y)
    }
    #expect(cotes.allSatisfy { abs($0 - 50) < 1e-9 })
}

// MARK: - Courses (N2)

private func course(_ date: DateCivile, _ distance: DistanceCourse, _ temps: Double, _ km: Double, vdot: Double,
                    test: Bool = false) -> LigneCourse {
    LigneCourse(
        cleSource: "\(date)-\(temps)", date: date, distance: distance, estTest: test,
        temps_s: temps, allure_skm: temps / km, vdot: vdot
    )
}

/// Sept courses et tests sur deux ans. Le 10 km du 6 avril (37:30) bat celui du 12 octobre (37:40) : c'est le record.
private let courses: [LigneCourse] = [
    course("2026-10-12", .dixKm, 2260, 10, vdot: 54.2),
    course("2026-09-14", .cinqKm, 1085, 5, vdot: 53.9, test: true),
    course("2026-06-21", .semi, 5070, 21.0975, vdot: 53.1),
    course("2026-04-06", .dixKm, 2250, 10, vdot: 53.4),
    course("2025-10-19", .marathon, 11140, 42.195, vdot: 51.6),
    course("2025-09-07", .cinqKm, 1120, 5, vdot: 52.1, test: true),
    course("2025-06-15", .dixKm, 2345, 10, vdot: 52.0),
]

private func ligne(_ groupes: [ModeleNiveau.Annee], _ date: String) -> ModeleNiveau.Ligne {
    groupes.flatMap(\.lignes).first { $0.id.hasPrefix(date) }!
}

// 04, « Courses » : groupées par année, la plus récente en haut
@Test func lesCoursesSontGroupeesParAnneeLaPlusRecenteEnHaut() {
    let groupes = ModeleNiveau.courses(courses, filtre: .toutes)
    #expect(groupes.map(\.annee) == [2026, 2025])
    #expect(groupes[0].lignes.count == 4)
    #expect(groupes[1].lignes.count == 3)
    #expect(groupes[0].lignes[0].date == "12 oct.")
}

// maquette (`coursesHTML`) : temps, allure, VDOT ; le titre d'un test porte « Test »
@Test func uneLigneDeCourseAfficheSonTitreSonTempsSonAllureEtSonVDOT() {
    let groupes = ModeleNiveau.courses(courses, filtre: .toutes)
    let dixKm = ligne(groupes, "2026-10-12")
    #expect(dixKm.titre == "10 km")
    #expect(dixKm.temps == "37:40")
    #expect(dixKm.allure == "3:46/km")
    #expect(dixKm.vdot == "54,2")

    let test = ligne(groupes, "2026-09-14")
    #expect(test.titre == "Test 5 km")
    #expect(test.temps == "18:05")
    #expect(test.allure == "3:37/km")
}

// point de décision 14 : le record est celui de P5, sur la course qui le détient (pas la plus récente)
@Test func lePillRecordVaSurLaCourseQuiDetientLeRecordDeSaDistance() {
    let groupes = ModeleNiveau.courses(courses, filtre: .toutes)
    #expect(ligne(groupes, "2026-04-06").record)
    #expect(!ligne(groupes, "2026-10-12").record)
    #expect(ligne(groupes, "2026-09-14").record)
    #expect(ligne(groupes, "2025-10-19").record)
    #expect(!ligne(groupes, "2025-09-07").record)
}

// point de décision 14 : sans 5 km, le 10 km et le marathon gardent leur record (P5 ne le lie pas au niveau)
@Test func sansCinqKmLeDixKmEtLeMarathonGardentLeurRecord() {
    let sansCinqKm = courses.filter { $0.distance != .cinqKm }
    let groupes = ModeleNiveau.courses(sansCinqKm, filtre: .toutes)
    #expect(ligne(groupes, "2026-04-06").record)
    #expect(ligne(groupes, "2025-10-19").record)
    #expect(!ligne(groupes, "2026-10-12").record)
}

// 02 « Filtre des courses », N2 : « 10 km » ne garde que .dixKm
@Test func leFiltreDixKmNeGardeQueLesCoursesDeDixKilometres() {
    let groupes = ModeleNiveau.courses(courses, filtre: .dixKm)
    let titres = groupes.flatMap(\.lignes).map(\.titre)
    #expect(titres == ["10 km", "10 km", "10 km"])
    #expect(groupes.map(\.annee) == [2026, 2025])
}

// 02 « Filtre des courses » : chaque filtre a son libellé, « Toutes » garde tout
@Test func lesFiltresOntLeurLibelleEtToutesGardeTout() {
    #expect(ModeleNiveau.FiltreCourses.allCases.map(\.libelle) == ["Toutes", "5 km", "10 km", "Semi", "Marathon"])
    #expect(ModeleNiveau.FiltreCourses.toutes.retient(.autre(km: 15)))
    #expect(!ModeleNiveau.FiltreCourses.marathon.retient(.semi))
}

// point de décision 9 : une distance hors catégorie s'affiche en kilomètres, avec sa virgule
@Test func uneDistanceAutreAfficheSesKilometres() {
    let autre = [course("2026-05-02", .autre(km: 15), 3600, 15, vdot: 50.0)]
    let groupes = ModeleNiveau.courses(autre, filtre: .toutes)
    #expect(groupes.flatMap(\.lignes).map(\.titre) == ["15 km"])
    #expect(ModeleNiveau.courses(autre, filtre: .dixKm).isEmpty)
}

// 04 / maquette : « 7 courses et tests » ; au singulier, « 1 course et test »
@Test func leTitreCompteLesCoursesEtTestsAvecLeBonAccord() {
    #expect(ModeleNiveau.titreCompte(courses) == "7 courses et tests")
    #expect(ModeleNiveau.titreCompte([courses[0]]) == "1 course et test")
    #expect(ModeleNiveau.titreCompte([]) == "0 courses et tests")
}

// MARK: - Courbe

// maquette (`coursesHTML`, sparkline) : un point par course, du plus ancien au plus récent ; référence = il y a un an
@Test func laCourbeDonneUnPointParCourseDuPlusAncienAuPlusRecent() {
    let courbe = ModeleNiveau.courbe(courses, ilYAUnAn: 52.1)
    #expect(courbe.points.count == 7)
    #expect(courbe.points.first?.date == "2025-06-15")
    #expect(courbe.points.last?.date == "2026-10-12")
    #expect(courbe.points.last?.vdot == 54.2)
    #expect(courbe.reference == 52.1)
}

// sans niveau il y a un an, la courbe n'a pas de référence
@Test func sansNiveauDUnAnLaCourbeNAPasDeReference() {
    #expect(ModeleNiveau.courbe(courses, ilYAUnAn: nil).reference == nil)
}
