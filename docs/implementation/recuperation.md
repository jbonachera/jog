# Récupération : VFC, FC de repos et sommeil (D-023)

Statut : **proposé**, 2026-10-29. Maquette validée : [`../design/maquette/recuperation.html`](../design/maquette/recuperation.html). C'est la source de vérité de l'UX, y compris pour les règles de son JS. Le reste de l'app suit [`ensemble.html`](../design/maquette/ensemble.html).

Le principe 2 de `01-vision.md` (« pas de sommeil ») est levé par D-023, validée par l'athlète.

## Méthode

On garde celle de [`lots.md`](lots.md) et de [`migration-ios.md`](migration-ios.md).

- **TDD de comportement** : les tests sont écrits d'abord, à une frontière publique, et nommés en français avec la règle citée. Aucun test de détail interne. Les fixtures sont construites par code, sans aucune donnée réelle.
- **Rôles** :
  - un Haiku implémente un lot ;
  - un Sonnet relit **le code et les tests** : conformité à D-023, comportement plutôt qu'implémentation, bornes, D-015 ;
  - un Haiku corrige.
- **Un lot = un commit**, message en français (« Ajoute … »), terminé par la ligne Co-Authored-By.

**Commandes de vérification** (à lancer avec `dangerouslyDisableSandbox: true`)
- Moteur : `cd /Users/jbonachera/git/jog/ios/JogCore && swift test --disable-sandbox`. Pendant un lot, on peut cibler avec `--filter Recuperation`.
- App :
  ```
  cd /Users/jbonachera/git/jog/ios/Jog && xcodebuild test -project Jog.xcodeproj -scheme Jog \
    -destination 'platform=iOS Simulator,id=<UDID>' \
    -IDEPackageSupportDisableManifestSandbox=YES -skipPackagePluginValidation -skipMacroValidation \
    OTHER_SWIFT_FLAGS="-disable-sandbox" [-only-testing:JogTests/<Suite>]
  ```
  L'UDID se lit avec `xcrun simctl list devices available`.
- Performance : `JOG_PERF=1 swift test -c release --disable-sandbox --scratch-path /tmp/jogcore-R --filter mesure`.

**Projet Xcode**
- Le dossier `ios/Jog/Jog` est un groupe synchronisé : un fichier créé dans l'app y entre tout seul.
- La cible `JogTests` **ne l'est pas** : chaque nouveau fichier de test s'ajoute à la main dans `project.pbxproj` (PBXBuildFile, PBXFileReference, groupe, phase Sources), comme `ApercuTests.swift`.

**Définition de « terminé » pour un lot**
- `swift test` est vert, avec **les 1 271 cas dorés de l'oracle inchangés** (aucun JSON de `Tests/Oracle/` n'est modifié).
- À partir du lot 8, `xcodebuild test` est vert aussi.
- Chaque règle citée a au moins un test.
- Aucun fichier hors du périmètre du lot n'est touché sans raison écrite dans le compte rendu.

## Architecture

```
HealthKit (sommeil, VFC, FC, respiration)
  └─► LecteurHealthKit : SourceNuits         (app : requêtes bornées, aucune logique)
        └─► SynchroniseurNuits (JogCore)      ─► sessionsDeSommeil ─► resumerNuits ─► fusionnerNuits
              └─► Moteur.remplacerNuits       (nuits.json, ≤ 250 nuits)
                    └─► calculerVue(EntreeVue + nuits) ─► Vue.recuperation (VueRecuperation)
                                                       └─► decider : 8ᵉ signal « Récupération »
SwiftUI : ModeleRecuperation (pur) ─► carte Aujourd'hui, feuille « Cette nuit », Charge › Récupération
```

Les choix structurants, et pourquoi :
- **Golden JSON intacts.** Chaque nouveau champ d'entrée est un `Optional` simple, sans property wrapper. Le décodage synthétisé utilise alors `decodeIfPresent`, et l'encodage omet le champ s'il vaut nil. Le comparateur de l'oracle traite une clé absente comme `null`. Sans nuits (`nuits == nil`, cas de tous les goldens) :
  - il n'y a pas de 8ᵉ signal ;
  - `Vue.recuperation` vaut nil ;
  - les sorties sont identiques au champ près.
- **`REGLES_VERSION` reste à 1.1.0.** Elle entre dans la clé de mémorisation de ②a : la monter relirait **tous** les flux de séances au premier lancement. On ajoute `VERSION_RECUPERATION = 1`, et `FORMAT_VUE` passe à 6.
- **Le besoin de sommeil n'est pas un paramètre du moteur.** C'est une préférence d'affichage, `@AppStorage("besoinSommeil_min")`, qui n'entre ni dans l'état ni dans le verdict (D-023). L'ajouter à `ParamsGlobaux` changerait `parametresEnVigueur.globaux` dans tous les goldens de la Vue.
- **Calcul incrémental et borné.**
  - On lit au plus 250 nuits : 182 pour le graphique de 6 mois, plus 67 pour la norme de la plus ancienne.
  - Après la première lecture, chaque synchronisation ne relit que les 3 dernières nuits.
  - Les nuits résumées sont mémorisées dans `nuits.json`. Le calcul de la série est en O(250 × 67), soit moins de 1 ms.

---

## Lot 0 · Spec (documentation seule)

