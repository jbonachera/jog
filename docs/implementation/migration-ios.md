# Migration vers une app iOS native (SwiftUI)

Statut : **terminé**, 2026-10-28 (lot 6 : bascule faite, ADR 0014). Plan proposé le 2026-10-22. Migration en une fois (big bang) : le tableau de bord web est retiré à la livraison. Aucune reprise de l'historique : l'app part de zéro et lit HealthKit. **Tout est réécrit en Swift**, moteur compris ; aucune ligne de TypeScript ne reste à la fin.

Design cible : [`../design/maquette/mobile.html`](../design/maquette/mobile.html), avec ses écarts proposés (Paramètres dans la barre du haut, lecture au doigt, signaux et semaines dans des feuilles).

## Comment réécrire vite sans régresser : l'oracle TypeScript

Traduire les ~150 fichiers de tests un par un coûterait trop cher. On se sert plutôt du moteur TS actuel comme **oracle**, tant qu'il existe encore :

1. Un script vitest, `scripts/oracle.ts`, part des fixtures existantes (`tests/fixtures` : construire, maquette, décision, progression, vues). Il écrit des **cas dorés** en JSON dans `ios/JogCore/Tests/Oracle/` : entrée (pivots, paramètres, J) et sortie (séances intrinsèques, Vue). Il couvre, entre autres :
   - les trois verdicts ;
   - les bornes de chaque seuil ;
   - les données insuffisantes ;
   - l'athlète de la maquette sur 14 mois ;
   - des séances à pauses, à tours automatiques, sans FC.
2. Le moteur Swift doit reproduire ces sorties, au champ près, avec une tolérance de 1e-9 sur les nombres.
3. Seuls les tests qui fixent une **règle de la spec** sont traduits à la main en Swift Testing : les critères d'acceptation de `05`, l'arrondi D-015, le calendrier ADR 0007. Les autres sont couverts par l'oracle.
4. Au lot 6, l'oracle est figé : ses JSON restent comme tests de non-régression, et le TypeScript est supprimé.

## Architecture cible

```
HealthKit ──► AdaptateurHealthKit ──► ActivitePivot ──► analyse de séance (mémorisée) ──► calculerVue ──► Vue ──► SwiftUI
```

- **`JogCore`**, un paquet Swift pur, sans UIKit ni HealthKit. C'est la traduction de `src/core` et de `adapters/commun`, avec les mêmes types que [`contrats.md`](contrats.md) :
  - `Flux` en `[Float]` ou `ContiguousArray<Float>` ;
  - les dates civiles et les numéros de jour de l'ADR 0007, en `Calendar` grégorien avec le fuseau du lieu ;
  - les empreintes en SHA-256 avec `CryptoKit`.

  Il se teste avec `swift test` sur le Mac, sans simulateur : rapide et peu coûteux. Performance : les boucles sur les flux s'écrivent sur des tableaux contigus, et l'analyse des séances est parallélisée en `TaskGroup`.
