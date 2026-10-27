// Adaptateur HealthKit, partie pure (migration-ios, source ; ADR 0003, 0007 ; contrats.md). Transforme une séance brute
// (SeanceBrute) en ActivitePivot. Aucun import de HealthKit : la lecture de HealthKit est dans l'app (sous-lot 2b).
//
// Conventions du pivot, comme pour FIT, GPX et TCX : grille à 1 s de la durée écoulée, pauses absentes de la grille
// (un trou, comme la Pause de construire.ts), FC à 1 s avec NaN entre les mesures, duree_s = temps en mouvement.
import CryptoKit
import Foundation

/// Version de cet adaptateur, dans le pivot (ADR 0003).
public let VERSION_ADAPTATEUR_HEALTHKIT = "healthkit-1.0.0"

/// HKWorkoutActivityType de la course à pied.
private let TYPE_ACTIVITE_COURSE = 37
/// HKWorkoutEventType utilisés : pause, reprise, tour, segment.
private let EVENEMENT_PAUSE = 1
private let EVENEMENT_REPRISE = 2
private let EVENEMENT_TOUR = 3
private let EVENEMENT_SEGMENT = 7
/// Un échantillon de distance d'au plus ce temps est « fin » ; au-delà, c'est un résumé qui recouvre des fins.
/// Sur l'export réel, les fins durent 2,5 s (jusqu'à 18 s près des pauses), les résumés environ 600 s (le plus court
/// observé : 208 s). Tout seuil entre 18 et 200 s les sépare ; 30 s laisse une marge.
private let DUREE_ECHANTILLON_FIN_MAX_S = 30.0
/// Bornes de plausibilité de la FC, en bpm (contrats.md, D5).
private let FC_MIN_PLAUSIBLE = 30.0
private let FC_MAX_PLAUSIBLE = 250.0

/// Séance que l'adaptateur refuse : durée nulle, dates incohérentes.
public struct ErreurSeanceHealthKit: Error, Sendable, Equatable {
    public let id: String
    public let detail: String

    public init(id: String, detail: String) {
        self.id = id
        self.detail = detail
    }
}

/// Filtre de source et de type (migration-ios, décision 5) : seule l'app Exercice d'Apple est retenue (séances de la
/// Watch, bundle « com.apple.health. », ou « com.apple.workout »), et seulement les courses. Nil si la séance passe.
public func raisonIgnoreeHealthKit(_ brute: SeanceBrute) -> Ignoree? {
    let bundle = brute.sourceRevision?.bundleId ?? ""
    if let ignoree = raisonIgnoreeSourceHealthKit(id: brute.id, bundleId: bundle) { return ignoree }
    guard brute.activityType == TYPE_ACTIVITE_COURSE else {
        return Ignoree(cleSource: "hk:" + brute.id, raison: .pasUneCourse, detail: "type \(brute.activityType)")
    }
    return nil
}

/// Filtre de source seul, pour écarter une séance avant de lire ses séries (migration-ios, décision 5). Le bundle
/// « com.apple.health. » ou « com.apple.workout » est celui de l'app Exercice d'Apple. Nil si la source est retenue.
public func raisonIgnoreeSourceHealthKit(id: String, bundleId: String) -> Ignoree? {
    guard bundleId.hasPrefix("com.apple.health.") || bundleId == "com.apple.workout" else {
        return Ignoree(cleSource: "hk:" + id, raison: .autreSource, detail: bundleId.isEmpty ? nil : bundleId)
    }
    return nil
}

