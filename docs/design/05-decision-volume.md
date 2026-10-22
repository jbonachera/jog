# 05 · Décision volume

C'est le cœur du produit. Chaque jour, à partir du réalisé jusqu'à hier soir, le tableau de bord donne :
1. un **verdict** : Augmenter, Maintenir ou Alléger le volume ;
2. la **liste des signaux** qui le justifient ;
3. une **fourchette de km** raisonnable pour les 7 prochains jours ;
4. un **simulateur** pour tester un volume.

Ce n'est **pas** un plan. Le produit ne dit ni quelles séances faire, ni quand. Il borne le volume à partir de ce que l'athlète a réellement absorbé.

## Les 7 signaux

Chaque signal a un état **OK**, **À surveiller** ou **Alerte**, une valeur affichée et une phrase d'explication.

| # | Signal | Mesure | OK | À surveiller | Alerte | Sources |
|---|---|---|---|---|---|---|
| 1 | **Progressivité** | ratio 7 j / 30 j à J−1 | 0,8 à 1,3 | > 1,3 ou < 0,8 | > 1,5 | GPS |
| 2 | **Fraîcheur** | TSB du jour | −25 à +5 | > +5 | < −25 | GPS + ceinture |
| 3 | **Réponse à l'effort** | allure normalisée à [refHr] : moyenne des 3 dernières séances SS − moyenne des 6 précédentes (s/km) | ≤ +1 | +1 à +3 | > +3 | GPS + ceinture |
| 4 | **Répétitions hors sous-seuil** | nb de répétitions hors sous-seuil sur les 3 dernières séances SS | 0 | 1 ou 2 | ≥ 3 | GPS + ceinture |
| 5 | **Footings sous le plafond** | part des footings sur 14 jours avec FC moy. ≤ [easyCap] | ≥ 90 % | 75 à 90 % | < 75 % | ceinture |
| 6 | **Découplage de la dernière sortie longue** | découplage de la dernière sortie longue utilisable, sur ses portions faciles | ≤ 5 % | 5 à 8 % | > 8 % | GPS + ceinture |
| 7 | **Palier de volume** | semaines consécutives à ±10 % du volume de la dernière semaine | ≥ 2 | < 2 | — | GPS |

Textes d'explication, selon l'état :

| Signal | Explication |
|---|---|
| Progressivité | « Les 7 derniers jours dépassent nettement la moyenne du mois. » · « Semaine nettement plus légère que la moyenne du mois. » · « Volume récent cohérent avec le mois écoulé. » |
| Fraîcheur | « Fatigue nettement au-dessus de ce que la forme absorbe. » · « Très frais : il y a de la marge pour charger. » · « Fatigue d'entraînement normale. » |
| Réponse à l'effort | Rappel de la méthode : « Allure normalisée à {refHr} bpm, 3 dernières séances sous-seuil comparées aux 6 précédentes. » La valeur s'écrit « X s/km plus lent / plus rapide à FC égale ». |
| Hors sous-seuil | « Plus rapides que l'allure seuil ({lt2Pace}/km) ou FC de fin au-dessus de {subtHrHi} bpm, 3 dernières séances. » La valeur s'écrit « n sur N ». |
| Footings | « FC moyenne ≤ {easyCap} bpm. Des footings trop rapides empiètent sur la récupération. » |
| Découplage | Date et distance de la sortie, puis « Sous 5 %, la base aérobie tient la durée. » Si des segments à allure marathon ont été retirés, on ajoute « portions faciles : {retenu} min sur {total} ». |
| Palier | « Volume tenu assez longtemps pour envisager une hausse. » · « Volume atteint récemment : le consolider avant de monter. » La valeur s'écrit « n sem. autour de X km ». |

## Seuils du verdict

