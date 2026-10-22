// Outils partagés des séries, traduits de src/core/series/commun.ts. Fonctions pures, sans Date (ADR 0007).
import Foundation

/// Les jours doivent se suivre sans trou, du plus ancien au plus récent : les séries s'appuient sur l'indice d'un jour
/// pour trouver les jours qui le précèdent. Lève RangeError sinon.
func verifierContigus(_ jours: [JourAgrege]) throws {
    guard let premier = jours.first else { return }
    let debut = try numeroJour(premier.date)
    for (i, jour) in jours.enumerated() {
        if try numeroJour(jour.date) != debut + i {
            throw RangeError("jours non consécutifs à \(jour.date)")
        }
    }
}

/// Les fenêtres de ④ s'arrêtent à J−1 : la série doit finir à J−1 (ADR 0007). Lève RangeError sinon.
func verifierFinVeille(_ jours: [JourAgrege], _ J: DateCivile) throws {
    guard let dernier = jours.last else { return }
    if try numeroJour(dernier.date) != numeroJour(J) - 1 {
        throw RangeError("la série doit finir à J−1 (\(J))")
    }
}

/// Les séances groupées par numéro de jour, dans l'ordre reçu.
func seancesParJour(_ seances: [Seance]) throws -> [NumeroJour: [Seance]] {
    var parJour: [NumeroJour: [Seance]] = [:]
    for seance in seances {
        let n = try numeroJour(seance.date)
        parJour[n, default: []].append(seance)
    }
    return parJour
}

/// Jour de la semaine (lundi = 0 … dimanche = 6) d'un numéro de jour. Équivaut à jourDeSemaine(dateDepuisNumero(n)),
/// sans passer par la chaîne. 1970-01-01 est un jeudi.
func jourSemaineDuNumero(_ n: NumeroJour) -> Int {
    (((n + 3) % 7) + 7) % 7
}

/// Numéro du lundi de la semaine ISO qui contient le jour n.
func lundiDe(_ n: NumeroJour) -> NumeroJour {
    n - jourSemaineDuNumero(n)
}