/// Transforme une séance HealthKit en pivot. Nil si le filtre l'écarte (voir `raisonIgnoreeHealthKit`).
/// `decalageAppareil_min` ne sert que si la séance ne donne pas son fuseau (métadonnée HKTimeZone), ADR 0007.
public func adapterSeance(_ brute: SeanceBrute, decalageAppareil_min: Int) throws -> ActivitePivot? {
    if raisonIgnoreeHealthKit(brute) != nil { return nil }

    let W = brute.fin.timeIntervalSince(brute.debut)
    guard W > 0 else {
        throw ErreurSeanceHealthKit(id: brute.id, detail: "fin non postérieure au début")
    }
    guard brute.dureeSecondes.isFinite, brute.dureeSecondes > 0 else {
        throw ErreurSeanceHealthKit(id: brute.id, detail: "durée nulle")
    }
    guard brute.dureeSecondes <= W + 1 else {
        throw ErreurSeanceHealthKit(id: brute.id, detail: "durée en mouvement supérieure à la durée totale")
    }

    let relatif: (Date) -> Double = { $0.timeIntervalSince(brute.debut) }
    let pauses = pausesDepuis(brute.workoutEvents ?? [], relatif: relatif, W: W)
    let grille = Grille(W: W, pauses: pauses)

    let intervalles = intervallesDistance(
        (brute.distanceEchantillonsFins ?? []).map { (debut: relatif($0.debut), fin: relatif($0.fin), metres: $0.metres) },
        W: W
    )
    let distanceCumulee = cumulAuxInstants(intervalles, grille.instants)
    let distanceTotale = intervalles.reduce(0) { $0 + $1.metres }

    let fcMesurees = (brute.frequenceCardiaque ?? [])
        .map { (t: relatif($0.debut), valeur: $0.bpm) }
        .filter { $0.t >= 0 && $0.t <= W && (FC_MIN_PLAUSIBLE...FC_MAX_PLAUSIBLE).contains($0.valeur) }
        .sorted { $0.t < $1.t }
    let fc: [Float]? = fcMesurees.isEmpty ? nil : colonne(fcMesurees, grille)
    let pasFC = mediane(ecartsPositifs(fcMesurees.map(\.t)))

    let points = (brute.traces ?? []).flatMap(\.points)
        .map { (point: $0, t: relatif($0.timestamp)) }
        .filter { $0.t >= 0 && $0.t <= W }
        .sorted { $0.t < $1.t }
    let altitudes = points.compactMap { p -> (t: Double, valeur: Double)? in
        guard let altitude = p.point.altitude, altitude.isFinite, (p.point.precisionVerticale ?? 0) >= 0 else { return nil }
        return (t: p.t, valeur: altitude)
    }
    let vitesses = points.compactMap { p -> (t: Double, valeur: Double)? in
        guard let vitesse = p.point.vitesse, vitesse.isFinite, vitesse >= 0 else { return nil }
        return (t: p.t, valeur: vitesse)
    }

    let decalage = decalageLocal(brute, decalageAppareil_min: decalageAppareil_min)
    let debutUtc = brute.debut.timeIntervalSince1970 * 1000

    return ActivitePivot(
        cleSource: "hk:" + brute.id,
        source: .healthkit,
        versionAdaptateur: VERSION_ADAPTATEUR_HEALTHKIT,
        empreinteBrute: empreinte(brute),
        debutUtc: debutUtc,
        decalageLocal_min: Double(decalage),
        dateLocale: try dateLocale(debutUtc, Double(decalage)),
        duree_s: brute.dureeSecondes,
        distance_m: distanceTotale,
        nom: nomDeLaSeance(brute),
        competition: false,
        sousType: brute.metadata?["HKIndoorWorkout"] == "1" ? .tapis : .route,
        pasFC_s: pasFC,
        flux: Flux(
            t_s: grille.instants.map { Float($0) },
            dist_m: distanceCumulee.map { Float($0) },
            fc_bpm: fc,
            alt_m: altitudes.isEmpty ? nil : colonne(altitudes, grille),
            vitesse_ms: vitesses.isEmpty ? nil : colonne(vitesses, grille)
        ),
        tours: tours(brute, grille: grille, relatif: relatif)
    )
}

// MARK: - Grille

/// Grille à 1 s de la séance : les instants entiers hors pauses, en secondes depuis le début.
private struct Grille {
    /// Instants croissants, hors pauses.
    let instants: [Int]
    /// Pour chaque seconde de 0 à N, l'indice dans `instants`, ou -1 pendant une pause.
    private let indiceDeSeconde: [Int]

    init(W: Double, pauses: [(debut: Double, fin: Double)]) {
        let n = Int(W.rounded(.down))
        var enPause = [Bool](repeating: false, count: n + 1)
        for pause in pauses {
            let debut = max(0, Int(pause.debut.rounded(.up)))
            let fin = min(n + 1, Int(pause.fin.rounded(.up)))
            if debut < fin {
                for k in debut..<fin { enPause[k] = true }
            }
        }
        var instants: [Int] = []
        var indices = [Int](repeating: -1, count: n + 1)
        for k in 0...n where !enPause[k] {
            indices[k] = instants.count
            instants.append(k)
        }
        self.instants = instants
        self.indiceDeSeconde = indices
    }

    /// Indice de la seconde `seconde` dans la grille, ou nil pendant une pause ou hors de la séance.
    func indice(seconde: Int) -> Int? {
        guard seconde >= 0, seconde < indiceDeSeconde.count else { return nil }
        let indice = indiceDeSeconde[seconde]
        return indice >= 0 ? indice : nil
    }

