import Foundation
import Testing
@testable import JogCore

// Évaluation de l'estimation des répétitions (D-021) sur des références réelles, tours retirés. Sur le modèle de
// `npm run verif:reel` : ignoré sans variable d'environnement, aucune donnée dans le dépôt, des agrégats seulement.
//
// Lancement (le dossier est celui de local-data/reference : index.json et <n>.json, ignorés par git) :
//   cd ios/JogCore && JOG_REEL_REFERENCE=/chemin/reference swift test -c release --disable-sandbox \
//     --scratch-path /tmp/jogcore-V --filter EvaluationReelleTests
// Variable facultative JOG_REGLAGES="cle=valeur,cle=valeur" : remplace des constantes de ReglagesEstimation.defaut
// (noms des champs), pour essayer un réglage sans recompiler.
//
// Populations. Qualité : références « sous-seuil » dont les répétitions viennent des tours. Footing : « footing » et
// « footing-lignes-droites » (sans répétition de référence). Les autres types sont rapportés à part. Une séance est
// classée qualité si le détecteur trouve au moins deux blocs. Apprentissage = index pair, validation = index impair.

private let dossierReference: String? = ProcessInfo.processInfo.environment["JOG_REEL_REFERENCE"]

struct RepetitionReference: Decodable {
    var debut_s: Double
    var duree_s: Double
}

struct ReferenceReelle: Decodable {
    var index: Int
    var type: String
    var cheminRepetitions: String
    var dateLocale: String
    var flux: Flux
    var repetitionsReference: [RepetitionReference]
}

/// Séance de référence mise en forme, avec ses tours retirés (HealthKit, autre app que Exercice).
struct ReferencePreparee {
    let index: Int
    let type: String
    let grille: GrilleSeance
    let params: ParamsDates
    let reference: [(debut: Double, fin: Double)]
    let pivot: ActivitePivot
}

/// Blocs de référence : les répétitions séparées de moins de 30 s (tours enchaînés d'un même effort continu) sont
/// fusionnées, parce que la FC ne peut pas les distinguer.
func blocsDeReference(_ reps: [RepetitionReference]) -> [(debut: Double, fin: Double)] {
    var blocs: [(debut: Double, fin: Double)] = []
    for r in reps.sorted(by: { $0.debut_s < $1.debut_s }) {
        if let dernier = blocs.last, r.debut_s - dernier.fin < 30 {
            blocs[blocs.count - 1].fin = max(dernier.fin, r.debut_s + r.duree_s)
        } else {
            blocs.append((r.debut_s, r.debut_s + r.duree_s))
        }
    }
    return blocs
}

func chargerReferences(_ dossier: String) throws -> [ReferencePreparee] {
    let parametres = try indexerParametres(parametresDefaut())
    let index = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: dossier + "/index.json")))
    let numeros = (index as? [[String: Any]] ?? []).compactMap { $0["index"] as? Int }.sorted()
    var resultat: [ReferencePreparee] = []
    for numero in numeros {
        let donnees = try Data(contentsOf: URL(fileURLWithPath: dossier + "/\(numero).json"))
        let ref = try JSONDecoder().decode(ReferenceReelle.self, from: donnees)
        // Les références de type « sous-seuil » dont la vérité ne vient pas des tours ne servent pas à la mesure.
        let type = ref.type == "sous-seuil" && ref.cheminRepetitions != "tours" ? "sous-seuil-flux" : ref.type
        let pivot = ActivitePivot(
            cleSource: "reel:\(numero)", source: .healthkit, versionAdaptateur: "1.0.0", empreinteBrute: "reel",
            debutUtc: 0, decalageLocal_min: 0, dateLocale: ref.dateLocale,
            duree_s: Double(ref.flux.t_s.last ?? 0), distance_m: Double(ref.flux.dist_m.last ?? 0), nom: nil,
            competition: false, sousType: .route, pasFC_s: 1, flux: ref.flux, tours: [],
            appSource: "net.workoutdoors.workoutdoors"
        )
        resultat.append(ReferencePreparee(
            index: numero, type: type, grille: try miseEnForme(pivot), params: parametres.auJour(ref.dateLocale),
            reference: blocsDeReference(ref.repetitionsReference), pivot: pivot
        ))
    }
    return resultat
}