**Objectif** : écrire la règle avant le code. **Modèle** : Haiku, avec les textes ci-dessous recopiés tels quels, puis une relecture Sonnet (cohérence entre fichiers, liens d'ancres).
**Fichiers** : `docs/design/decisions.md`, `01-vision.md`, `02-navigation.md`, `03-composants.md`, `04-metriques.md`, `05-decision-volume.md`, `06-parametres.md`, `07-donnees.md`.
**Vérification** : `grep -n "D-023" docs/design/*.md` donne au moins 7 fichiers ; les liens `decisions.md#d-023--récupération-nocturne` se résolvent.
**Fin du lot** : relu, commit « Inscrit la récupération nocturne dans la spécification (D-023) ».

### 0.1 · `decisions.md`, à ajouter à la fin

```markdown
## D-023 · Récupération nocturne

- **Date** : 2026-10-29
- **Question** : Jog doit-il lire ce que l'Apple Watch mesure pendant le sommeil, et comment le faire entrer dans la décision volume ?
- **Décision** : oui. Jog lit la nuit, compare chaque valeur à **la norme de l'athlète**, et n'en tire **aucun score**.
  - **Données** (Santé) : VFC (SDNN), FC et fréquence respiratoire pendant le sommeil ; phases du sommeil (léger, profond, paradoxal, éveillé). Une nuit sans montre est **ignorée, jamais comptée à zéro**.
  - **Nuit** : les échantillons de sommeil d'une même source, séparés de 60 min au plus, forment une session. La session est datée du jour civil de son réveil. Pour chaque date, on garde la session la plus longue, si elle compte au moins 3 h endormi : les siestes sont ignorées. Quand plusieurs sources se recouvrent, on garde celle qui donne des phases (l'Apple Watch). Les échantillons « au lit » sont ignorés.
  - **VFC de la nuit** : exp(moyenne des ln(SDNN)) des mesures prises pendant la session. **FC de repos de la nuit** : FC moyenne pendant la session, et non la « FC au repos » du jour donnée par Santé.
  - **Moyenne 7 nuits** : la nuit du jour et les 6 précédentes, s'il y a au moins **4 nuits mesurées** (moyenne des ln pour la VFC).
  - **Norme** : les **60 nuits** qui précèdent ces 7 nuits, s'il y a au moins **21 nuits mesurées** ; sinon, « Norme en cours de calcul ». Bande = moyenne ± **0,95 écart-type** (écart-type de population ; en logarithme pour la VFC).
  - **État**, comparé sur les valeurs arrondies (D-015 : VFC à 1 ms, FC à 1 bpm) :
    - **Dans ta norme** : VFC sur 7 nuits ≥ bas de sa bande ;
    - **Sous ta norme** : VFC sur 7 nuits < bas de sa bande, FC de repos sur 7 nuits ≤ haut de sa bande ;
    - **Récupération basse** : VFC sur 7 nuits < bas de sa bande **et** FC de repos sur 7 nuits > haut de sa bande.
  - **Figé au réveil** : l'état ne dépend que des nuits terminées ; il ne change plus avant la nuit suivante.
  - **Sommeil** : c'est un contexte, pas une entrée de l'état. Le repère est le besoin de sommeil, réglable, 7 h 30 par défaut.
  - **8ᵉ signal « Récupération »** de la décision volume, **non décisif** : il peut faire passer Augmenter à Maintenir, jamais déclencher Alléger seul.
- **Seuils publiés** (constantes du produit, comme D-008) :

  | Constante | Valeur |
  |---|---|
  | Fenêtre courte / minimum mesuré | 7 nuits / 4 nuits |
  | Norme / minimum mesuré | 60 nuits précédant la fenêtre / 21 nuits |
  | Largeur de la bande | ± 0,95 écart-type |
  | Nuit retenue | ≥ 3 h endormi ; sessions séparées au-delà de 60 min |
  | Nuit basse (phrase seulement) | VFC de la nuit < 0,9 × bas de la bande |
  | Sommeil, à surveiller | moyenne 7 nuits ≥ 45 min sous le besoin |
  | Régularité du coucher, à surveiller | écart-type de l'heure d'endormissement > 45 min |
  | Écart hebdomadaire de la VFC, marqué | < −8 % de la norme |
  | Besoin de sommeil | 7 h 30 par défaut, de 4 h à 12 h, au pas de 15 min |

- **Options écartées** :
  - score de récupération de 0 à 100 % (Athlytic, Whoop) : opaque, contraire au principe 4 ;
  - score composite et anneaux (Bevel) ;
  - RMSSD : Santé ne le fournit pas ;
  - « FC au repos » quotidienne de Santé : elle mêle la journée ;
  - sommeil dans l'état : une mauvaise nuit isolée ne dit rien de la charge ;
  - signal décisif : la VFC bouge avec la chaleur, l'alcool, la maladie, pas seulement avec l'entraînement.
- **Raison** : la tendance de la VFC et de la FC nocturnes, face à une norme personnelle, est le repère le plus documenté de l'absorption de la charge (statut VFC de Garmin, HRV4Training). La garder secondaire respecte « le réalisé d'abord ».
- **Impacts** :
  - `01` (principe 2, non-objectifs) ;
  - onglet Aperçu renommé **Aujourd'hui** ; Forme et fatigue passe dans Charge › Entraînement ;
  - Charge scindé en Entraînement · Récupération ;
  - 8ᵉ signal (`05`) ;
  - autorisations HealthKit ;
  - Paramètres (besoin de sommeil).
- **Fichiers modifiés** : `01-vision.md`, `02-navigation.md`, `03-composants.md`, `04-metriques.md`, `05-decision-volume.md`, `06-parametres.md`, `07-donnees.md`.
- **À valider sur données réelles** :
  - le nombre de mesures de VFC par nuit (souvent 1 à 5) ;
  - la part de nuits sans VFC ;
  - les sources tierces de sommeil (AutoSleep, Pillow) qui doublent la Watch ;
  - les nuits coupées en deux sessions ;
  - la largeur réelle de la bande (0,95 σ) ;
  - la répartition des états sur 6 mois.
```

### 0.2 · `01-vision.md`

- **Principe 2**, à remplacer par :
  « **Seulement ce qui se mesure** avec une montre GPS et une ceinture cardio : distance, allure, durée, FC échantillonnée par la ceinture (1 à 5 s selon l'appareil), altitude, cadence. **La nuit**, avec l'Apple Watch : VFC, FC et fréquence respiratoire pendant le sommeil, et phases du sommeil ([D-023](decisions.md#d-023--récupération-nocturne)). Pas de lactate, de ressenti, de score de récupération ni de saisie manuelle. »
- **Principe 3** : « (Aperçu) » devient « (Aujourd'hui) ».
- **Non-objectifs** : la ligne « Gérer le lactate, la puissance, le ressenti, le sommeil ou la nutrition. » devient « Gérer le lactate, la puissance, le ressenti ou la nutrition. ». Ajouter la ligne : « Noter la récupération par un score ou un pourcentage, ou juger une nuit isolée. »
- **Tableau des questions** :
  - « Aperçu » devient « Aujourd'hui » partout ;
  - la ligne « Où en sont ma forme de fond et ma fatigue ? » renvoie à « Charge, Entraînement, forme et fatigue » ;
  - ligne ajoutée : « Mon corps absorbe-t-il la charge ? | Aujourd'hui, carte Récupération ; Charge, Récupération ».

### 0.3 · `02-navigation.md`

- **Onglets** : « Aujourd'hui · Charge · Progression · Historique » (Paramètres reste dans la barre).
- **Tableau « Contenu par onglet »** :
  - Aujourd'hui = « 1. Décision volume · 2. Récupération (carte, feuille Cette nuit) · 3. Volume réalisé · 4. 7 derniers jours » ;
  - Charge = « sélecteur Entraînement · Récupération. Entraînement : Forme et fatigue, Progressivité, Minutes de sous-seuil, Discipline NSA. Récupération : R1 à R7 ».
- **Sélecteurs locaux**, deux lignes ajoutées :
  - « Partie de Charge | Entraînement (défaut) · Récupération | onglet Charge | Oui » ;
  - « Fenêtre de la récupération | 8 semaines (défaut) · 6 mois | VFC et FC de repos | Non ».

### 0.4 · `03-composants.md`

- « Onglet Aperçu » devient « Onglet Aujourd'hui (ex-Aperçu) ».
- **A4** déménage sous « Onglet Charge, partie Entraînement ». On garde l'identifiant A4, avec la mention « déplacée de l'Aperçu (D-023) ».
- Fiches ajoutées :

```markdown
### A5 · Récupération (carte)

**But** : lire le matin, en une carte, si le corps absorbe la charge.
**Données** : `Vue.recuperation` (D-023, `04` « Récupération »).
**Affichage** :
- en-tête de section « Récupération », avec à droite un lien « Tendances » (vers Charge › Récupération) ;
- titre : l'état (Dans ta norme · Sous ta norme · Récupération basse · Norme en cours de calcul · Pas assez de nuits), avec une pastille (OK · À surveiller · Alerte · Données insuffisantes) et un chevron ;
- 3 tuiles : **VFC** (« 52 ms », « norme 40–59 »), **FC repos** (« 46 bpm », « norme 44–48 »), **Sommeil** (« 6h52 », « besoin 7h30 »). Chaque tuile porte une mini-courbe des 14 dernières moyennes sur 7 nuits, sur la bande de norme. Pour le sommeil, la bande va du besoin − 45 min au besoin ;
- la phrase d'explication de l'état.
**Sans aucune nuit mesurée** : « Aucune nuit mesurée dans Santé. Porte l’Apple Watch la nuit, avec le suivi du sommeil activé. », sans tuiles.
**Interactions** : un appui sur la carte ouvre A6. « Tendances » ouvre Charge › Récupération.
**Critères** : à 320 pt, aucune valeur de tuile n'est tronquée ; une valeur absente s'écrit « – ».

### A6 · Cette nuit (feuille)

**Affichage** :
- durée endormie en grand (« 6 h 41 »), avec la pastille « −49 min / besoin », orange si l'écart est ≤ −45 min, neutre sinon ;
- la date « Nuit du mar. 28 oct. au mer. 29 oct. » ;
- un **hypnogramme** en 4 couloirs, de haut en bas Éveillé, Paradoxal, Léger, Profond, avec 3 heures sous l'axe (début, milieu, fin) ;
- 4 valeurs : VFC (ms), FC de repos (bpm), Profond (min), Paradoxal (min) ;
- un bouton « Tendances de récupération » vers Charge › Récupération.
Sans nuit mesurée aujourd'hui : « Pas de nuit mesurée cette nuit. », et le bouton seul.
**Couleurs** : profond `ZAuDessus`, paradoxal `ZSousSeuil`, léger `ZFacile`, éveillé `Attention`.

### Charge · sélecteur Entraînement · Récupération

Un sélecteur segmenté sous le grand titre (« Ce que tu fais, et comment ton corps l'encaisse »). Il est mémorisé.

### R1 · État de récupération
- surtitre « Ce matin · moyenne des 7 dernières nuits face à ta norme de 60 jours » ;
- l'état en grand titre, coloré (vert, orange, rouge ; `ink-2` s'il manque des données) ;
- la phrase d'explication (`04`).

### R2 · Signaux de récupération
Une liste, avec le résumé « n sur m au vert » (m sans les contextes). Chaque ligne porte le nom, « valeur · détail », une pastille et un chevron. Un appui ouvre une feuille : valeur, pastille, détail, explication, repères (OK / À surveiller / Alerte), et la note « Norme : 60 nuits précédentes, plus ou moins un écart-type environ. ».
Signaux : VFC, FC de repos, Sommeil, Régularité, Fréquence respiratoire (contexte, pastille neutre « Contexte »). Textes et seuils : `04`, « Indicateurs de récupération ».

### R3 · Variabilité cardiaque (VFC nocturne) et R4 · FC de repos
- Sélecteur 8 semaines · 6 mois (56 ou 182 nuits), commun à R3 et R4.
- Un point par nuit mesurée (`ZFacile`, plus petit à 6 mois).
- Une courbe 2 px accent : la moyenne sur 7 nuits. Point final marqué.
- La bande de norme teintée (`Bande`).
- Axe Y calculé sur les données (D-009), au pas de 5 ms (VFC) ou de 2 bpm (FC).
- Lecture par défaut : « Ce matin : moy. 7 nuits 52 ms · norme 40–59 ». Au doigt : « Nuit du {date} : nuit 49 ms · moy. 7 n. 52 · norme 40–59 », ou « pas de mesure (montre non portée) ».
- Légende : Nuit · Moyenne 7 nuits · Ta norme. Vue tableau (D-011).

### R5 · Sommeil, 14 dernières nuits
- Barres empilées par phase (profond, paradoxal, léger, éveillé, de bas en haut), avec une ligne pointillée encre au besoin.
- Axe de 0 à 10 h, une graduation toutes les 2 h.
- Une nuit absente est marquée « – ».
- Lecture : « Moyenne 14 nuits : 7 h 02 · profond 58 min · paradoxal 1 h 31 ». Au doigt : la nuit et ses phases, éveillé en minutes.

### R6 · Récupération et charge
Sur 16 semaines (lundi → dimanche, semaine en cours comprise), deux graphiques alignés :
- barres en km par semaine, la semaine en cours en contour ;
- courbe de l'écart moyen de la VFC des nuits de la semaine à sa norme, en %, avec la ligne zéro ; les points sous −8 % sont orange.
Lecture : « Semaine en cours : 62 km · VFC −3 % face à la norme ». Note : « Quand le volume monte et que la VFC passe sous sa norme plusieurs semaines de suite, la charge n’est plus absorbée. Une baisse isolée d’une nuit ne veut rien dire. »

### R7 · Comment c'est calculé
Un bloc repliable, avec les 4 paragraphes de la maquette (Mesure, Norme, État, Sommeil), puis la mention « Source : Apple Santé (HealthKit). Pas de score sur 100 : chaque valeur est affichée face à sa propre norme. ».
```

### 0.5 · `04-metriques.md`, nouvelle section après « Endurance »

```markdown
## Récupération

Règle de [D-023](decisions.md#d-023--récupération-nocturne). `A` = aujourd'hui (J−1, D-022). Une nuit est datée du jour de son réveil.

- **Nuit mesurée** pour la VFC : au moins une mesure de VFC pendant la session. Pour la FC : une FC moyenne existe. Une nuit absente ou non mesurée ne compte dans aucune moyenne, et n'est jamais comptée à zéro.
- `vfc(n) = exp( moyenne des ln(SDNN_ms) )` sur les mesures de la session ; `fc(n)` = FC moyenne pendant la session.
- `F7(d)` = nuits datées de d−6 à d. `N60(d)` = nuits datées de d−66 à d−7.
- `vfc7(d) = exp( moyenne ln vfc(n), n ∈ F7(d) mesurées )`, si au moins 4 nuits ; `fc7(d)` de même, en moyenne simple.
- Norme, si au moins 21 nuits de `N60(d)` sont mesurées : `m = moyenne ln vfc`, `s = écart-type de population ln vfc`, bande VFC = `[exp(m − 0,95 s) ; exp(m + 0,95 s)]`, milieu `exp(m)`. Bande FC = `moyenne ± 0,95 × écart-type` de `fc`.
- **État** (D-015) : `bas = arrondi(vfc7) < arrondi(vfcBas)` ; `haute = arrondi(fc7) > arrondi(fcHaut)` (arrondi au plus proche, mi-chemin loin de zéro). `basse` si bas et haute ; `sous` si bas seul ; `dans` sinon. Moins de 4 nuits mesurées dans F7 : « Pas assez de nuits ». Norme absente : « Norme en cours de calcul ».
- **Phrase** :
  - dans : « VFC et FC de repos des 7 dernières nuits restent dans ta plage habituelle. » Si la nuit du jour est basse (`arrondi(vfc(A)) < arrondi(0,9 × vfcBas)`) : « Nuit dernière basse (VFC {v} ms), mais une nuit isolée ne change pas la tendance des 7 nuits. » ;
  - sous : « La VFC des 7 dernières nuits est passée sous ta plage habituelle. La FC de repos tient encore. » ;
  - basse : « VFC sous ta norme ({vfc7} ms contre {bas}–{haut}) et FC de repos au-dessus ({fc7} bpm). Le corps n’absorbe pas la charge actuelle. » ;
  - norme en cours : « Norme en cours de calcul : il faut 21 nuits mesurées ({n} pour l’instant). » ;
  - pas assez : « Il faut 4 nuits mesurées sur les 7 dernières ({n} pour l’instant). ».

### Indicateurs de récupération (R2)

| Indicateur | Valeur (précision) | OK | À surveiller | Alerte |
|---|---|---|---|---|
| VFC | vfc7, 1 ms | dans la norme ou au-dessus | sous la norme | sous la norme et FC de repos haute (repère seulement) |
| FC de repos | fc7, 1 bpm | dans la norme ou en dessous | au-dessus de la norme | — |
| Sommeil | moyenne des durées endormies de F7(A), 1 min ; écart = besoin − moyenne | moins de 45 min sous le besoin | 45 min ou plus sous le besoin | — |
| Régularité | écart-type de population de l'heure d'endormissement sur F7(A), 1 min | ≤ 45 min | > 45 min | — |
| Fréquence respiratoire | moyenne sur F7(A), 0,1 /min | contexte, sans état | | |

Chaque indicateur demande au moins 4 nuits dans F7(A) ; sinon, valeur « – », état « Données insuffisantes ».
Durée endormie = léger + profond + paradoxal (« endormi non précisé » compte en léger) ; l'éveil n'en fait pas partie. Heure d'endormissement = début du premier segment endormi, en minutes depuis 18 h la veille.
Écart hebdomadaire (R6) = moyenne, sur les nuits mesurées de la semaine qui ont une norme, de `(vfc(n) ÷ milieu(n) − 1) × 100`.
```

### 0.6 · `05-decision-volume.md`

- « Les 7 signaux » devient « Les 8 signaux ». Ligne 8 du tableau : « 8 | **Récupération** | moyenne VFC 7 nuits face à la norme, avec la FC de repos ([D-023](decisions.md#d-023--récupération-nocturne)) | Dans ta norme | Sous ta norme | Récupération basse | Apple Watch, la nuit ».
- Texte d'explication : « VFC des 7 dernières nuits dans ta norme ({bas}–{haut} ms). » · « VFC des 7 dernières nuits sous ta norme ({bas}–{haut} ms). » · « VFC sous ta norme et FC de repos au-dessus de la sienne. ». La valeur s'écrit « VFC {n} ms ».
- **Données insuffisantes**, ligne 8 : « 4 nuits mesurées sur 7, et 21 nuits mesurées pour la norme » ; phrases de `04`. **Sans aucune nuit mesurée sur les 250 dernières, le signal n'existe pas** : il n'apparaît pas dans la liste.
- **Règle du verdict**, à ajouter sous « Hors sous-seuil, Footings et Palier… » : « **Récupération** n'est pas décisive : en Alerte comme À surveiller, elle retient à Maintenir et ne déclenche jamais Alléger. Insuffisante, elle n'a pas d'effet, sinon le mot « disponibles » dans la phrase d'Augmenter. »
- **Phrase**, cas ajouté : « MAINTENIR, quand Récupération est le seul signal À surveiller ou en Alerte : « Rien d’alarmant côté entraînement, mais la récupération est {sous ta norme | basse} : mieux vaut consolider avant de monter. » ».
- **Critères d'acceptation**, ajouts :
  - récupération basse seule → Maintenir, jamais Alléger ;
  - sans nuit, la liste garde 7 signaux et les verdicts ne changent pas.

### 0.7 · `06-parametres.md`

- Ligne ajoutée au tableau des champs, groupe « Récupération » : `besoinSommeil` | Besoin de sommeil | 7 h 30 | h:mm, de 4 h à 12 h au pas de 15 min | repère du sommeil (A5, A6, R2, R5). Non daté, sans recalcul : il n'entre ni dans l'état ni dans le verdict (D-023).
- Phrase d'aide : « Durée de sommeil qui te laisse reposé. C’est un repère de lecture, pas une consigne. »

### 0.8 · `07-donnees.md`

- **Sources autorisées**, lignes ajoutées :
  - « VFC (SDNN) pendant le sommeil | Apple Watch | état de récupération, 8ᵉ signal » ;
  - « FC pendant le sommeil | Apple Watch | FC de repos nocturne » ;
  - « Fréquence respiratoire | Apple Watch | contexte » ;
  - « Phases du sommeil (léger, profond, paradoxal, éveillé) | Apple Watch | sommeil, régularité, hypnogramme ».
- La ligne « Exclus » devient : « lactate, puissance, ressenti, saisie manuelle, score de récupération ».
- **Entité** ajoutée :
  ```
  ### Nuit (lue dans Santé, D-023)
  date (jour du réveil), début, fin, heure d'endormissement, durée endormie,
  minutes par phase { léger, profond, paradoxal, éveillé },
  VFC de la nuit (ms, moyenne géométrique) | absente, FC moyenne | absente, fréquence respiratoire | absente
  ```
  Conservées sur l'appareil : 250 nuits au plus.

---

## Lot 1 · Sessions de sommeil (JogCore, pur)

**Objectif** : passer des échantillons bruts de sommeil à une session principale par date.
**Fichiers** :
- créer `ios/JogCore/Sources/JogCore/recuperation-types.swift` et `recuperation-sessions.swift` ;
- dans `constantes.swift`, ajouter l'espace de noms `RECUPERATION` et `VERSION_RECUPERATION` ;
- tests : `ios/JogCore/Tests/JogCoreTests/RecuperationSessionsTests.swift`.

**Types et fonctions publics**
```swift
public enum RECUPERATION {
    public static let nuitsFenetre = 7, minNuitsFenetre = 4
    public static let nuitsNorme = 60, minNuitsNorme = 21
    public static let kEcartType = 0.95
    public static let ecartSessionMax_min = 60.0, sommeilMinNuit_min = 180.0
    public static let nuitBasseFraction = 0.9
    public static let sommeilSurveiller_min = 45.0, regulariteSurveiller_min = 45.0
    public static let ecartHebdoSignale_pct = -8.0
    public static let besoinDefaut_min = 450.0, besoinMin_min = 240.0, besoinMax_min = 720.0, besoinPas_min = 15.0
    public static let nuitsLues = 250, nuitsRelues = 3, nuitsSerie = 182, semainesCharge = 16
}
public let VERSION_RECUPERATION = 1

public enum PhaseSommeil: String, Codable, Sendable, Equatable, CaseIterable { case eveille, paradoxal, leger, profond }
public struct EchantillonSommeilBrut: Codable, Sendable, Equatable {
    public var debut: Date; public var fin: Date
    /// HKCategoryValueSleepAnalysis.rawValue : 0 au lit, 1 endormi non précisé, 2 éveillé, 3 léger (core), 4 profond, 5 paradoxal.
    public var valeur: Int
    public var source: String        // bundleIdentifier
    public var appareil: String?     // productType, nil si inconnu
}
public struct SegmentSommeil: Codable, Sendable, Equatable { public var debutUtc_ms: Double; public var finUtc_ms: Double; public var phase: PhaseSommeil }
public struct SessionSommeil: Codable, Sendable, Equatable {
    public var date: DateCivile          // jour civil local du réveil
    public var debutUtc_ms: Double; public var finUtc_ms: Double
    public var decalageDebut_min: Int    // décalage local au début (heures de l'hypnogramme)
    public var segments: [SegmentSommeil]
    public var coucher_min: Double       // début du 1er segment endormi, en minutes depuis 18:00 locale la veille du réveil
    public var sommeil_min: Double; public var leger_min: Double; public var profond_min: Double
    public var paradoxal_min: Double; public var eveille_min: Double
}
public func sessionsDeSommeil(_ echantillons: [EchantillonSommeilBrut], fuseau: TimeZone) -> [SessionSommeil]   // triées par date, une par date
```

**Règles**
- On ignore les échantillons de valeur 0 et ceux qui ne sont pas dans [1, 5].
- **Source retenue** : parmi les sources qui donnent au moins une valeur 3, 4 ou 5, celle dont la durée endormie totale est la plus grande ; s'il n'y en a aucune, la source à la plus grande durée endormie ; à égalité, la plus petite chaîne `source`.
- Échantillons triés par début. Un écart de plus de 60 min entre la fin d'un échantillon et le début du suivant ouvre une nouvelle session. Un recouvrement au sein de la source est rogné : le premier commencé l'emporte.
- La date est celle de la fin, dans `fuseau`. Par date, on garde la session au plus grand `sommeil_min`, et seulement s'il atteint 180 min.
- Les durées se calculent sur les instants, jamais sur l'heure murale.

**Tests à écrire d'abord** (fuseau `Europe/Paris`)
1. Core 23:00→01:00, deep 01:00→02:00, REM 02:00→03:00, awake 03:00→03:10, core 03:10→07:00, nuit du 28 au 29 oct. 2026 → une session `date "2026-10-29"`, `sommeil_min 470`, `leger 350`, `profond 60`, `paradoxal 60`, `eveille 10`, `coucher_min 300`, 5 segments.
2. Le même jeu, plus un « au lit » de 22:30 à 07:30 → résultat identique (l'échantillon « au lit » ne déplace pas le début).
3. Endormissement à 00:30 → `coucher_min 390`.
4. Sieste 14:00→14:40 le 29 → la nuit principale est gardée, une seule session pour le 29.
5. Sieste seule de 90 min un jour sans nuit → aucune session à cette date.
6. Un trou de 61 min au milieu de la nuit → deux sessions, la plus longue gardée. Un trou de 60 min → une seule session.
7. Deux sources : la Watch (phases 3, 4, 5) et une app tierce (valeur 1 seule) qui recouvrent la même nuit → `sommeil_min` est celui de la Watch, pas doublé.
8. Passage à l'heure d'hiver : core du 24 oct. 23:00 au 25 oct. 07:00, heure locale (9 h réelles) → `sommeil_min 540`, `date "2026-10-25"`.
9. « Endormi non précisé » (1) compte en léger et dans `sommeil_min`.
10. Liste vide → `[]`.

**Vérification** : `swift test --disable-sandbox --filter RecuperationSessions`, puis la suite complète.
**Fin du lot** : tests verts, oracle intact.

## Lot 2 · Résumé et fusion des nuits (JogCore, pur)

**Fichiers** : `recuperation-nuits.swift` ; test `RecuperationNuitsTests.swift`.
```swift
public struct MesureNocturneBrute: Codable, Sendable, Equatable { public var instant: Date; public var valeur: Double }
public struct NuitResumee: Codable, Sendable, Equatable {
    public var date: DateCivile; public var debutUtc_ms: Double; public var finUtc_ms: Double
    public var coucher_min: Double; public var sommeil_min: Double; public var leger_min: Double
    public var profond_min: Double; public var paradoxal_min: Double; public var eveille_min: Double
    public var vfcLn: Double?; public var fcSommeil: Double?; public var respiration: Double?
    public var vfc_ms: Double? { vfcLn.map { Foundation.exp($0) } }
}
public func resumerNuits(_ sessions: [SessionSommeil], vfc: [MesureNocturneBrute],
                         fcMoyenne: [DateCivile: Double], respiration: [MesureNocturneBrute]) -> [NuitResumee]
/// Remplace les nuits datées à partir de `depuis` par `relues` (une nuit absente des relues disparaît), garde les
/// plus anciennes, et ne conserve que les `RECUPERATION.nuitsLues` dates les plus récentes. Trié par date.
public func fusionnerNuits(_ anciennes: [NuitResumee], _ relues: [NuitResumee], depuis: DateCivile, aujourdhui: DateCivile) throws -> [NuitResumee]
```

**Tests**
1. VFC de 40 et 60 ms dans la session, et 100 ms une minute après sa fin → `vfc_ms ≈ 48,9898` (moyenne géométrique, et non 50). La mesure hors session est ignorée.
2. Aucune mesure de VFC → `vfcLn == nil`, mais la nuit existe (son sommeil est connu).
3. Une mesure de VFC ≤ 0 ou non finie est ignorée.
4. `fcMoyenne["2026-10-29"] = 47,2` → `fcSommeil 47,2` ; date absente du dictionnaire → nil.
5. Respiration 14,0, 14,2, 14,2, 14,4 pendant la session → 14,2.
6. Fusion :
   - anciennes du 01 au 10, relues des 08 et 10 (le 09 n'est plus dans Santé), depuis 08 → dates 01…07, 08, 10 ;
   - avec 260 dates en entrée, il en reste 250, les plus récentes.

## Lot 3 · Norme et série (JogCore, pur) + données d'exemple

**Fichiers** : `recuperation-norme.swift`, `recuperation-exemple.swift` ; tests `RecuperationNormeTests.swift`, `RecuperationExempleTests.swift`.
```swift
public struct PointRecuperation: Codable, Sendable, Equatable {
    public var date: DateCivile
    public var vfc_ms: Double?; public var vfc7_ms: Double?; public var vfcBas: Double?; public var vfcHaut: Double?; public var vfcMilieu: Double?
    public var fc: Double?; public var fc7: Double?; public var fcBas: Double?; public var fcHaut: Double?; public var fcMilieu: Double?
    public var sommeil_min: Double?; public var sommeil7_min: Double?
    public var nuitsFenetreVfc: Int; public var nuitsNormeVfc: Int
}
/// Un point par date de `du` à `au` inclus, nuits absentes comprises (valeurs nil).
public func serieRecuperation(_ nuits: [NuitResumee], du: DateCivile, au: DateCivile) throws -> [PointRecuperation]

public enum ScenarioRecuperation: String, Sendable, CaseIterable { case normal, fatigue, mauvaiseNuit }
/// Nuits déterministes (Park–Miller, graine 7, comme `gen()` de la maquette), pour l'aperçu, la maquette de DEBUG et les tests de l'app.
public func nuitsExemple(_ scenario: ScenarioRecuperation, aujourdhui: DateCivile, nombre: Int = 250) throws -> [NuitResumee]
```

**Tests** (« base 40/60 » = 60 nuits de N60 dont la VFC alterne 40 et 60 ms, et la FC 44 et 48 bpm)
1. Base 40/60 → `vfcBas ≈ 40,4075`, `vfcHaut ≈ 59,3954`, `vfcMilieu ≈ 48,9898` (tolérance 1e-3), `fcBas 44,1`, `fcHaut 47,9`, `fcMilieu 46`.
2. Fenêtre de 4 nuits mesurées à 50 ms et 3 nuits absentes → `vfc7 == 50`, pas 28,6 (une nuit absente n'est jamais un zéro).
3. 3 nuits mesurées dans F7 → `vfc7 == nil`, `nuitsFenetreVfc == 3`.
4. 20 nuits mesurées dans N60 → bande nil, `nuitsNormeVfc == 20` ; 21 nuits → bande définie.
5. Bornes des fenêtres :
   - une nuit à d−67 n'entre pas dans la norme de d ;
   - une nuit à d−66 y entre ;
   - une nuit à d−6 est dans F7, pas dans N60.
6. Nuits de 40, 40, 60, 60 dans F7 → `vfc7 ≈ 48,99` (moyenne des ln).
7. `serieRecuperation(du: A−181, au: A)` rend 182 points, dates consécutives.
8. Exemple : deux appels donnent des nuits identiques ; `normal` donne environ 4 % de nuits absentes, jamais aujourd'hui ; `mauvaiseNuit` donne une nuit du jour à 312 min.
9. Performance (`JOG_PERF=1`, dans `VuePerfTests.swift`) : `serieRecuperation` sur 250 nuits et 182 points est mesurée et affichée. Budget : moins de 5 ms en release.

## Lot 4 · État, phrases, indicateurs et semaines (JogCore, pur)

**Fichiers** : `recuperation-etat.swift`, `recuperation-indicateurs.swift`, `recuperation-semaines.swift` ; tests `RecuperationEtatTests.swift`, `RecuperationIndicateursTests.swift`.
```swift
public enum EtatRecuperation: String, Codable, Sendable, Equatable {
    case dansLaNorme = "dans-la-norme", sousLaNorme = "sous-la-norme", basse
    case normeEnCours = "norme-en-cours", nuitsInsuffisantes = "nuits-insuffisantes"
}
public func etatRecuperation(_ p: PointRecuperation) throws -> EtatRecuperation
public func titreEtatRecuperation(_ e: EtatRecuperation) -> String   // « Dans ta norme »…, « Norme en cours de calcul », « Pas assez de nuits »
public func phraseRecuperation(_ e: EtatRecuperation, point: PointRecuperation) throws -> String   // textes exacts de 04

public enum EtatIndicateur: String, Codable, Sendable { case ok, surveiller, alerte, insuffisant, contexte }
public enum CleIndicateur: String, Codable, Sendable { case vfc, fcRepos, sommeil, regularite, respiration }
public struct RepereIndicateur: Codable, Sendable, Equatable { public var etat: EtatIndicateur; public var texte: String }
public struct IndicateurRecuperation: Codable, Sendable, Equatable {
    public var cle: CleIndicateur; public var nom: String; public var etat: EtatIndicateur
    public var valeurTexte: String; public var detail: String; public var explication: String; public var reperes: [RepereIndicateur]
}
/// `nuits` : nuits de F7(A). `besoin_min` : préférence de l'app.
public func indicateursRecuperation(point: PointRecuperation, nuits: [NuitResumee], aujourdhui: DateCivile, besoin_min: Double) throws -> [IndicateurRecuperation]

public struct SemaineRecuperation: Codable, Sendable, Equatable { public var lundi: DateCivile; public var ecartVfc_pct: Double?; public var nuits: Int }
public func semainesRecuperation(_ serie: [PointRecuperation], aujourdhui: DateCivile, nombre: Int = RECUPERATION.semainesCharge) throws -> [SemaineRecuperation]
```

Les nombres passent par `formatNombre` (virgule, moins U+2212) et les durées par `formatDuree`. Les plages s'écrivent avec un tiret demi-cadratin (« 40–59 »). Les comparaisons se font après `arrondir` (D-015).

**Tests** (base 40/60, donc bande VFC affichée 40–59 et FC 44–48)
1. `vfc7 40,0` → dans la norme : arrondi(40,0) = 40, qui n'est pas < arrondi(40,41) = 40.
2. `vfc7 39,4` → sous la norme ; `vfc7 39,5` → dans la norme (39,5 s'arrondit à 40, mi-chemin loin de zéro).
3. `vfc7 39` et `fc7 48,4` → sous la norme ; `fc7 48,5` → basse (49 > 48).
4. `vfc7 45` et `fc7 52` → dans la norme : la FC seule ne change pas l'état.
5. `vfc7 nil` → `nuitsInsuffisantes` ; bande nil → `normeEnCours` (la norme passe en premier quand les deux manquent).
6. Phrases :
   - basse → « VFC sous ta norme (39 ms contre 40–59) et FC de repos au-dessus (49 bpm). Le corps n’absorbe pas la charge actuelle. » ;
   - dans la norme avec une nuit du jour à 36 ms (0,9 × 40,41 = 36,37, arrondi 36 ; 36 < 36 faux) → phrase ordinaire ; à 35 ms → « Nuit dernière basse (VFC 35 ms), mais… ».
7. Sommeil, besoin 450 :
   - moyenne 405 → écart 45 → surveiller ;
   - 405,6 → écart 44,4, arrondi 44 → ok ;
   - 405,4 → 44,6, arrondi 45 → surveiller.
   Détail « moy. 7 nuits · besoin 7h30 ».
8. Régularité : couchers 255, 345, 255, 345 → σ 45 → ok, « ± 45 min » ; 254, 346, 254, 346 → σ 46 → surveiller.
9. Respiration 14,0, 14,2, 14,2, 14,4 → « 14,2 /min », état contexte, sans repères.
10. 3 nuits dans F7 → les 5 indicateurs sont insuffisants, valeur « – ».
11. L'ordre est VFC, FC de repos, Sommeil, Régularité, Fréquence respiratoire ; repères et explications exacts de `04` et de la maquette.
12. Semaines : 16 entrées, de la semaine de A−105 environ à celle de A ; écart −10 % pour des nuits à 0,9 × milieu ; semaine sans nuit mesurée → nil.

## Lot 5 · VueRecuperation et intégration à la Vue (JogCore)

**Fichiers** :
- créer `recuperation-vue.swift` ;
- modifier `vue.swift` (`EntreeVue`, `assemblerVue`, `arrondirVueFinale`), `types.swift` (`Vue`) et `constantes.swift` (`FORMAT_VUE = 6`, commentaire d'historique) ;
- test `RecuperationVueTests.swift`.
```swift
public struct VueRecuperation: Codable, Sendable, Equatable {
    public var aujourdhui: DateCivile
    public var etat: EtatRecuperation; public var titre: String; public var phrase: String
    public var point: PointRecuperation            // ce matin (= serie.last)
    public var serie: [PointRecuperation]          // 182 dates jusqu'à A
    public var nuits: [NuitResumee]                // nuits mesurées de A−13 à A (R5, indicateurs, A6)
    public var derniereSession: SessionSommeil?    // seulement si sa date == A (hypnogramme)
    public var semaines: [SemaineRecuperation]
}
/// nil quand aucune nuit n'est mesurée sur les 250 dernières dates.
public func calculerRecuperation(_ nuits: [NuitResumee], derniereSession: SessionSommeil?, aujourdhui: DateCivile) throws -> VueRecuperation?
```
- `EntreeVue` reçoit `public var nuits: [NuitResumee]?` et `public var derniereSession: SessionSommeil?`. Ce sont des Optional simples, ajoutés en fin d'init avec `= nil`.
- `Vue` reçoit `public var recuperation: VueRecuperation?` (paramètre d'init `= nil` en dernier). `Vue.vide` est inchangé.
- `assemblerVue` : `recuperation = try entree.nuits.flatMap { try calculerRecuperation($0, derniereSession: entree.derniereSession, aujourdhui: veille) }`, même sans séance.
- `arrondirVueFinale` arrondit les nombres de `recuperation.serie` et de `recuperation.nuits` à 4 décimales. L'état et les phrases sont calculés avant, sur les valeurs brutes.

**Tests**
1. `oracleVue` et `oracleDecision` restent verts sans aucune modification des JSON : c'est la parité des goldens.
2. `EntreeVue` décodée depuis un golden → `nuits == nil` ; `calculerVue` encodée ne contient pas la clé `recuperation`.
3. Avec `nuitsExemple(.normal, aujourdhui: A)` et `J = A+1` → `recuperation.point.date == A`, 182 points, 16 semaines.
4. Une liste de nuits vide, ou sans aucune mesure → `recuperation == nil`.
5. `derniereSession` d'une autre date → `derniereSession == nil` dans la Vue.
6. Une Vue au format 5, sans `recuperation`, se décode toujours (cache au lancement).

## Lot 6 · 8ᵉ signal dans la décision (JogCore)

**Fichiers** :
- modifier `types.swift` (`CleSignal` reçoit `case recuperation`), `decision-types.swift` (`EntreesDecision.recuperation: VueRecuperation?`, init `= nil`), `decision-signaux.swift` (`NOMS_SIGNAUX[.recuperation] = "Récupération"`, signal ajouté en fin de liste s'il est présent) et `decision-verdict.swift` (phrase spéciale) ;
- créer `decision-recuperation.swift` (`func signalRecuperation(_ r: VueRecuperation) throws -> Signal`) ;
- dans `vue.swift`, passer `recuperation` à `EntreesDecision` (le calculer **avant** `decider`) ;
- test `DecisionRecuperationTests.swift`, qui recopie le motif `situationSaine` de `DecisionReglesSpecTests.swift`.

**Correspondance** : dans la norme → `ok` ; sous la norme → `surveiller` ; basse → `alerte` ; norme en cours ou pas assez de nuits → `insuffisant`, valeur « – ». `valeur` = arrondi(vfc7) ; `valeurTexte` = « VFC 52 ms ». Explications de `05`. `DECISIFS` est **inchangé**.

**Tests**
1. Situation saine, récupération dans la norme → augmenter, 8 signaux, « Tous les signaux sont au vert : la charge actuelle est absorbée. ».
2. Saine, sous la norme → maintenir, « Rien d’alarmant côté entraînement, mais la récupération est sous ta norme : mieux vaut consolider avant de monter. ».
3. Saine, basse → **maintenir** (et non alléger) ; phrase « …la récupération est basse : … ».
4. Fraîcheur en alerte et récupération basse → alléger, « À surveiller en priorité : Fraîcheur. » : la récupération n'est pas dans la liste des alertes.
5. Footings à surveiller et récupération sous la norme → maintenir, phrase standard « … Points à surveiller : Footings sous le plafond, Récupération. ».
6. Saine, norme en cours → augmenter, « Tous les signaux disponibles sont au vert : … ».
7. `recuperation == nil` → 7 signaux, et sortie identique à la même entrée sans le champ.
8. Progressivité insuffisante et récupération basse → aucun verdict, phrase inchangée.
9. Critère de `05` : chaque signal cité dans la phrase est dans `signaux`.

## Lot 7 · Stockage, moteur et synchronisation des nuits (JogCore)

**Fichiers** :
- modifier `stockage.swift`, `moteur.swift` et `healthkit-synchro.swift` (condition de recalcul) ;
- créer `recuperation-synchro.swift` ;
- tests `RecuperationSynchroTests.swift`, plus des ajouts à `MoteurTests.swift` et `SynchroniseurTests.swift`.
```swift
public struct ReleveNuits: Codable, Sendable, Equatable { public var version: Int; public var nuits: [NuitResumee]; public var derniereSession: SessionSommeil? }
// Stockage : nuits.json, protection complete, comme les autres fichiers
public func lireNuits() throws -> Lecture<ReleveNuits>
public func ecrireNuits(_ releve: ReleveNuits) throws
// supprimerTout() efface aussi nuits.json

// Moteur
public func releveNuits() throws -> ReleveNuits?
/// Persiste, invalide les calculs en cours (generation += 1) et lève `nuitsNonCalculees`. Rend vrai si quelque chose a changé.
public func remplacerNuits(_ releve: ReleveNuits) throws -> Bool
public private(set) var nuitsNonCalculees: Bool   // remis à false par `persister`

public protocol SourceNuits: Sendable {
    func echantillonsSommeil(du debut: Date, au fin: Date) async throws -> [EchantillonSommeilBrut]
    func mesuresVFC(du debut: Date, au fin: Date) async throws -> [MesureNocturneBrute]
    func mesuresRespiration(du debut: Date, au fin: Date) async throws -> [MesureNocturneBrute]
    func fcMoyenne(du debut: Date, au fin: Date) async throws -> Double?
}
public actor SynchroniseurNuits {
    public init(source: any SourceNuits, moteur: Moteur)
    /// Rend vrai si les nuits du moteur ont changé.
    public func synchroniser(maintenant: Date = Date(), fuseau: TimeZone = .current) async throws -> Bool
}
```

**Règles**
- **Fenêtre de lecture** :
  - A−249 si le relevé est absent, illisible ou d'une autre `version` ;
  - sinon, la date de la dernière nuit stockée − 2 (au plus tôt A−249).
- Les échantillons sont lus de 18:00 locale la veille du début de la fenêtre jusqu'à `maintenant`.
- Ensuite, dans l'ordre : `sessionsDeSommeil`, une requête `fcMoyenne` **par session** (au plus 8 en parallèle), `resumerNuits`, `fusionnerNuits`, puis `remplacerNuits`.
- **`Moteur.calculer`** passe `nuits` et `derniereSession` à `EntreeVue`. Sans relevé, il passe `nil`.
- **`Synchroniseur.synchroniser`** : la condition de sortie anticipée devient `!illisibles, resultatVide, let stockee, stockee.J == J, !(await moteur.nuitsNonCalculees)`.

**Tests** (source factice, comme `FauxSource`)
1. Premier passage → lecture depuis A−249 ; second passage → lecture depuis la dernière nuit − 2.
2. Une nuit modifiée dans Santé (VFC ajoutée tard) → `true`, et la nuit est remplacée.
3. Rien de changé → `false`, et `nuits.json` n'est pas réécrit.
4. Nombre d'appels à `fcMoyenne` = nombre de sessions retenues (pas de lecture de la FC sur 250 jours).
5. Moteur : après `remplacerNuits`, `recalculer` rend une Vue avec `recuperation`. Un relevé illisible donne nil, sans erreur.
6. Synchroniseur : aucune séance nouvelle mais des nuits nouvelles → la Vue est recalculée (`recuperation` à jour). Sans nuit nouvelle → la Vue stockée est rendue telle quelle (test existant inchangé).
7. `supprimerTout` efface `nuits.json`.

---

## Lot 8 · Adaptateur HealthKit et autorisations (app)

**Fichiers** :
- `ios/Jog/Jog/HealthKit/LecteurHealthKit.swift` : `private let store` devient `let store` ; `typesLecture` étendu ;
- créer `ios/Jog/Jog/HealthKit/LecteurNuits.swift` (`extension LecteurHealthKit: SourceNuits`) ;
- `ios/Jog/Jog/Etat/ModeleApp.swift` ;
- `ios/Jog/Jog/Info.plist` (le texte `NSHealthShareUsageDescription` mentionne le sommeil, la VFC et la fréquence respiratoire).

**Requêtes** (toutes bornées par `HKQuery.predicateForSamples(withStart:end:)`) :
- sommeil : `HKSampleQueryDescriptor(predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis), predicate: p)], sortDescriptors: [SortDescriptor(\.startDate)])`. `source` = `sourceRevision.source.bundleIdentifier`, `appareil` = `sourceRevision.productType` ;
- VFC : `.quantitySample(type: HKQuantityType(.heartRateVariabilitySDNN), …)`, valeur en `.secondUnit(with: .milli)` ;
- respiration : `HKQuantityType(.respiratoryRate)`, unité `.count().unitDivided(by: .minute())` ;
- FC moyenne : `HKStatisticsQueryDescriptor(predicate: .quantitySample(type: HKQuantityType(.heartRate), predicate: HKQuery.predicateForSamples(withStart: d, end: f, options: .strictStartDate)), options: .discreteAverage)`, puis `averageQuantity()?.doubleValue(for: .count().unitDivided(by: .minute()))`.
- `typesLecture` reçoit `HKCategoryType(.sleepAnalysis)`, `HKQuantityType(.heartRateVariabilitySDNN)` et `HKQuantityType(.respiratoryRate)`.

**ModeleApp**
- `Services` reçoit `synchroNuits: SynchroniseurNuits`.
- Dans `synchroniser()`, avant `services.synchro.synchroniser`, appeler `_ = try? await services.synchroNuits.synchroniser()` : la récupération est secondaire, son échec ne bloque jamais les séances.
- Nouvelle clé `CLE_AUTORISATION_RECUPERATION = "autorisationRecuperationDemandee"`. Dans `demarrer`, si l'autorisation générale a été demandée et pas celle-ci, appeler `try? await lecteur.demanderAutorisation()` (iOS ne présente que les types nouveaux), puis poser la clé. `autoriserSante` pose les deux clés ; `supprimerToutesLesDonnees` les retire toutes les deux.

**Tests** :
- `swift test` (le lot 7 couvre la logique) ;
- `xcodebuild test` vert ;
- dans `TransitionsAppTests`, aucun changement attendu.

**Vérification manuelle**, sur l'iPhone :
- la feuille d'autorisation propose Sommeil, VFC et Fréquence respiratoire ;
- deuxième lancement : la synchronisation des nuits ne relit que 3 nuits (journal en DEBUG) ;
- le lancement reste instantané (Vue en cache).

## Lot 9 · Navigation : Aujourd'hui, Charge segmenté, Forme et fatigue déplacée (app)

**Fichiers** :
- `ContentView.swift` ;
- `Apercu/ApercuView.swift` : retirer `FormeFatigueView`, titre « Aujourd’hui » ;
- `git mv` de `Apercu/FormeFatigueView.swift` vers `Charge/FormeFatigueView.swift`, avec le type inchangé ;
- `Charge/ChargeView.swift` ;
- créer `Etat/Navigation.swift` ;
- tests : `ios/Jog/JogTests/NavigationTests.swift`, à ajouter au pbxproj.
```swift
enum Onglet: String, Hashable, CaseIterable { case aujourdhui, charge, progression, historique }
enum PartieCharge: String, Hashable, CaseIterable { case entrainement, recuperation
    var titre: String { self == .entrainement ? "Entraînement" : "Récupération" } }
@MainActor @Observable final class Navigation {
    var onglet: Onglet = .aujourdhui
    var partieCharge: PartieCharge   // lu et écrit dans UserDefaults « jog-charge-partie »
    init(defaults: UserDefaults = .standard)
    func ouvrirTendancesRecuperation()   // onglet = .charge ; partieCharge = .recuperation
}
```
- `TabView(selection: $navigation.onglet)`, avec `Tab("Aujourd’hui", systemImage: "gauge.with.dots.needle.33percent", value: .aujourdhui)`. Les autres onglets sont inchangés et reçoivent leur `value:`.
- `ChargeView(vue:partie: Binding<PartieCharge>)` : un `Picker` `.segmented` sous le titre, et le sous-titre « Ce que tu fais, et comment ton corps l’encaisse ». Entraînement = `FormeFatigueView`, `ProgressiviteView`, `MinutesSousSeuilView`, `DisciplineView`. Récupération = un emplacement provisoire (`RecuperationView` au lot 12).
- `ApercuView` reçoit `ouvrirTendances: () -> Void` : la navigation n'est pas dans la vue.

**Tests**
1. `ouvrirTendancesRecuperation()` → `onglet == .charge`, `partieCharge == .recuperation`.
2. `partieCharge` est relue depuis des `UserDefaults(suiteName:)` dédiés : elle persiste.
3. `ProgressionGraduationsTests` (qui cite `FormeFatigueView.reperesAxeY/X`) reste vert sans modification.

**Fin du lot** : suite verte ; captures de l'onglet renommé et du sélecteur, en clair et en sombre (`xcrun simctl io booted screenshot`).

## Lot 10 · ModeleRecuperation : textes, tuiles, séries de graphiques (app, pur)

**Fichiers** : créer `ios/Jog/Jog/Recuperation/ModeleRecuperation.swift` ; test `ios/Jog/JogTests/RecuperationTests.swift`, à ajouter au pbxproj.
```swift
enum ModeleRecuperation {
    struct Tuile: Identifiable { let id: String; let libelle: String; let valeur: String; let unite: String; let norme: String
                                 let courbe: [Double?]; let bandeBas: Double; let bandeHaut: Double }
    struct Carte { let titre: String; let pastille: (texte: String, ton: Ton); let tuiles: [Tuile]; let phrase: String }
    static func carte(_ r: VueRecuperation?, besoin_min: Double) -> Carte?   // nil → message « Aucune nuit mesurée… »
    static func tonEtat(_ e: EtatRecuperation) -> Ton                        // bon / attention / mauvais / neutre
    static func libellePastille(_ e: EtatRecuperation) -> String             // OK, À surveiller, Alerte, Données insuffisantes
    static func libelleIndicateur(_ e: EtatIndicateur) -> String             // … et « Contexte »
    static func resumeIndicateurs(_ i: [IndicateurRecuperation]) -> String   // « 3 sur 4 au vert »
    struct Nuit { let duree: String; let ecart: String; let ecartTon: Ton; let date: String
                  let segments: [(debut: Date, fin: Date, phase: PhaseSommeil)]; let heures: [String]; let valeurs: [(String, String, String)] }
    static func nuit(_ r: VueRecuperation, besoin_min: Double, calendrier: Calendar) -> Nuit?
    struct PointTendance: Identifiable { let id: DateCivile; let date: Date; let nuit: Double?; let moyenne7: Double?; let bas: Double?; let haut: Double? }
    static func tendance(_ r: VueRecuperation, mesure: CleIndicateur, nuits: Int) -> [PointTendance]   // .vfc ou .fcRepos ; 56 ou 182
    static func lectureTendance(_ p: PointTendance?, mesure: CleIndicateur, ceMatin: Bool) -> String
    struct BarreSommeil: Identifiable { let id: DateCivile; let absente: Bool; let phases: [(PhaseSommeil, Double)] }
    static func sommeil14(_ r: VueRecuperation) -> [BarreSommeil]
    struct SemaineChargeRecup: Identifiable { let id: DateCivile; let km: Double; let ecart: Double?; let enCours: Bool; let marque: Bool }
    static func chargeEtRecuperation(_ vue: Vue) -> [SemaineChargeRecup]   // km depuis vue.semaines (0 si absente)
    static func besoinTexte(_ min: Double) -> String                         // « 7 h 30 »
}
```

**Tests**, sur `calculerRecuperation(nuitsExemple(…))` avec A = 2026-10-29
1. Scénario normal → titre « Dans ta norme », pastille « OK », 3 tuiles (VFC, FC repos, Sommeil), 14 valeurs par courbe.
2. Fatigue → « Sous ta norme » ou « Récupération basse », comme `etatRecuperation`. Le test lit l'état de JogCore et vérifie le texte, il ne recalcule pas.
3. `carte(nil, …)` → nil.
4. `nuit(...)` :
   - l'écart −49 min donne le ton attention ; −44 min donne le ton neutre ;
   - date « Nuit du mar. 28 oct. au mer. 29 oct. » en `fr_FR` ;
   - 3 heures croissantes.
5. `tendance(…, nuits: 56)` donne 56 points ; une nuit absente a `nuit == nil` et garde sa bande ; la lecture dit « pas de mesure (montre non portée) ».
6. `sommeil14` donne 14 barres, et la somme des phases d'une barre = sommeil + éveil.
7. `chargeEtRecuperation` : 16 semaines, la dernière `enCours` ; `marque` vaut vrai seulement pour un écart arrondi au dixième < −8.
8. `besoinTexte(450) == "7 h 30"`.

## Lot 11 · Carte Récupération et feuille « Cette nuit » (app, vues)

**Fichiers** :
- créer `Recuperation/CarteRecuperationView.swift`, `Recuperation/MiniCourbe.swift` et `Recuperation/FeuilleNuitView.swift` (avec l'hypnogramme en Swift Charts : `RectangleMark` par segment, 4 couloirs catégoriels) ;
- modifier `Apercu/ApercuView.swift` (la carte juste après `DecisionVolumeView`) et `Apercu/FeuilleSignaux.swift` (la carte du signal `.recuperation` porte un bouton « Tendances de récupération » qui ferme la feuille et appelle `ouvrirTendances`) ;
- tests : `ios/Jog/JogTests/RecuperationLayoutTests.swift`, sur le modèle de `ProgressionLayoutTests.swift` et `RenduGraphique.swift`.

Pas d'étiquette « nouveau » ni « D-023 » : ce sont des annotations de la maquette. Le besoin est lu par `@AppStorage("besoinSommeil_min")`, 450 par défaut.

**Tests**
1. À 320, 393 et 430 pt, en `fr_FR`, avec le texte au défaut et en `.accessibility1` : les 3 tuiles tiennent dans la largeur, et aucune valeur n'est tronquée (valeurs extrêmes « 142 ms », « 103 bpm », « 11h59 »).
2. L'hypnogramme dessine au moins un rectangle par segment, en clair et en sombre (utilitaires de `RenduGraphique`).
3. VoiceOver : la carte a un libellé combiné « Récupération : Dans ta norme. VFC 52 millisecondes, norme 40 à 59… ».

**Fin du lot** : captures d'Aujourd'hui et de la feuille, en clair et en sombre ; elles sont comparées à la maquette par Sonnet.

## Lot 12 · Charge › Récupération : état, signaux, méthode (app, vues)

**Fichiers** : créer `Recuperation/RecuperationView.swift` (R1, R2, R7, mention de la source), `Recuperation/FeuilleIndicateurView.swift` et `Recuperation/CommentCestCalculeView.swift` (`DisclosureGroup`, avec les 4 paragraphes exacts de la maquette) ; brancher la vue dans `ChargeView`.
- Sans `vue.recuperation`, la partie montre `ContentUnavailableView` avec le texte d'A5.

**Tests**
1. `RecuperationTests` : l'ordre des sections est donné par un `ModeleRecuperation.sections(_:)` testé.
2. Rendu : la liste des indicateurs ne déborde pas à 320 pt en `.accessibility3`. La feuille d'un indicateur contexte n'a pas de bloc « Repères ».

## Lot 13 · Graphiques R3 à R6 (app, vues)

**Fichiers** :
- créer `Recuperation/TendanceNocturneView.swift` (R3 et R4, paramétré par `CleIndicateur` ; sélecteur 8 semaines · 6 mois en `@State` dans `RecuperationView`, partagé), `Recuperation/SommeilNuitsView.swift` (R5) et `Recuperation/RecuperationChargeView.swift` (R6, deux `Chart` empilés, lecture partagée) ;
- `ProgressionGraduationsTests` étendu, ou nouveau `RecuperationGrapheTests.swift`.

**Règles visuelles**
- Bandes en `AreaMark(yStart:yEnd:)`, `Color.bande` ; points `ZFacile` ; moyenne en accent, 2,2 px.
- Barres sur axe continu à **largeur fixe** via `DimensionsGraphique.largeurBarre`, jamais `.ratio` (cause des bugs 09e456e et cf99e00).
- Graduations par `Axes.graduations` ; lecture au doigt par `chartXSelection` ; vue tableau `GraphiqueOuTableau` (D-011) ; `accessibilityChartDescriptor` (`DescripteurGraphique`).

**Tests** (rendu à 320, 393 et 430 pt, clair et sombre, utilitaires de `RenduGraphique.swift`)
1. R3 dessine des points et une ligne avec des données ; à 6 mois, 182 points au plus.
2. R5 dessine 4 phases × 14 barres au plus, plus la ligne du besoin.
3. R6 dessine 16 barres et la courbe.
4. Les graduations de chaque axe ne se chevauchent pas en `.accessibility3`.

## Lot 14 · Besoin de sommeil, maquette DEBUG et vérification finale

**Fichiers** :
- `Parametres/SectionsParametres.swift` : groupe « Récupération », `Stepper` de 240 à 720 min au pas de 15, libellé `besoinTexte`, phrase d'aide de `06` ;
- `Parametres/ModeleParametres.swift`, si la validation y vit ;
- `Apercu/SourceDeVue.swift` / `Etat/ModeleApp.swift` : en DEBUG, la maquette reçoit `recuperation = calculerRecuperation(nuitsExemple(.normal, aujourdhui: veille(J)))`, avec un choix de scénario dans Paramètres › Développement ;
- `ParametresTests.swift`.

**Tests**
1. Le besoin est borné : la valeur 225 est refusée ou ramenée à 240, et 735 à 720.
2. Changer le besoin change aussitôt l'indicateur Sommeil d'une Vue fixe, sans recalcul du moteur.
3. `supprimerToutesLesDonnees` retire `besoinSommeil_min`.

**Vérification finale**
- `swift test` (oracle intact), `xcodebuild test`, test de performance.
- Sur l'iPhone, avec les données réelles :
  - temps de la première synchronisation des nuits (budget : moins de 3 s pour 250 nuits) ;
  - deuxième lancement (moins de 300 ms pour les nuits) ;
  - captures des 3 scénarios DEBUG, en clair et en sombre.
- Mettre à jour la section « Avancement » de ce fichier.

---

## Impacts sur l'existant

| Élément | Changement | Lot |
|---|---|---|
| `CleSignal`, `EntreesDecision`, `calculerSignaux`, `verdictDe` | un cas `.recuperation`, un champ optionnel, un signal en fin de liste, une phrase spéciale ; `DECISIFS` inchangé | 6 |
| `EntreeVue`, `Vue`, `assemblerVue`, `arrondirVueFinale` | champs optionnels, `FORMAT_VUE` 6 ; `REGLES_VERSION` inchangée | 5 |
| `Stockage`, `Moteur`, `Synchroniseur` | `nuits.json`, `remplacerNuits`, `nuitsNonCalculees` ; la sortie anticipée de la synchronisation en tient compte | 7 |
| `LecteurHealthKit`, `Info.plist`, `ModeleApp` | 3 types lus de plus, `store` interne, seconde demande d'autorisation, synchronisation des nuits avant les séances | 8 |
| `ContentView`, `ApercuView` | `TabView(selection:)`, onglet « Aujourd’hui », titre, carte Récupération ; Forme et fatigue retirée | 9, 11 |
| `FormeFatigueView` | déplacée dans `Charge/`, code inchangé | 9 |
| `ChargeView` | sélecteur segmenté, deux parties | 9, 12 |
| `FeuilleSignaux`, `ModeleApercu.resumeSignaux` | 8 cartes ; le résumé compte tout seul « n sur 8 » ; bouton vers les tendances | 11 |
| `ParametresView` | groupe Récupération | 14 |
| Golden JSON (`Tests/Oracle/*.json`) | **aucun changement** ; `oracleVue` et `oracleDecision` servent de garde | 5, 6 |
| Tests existants | aucun à réécrire ; `SynchroniseurTests` et `MoteurTests` gagnent des cas ; `ProgressionGraduationsTests` doit passer après le déplacement | 7, 9 |
| `vue-maquette.json` | inchangé ; la récupération de DEBUG vient de `nuitsExemple` | 14 |

## Risques

- **Performance HealthKit.**
  - Ne jamais lire la FC brute sur 250 jours : les séances à 5 s en font des centaines de milliers d'échantillons. On fait une requête de statistiques par session.
  - Sommeil, VFC et respiration sont lus sur une plage bornée, puis 3 nuits seulement à chaque synchronisation.
  - La synchronisation des nuits est dans la file de `ModeleApp`, avant les séances, et ne bloque pas l'affichage de la Vue en cache.
- **Recalcul.** Sans `nuitsNonCalculees`, des nuits nouvelles un matin sans séance laisseraient la Vue d'hier, qui a le même J. À couvrir par le test 7.6.
- **Golden JSON.** Un property wrapper (`@ChampNul`) sur les nouveaux champs ferait encoder `null` explicitement : c'est sans effet sur la comparaison, mais un décodage strict casserait. On garde des `Optional` simples. Ne jamais toucher `REGLES_VERSION`, au risque de relire tous les flux.
- **Données réelles.**
  - Apps tierces de sommeil (doublons) : la règle de source du lot 1.
  - Nuits sans VFC : la nuit compte pour le sommeil, pas pour la norme.
  - Montre retirée en pleine nuit : session courte, ignorée sous 3 h.
  - VFC écrite tard dans Santé : l'état peut changer dans la matinée (voir les points de décision).
- **Autorisations.** HealthKit ne dit jamais si la lecture est refusée. Un refus ressemble à « aucune nuit » : la carte affiche le message d'A5, sans erreur.
- **Mise en page.** 3 tuiles à 320 pt avec Dynamic Type : à tester dès le lot 11, avec `ViewThatFits` (2 + 1 tuiles) si besoin.

## Points de décision restants (avec recommandation, non bloquants)

1. **Largeur de bande : 0,95 ou 1,0 σ.** Recommandé : **0,95**, comme la maquette validée, publié dans D-023 et réglé par une décision après 3 mois d'usage.
2. **Seuil du sommeil, ≥ 45 ou > 45 min.** La maquette écrit « 45 min ou plus » dans ses repères, mais code `< −45` strict. Recommandé : **≥ 45 après arrondi**, le texte publié l'emporte (D-015). Même règle pour la pastille de la feuille « Cette nuit ».
3. **« Figé au réveil »** : figer l'état à la première synchronisation après le réveil, ou le laisser suivre les mesures tardives de la matinée. Recommandé : **ne pas figer explicitement**, l'état ne dépend que des nuits terminées. À revoir si l'état change en cours de matinée (à mesurer).
4. **FC de repos sur toute la session ou hors éveil.** Recommandé : **toute la session** (une requête), éveils compris, car ils sont courts. Écart à mesurer au lot 14.
5. **Signal absent ou insuffisant sans aucune nuit.** Recommandé : **absent**. Un athlète sans Watch la nuit ne doit pas voir « Tous les signaux disponibles » à vie.
6. **Phrase « côté entraînement »** quand la récupération est seule en cause. Recommandé : **la garder** (maquette), et la phrase standard sinon.
7. **Tutoiement** (« ta norme ») alors que l'app vouvoie ailleurs (D-019, messages de `06`). Recommandé : garder les textes validés de la maquette, et ouvrir une décision globale sur le ton.
8. **Identifiants de code** : garder `ApercuView` et le dossier `Apercu/`, et ne renommer que les libellés visibles. Recommandé : **oui**, pour éviter le bruit dans le pbxproj et les tests.
9. **Besoin de sommeil** en préférence (`AppStorage`) plutôt qu'en paramètre daté. Recommandé : **préférence**. Il n'agit sur aucun calcul de la Vue, et un paramètre global casserait les goldens.
10. **Livraison en arrière-plan du sommeil.** Recommandé : **non**, la synchronisation à l'ouverture suffit pour une lecture du matin.

## Avancement

| Lot | État | Vérification |
|---|---|---|
| 0 | fait | grep D-023 : 7 fichiers, ancres résolues, relu |
| 1 | fait | swift test 308 verts, relu |
| 2 | fait | swift test 320 verts, relu |
| 3 | fait | swift test 337 verts, perf serie 0,24 ms, relu |
| 4 | fait | swift test 356 verts, relu |
| 5 | fait | swift test 366 verts, goldens intacts, relu |
| 6 | fait | swift test 375 verts, goldens intacts, relu |
| 7 | fait | swift test 390 verts, relu |
| 8 | fait | xcodebuild test vert (75 tests), swift test 390 ; iPhone à faire par l'utilisateur |
| 9 | fait | xcodebuild test vert (78 tests), swift test 390, relu ; captures à faire |
| 10 | fait | xcodebuild test vert (102 tests), swift test 390, relu |
| 11 | fait | xcodebuild test vert (105 tests), swift test 390, relu ; captures à faire |
| 12 | fait | xcodebuild test vert (114 tests), swift test 390, relu + 1 correction |
| 13 | fait | xcodebuild test vert (119 tests), swift test 390, relu + 1 correction ; visuel à faire |
| 14 | fait | swift test 390, xcodebuild test 123, perf OK, relu ; iPhone à faire par l'utilisateur |

## Écarts proposés

- Lot 0 : la clé de persistance du sélecteur « Partie de Charge » (`jog-charge-partie`) n'est pas inscrite dans `02-navigation.md` (non précisée par le plan).
- Lot 0 : `03-composants.md` (Conventions communes) dit que la journée en cours n'entre dans aucun calcul, ce qui contredit D-022 (écart préexistant).
- Lot 4 : avec une norme absente mais une moyenne 7 nuits disponible, les indicateurs VFC et FC affichent la valeur (état « Données insuffisantes ») au lieu de « – » ; 04 dit « – » seulement sous 4 nuits. Choix conservé, à trancher.
- Lot 4 : la FC de repos s'affiche sans décimale (04 et plan) alors que la maquette en met une.
- Lot 5 : `FORMAT_VUE` passe à 6 alors que les 34 goldens de la Vue portent `formatVersion: 5`. `VueOracleTests` ramène donc `formatVersion` à 5 dans la sortie comparée (adaptateur `auFormatDesGoldens`, seule clé touchée) ; aucun JSON n'est modifié, et le format 6 est testé dans `RecuperationVueTests`.
- Lot 6 : le plan (test 6.5) écrit « Footings sous le plafond, Récupération » ; l'énumération existante donne « X et Y » à deux éléments, conservée.
- Lot 7 : `nuits.json` suit la protection des autres fichiers (`completeFileProtectionUntilFirstUserAuthentication`, lisible téléphone verrouillé pour la livraison en arrière-plan) et non `complete` comme écrit au plan ; le moteur lève `nuitsNonCalculees` au chargement d'un relevé (le drapeau n'est pas persisté, une app tuée avant le recalcul ne doit pas laisser une Vue sans nuits) ; `synchroniser` ignore les sessions antérieures à la fenêtre `depuis`.
- Lot 8 : à l'autorisation de récupération sur une installation existante, la clé n'est posée qu'après succès de `demanderAutorisation` (sinon la demande est refaite au lancement suivant). Aucun test d'app : `ModeleApp` n'injecte ni `UserDefaults` ni lecteur HealthKit.
- À faire par l'utilisateur (lot 8, iPhone) : la feuille d'autorisation propose Sommeil, VFC et Fréquence respiratoire ; au deuxième lancement, seules 3 nuits sont relues (journal DEBUG) ; le lancement reste instantané.
- À faire par l'utilisateur (lot 9) : captures de l'onglet « Aujourd’hui » et du sélecteur Entraînement · Récupération, clair et sombre (non faites).
- Lot 10 : le plan (test 10.4) cite « Nuit du mar. 28 oct. au mer. 29 oct. » pour A = 2026-10-29, or c'est un jeudi : le code produit « mer. 28 oct. au jeu. 29 oct. » (le libellé du plan est testé sur 2025).
- Lot 10 : `Tuile.bandeBas/bandeHaut` sont optionnels (norme absente).
- À faire par l'utilisateur (lot 11) : captures d'Aujourd'hui et de la feuille « Cette nuit », clair et sombre ; vérifier la fermeture de la feuille suivie du changement d'onglet (bouton « Tendances de récupération »), et `ValeursNuit` à 320 pt en `.accessibility1` (deux colonnes sans repli, non testé).
- Lot 11 : le test de troncature mesure le débordement (`sizeThatFits`), pas une troncature réelle.
- À faire par l'utilisateur (lot 13) : relire R3 à R6 à 320 et 430 pt, en `.accessibility3` et sur R4 ; tester au doigt (`chartXSelection`), la vue tableau et VoiceOver. Non testés au rendu : la fenêtre 6 mois (182 points) et le 8 semaines.
- Lot 13 : l'axe Y de la VFC a une plage minimale de 20 ms (choix d'implémentation) ; D-009 n'a pas de ligne pour la VFC ni la FC de repos.
- À faire par l'utilisateur (lot 14, iPhone réel) : temps de la première synchronisation des nuits (budget < 3 s pour 250 nuits) ; deuxième lancement (< 300 ms pour les nuits) ; captures des 3 scénarios DEBUG (normal, fatigue, mauvaise nuit), clair et sombre ; mesure de l'écart FC de session entière / hors éveil (point de décision 4) et de la stabilité de l'état dans la matinée (point 3).
- Lot 14 : perf release mesurée : `serieRecuperation` 0,245 ms, `calculerVue` (maquette 14 mois) 0,750 ms.
