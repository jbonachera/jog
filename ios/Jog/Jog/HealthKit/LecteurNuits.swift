// Lecture des nuits pour la récupération (D-023 ; docs/implementation/recuperation.md, lot 8). Implémente `SourceNuits`,
// le protocole que `SynchroniseurNuits` (JogCore) consomme. Chaque requête est bornée par la plage demandée ; seules des
// valeurs de JogCore sortent d'ici, aucun type HealthKit ne quitte l'acteur.
import Foundation
import HealthKit
import JogCore

extension LecteurHealthKit: SourceNuits {
    /// Sommeil par échantillon (phase, source, appareil). La source est le bundle de l'app émettrice.
    public func echantillonsSommeil(du debut: Date, au fin: Date) async throws -> [EchantillonSommeilBrut] {
        let predicat = HKQuery.predicateForSamples(withStart: debut, end: fin)
        let echantillons = try await HKSampleQueryDescriptor(
            predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis), predicate: predicat)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        ).result(for: store)
        return echantillons.map {
            EchantillonSommeilBrut(
                debut: $0.startDate,
                fin: $0.endDate,
                valeur: $0.value,
                source: $0.sourceRevision.source.bundleIdentifier,
                appareil: $0.sourceRevision.productType
            )
        }
    }

    /// VFC (SDNN) en millisecondes.
    public func mesuresVFC(du debut: Date, au fin: Date) async throws -> [MesureNocturneBrute] {
        try await mesures(.heartRateVariabilitySDNN, unite: .secondUnit(with: .milli), du: debut, au: fin)
    }

    /// Fréquence respiratoire en respirations par minute.
    public func mesuresRespiration(du debut: Date, au fin: Date) async throws -> [MesureNocturneBrute] {
        try await mesures(.respiratoryRate, unite: .count().unitDivided(by: .minute()), du: debut, au: fin)
    }

    /// FC moyenne d'une session, par une seule requête statistique sur la plage exacte de la session (pas de FC sur
    /// la plage entière). nil s'il n'y a aucune mesure.
    public func fcMoyenne(du debut: Date, au fin: Date) async throws -> Double? {
        let predicat = HKQuery.predicateForSamples(withStart: debut, end: fin, options: .strictStartDate)
        let statistique = try await HKStatisticsQueryDescriptor(
            predicate: .quantitySample(type: HKQuantityType(.heartRate), predicate: predicat),
            options: .discreteAverage
        ).result(for: store)
        return statistique?.averageQuantity()?.doubleValue(for: .count().unitDivided(by: .minute()))
    }

    private func mesures(
        _ identifiant: HKQuantityTypeIdentifier, unite: HKUnit, du debut: Date, au fin: Date
    ) async throws -> [MesureNocturneBrute] {
        let predicat = HKQuery.predicateForSamples(withStart: debut, end: fin)
        let echantillons = try await HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(identifiant), predicate: predicat)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        ).result(for: store)
        return echantillons.map {
            MesureNocturneBrute(instant: $0.startDate, valeur: $0.quantity.doubleValue(for: unite))
        }
    }
}