    /// Indices (inclus) des instants de [a, b[, fin exclue (comme les tours de contrats.md) ; nil s'il n'y en a aucun.
    func plage(_ a: Double, _ b: Double) -> ClosedRange<Int>? {
        let premier = premierIndice(atteignant: a)
        let dernier = premierIndice(atteignant: b) - 1
        guard premier < instants.count, dernier >= premier else { return nil }
        return premier...dernier
    }

    private func premierIndice(atteignant x: Double) -> Int {
        var bas = 0
        var haut = instants.count
        while bas < haut {
            let milieu = (bas + haut) / 2
            if Double(instants[milieu]) < x {
                bas = milieu + 1
            } else {
                haut = milieu
            }
        }
        return bas
    }
}

/// Pauses de la séance, de la pause (type 1) à la reprise (type 2) ; une pause sans reprise dure jusqu'à la fin.
private func pausesDepuis(
    _ evenements: [EvenementBrut], relatif: (Date) -> Double, W: Double
) -> [(debut: Double, fin: Double)] {
    let utiles = evenements
        .filter { $0.type == EVENEMENT_PAUSE || $0.type == EVENEMENT_REPRISE }
        .sorted { $0.debut < $1.debut }
    var pauses: [(debut: Double, fin: Double)] = []
    var debutPause: Double?
    for evenement in utiles {
        let t = relatif(evenement.debut)
        if evenement.type == EVENEMENT_PAUSE {
            if debutPause == nil { debutPause = t }
        } else if let debut = debutPause {
            pauses.append((debut, t))
            debutPause = nil
        }
    }
    if let debut = debutPause { pauses.append((debut, W)) }
    return pauses.compactMap { pause -> (debut: Double, fin: Double)? in
        let debut = max(0, pause.debut), fin = min(W, pause.fin)
        return fin > debut ? (debut: debut, fin: fin) : nil
    }
}

// MARK: - Distance

/// Un intervalle de distance net : `metres` parcourus pendant [debut, fin] (secondes depuis le début).
private struct IntervalleMetres {
    let debut: Double
    let fin: Double
    let metres: Double
}

/// Intervalles de distance sans double comptage, dans la séance (ADR 0003, D-013).
///
/// 1. Chaque échantillon est rogné sur [0, W] au prorata de sa durée : le premier peut déborder avant le début.
/// 2. Seuls les échantillons fins (au plus `DUREE_ECHANTILLON_FIN_MAX_S`) comptent. Chacun est rogné sur le précédent :
///    pas de chevauchement. Ils donnent le total HealthKit à moins de 0,5 % sur les trois exports Exercice.
/// 3. Les résumés (plusieurs minutes) ne servent qu'en repli, quand la séance n'a AUCUN échantillon fin. Ils recouvrent
///    alors les fins absentes, sans chevauchement entre eux. Sur l'export réel, ils doublent les fins : les compter
///    en plus donnait 0,7 à 2,3 % de trop.
private func intervallesDistance(_ echantillons: [(debut: Double, fin: Double, metres: Double)], W: Double) -> [IntervalleMetres] {
    var rognes: [IntervalleMetres] = []
    for echantillon in echantillons where echantillon.metres.isFinite && echantillon.metres >= 0 {
        let duree = echantillon.fin - echantillon.debut
        if duree <= 0 {
            if echantillon.debut >= 0 && echantillon.debut <= W {
                rognes.append(IntervalleMetres(debut: echantillon.debut, fin: echantillon.debut, metres: echantillon.metres))
            }
            continue
        }
        let debut = max(echantillon.debut, 0)
        let fin = min(echantillon.fin, W)
        guard fin > debut else { continue }
        rognes.append(IntervalleMetres(debut: debut, fin: fin, metres: echantillon.metres * (fin - debut) / duree))
    }

    var nets: [IntervalleMetres] = []
    var couverts: [(debut: Double, fin: Double)] = []
    var curseur = -Double.infinity
    let fins = rognes
        .filter { $0.fin - $0.debut <= DUREE_ECHANTILLON_FIN_MAX_S }
        .sorted { ($0.debut, $0.fin) < ($1.debut, $1.fin) }
    for fine in fins {
        if fine.fin == fine.debut {
            nets.append(fine)
            continue
        }
        let debut = max(fine.debut, curseur)
        guard fine.fin > debut else { continue }
        nets.append(IntervalleMetres(debut: debut, fin: fine.fin, metres: fine.metres * (fine.fin - debut) / (fine.fin - fine.debut)))
        couverts.append((debut, fine.fin))
        curseur = max(curseur, fine.fin)
    }

    // Repli : sans échantillon fin, les résumés donnent la distance (ils ne se doublent pas entre eux, grâce à `couverts`).
    guard fins.isEmpty else { return nets.sorted { ($0.debut, $0.fin) < ($1.debut, $1.fin) } }
    let resumes = rognes
        .filter { $0.fin - $0.debut > DUREE_ECHANTILLON_FIN_MAX_S }
        .sorted { $0.debut < $1.debut }
    for resume in resumes {
        let duree = resume.fin - resume.debut
        for trou in trous(resume.debut, resume.fin, couverts) {
            nets.append(IntervalleMetres(debut: trou.debut, fin: trou.fin, metres: resume.metres * (trou.fin - trou.debut) / duree))
            couverts.append(trou)
        }
        couverts.sort { $0.debut < $1.debut }
    }
    return nets.sorted { ($0.debut, $0.fin) < ($1.debut, $1.fin) }
}