- **Source** : `HKWorkout` de course, avec ses données associées :
  - FC (`heartRate`, environ 5 s, D-013) ;
  - distance (`distanceWalkingRunning` en séries fines, `HKQuantitySeriesSampleQuery`) ;
  - tracé (`HKWorkoutRoute`, pour l'altitude) ;
  - tours et segments (`HKWorkoutEvent`) ;
  - étapes d'entraînement personnalisé (`workoutActivities`).

  Synchronisation incrémentale par `HKAnchoredObjectQuery` et une ancre persistée ; `enableBackgroundDelivery` pour les nouvelles séances.
- **Adaptateur HealthKit** dans l'app. Il est découpé en deux :
  - une partie qui interroge HealthKit et produit des échantillons bruts sérialisables ;
  - une partie pure, dans `JogCore`, qui transforme ces échantillons en `ActivitePivot`.

  La partie pure se teste sur des fixtures exportées d'un vrai iPhone (lot 0.2).
- **Stockage** (remplace l'ADR 0005) : HealthKit sert de couche brute, et on ne recopie pas les flux. Dans Application Support, protection `complete`, des fichiers JSON `Codable` :
  - `parametres.json`, avec l'historique daté des modifications ;
  - `seances.json` : les séances intrinsèques, par clé de mémorisation ;
  - `ancre` : l'ancre de synchronisation HealthKit ;
  - `vue.json` : le dernier calcul, pour un affichage instantané au lancement.

  Pas de SwiftData : le volume est petit et le modèle reste « recalculer en entier ».
- **Calcul** : un `actor Moteur`, hors du fil principal. Il calcule au lancement, après une synchronisation, quand un paramètre change et au changement de jour (ADR 0007).
- **Interface** : SwiftUI, iOS 26 au minimum (Liquid Glass natif). L'essentiel du verre est gratuit dans les composants système :
  - `TabView` + `.tabBarMinimizeBehavior(.onScrollDown)` ;
  - `NavigationStack` à grands titres ;
  - bouton de barre pour les Paramètres ;
  - `.sheet` + `presentationDetents` ;
  - `Picker(.segmented)` ;
  - Swift Charts avec `chartXSelection` pour la lecture au doigt.

  Les surfaces Fjord passent en `Color` d'Asset Catalog (clair et sombre) ; les polices Schibsted Grotesk et IBM Plex Mono sont embarquées. La Vue est un type Swift de `JogCore`, consommé directement par les écrans.

## Dépôt après migration

- **Ajouté** : `ios/` avec deux éléments :
  - `JogCore/`, le paquet Swift ;
  - `Jog/`, le projet Xcode : app et tests d'interface minimaux.
- **Supprimé au lot 6** :
  - `src/`, `tests/` (hors cas dorés déjà copiés), `scripts/` ;
  - `package.json`, configurations Vite, Vitest et ESLint, `node_modules`, `dist/` ;
  - le déploiement GitHub Pages ;
  - `mise.toml` pour Node.
- **Gardé** : `docs/design` (les règles ne changent pas) et `docs/adr`. Les ADR 0006, 0007, 0011 et 0013 restent valables sur le fond. Une seule nouvelle ADR : **0014 · App iOS native en Swift, source HealthKit**. Elle remplace 0001, 0003, 0004, 0005, 0008, 0009 et 0012, et amende 0010.

## Lots

Même méthode que [`lots.md`](lots.md) : tests de comportement d'abord ; Haiku implémente, Sonnet relit le code et les tests une fois par lot. Chaque lot se termine vert : `swift test`, plus `xcodebuild test` à partir du lot 2.

| Lot | Contenu | Fin du lot | Modèle |
|---|---|---|---|
| **0 · Socle, oracle, spike** | 0.1 `scripts/oracle.ts` et les cas dorés JSON. 0.2 **Spike HealthKit** sur l'iPhone de l'athlète : export JSON brut de 5 séances types (footing, sous-seuil programmé, sortie longue avec allure marathon, séance avec pause, séance sans tracé GPS), pour voir ce que donnent vraiment les tours et les `workoutActivities`. 0.3 Paquet `JogCore` vide, projet Xcode (iOS 26, capacité HealthKit), construction et tests depuis la ligne de commande | oracle et fixtures réelles en place | Sonnet (oracle, spike), Haiku (projet) |
| **1 · Moteur Swift** | traduction de `core`, dans l'ordre des dépendances : dates, arrondi, format → séance (intrinsèque, répétitions, découplage, classement, pic) → séries → décision → progression → sélecteurs → `calculerVue`. Un sous-lot par dossier, chacun vert sur ses cas dorés | 100 % de l'oracle reproduit, temps du recalcul mesuré | Haiku par dossier, revue Sonnet en fin de lot |
| **2 · HealthKit et données** | adaptateur (requêtes, puis partie pure testée sur les fixtures 0.2), ancre, livraison en arrière-plan, stockage dans des fichiers, `actor Moteur`, progression du premier import | sur le téléphone, la Vue se calcule à partir de HealthKit | Haiku + revue Sonnet |
| **3 · Aperçu** | tokens Fjord, polices, composants de base (pastille, carte, liste, lecture au doigt) ; Décision, signaux et leur feuille, simulateur, compteurs, 7 derniers jours, forme et fatigue ; écran sans données et autorisation HealthKit | écran conforme à la maquette, clair et sombre | Haiku + revue Sonnet |
| **4 · Charge, Progression, Historique** | tous les graphiques en Swift Charts, comparateur et son menu, journal et feuille de semaine | les 4 onglets conformes | Haiku + revue Sonnet |
| **5 · Paramètres et finitions** | feuille Paramètres, validation et recalcul, FC max observée (D-019), suppression des données (D-016) ; accessibilité (VoiceOver sur les graphiques par `accessibilityChartDescriptor`, Dynamic Type) | vérification sur données réelles à l'iPhone | Haiku + revue Sonnet |
| **6 · Bascule** | suppression du web et du TypeScript, ADR 0014, mise à jour du `README.md`, de `lots.md` et de `docs/design` | dépôt 100 % Swift | Haiku |

Points d'arrêt : fin du lot 0, si HealthKit ne fournit pas de quoi détecter les répétitions (tours ou étapes absents), et fin du lot 1, si l'oracle n'est pas reproduit.

## Pour être économes en budget Claude

- **L'oracle remplace la traduction des tests** : c'est le gros du gain.
- **`swift test` sur le Mac** pour tout le moteur : pas de simulateur dans la boucle du lot 1.
- **Le système fournit le Liquid Glass** : pas de verre fait à la main en SwiftUI. On n'imite la maquette que sur les surfaces Fjord.
- **Délégation** : chaque tâche Haiku reçoit le fichier TS à traduire, ses cas dorés et la commande de test, rien de plus. Une seule revue Sonnet par lot.
- **Vérifications visuelles** : captures du simulateur par `xcrun simctl io booted screenshot`, seulement en fin de lot 3 et de lot 4.
- **Pas de nouveau document de spec** : les écarts vont dans « Écarts proposés » de `lots.md`, en une ligne chacun.

## Prérequis et décisions (tranchés le 2026-10-22)

1. **Compte Apple Developer payant** : signature d'équipe, HealthKit avec livraison en arrière-plan, installation durable sur l'iPhone.
2. **D-020 acceptée** : un appui long sur une séance permet de la marquer « Course » ou « Test ». Le marquage est stocké dans l'app (`marquages.json`) et alimente le niveau estimé (P5), les lignes de course (H1) et le « meilleur test 5 km » du comparateur. C'est une exception explicite au principe 2 de `01-vision.md`.
3. **Écran de première ouverture** : il demande l'autorisation HealthKit, puis montre la progression de l'import. Avant 30 jours d'historique, la règle de D-007 s'applique. Il remplace D-018 (import d'une archive Strava), qui disparaît.
4. **Sauvegarde (D-012)** : la sauvegarde iOS de l'appareil suffit. L'export et l'import manuels sont retirés.
5. **Sources** (2026-10-23, revu le 2026-10-27) :
   - **Toutes les séances de course sont importées**, quelle que soit l'app, pour le volume, la charge, la FC et le reste. Les ignorer sous-estimait la charge.
   - **Seule l'analyse des intervalles est réservée à l'app Exercice d'Apple** (`com.apple.workout`). Une séance d'une autre app (WorkOutDoors…) est traitée comme une séance libre, sans répétitions.
   - **Doublons** : quand deux apps ont enregistré la même sortie, on garde la version Exercice.

   Constat du spike : Constat du spike : les segments (`HKWorkoutEvent` de type `segment`) d'une séance libre sont les temps de passage automatiques au km et au mile, qui se chevauchent. Ce ne sont jamais des tours de travail. Les répétitions viennent des étapes d'un entraînement personnalisé, à confirmer sur une séance à intervalles exportée.

## Orchestration

Pour limiter le coût de relecture du contexte dans la session principale, les lots sont pilotés par **un sous-agent orchestrateur Sonnet**. Il délègue l'implémentation à Haiku et ne rend la main qu'à la fin, ou sur un point d'arrêt. Le lot 1 ne dépend que de l'oracle : il avance sans attendre le spike HealthKit, qui demande l'iPhone.
