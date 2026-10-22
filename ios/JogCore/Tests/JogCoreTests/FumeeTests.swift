import Testing
@testable import JogCore

@Test func versionDuMoteurEstDisponible() {
    #expect(versionMoteur == "0")
}

@Test(.enabled(if: !modulesOracleDisponibles().isEmpty, "Aucun cas doré dans Tests/Oracle"))
func chargementDUnModuleOracle() throws {
    let module = try #require(modulesOracleDisponibles().first)
    let fichier = try chargerOracle(module)
    #expect(fichier.module == module)
    #expect(!fichier.cas.isEmpty)
}