/// Parties de [a, b] que ne couvre aucun intervalle de `couverts` (disjoints, triés par début).
private func trous(_ a: Double, _ b: Double, _ couverts: [(debut: Double, fin: Double)]) -> [(debut: Double, fin: Double)] {
    var sortie: [(debut: Double, fin: Double)] = []
    var courant = a
    for couvert in couverts where couvert.fin > a && couvert.debut < b {
        if couvert.debut > courant { sortie.append((courant, couvert.debut)) }
        courant = max(courant, couvert.fin)
    }
    if courant < b { sortie.append((courant, b)) }
    return sortie
}

/// Distance cumulée à chaque instant de la grille, par interpolation linéaire à l'intérieur de chaque intervalle.
/// `intervalles` doit être disjoint et trié.
private func cumulAuxInstants(_ intervalles: [IntervalleMetres], _ instants: [Int]) -> [Double] {
    var sortie: [Double] = []
    sortie.reserveCapacity(instants.count)
    var p = 0
    var accumule = 0.0
    for instant in instants {
        let t = Double(instant)
        while p < intervalles.count && intervalles[p].fin <= t {
            accumule += intervalles[p].metres
            p += 1
        }
        var partiel = 0.0
        if p < intervalles.count && intervalles[p].debut < t {
            let intervalle = intervalles[p]
            partiel = intervalle.metres * (t - intervalle.debut) / (intervalle.fin - intervalle.debut)
        }
        sortie.append(accumule + partiel)
    }
    return sortie
}

// MARK: - Mesures

/// Colonne du flux : la valeur de chaque mesure à sa seconde (la dernière gagne), NaN ailleurs. `mesures` est trié.
private func colonne(_ mesures: [(t: Double, valeur: Double)], _ grille: Grille) -> [Float] {
    var sortie = [Float](repeating: .nan, count: grille.instants.count)
    for mesure in mesures {
        if let indice = grille.indice(seconde: Int(mesure.t.rounded())) {
            sortie[indice] = Float(mesure.valeur)
        }
    }
    return sortie
}

private func ecartsPositifs(_ instants: [Double]) -> [Double] {
    zip(instants, instants.dropFirst()).map { $1 - $0 }.filter { $0 > 0 }
}

/// Fuseau du lieu (HKTimeZone, ADR 0007) au début de la séance, sinon le décalage de l'appareil.
private func decalageLocal(_ brute: SeanceBrute, decalageAppareil_min: Int) -> Int {
    guard let identifiant = brute.metadata?["HKTimeZone"], let fuseau = TimeZone(identifier: identifiant) else {
        return decalageAppareil_min
    }
    return fuseau.secondsFromGMT(for: brute.debut) / 60
}

/// Nom de la séance s'il existe. L'app Exercice ne nomme pas ses séances.
private func nomDeLaSeance(_ brute: SeanceBrute) -> String? {
    guard let nom = brute.metadata?["HKWorkoutBrandName"], !nom.isEmpty else { return nil }
    return nom
}

/// SHA-256 d'une chaîne déterministe : identifiant, début et fin en ms, métadonnées triées, nombres d'échantillons.
private func empreinte(_ brute: SeanceBrute) -> String {
    let debutMs = Int((brute.debut.timeIntervalSince1970 * 1000).rounded())
    let finMs = Int((brute.fin.timeIntervalSince1970 * 1000).rounded())
    let metadonnees = (brute.metadata ?? [:])
        .sorted { $0.key < $1.key }
        .map { "\($0.key)=\($0.value)" }
        .joined(separator: ";")
    let texte = [
        brute.id, "\(debutMs)", "\(finMs)", metadonnees,
        "fc=\(brute.frequenceCardiaque?.count ?? 0)", "dist=\(brute.distanceEchantillonsFins?.count ?? 0)",
    ].joined(separator: "|")
    return SHA256.hash(data: Data(texte.utf8)).map { String(format: "%02x", $0) }.joined()
}

