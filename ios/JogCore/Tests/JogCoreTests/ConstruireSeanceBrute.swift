import Foundation
@testable import JogCore

// Séances brutes HealthKit construites par code pour les tests de l'adaptateur (ADR 0010) : valeurs inventées, sans
// aucune donnée réelle, et sans coordonnée (jamais décodée). Le JSON reproduit celui du spike ; il est décodé par le
// décodeur de l'export, pour passer par le chemin de décodage réel.

/// Date ISO 8601 (avec ou sans millisecondes ni deux-points dans le décalage), pour les tests.
func dateTest(_ texte: String) -> Date {
    try! Date(texte, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true, timeZone: .current))
}

/// Séance de test, décrite en secondes depuis son début. Les champs non renseignés donnent un footing de 20 min sans
/// événement, avec la métadonnée de fuseau de Paris.
struct ConstructeurSeance {
    var id = "7D1E1FAC-0000-4000-8000-000000000001"
    var debut = dateTest("2026-07-03T07:07:27+0200")
    /// Durée écoulée, pauses comprises. La durée en mouvement vaut cette durée moins les pauses, sauf si elle est fixée.
    var dureeEcoulee: Double = 1200
    var dureeMouvement: Double?
    var bundle: String? = "com.apple.health.7D1E1FAC-B565-45D1-9D90-C0C92AA39647"
    var activityType = 37
    var fuseau: String? = "Europe/Paris"
    var indoor = false
    var nomMarque: String?
    /// Pauses (type 1), chacune reprise à sa fin (type 2) ; une fin égale à la durée écoulée n'est pas reprise.
    var pauses: [(debut: Double, fin: Double)] = []
    /// Segments automatiques au km ou au mile (type 7), qui se chevauchent.
    var segments: [(debut: Double, fin: Double)] = []
    /// Tours manuels (type 3).
    var tours: [(debut: Double, fin: Double)] = []
    var fc: [(t: Double, bpm: Double)] = []
    var distances: [(debut: Double, fin: Double, metres: Double)] = []
    var points: [(t: Double, altitude: Double, vitesse: Double, precisionVerticale: Double)] = []
    /// Étapes d'un entraînement personnalisé : clé « bloc.itération.étape », début et fin.
    var etapes: [(cle: String, debut: Double, fin: Double)] = []
    /// Remplace des clés de l'export (champs d'erreur du spike, par exemple).
    var surcharge: [String: Any] = [:]

    /// Séance brute décodée par le décodeur de l'export.
    func brute() throws -> SeanceBrute {
        let donnees = try JSONSerialization.data(withJSONObject: json())
        return try decodeurSeanceBrute().decode(SeanceBrute.self, from: donnees)
    }

    private func iso(_ secondes: Double) -> String {
        Date(timeIntervalSince1970: debut.timeIntervalSince1970 + secondes)
            .formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true, timeZone: TimeZone(identifier: "Europe/Paris")!))
    }

    private var pausesTotales: Double {
        pauses.reduce(0) { $0 + (min($1.fin, dureeEcoulee) - $1.debut) }
    }

    private func json() -> [String: Any] {
        var metadonnees: [String: Any] = ["HKIndoorWorkout": indoor ? "1" : "0", "HKAverageMETs": "9.1 kcal/hr·kg"]
        if let fuseau { metadonnees["HKTimeZone"] = fuseau }
        if let nomMarque { metadonnees["HKWorkoutBrandName"] = nomMarque }

        var evenements: [[String: Any]] = []
        for pause in pauses {
            evenements.append(evenement(1, pause.debut, pause.debut))
            if pause.fin < dureeEcoulee { evenements.append(evenement(2, pause.fin, pause.fin)) }
        }
        evenements += segments.map { evenement(7, $0.debut, $0.fin) }
        evenements += tours.map { evenement(3, $0.debut, $0.fin) }

        var racine: [String: Any] = [
            "id": id,
            "debut": iso(0),
            "fin": iso(dureeEcoulee),
            "dureeSecondes": dureeMouvement ?? (dureeEcoulee - pausesTotales),
            "activityType": activityType,
            "device": ["nom": "Apple Watch", "fabricant": "Apple Inc.", "modele": "Watch"],
            "metadata": metadonnees,
            "totaux": ["distanceMetres": distances.reduce(0) { $0 + $1.metres }, "energieActiveKilocalories": 0],
            "frequenceCardiaque": fc.map { mesure -> [String: Any] in
                ["uuid": UUID().uuidString, "debut": iso(mesure.t), "fin": iso(mesure.t), "bpm": mesure.bpm,
                 "metadata": ["HKMetadataKeyHeartRateMotionContext": "0"]]
            },
            "distanceEchantillonsFins": distances.map { ["debut": iso($0.debut), "fin": iso($0.fin), "metres": $0.metres] },
            "traces": points.isEmpty ? NSNull() : [[
                "uuid": UUID().uuidString, "debut": iso(0), "fin": iso(dureeEcoulee), "metadata": NSNull(),
                "points": points.map { point -> [String: Any] in
                    ["timestamp": iso(point.t), "altitude": point.altitude, "vitesse": point.vitesse,
                     "precisionHorizontale": 5.0, "precisionVerticale": point.precisionVerticale]
                },
            ]],
            "workoutEvents": evenements,
            "workoutActivities": etapes.map { etape -> [String: Any] in
                [
                    "uuid": UUID().uuidString, "debut": iso(etape.debut), "fin": iso(etape.fin),
                    "metadata": ["WOIntervalStepKeyPath": etape.cle, "WOIntervalStepSuccessful": "1"],
                    "workoutConfiguration": ["activityType": 37, "locationType": 3],
                    "workoutEvents": [] as [Any], "statistiques": [:] as [String: Any],
                ]
            },
            "statistiques": [:] as [String: Any],
        ]
        racine["sourceRevision"] = ["nom": "Julien’s Apple Watch", "bundleId": bundle ?? "", "version": "27.0.1"]
        for (cle, valeur) in surcharge { racine[cle] = valeur }
        return racine
    }

    private func evenement(_ type: Int, _ debut: Double, _ fin: Double) -> [String: Any] {
        ["type": type, "debut": iso(debut), "fin": iso(fin),
         "dateInterval": ["debut": iso(debut), "fin": iso(fin)], "metadata": [:] as [String: Any]]
    }
}

/// Échantillons de distance et de FC d'un tronçon à allure et FC constantes, dans [debut, fin[.
/// Renvoie les distances (un échantillon toutes les 2,5 s) et les FC (une mesure toutes les 5 s).
func echantillonsTroncon(
    debut: Double, fin: Double, vitesse: Double, fc: Double?
) -> (distances: [(debut: Double, fin: Double, metres: Double)], fc: [(t: Double, bpm: Double)]) {
    var distances: [(debut: Double, fin: Double, metres: Double)] = []
    var t = debut
    while t < fin {
        let suivant = min(t + 2.5, fin)
        distances.append((t, suivant, vitesse * (suivant - t)))
        t += 2.5
    }
    var mesures: [(t: Double, bpm: Double)] = []
    if let fc {
        var u = debut
        while u < fin {
            mesures.append((u, fc))
            u += 5
        }
    }
    return (distances, mesures)
}