/// Réglages par défaut, remplacés par JOG_REGLAGES s'il est donné.
func reglagesDeLEnvironnement() -> ReglagesEstimation {
    var r = ReglagesEstimation.defaut
    let texte = ProcessInfo.processInfo.environment["JOG_REGLAGES"] ?? ""
    for paire in texte.split(separator: ",") {
        let morceaux = paire.split(separator: "=")
        guard morceaux.count == 2, let v = Double(morceaux[1]) else { continue }
        switch morceaux[0] {
        case "decalageFc_s": r.decalageFc_s = v
        case "percentileRecuperation": r.percentileRecuperation = v
        case "percentilePic": r.percentilePic = v
        case "margeFc_bpm": r.margeFc_bpm = v
        case "vitesseActive_ms": r.vitesseActive_ms = v
        case "dureeMinBloc_s": r.dureeMinBloc_s = v
        case "trouMax_s": r.trouMax_s = v
        case "ecartDureeMax": r.ecartDureeMax = v
        case "recupMin_s": r.recupMin_s = v
        case "retourFcMin_bpm": r.retourFcMin_bpm = v
        case "fenetreBords_s": r.fenetreBords_s = v
        case "demiFenetreRupture_s": r.demiFenetreRupture_s = v
        case "penteCote": r.penteCote = v
        case "recupMaxRelative": r.recupMaxRelative = v
        case "regulariteBlocs": r.regulariteBlocs = v
        case "nbBlocsReguliers": r.nbBlocsReguliers = Int(v)
        case "blocsParVitesse": r.blocsParVitesse = v != 0
        case "secoursEnCote": r.secoursEnCote = v != 0
        case "lissageVitesse_s": r.lissageVitesse_s = v
        case "percentileVitesseBas": r.percentileVitesseBas = v
        case "percentileVitesseHaut": r.percentileVitesseHaut = v
        case "ecartVitesseMin_ms": r.ecartVitesseMin_ms = v
        case "contrasteFcMin_bpm": r.contrasteFcMin_bpm = v
        default: break
        }
    }
    return r
}

/// Agrégats d'une population.
struct MesureEstimation {
    var seances = 0
    var classeesQualite = 0
    var referencesTotal = 0
    var referencesRetrouvees = 0
    var blocsDetectes = 0
    var blocsInventes = 0
    var ecartsDebut: [Double] = []
    var ecartsFin: [Double] = []

    var tauxQualite: Double { seances == 0 ? .nan : Double(classeesQualite) / Double(seances) }
    var tauxRetrouvees: Double { referencesTotal == 0 ? .nan : Double(referencesRetrouvees) / Double(referencesTotal) }
    var ecartDebutMedian: Double { medianeEstim(ecartsDebut) }
    var ecartFinMedian: Double { medianeEstim(ecartsFin) }
}

private func medianeEstim(_ v: [Double]) -> Double {
    if v.isEmpty { return .nan }
    let t = v.sorted()
    return t.count % 2 == 1 ? t[t.count / 2] : (t[t.count / 2 - 1] + t[t.count / 2]) / 2
}

/// MesureEstimation du détecteur sur un ensemble de références.
func mesurerEstimation(_ refs: [ReferencePreparee], _ r: ReglagesEstimation) -> MesureEstimation {
    var m = MesureEstimation()
    for ref in refs {
        let g = ref.grille
        let plages = estimerRepetitions(g, ref.params, r)
        let blocs = plages.map { (debut: g.t_s[$0.a], fin: g.t_s[$0.b] + g.dt_s[$0.b]) }
        m.seances += 1
        if blocs.count >= 2 { m.classeesQualite += 1 }
        m.blocsDetectes += blocs.count
        m.referencesTotal += ref.reference.count

        // Appariement glouton par recouvrement, au moins la moitié de la plus courte des deux plages.
        var paires: [(Double, Int, Int)] = []
        for (k, b) in blocs.enumerated() {
            for (j, v) in ref.reference.enumerated() {
                let recouvrement = min(b.fin, v.fin) - max(b.debut, v.debut)
                let part = recouvrement / max(1, min(b.fin - b.debut, v.fin - v.debut))
                if part >= 0.5 { paires.append((part, k, j)) }
            }
        }
        paires.sort { $0.0 > $1.0 }
        var blocPris = Set<Int>()
        var referencePrise = Set<Int>()
        for (_, k, j) in paires where !blocPris.contains(k) && !referencePrise.contains(j) {
            blocPris.insert(k)
            referencePrise.insert(j)
            m.ecartsDebut.append(abs(blocs[k].debut - ref.reference[j].debut))
            m.ecartsFin.append(abs(blocs[k].fin - ref.reference[j].fin))
        }
        m.referencesRetrouvees += referencePrise.count
        m.blocsInventes += blocs.count - blocPris.count
    }
    return m
}

