// D-034 · Récit de l'écran Séance : héros et phrase selon le type (03 S3).
import Testing
@testable import JogCore
@testable import Jog

private let p = ParamsDates(
    hrMax: 190, hrRest: 50, z1: 60, z2: 78, z3: 85, z4: 92, lt2Hr: 172, lt2Pace: 240, easyCap: 142, subtHrLo: 155, subtHrHi: 163
)

private func seance(
    _ type: TypeSeance, km: Double = 8.2, dureeMin: Double = 47, allure: Double? = 348, fcMoy: Double? = nil,
    repetitions: [Repetition] = [], format: String? = nil, distance: Double? = nil, temps: Double? = nil
) -> SeanceVue {
    SeanceVue(seance: Seance(
        intrinseque: SeanceIntrinseque(
            cleSource: "s", date: "2026-11-04", debutUtc: 0, nom: nil, marquage: .aucun, duree_min: dureeMin, km: km,
            fcMoy: fcMoy, allureMoy_skm: allure, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: 0, mp_min: 0,
            segmentsMp: [], repetitions: repetitions, format: format, recup_s: nil, ef: nil, fcPic: nil, decouplage: nil,
            lignesDroites: false, distanceRef_km: distance, temps_s: temps
        ),
        type: type
    ))
}

@Test func d034FootingHerosDistanceEtEcartAuPlafond() {
    let r = ModeleRecit.recit(seance(.footing, fcMoy: 136), p, niveau: nil, moities: nil)
    #expect(r.surtitre == "Footing · mer. 4 nov.")
    #expect(r.heros == "8,2" && r.unite == "km")
    #expect(r.phrase == "En **47 min** à **5:48/km**, **136 bpm** de moyenne : **6 bpm sous ton plafond** facile.")
}

@Test func d034SousSeuilNommeLaRepetitionHorsBande() {
    let reps = [158.0, 160, 161, 163, 166].enumerated().map {
        Repetition(n: Double($0.offset + 1), debut_s: 0, duree_s: 480, allure_skm: 263, fcFin: $0.element)
    }
    let r = ModeleRecit.recit(seance(.sousSeuil, repetitions: reps, format: "5×8′"), p, niveau: nil, moities: nil)
    #expect(r.heros == "5×8′")
    #expect(r.phrase == "Répétitions à **4:23/km**. **4 sur 5** dans la bande ; R5 finit à **166 bpm**, au-dessus de la bande.")
}

@Test func d034CourseHerosTempsEtSecondeMoitie() {
    let s = seance(.course, km: 10, allure: 251.2, distance: 10, temps: 2512)
    let r = ModeleRecit.recit(s, p, niveau: nil, moities: (1270, 1242))
    #expect(r.heros == formatTempsCourse(2512))
    #expect(r.surtitre.hasPrefix("Course · 10 km · "))
    #expect(r.phrase.hasSuffix("Seconde moitié **0:28** plus rapide."))
}

@Test func d034EquivalencesSansLaDistanceCourue() {
    let e = ModeleRecit.equivalences(km: 10, temps_s: 2512).map(\.0)
    #expect(e == ["5 km", "Semi", "Marathon"])
}
