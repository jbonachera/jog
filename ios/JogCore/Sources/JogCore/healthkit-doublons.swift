// Doublons entre apps (migration-ios, décision 3). Une même sortie enregistrée par deux apps (Exercice d'Apple et
// WorkOutDoors, par exemple) ne doit compter qu'une fois. Fonction pure, appliquée par le moteur à chaque recalcul sur
// l'ensemble des activités connues : un doublon peut arriver lors d'une synchro différente de celle de l'original.
//
// Règle reprise de src/store/doublons.ts (ADR 0004), à une différence près : le seuil est « au moins 50 % » ici, la
// version TypeScript dit « plus de 50 % ». Le classement diffère : l'Exercice d'Apple passe avant tout, puis la FC.
import Foundation

/// Part commune, en fraction de la plus courte des deux activités, à partir de laquelle deux enregistrements sont la
/// même sortie (décision 3 : au moins 50 %).
public let SEUIL_RECOUVREMENT_DOUBLON = 0.5

/// Activités écartées comme doublons de `activites` (raison `doublon`, `detail` = clé de la version gardée). Les autres
/// restent. On garde, par ordre de rang, l'Exercice d'Apple, puis la plus riche en mesures de FC, puis la plus longue,
/// puis la plus petite clé ; une activité qui recouvre une activité gardée est écartée.
///
/// Le résultat ne dépend pas de l'ordre d'entrée. Le rang n'est pas transitif quand la FC est inconnue d'une partie des
/// activités (`nbMesuresFC` nil) : la FC n'arbitre alors pas, et la durée prend le relais. Pour que le tri ne dépende
/// pas de l'entrée, les activités sont d'abord rangées par clé source.
public func doublonsEcartes(_ activites: [PivotSansFlux]) -> [Ignoree] {
    var gardees: [PivotSansFlux] = []
    var ecartees: [Ignoree] = []
    for activite in activites.sorted(by: { $0.cleSource < $1.cleSource }).sorted(by: devantAuRang) {
        if let gardee = gardees.first(where: { recouvrent($0, activite) }) {
            ecartees.append(Ignoree(cleSource: activite.cleSource, raison: .doublon, detail: gardee.cleSource))
        } else {
            gardees.append(activite)
        }
    }
    return ecartees.sorted { $0.cleSource < $1.cleSource }
}

/// Vrai pour une séance enregistrée par l'app Exercice d'Apple.
func estExerciceDeLApple(_ activite: PivotSansFlux) -> Bool {
    activite.source == .healthkit && estExerciceApple(activite.appSource)
}

/// Ordre de préférence : Exercice d'Apple, puis plus de mesures de FC (si les deux sont connues), puis plus longue, puis
/// plus petite clé. Une FC inconnue ne pénalise jamais : la comparaison passe alors à la durée.
private func devantAuRang(_ a: PivotSansFlux, _ b: PivotSansFlux) -> Bool {
    let exerciceA = estExerciceDeLApple(a), exerciceB = estExerciceDeLApple(b)
    if exerciceA != exerciceB { return exerciceA }
    if let fcA = a.nbMesuresFC, let fcB = b.nbMesuresFC, fcA != fcB { return fcA > fcB }
    if a.duree_s != b.duree_s { return a.duree_s > b.duree_s }
    return a.cleSource < b.cleSource
}

/// Durée prise pour les bornes de recouvrement : la durée écoulée, pauses comprises, ou à défaut le temps en mouvement.
private func dureeDesBornes(_ activite: PivotSansFlux) -> Double {
    activite.dureeEcoulee_s ?? activite.duree_s
}

/// Vrai quand la part commune atteint le seuil, par rapport à la plus courte des deux.
private func recouvrent(_ a: PivotSansFlux, _ b: PivotSansFlux) -> Bool {
    let dureeA = dureeDesBornes(a), dureeB = dureeDesBornes(b)
    let finA = a.debutUtc + dureeA * 1000
    let finB = b.debutUtc + dureeB * 1000
    let commun = min(finA, finB) - max(a.debutUtc, b.debutUtc)
    let plusCourte = min(dureeA, dureeB) * 1000
    guard commun > 0, plusCourte > 0 else { return false }
    return commun >= plusCourte * SEUIL_RECOUVREMENT_DOUBLON
}
