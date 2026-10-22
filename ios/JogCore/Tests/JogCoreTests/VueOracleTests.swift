import Testing
@testable import JogCore

/// Dispatch des cas `vue` de l'oracle : `calculerVue` et `calculerVueBrute` reçoivent un objet (EntreeVue).
private func executerVue(_ cas: CasOracle) throws -> JSONValue {
    let entree = try argDecode(cas.entree, EntreeVue.self)
    switch cas.fn {
    case "calculerVue":
        return try JSONValue(encodant: try calculerVue(entree))
    case "calculerVueBrute":
        return try JSONValue(encodant: try calculerVueBrute(entree))
    default:
        throw ErreurHarnais("fonction inconnue dans vue : \(cas.fn)")
    }
}

@Test func oracleVue() throws {
    let differences = rejouer(module: "vue", executer: executerVue)
    #expect(differences.isEmpty, messageDifferences(differences))
}

/// Répartition des cas de l'oracle vue par fonction (30 calculerVue, 4 calculerVueBrute) : le total est couvert
/// par HarnaisOracle.
@Test func harnaisLitLesCasDeVueParFonction() throws {
    let cas = try chargerCasOracle("vue").cas
    #expect(cas.filter { $0.fn == "calculerVue" }.count == 30)
    #expect(cas.filter { $0.fn == "calculerVueBrute" }.count == 4)
}

/// Le cas « maquette 14 mois » rejoué à part : c'est aussi l'entrée du test de performance.
@Test func oracleVueMaquette14Mois() throws {
    let cas = try chargerCasOracle("vue").cas.first { $0.nom == "maquette 14 mois" }
    let trouve = try #require(cas)
    let differences = comparer(trouve.sortie ?? .null, try JSONValue(encodant: try calculerVue(try argDecode(trouve.entree, EntreeVue.self))))
    #expect(differences.isEmpty, messageDifferences(differences))
}