// MARK: - Tours et étapes

/// Tours de la séance, en indices de la grille.
/// - Étapes d'un entraînement personnalisé (`WOIntervalStepKeyPath`) : elles donnent les tours, avec leur rôle.
///   Sans étape, les tours manuels (type 3) servent.
/// - Segments (type 7) : passages automatiques au km ou au mile. Déclenchement « distance », jamais de travail.
private func tours(_ brute: SeanceBrute, grille: Grille, relatif: (Date) -> Double) -> [Tour] {
    var tours: [Tour] = []
    let etapes = etapesDeLEntrainement(brute, relatif: relatif)
    // Un entraînement structuré n'a que ses étapes pour tours : les passages automatiques s'intercaleraient dans leur
    // ordre et casseraient l'enchaînement travail, récupération, travail.
    if etapes.isEmpty {
        for evenement in brute.workoutEvents ?? [] where evenement.type == EVENEMENT_SEGMENT {
            if let plage = grille.plage(relatif(evenement.debut), relatif(evenement.fin)) {
                tours.append(Tour(iDebut: plage.lowerBound, iFin: plage.upperBound, declenchement: .distance))
            }
        }
    }
    if !etapes.isEmpty {
        for (etape, intensite) in zip(etapes, roles(des: etapes)) {
            if let plage = grille.plage(etape.debut, etape.fin) {
                // Le déclenchement n'est pas dans la source : la métadonnée ne dit ni temps ni distance (inconnu).
                tours.append(Tour(iDebut: plage.lowerBound, iFin: plage.upperBound, declenchement: .inconnu, intensite: intensite))
            }
        }
    } else {
        for evenement in brute.workoutEvents ?? [] where evenement.type == EVENEMENT_TOUR {
            if let plage = grille.plage(relatif(evenement.debut), relatif(evenement.fin)) {
                tours.append(Tour(iDebut: plage.lowerBound, iFin: plage.upperBound, declenchement: .manuel))
            }
        }
    }
    return tours
}

/// Étape d'un entraînement personnalisé, dans son rang (bloc, itération, étape) et son intervalle, en secondes.
private struct EtapeEntrainement {
    let bloc: Int
    let iteration: Int
    let etape: Int
    let debut: Double
    let fin: Double
}

/// Étapes de la séance, dans l'ordre de l'export. Une étape sans `WOIntervalStepKeyPath` lisible est ignorée.
private func etapesDeLEntrainement(_ brute: SeanceBrute, relatif: (Date) -> Double) -> [EtapeEntrainement] {
    (brute.workoutActivities ?? []).compactMap { etape -> EtapeEntrainement? in
        guard let cle = etape.metadata?["WOIntervalStepKeyPath"],
              let debut = etape.debut, let fin = etape.fin else { return nil }
        let rangs = cle.split(separator: ".").compactMap { Int($0) }
        guard rangs.count == 3 else { return nil }
        return EtapeEntrainement(
            bloc: rangs[0], iteration: rangs[1], etape: rangs[2],
            debut: relatif(debut), fin: relatif(fin)
        )
    }
}

/// Rôle de chaque étape (intensité), déduit de son rang :
/// - le premier bloc, s'il y en a plusieurs et qu'il n'a qu'une itération (la 0), est l'échauffement ;
/// - le dernier bloc, dans les mêmes conditions, est le retour au calme ;
/// - dans les autres blocs (et pour une séance d'un seul bloc), la première étape de chaque itération est le travail
///   (« actif »), les suivantes sont la récupération.
private func roles(des etapes: [EtapeEntrainement]) -> [IntensiteTour] {
    let blocs = Set(etapes.map(\.bloc)).sorted()
    let premier = blocs.first
    let dernier = blocs.last
    func iterationsDe(_ bloc: Int) -> Set<Int> {
        Set(etapes.filter { $0.bloc == bloc }.map(\.iteration))
    }
    return etapes.map { etape in
        if blocs.count >= 2, etape.bloc == premier, iterationsDe(etape.bloc) == [0] { return .echauffement }
        if blocs.count >= 2, etape.bloc == dernier, iterationsDe(etape.bloc) == [0] { return .retour }
        let premiereDeLIteration = etapes
            .filter { $0.bloc == etape.bloc && $0.iteration == etape.iteration }
            .map(\.etape).min()
        return etape.etape == premiereDeLIteration ? .actif : .recuperation
    }
}
