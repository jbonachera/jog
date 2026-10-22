import Foundation
import Testing
@testable import JogCore

// Test de performance de `calculerVue` (PERFORMANCE, lot 1E). Désactivé par défaut : il ne tourne que si JOG_PERF=1.
// Lancement, en release : JOG_PERF=1 swift test -c release --disable-sandbox --scratch-path /tmp/jogcore-E --filter mesure
// L'entrée est le cas doré « maquette 14 mois » (Tests/Oracle/vue.json). 3 itérations d'échauffement, puis 20 mesurées.

/// Durée d'un `Duration`, en millisecondes.
private func millisecondes(_ duree: Duration) -> Double {
    Double(duree.components.seconds) * 1_000 + Double(duree.components.attoseconds) * 1e-15
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["JOG_PERF"] == "1"))
func mesureCalculerVue() throws {
    let cas = try #require(try chargerCasOracle("vue").cas.first { $0.nom == "maquette 14 mois" })
    let entree = try argDecode(cas.entree, EntreeVue.self)

    for _ in 0..<3 {
        _ = try calculerVue(entree)
    }
    let debut = ContinuousClock.now
    for _ in 0..<20 {
        _ = try calculerVue(entree)
    }
    let moyenne = millisecondes(ContinuousClock.now - debut) / 20
    print(String(format: "calculerVue (maquette 14 mois, moyenne sur 20 itérations) : %.3f ms", moyenne))
}
