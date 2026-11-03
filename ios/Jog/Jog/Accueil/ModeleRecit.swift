// Récit de l'écran Séance (S3, D-034) : surtitre, chiffre héros et phrase, selon le type. Aucun import SwiftUI : se teste
// sans interface. La phrase est en Markdown, les valeurs en gras.
import Foundation
import JogCore

enum ModeleRecit {
    struct Recit: Equatable {
        let surtitre: String
        let heros: String
        let unite: String?
        let phrase: String
    }

    /// Famille de mise en page de S3 : la séance qualité suit le sous-seuil, le test suit la course.
    enum Famille { case footing, repetitions, course, sortieLongue }

    static func famille(_ t: TypeSeance) -> Famille {
        switch t {
        case .footing, .footingLignesDroites: .footing
        case .sousSeuil, .seanceQualite: .repetitions
        case .course, .test: .course
        case .sortieLongue: .sortieLongue
        }
    }

    static func libelle(_ t: TypeSeance) -> String {
        switch t {
        case .footing, .footingLignesDroites: "Footing"
        case .sousSeuil: "Sous-seuil"
        case .seanceQualite: "Séance qualité"
        case .course: "Course"
        case .test: "Test"
        case .sortieLongue: "Sortie longue"
        }
    }

    /// `niveau` : VDOT de la veille (D-027), pour l'écart d'une course. `moities` : temps (s) des deux moitiés.
    static func recit(_ s: SeanceVue, _ p: ParamsDates, niveau: Double?, moities: (s1: Double, s2: Double)?) -> Recit {
        let km = nombre(s.km, 1)
        let course = famille(s.type) == .course
        let distance = course ? s.distanceRef_km.map { " · \(nombre($0, $0 < 10 ? 1 : 0)) km" } ?? "" : ""
        let surtitre = "\(libelle(s.type))\(distance) · \(formatJourDate(s.date))"
        let duree = "**\(ModeleSeances.duree(s.duree_min))**"
        let allure = s.allureMoy_skm.map { " à **\(formatAllure($0))/km**" } ?? ""

        switch famille(s.type) {
        case .footing:
            var phrase = "En \(duree)\(allure)"
            if let fc = s.fcMoy, fc.isFinite {
                let d = Int((p.easyCap - fc).rounded())
                phrase += ", **\(Int(fc.rounded())) bpm** de moyenne : "
                phrase += d >= 0 ? "**\(d) bpm sous ton plafond** facile" : "**\(-d) bpm au-dessus de ton plafond** facile"
            }
            return Recit(surtitre: surtitre, heros: km, unite: "km", phrase: phrase + ".")

        case .repetitions:
            let reps = s.repetitions
            let n = reps.count
            let heros = s.format ?? "\(n) rép."
            let allures = reps.map(\.allure_skm).filter { $0.isFinite && $0 > 0 }
            guard !allures.isEmpty else { return Recit(surtitre: surtitre, heros: heros, unite: nil, phrase: "En \(duree).") }
            var phrase = "Répétitions à **\(formatAllure(allures.reduce(0, +) / Double(allures.count)))/km**."
            let bande = p.subtHrLo...p.subtHrHi
            let fins = reps.filter { $0.fcFin.isFinite }.map { (Int($0.n), $0.fcFin) }
            if !fins.isEmpty {
                let dans = fins.filter { bande.contains($0.1) }.count
                phrase += " **\(dans) sur \(fins.count)** dans la bande"
                if let (rep, fc) = fins.first(where: { !bande.contains($0.1) }) {
                    phrase += " ; R\(rep) finit à **\(Int(fc.rounded())) bpm**, \(fc > p.subtHrHi ? "au-dessus" : "en dessous") de la bande"
                }
                phrase += "."
            }
            return Recit(surtitre: surtitre, heros: heros, unite: nil, phrase: phrase)

        case .course:
            let temps = s.temps_s ?? s.duree_min * 60
            var phrase = "Soit" + allure.dropFirst(2)
            if let km = s.distanceRef_km, let v = vdot(distance_m: km * 1000, temps_min: temps / 60) {
                phrase += " et un VDOT de **\(nombre(v, 1))**"
                if let niveau {
                    let e = v - niveau
                    phrase += e >= 0 ? ", **+\(nombre(e, 1))** au-dessus de ton niveau" : ", **\(nombre(-e, 1))** sous ton niveau"
                }
            }
            phrase += "."
            if let m = moities, abs(m.s1 - m.s2) >= 1 {
                phrase += " Seconde moitié **\(formatAllure(abs(m.s1 - m.s2)))** plus \(m.s2 < m.s1 ? "rapide" : "lente")."
            }
            return Recit(surtitre: surtitre, heros: formatTempsCourse(temps), unite: nil, phrase: phrase)

        case .sortieLongue:
            var phrase = "En \(duree)\(allure)."
            if let d = s.decouplage?.valeur {
                phrase += " Ta FC a dérivé de **\(nombre(d, 1)) %** sur la seconde moitié"
                if let dp = s.dPlus_m, dp > 0 { phrase += ", avec **\(Int(dp)) m** de montée" }
                phrase += "."
            }
            return Recit(surtitre: surtitre, heros: km, unite: "km", phrase: phrase)
        }
    }

    /// Équivalences Riegel depuis la course affichée (04, « Moitiés de course ») vers les autres distances standard.
    static func equivalences(km: Double, temps_s: Double) -> [(String, String)] {
        [(5.0, "5 km"), (10, "10 km"), (21.0975, "Semi"), (42.195, "Marathon")]
            .filter { abs($0.0 - km) / $0.0 > 0.03 }
            .map { ($0.1, formatTempsCourse(tempsRiegel(temps_s, km, $0.0))) }
    }

    static func nombre(_ v: Double, _ d: Int) -> String { ModeleApercu.nombre(v, d) }
}