func populationsEstimation(_ refs: [ReferencePreparee]) -> (qualite: [ReferencePreparee], footing: [ReferencePreparee]) {
    // Qualité : les séances dont la vérité est faite de deux blocs au moins séparés par une récupération (fractionné).
    // Les séances « sous-seuil » dont tous les tours s'enchaînent (effort continu, un seul bloc) sont rapportées à part.
    (refs.filter { $0.type == "sous-seuil" && $0.reference.count >= 2 },
     refs.filter { $0.type == "footing" || $0.type == "footing-lignes-droites" })
}

private func pctEstim(_ x: Double) -> String { x.isNaN ? "n/a" : String(format: "%.1f %%", x * 100) }
private func secEstim(_ x: Double) -> String { x.isNaN ? "n/a" : String(format: "%.1f s", x) }

func rapportEstimation(_ nom: String, _ refs: [ReferencePreparee], _ r: ReglagesEstimation) -> (qualite: MesureEstimation, footing: MesureEstimation) {
    let (q, f) = populationsEstimation(refs)
    let mq = mesurerEstimation(q, r)
    let mf = mesurerEstimation(f, r)
    print("[\(nom)] qualité n=\(mq.seances) : bien classées \(pctEstim(mq.tauxQualite)) ; répétitions retrouvées "
        + "\(mq.referencesRetrouvees)/\(mq.referencesTotal) (\(pctEstim(mq.tauxRetrouvees))) ; inventées \(mq.blocsInventes) "
        + "sur \(mq.blocsDetectes) blocs ; écart médian début \(secEstim(mq.ecartDebutMedian)), fin \(secEstim(mq.ecartFinMedian))")
    print("[\(nom)] footing n=\(mf.seances) : classés qualité à tort \(pctEstim(mf.tauxQualite)) ; blocs inventés \(mf.blocsInventes)")
    return (mq, mf)
}

@Test(.enabled(if: dossierReference != nil))
func evaluationReelleDeLEstimation() throws {
    let refs = try chargerReferences(dossierReference ?? "")
    let r = reglagesDeLEnvironnement()
    let (q, f) = populationsEstimation(refs)
    print("[tailles] qualité \(q.count), footing \(f.count), total \(refs.count)")

    var autres: [String: [ReferencePreparee]] = [:]
    for ref in refs where !(q + f).contains(where: { $0.index == ref.index }) {
        autres[ref.type == "sous-seuil" ? "sous-seuil-continu" : ref.type, default: []].append(ref)
    }
    for (type, liste) in autres.sorted(by: { $0.key < $1.key }) {
        let m = mesurerEstimation(liste, r)
        print("[autres] \(type) n=\(m.seances) : classées qualité \(pctEstim(m.tauxQualite))")
    }

    let apprentissage = refs.filter { $0.index % 2 == 0 }
    let validation = refs.filter { $0.index % 2 == 1 }
    _ = rapportEstimation("apprentissage", apprentissage, r)
    let v = rapportEstimation("validation", validation, r)
    let t = rapportEstimation("total", refs, r)

    // Cohérence avec la chaîne complète : calculerSeanceIntrinseque classe comme le détecteur seul.
    var ecarts = 0
    for ref in q + f {
        let s = try calculerSeanceIntrinseque(ref.pivot, ref.params)
        let direct = estimerRepetitions(ref.grille, ref.params, r).count >= 2
        if r == .defaut && (s.repetitions.count >= 2) != direct { ecarts += 1 }
    }
    print("[chaîne] écarts entre calculerSeanceIntrinseque et le détecteur seul : \(ecarts)")

    #expect(v.qualite.tauxQualite >= 0.90, "séances qualité bien classées (validation)")
    #expect(v.footing.tauxQualite < 0.05, "footings classés qualité à tort (validation)")
    #expect(t.qualite.tauxQualite >= 0.90)
    #expect(t.footing.tauxQualite < 0.05)
}
