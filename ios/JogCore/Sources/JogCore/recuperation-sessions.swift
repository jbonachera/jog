// Sessions de sommeil (D-023 ; docs/implementation/recuperation.md, lot 1). Fonction pure : des échantillons bruts de
// HealthKit à une session principale par date civile de réveil. Les durées se calculent sur les instants (ms depuis
// l'époque), jamais sur l'heure murale.
import Foundation

private let MS_PAR_MINUTE = 60_000.0
private let MS_PAR_HEURE = 3_600_000.0
private let MS_PAR_JOUR = 86_400_000.0

/// Intervalle d'une source, rogné (ms depuis l'époque), avec sa valeur HealthKit.
private struct Morceau {
    let debut: Double
    let fin: Double
    let valeur: Int
}

/// Endormi : valeurs 1 (non précisé), 3 (léger), 4 (profond), 5 (paradoxal).
private func estEndormi(_ valeur: Int) -> Bool {
    [1, 3, 4, 5].contains(valeur)
}

/// Une valeur 3, 4 ou 5 donne une phase : c'est ce qui distingue l'Apple Watch d'une app tierce (D-023).
private func donnePhases(_ valeur: Int) -> Bool {
    [3, 4, 5].contains(valeur)
}

private func phase(_ valeur: Int) -> PhaseSommeil {
    switch valeur {
    case 2: return .eveille
    case 4: return .profond
    case 5: return .paradoxal
    default: return .leger  // 1 (non précisé) et 3 : léger.
    }
}

/// Décalage du fuseau à l'instant donné, en minutes.
private func decalageMin(_ ms: Double, _ fuseau: TimeZone) -> Double {
    Double(fuseau.secondsFromGMT(for: Date(timeIntervalSince1970: ms / 1000))) / 60
}

/// Échantillons d'une même source, triés par début, rognés : le premier commencé l'emporte (D-023).
private func rogner(_ echantillons: [EchantillonSommeilBrut]) -> [Morceau] {
    let tries = echantillons
        .map { (debut: $0.debut.timeIntervalSince1970 * 1000, fin: $0.fin.timeIntervalSince1970 * 1000, valeur: $0.valeur) }
        .sorted { ($0.debut, $0.fin, $0.valeur) < ($1.debut, $1.fin, $1.valeur) }
    var morceaux: [Morceau] = []
    var curseur = -Double.infinity
    for echantillon in tries {
        let debut = max(echantillon.debut, curseur)
        if echantillon.fin > debut {
            morceaux.append(Morceau(debut: debut, fin: echantillon.fin, valeur: echantillon.valeur))
            curseur = echantillon.fin
        }
    }
    return morceaux
}

/// Source retenue : parmi les sources qui donnent au moins une phase, celle à la plus grande durée endormie ; à défaut,
/// la plus grande durée endormie ; à égalité, la plus petite chaîne `source` (D-023).
private func sourceRetenue(_ parSource: [String: [Morceau]]) -> String? {
    let candidates = parSource.map { source, morceaux in
        (
            source: source,
            endormi: morceaux.filter { estEndormi($0.valeur) }.reduce(0.0) { $0 + ($1.fin - $1.debut) },
            donnePhases: morceaux.contains { donnePhases($0.valeur) }
        )
    }
    let avecPhases = candidates.filter { $0.donnePhases }
    let retenues = avecPhases.isEmpty ? candidates : avecPhases
    return retenues.min { a, b in
        if a.endormi != b.endormi { return a.endormi > b.endormi }
        return a.source < b.source
    }?.source
}

/// Sessions d'une source : un écart de plus de 60 min entre deux intervalles ouvre une nouvelle session (D-023).
private func decouper(_ morceaux: [Morceau]) -> [[Morceau]] {
    var groupes: [[Morceau]] = []
    var courant: [Morceau] = []
    for morceau in morceaux {
        if let dernier = courant.last, morceau.debut - dernier.fin > RECUPERATION.ecartSessionMax_min * MS_PAR_MINUTE {
            groupes.append(courant)
            courant = []
        }
        courant.append(morceau)
    }
    if !courant.isEmpty {
        groupes.append(courant)
    }
    return groupes
}

/// 18:00 locale la veille du jour civil `date`, en ms depuis l'époque.
private func dixHuitHeuresLaVeille(_ date: DateCivile, _ fuseau: TimeZone) -> Double? {
    guard let veille = try? ajouterJours(date, -1), let jour = try? numeroJour(veille) else { return nil }
    let naif = Double(jour) * MS_PAR_JOUR + 18 * MS_PAR_HEURE
    let approche = naif - decalageMin(naif, fuseau) * MS_PAR_MINUTE
    return naif - decalageMin(approche, fuseau) * MS_PAR_MINUTE
}

/// Session d'un groupe d'intervalles déjà rognés, ou nil si elle n'a pas de phase endormie ou pas de date valide.
private func construire(_ groupe: [Morceau], _ fuseau: TimeZone) -> SessionSommeil? {
    guard let premier = groupe.first, let dernier = groupe.last else { return nil }
    guard let premierEndormi = groupe.first(where: { estEndormi($0.valeur) }) else { return nil }
    let debut = premier.debut
    let fin = dernier.fin

    func minutes(_ filtre: (Morceau) -> Bool) -> Double {
        groupe.filter(filtre).reduce(0.0) { $0 + ($1.fin - $1.debut) } / MS_PAR_MINUTE
    }

    guard let date = try? dateLocale(fin, decalageMin(fin, fuseau)),
          let reference = dixHuitHeuresLaVeille(date, fuseau) else { return nil }

    return SessionSommeil(
        date: date,
        debutUtc_ms: debut,
        finUtc_ms: fin,
        decalageDebut_min: Int(decalageMin(debut, fuseau)),
        segments: groupe.map { SegmentSommeil(debutUtc_ms: $0.debut, finUtc_ms: $0.fin, phase: phase($0.valeur)) },
        coucher_min: (premierEndormi.debut - reference) / MS_PAR_MINUTE,
        sommeil_min: minutes { estEndormi($0.valeur) },
        leger_min: minutes { $0.valeur == 1 || $0.valeur == 3 },
        profond_min: minutes { $0.valeur == 4 },
        paradoxal_min: minutes { $0.valeur == 5 },
        eveille_min: minutes { $0.valeur == 2 }
    )
}

/// Session principale par date de réveil (D-023). Ignore les valeurs hors de 1 à 5 (dont « au lit », 0). Une date ne
/// garde que sa session au plus grand `sommeil_min`, et seulement si elle atteint 3 h. Triée par date.
public func sessionsDeSommeil(_ echantillons: [EchantillonSommeilBrut], fuseau: TimeZone) -> [SessionSommeil] {
    let valides = echantillons.filter { (1...5).contains($0.valeur) }
    let parSource = Dictionary(grouping: valides, by: { $0.source }).mapValues(rogner)
    guard let source = sourceRetenue(parSource), let morceaux = parSource[source] else { return [] }

    var meilleures: [DateCivile: SessionSommeil] = [:]
    for session in decouper(morceaux).compactMap({ construire($0, fuseau) }) {
        if let actuelle = meilleures[session.date],
           actuelle.sommeil_min > session.sommeil_min
            || (actuelle.sommeil_min == session.sommeil_min && actuelle.debutUtc_ms <= session.debutUtc_ms) {
            continue
        }
        meilleures[session.date] = session
    }
    return meilleures.values
        .filter { $0.sommeil_min >= RECUPERATION.sommeilMinNuit_min }
        .sorted { $0.date < $1.date }
}
