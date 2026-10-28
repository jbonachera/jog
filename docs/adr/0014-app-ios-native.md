# 0014 · App iOS native en Swift, source HealthKit

- **Statut** : Acceptée
- **Date** : 2026-10-28
- **Dépend de** : 0006, 0007, 0011, 0013
- **Remplace** : 0001, 0003, 0004, 0005, 0008, 0009 et 0012. **Amende** : 0010.

## Contexte

Le tableau de bord web (TypeScript, navigateur, archive Strava importée à la main) est remplacé par une app iPhone native. Les règles fonctionnelles (`docs/design`) ne changent pas ; les ADR 0006 (moteur recalculé en entier, séances mémorisées), 0007 (calendrier), 0011 (tests de comportement) et 0013 (FC max observée) restent valables sur le fond.

## Décision

Les règles D-016 à D-021 (suppression des données, marquage Course ou Test, répétitions estimées…) sont consignées dans `docs/implementation/lots.md` (« Écarts proposés ») et `docs/implementation/migration-ios.md`.

- **App** : SwiftUI, iOS 26 au minimum, un athlète, aucun serveur. Design de référence : `docs/design/maquette/mobile.html`.
- **Moteur** : le paquet Swift `ios/JogCore`, sans UIKit ni HealthKit, reprend l'ancien `src/core`. La Vue (ADR 0009) est un type Swift consommé directement par les écrans. Un `actor Moteur` calcule hors du fil principal.
- **Source** : HealthKit, en lecture seule. Toutes les séances de course sont importées, quelle que soit l'app, pour le volume, la charge, la FC, la forme et les compteurs. Seule l'analyse des intervalles (tours, étapes d'entraînement) est réservée à l'app Exercice d'Apple ; les autres apps donnent des séances libres, avec des répétitions estimées (D-021). Les doublons (même sortie enregistrée par deux apps, recouvrement d'au moins 50 % de la plus courte ; l'ADR 0004 disait « plus de 50 % ») sont résolus au profit d'Exercice. Synchronisation incrémentale par ancre, livraison en arrière-plan. Le marquage Course ou Test (D-020) est saisi dans l'app.
- **Adaptateur** : les requêtes HealthKit (dans l'app) produisent des échantillons bruts ; la transformation en `ActivitePivot` est pure et testée dans `JogCore`.
- **Stockage** : fichiers JSON `Codable` dans Application Support, protection `completeUntilFirstUserAuthentication`, exclus des sauvegardes (`parametres`, `activites`, `seances`, `marquages`, `vue`, ancre). HealthKit reste la couche brute : les flux ne sont pas recopiés. Pas de SwiftData.
- **Données et sécurité** : tout reste sur l'appareil, aucune connexion réseau, les coordonnées GPS ne sont jamais extraites du tracé (seuls l'altitude, la vitesse et les précisions sont gardées). La suppression des données (D-016) vide les fichiers sans toucher à Santé.
- **Tests** : Swift Testing. Les 1270 cas dorés (`ios/JogCore/Tests/Oracle`), produits par le moteur TypeScript supprimé, sont figés comme tests de non-régression ; les règles de la spec sont aussi testées à la main.

## Conséquences

- Plus de code TypeScript ni d'outillage Node ; le déploiement GitHub Pages est supprimé.
- Les adaptateurs FIT, GPX, TCX et l'archive Strava disparaissent ; D-018 (import d'archive) tombe. La sauvegarde est celle de l'appareil.
- L'oracle ne se régénère plus ; toute évolution des règles passe par des tests Swift.
