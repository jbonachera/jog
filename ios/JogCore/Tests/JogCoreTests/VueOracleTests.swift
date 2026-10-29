import Testing
@testable import JogCore

/// Format des goldens `vue` : figé à 5 par le moteur TypeScript (D-019). Le moteur Swift produit FORMAT_VUE (6, D-023) ;
/// la sortie est ramenée à ce format avant comparaison. Les JSON de l'oracle ne changent pas, et le format 6 est testé
/// dans RecuperationVueTests.
private let FORMAT_VUE_DES_GOLDENS = 5

private func auFormatDesGoldens(_ valeur: JSONValue) -> JSONValue {
    guard case var .object(champs) = valeur, champs["formatVersion"] != nil else { return valeur }
    champs["formatVersion"] = .number(Double(FORMAT_VUE_DES_GOLDENS))
    return .object(champs)
}

/// Dispatch des cas `vue` de l'oracle : `calculerVue` et `calculerVueBrute` reçoivent un objet (EntreeVue).
private func executerVue(_ cas: CasOracle) throws -> JSONValue {
    let entree = try argDecode(cas.entree, EntreeVue.self)
    switch cas.fn {
    case "calculerVue":
        return auFormatDesGoldens(try JSONValue(encodant: try calculerVue(entree)))
    case "calculerVueBrute":
        return auFormatDesGoldens(try JSONValue(encodant: try calculerVueBrute(entree)))
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
    let sortie = auFormatDesGoldens(try JSONValue(encodant: try calculerVue(try argDecode(trouve.entree, EntreeVue.self))))
    let differences = comparer(trouve.sortie ?? .null, sortie)
    #expect(differences.isEmpty, messageDifferences(differences))
}