Ce sont des **constantes du produit** ([D-008](decisions.md#d-008--seuils-du-verdict-fixes-et-publiés)). Elles ne sont pas réglables dans les Paramètres, et ne changent que par une nouvelle décision après retour d'usage. Ce tableau fait référence. Les repères cités dans [04](04-metriques.md) en reprennent les valeurs.

| Constante | Valeur |
|---|---|
| Progressivité : bande OK | 0,8 à 1,3 |
| Progressivité : alerte | > 1,5 |
| Fraîcheur : alerte / à surveiller | < −25 / > +5 |
| Réponse à l'effort : à surveiller / alerte | > +1 / > +3 s/km |
| Hors sous-seuil : à surveiller / alerte | 1 à 2 / ≥ 3 répétitions |
| Footings : à surveiller / alerte | < 90 % / < 75 % |
| Découplage : à surveiller / alerte | > 5 % / > 8 % |
| Palier : tolérance / durée OK | ±10 % / ≥ 2 semaines |
| Fourchette : Augmenter / Maintenir / Alléger | ×1,05–1,10 / ×0,95–1,05 / ×0,75–0,90 |
| Simulateur : bornes du curseur | ×0,5 à ×1,6 de la référence |

**Arrondi avant comparaison** ([D-015](decisions.md#d-015--arrondi-avant-comparaison-aux-seuils)) : chaque mesure est arrondie à sa précision d'affichage, puis comparée aux seuils. « à » est inclusif ; `>`, `<`, `≥` et `≤` s'appliquent tels qu'écrits. Arrondi au plus proche ; une valeur à mi-chemin s'éloigne de zéro.

| Mesure | Précision |
|---|---|
| Progressivité (ratio) | 0,01 |
| Fraîcheur (TSB) | 1 |
| Réponse à l'effort | 1 s/km |
| Hors sous-seuil, palier | entier |
| Footings sous le plafond | 1 % |
| Découplage | 0,1 % |
| Écart du palier (\|km / réf − 1\|) | 0,1 point de % |

## Données insuffisantes

Règle de [D-007](decisions.md#d-007--données-insuffisantes). Un signal sous son minimum prend l'état **Données insuffisantes** : pastille neutre, valeur « – », et une phrase qui dit ce qui manque.

| Signal | Minimum requis (fenêtres jusqu'à J−1) | Phrase |
|---|---|---|
| 1 Progressivité | 30 jours d'historique | « Il faut 30 jours d'historique (encore {n} jours). » |
| 2 Fraîcheur | 28 jours d'historique | « Il faut 28 jours d'historique pour estimer la fatigue (encore {n} jours). » |
| 3 Réponse à l'effort | 9 séances sous-seuil au total, dont les 3 dernières entre J−21 et J−1 | « Il faut 9 séances sous-seuil ({n} pour l'instant). » ou « Moins de 3 séances sous-seuil sur les 21 derniers jours. » |
| 4 Hors sous-seuil | 3 séances sous-seuil entre J−21 et J−1 | « Moins de 3 séances sous-seuil sur les 21 derniers jours. » |
| 5 Footings | 3 footings entre J−14 et J−1 | « Il faut 3 footings sur 14 jours ({n} pour l'instant). » |
| 6 Découplage | une sortie longue utilisable entre J−14 et J−1 | « Aucune sortie longue utilisable sur les 14 derniers jours. » |
| 7 Palier | 2 semaines terminées | « Il faut 2 semaines terminées. » |

## Règle du verdict

```
signaux décisifs = { Progressivité, Fraîcheur, Réponse à l'effort, Découplage }

si Progressivité est insuffisante                 → PAS DE VERDICT
# les règles suivantes ne portent que sur les signaux qui ont assez de données
si au moins un signal décisif est en Alerte       → ALLÉGER
sinon si au moins un signal est À surveiller ou en Alerte → MAINTENIR
sinon si au moins un signal décisif est insuffisant → MAINTENIR
sinon                                             → AUGMENTER
```

- Un signal insuffisant ne déclenche jamais « Alléger », et il n'est jamais compté comme « À surveiller ». Un signal décisif insuffisant empêche seulement « Augmenter ».
- Sans verdict, la carte affiche « Pas encore de verdict », sans fourchette ni simulateur.
- « Hors sous-seuil », « Footings » et « Palier » ne déclenchent jamais « Alléger ». Ils portent sur la qualité d'exécution ou la consolidation, et peuvent seulement retenir à « Maintenir ».
- La monotonie et la contrainte de Foster n'entrent pas dans le verdict, car elles sont élevées par construction en NSA.

**Phrase d'explication**
- AUGMENTER : « Tous les signaux sont au vert : la charge actuelle est absorbée. » Si un signal non décisif est insuffisant : « Tous les signaux disponibles sont au vert : la charge actuelle est absorbée. »
- MAINTENIR, avec au moins un signal À surveiller ou en Alerte : « Rien d'alarmant, mais mieux vaut consolider avant de monter. Point(s) à surveiller : {signaux À surveiller ou en Alerte}. » Si un signal décisif est insuffisant, on ajoute « Pas assez de données sur : {signaux décisifs insuffisants}. »
- MAINTENIR, seulement à cause de données insuffisantes : « Aucun signal défavorable, mais pas assez de données pour conseiller une hausse : {signaux décisifs insuffisants}. »
- ALLÉGER : « À surveiller en priorité : {signaux décisifs en alerte}. »
- PAS DE VERDICT : « Il faut 30 jours d'historique pour comparer la semaine au mois (encore {n} jours). »

## Fourchette des 7 prochains jours

```
référence = km de la dernière semaine terminée,  si verdict ≠ ALLÉGER et palier ≥ 2
          = chronic(J−1) (moyenne sur 30 j par 7 j),  sinon

AUGMENTER : [référence × 1,05 ; référence × 1,10]
MAINTENIR : [référence × 0,95 ; référence × 1,05]
ALLÉGER   : [référence × 0,75 ; référence × 0,90]
(bornes arrondies au km)
```

On prend le palier comme référence quand il existe : une hausse doit partir du volume **réellement tenu**, et non d'une moyenne qui inclut des semaines plus basses. La ligne sous la fourchette indique toujours la référence utilisée et rappelle que « c'est une borne calculée sur le réalisé, pas un plan ».

## Simulateur « et si… »

- **Curseur** : km sur les 7 prochains jours, de `0,5 × référence` à `1,6 × référence`, au pas de 1 km. Par défaut, il est au milieu de la fourchette.
- **Calculs**, mis à jour en direct :

```
ratio projeté = km ÷ ((Σ km(J−23 … J−1) + km) ÷ 30 × 7)

charge par km = Σ charge(30 derniers jours) ÷ Σ km(30 derniers jours)
charge quotidienne simulée = km × charge par km ÷ 7
on itère 7 jours le modèle CTL/ATL à partir des valeurs du jour
fraîcheur dans 7 jours = CTL − ATL
```

- **Résultats** : ratio projeté et fraîcheur dans 7 jours, chacun avec sa pastille d'état (mêmes seuils que les signaux 1 et 2). S'y ajoute une phrase : « Dans la fourchette proposée », « X km au-dessus de la fourchette » ou « X km sous la fourchette ». Une mention rappelle que c'est une « estimation à intensité inchangée ».

## Exemple (données de la maquette)

Au 19 octobre 2026 au soir :
- progressivité 1,04 ;
- fraîcheur −18 ;
- réponse à l'effort 2 s/km plus rapide à FC égale ;
- 0 répétition hors sous-seuil sur 21 ;
- footings 100 % ;
- découplage 3,4 % ;
- palier de 3 semaines autour de 96 km.

Tout est OK, donc le verdict est **AUGMENTER**, avec une fourchette de **100 à 105 km**. Le simulateur, à 103 km (le milieu de la fourchette), donne un ratio de 1,06 et une fraîcheur de −15.

## Critères d'acceptation

- Le verdict est déterministe et reproductible : mêmes données et mêmes paramètres, même verdict.
- Chaque signal cité dans la phrase d'explication (À surveiller, Alerte ou Données insuffisantes) est aussi visible dans la liste.
- Changer un paramètre (plafond, allure seuil, FC de référence, coefficient allure ↔ FC, bande de FC) se répercute sur les signaux concernés après recalcul.
- Les tests unitaires couvrent au moins trois cas, un par verdict, plus les bornes de chaque seuil.
- Chaque signal sous son minimum affiche « Données insuffisantes », en état neutre, avec sa phrase. Les tests couvrent aussi : aucun verdict avant 30 jours ; « Maintenir » quand seul un signal décisif est insuffisant ; un signal non décisif insuffisant sans effet.
