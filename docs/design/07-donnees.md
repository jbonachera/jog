# 07 · Données

## Sources autorisées

Seulement ce qu'enregistrent une **montre GPS** et une **ceinture cardio** :

| Donnée | Capteur | Usage |
|---|---|---|
| Horodatage, durée | montre | tout |
| Distance, allure (flux GPS) | montre | volume, allures, EF, découplage |
| Altitude (GPS ou baromètre) | montre | allure corrigée de la pente (backlog) |
| FC échantillonnée (1 à 5 s selon l'appareil, [D-013](decisions.md#d-013--fc-échantillonnée)) | ceinture | FC moyenne et de fin de répétition, intensité, charge, EF, découplage |
| Cadence | montre ou ceinture | non utilisée pour l'instant |
| Tours (manuels ou programmés) | montre | découpage des répétitions |
| Type d'activité, nom, marquage course | montre / plateforme | classification des séances, courses, tests |

Exclus : lactate, puissance, ressenti, sommeil, saisie manuelle.

## Entités

### Activité (importée)

```
id, début (date-heure locale), durée (s), distance (m), type (course à pied)
flux : temps, distance, allure, FC, altitude (échantillons ~1 s ; FC rééchantillonnée à 1 s, voir D-013)
tours : [{ début, durée, distance, FC moy, FC max, FC fin }]
marquage : course officielle | test | aucun
```

### Séance (dérivée d'une activité)

```
date, type ∈ { footing, footing + lignes droites, sous-seuil, sortie longue, course, test }
durée (min), km, FC moyenne, allure moyenne
minutes par intensité { easy, mp, subt, hard }   # règle : 04, « Règle de classement »
charge
répétitions (si sous-seuil) : [{ n°, durée, allure moy (s/km), FC fin (bpm) }], format (ex. « 6×6' »), récupération
sortie longue : découplage (%) ou « non utilisable », minutes retenues pour le découplage, minutes à allure marathon
course / test : distance de référence, temps
```

Un jour sans activité est un jour de **repos**, de charge nulle.

### Paramètres de l'athlète

```
valeurs globales : { refHr, paceHrK, ctlDays, atlDays, subtPctLo, subtPctHi }
modifications datées : [{ paramètre, valeur, date d'effet, enregistrée le }]
```

Stockés sur l'appareil, avec export et import d'une sauvegarde ([D-012](decisions.md#d-012--stockage-local-dans-le-navigateur)).

Voir [06](06-parametres.md#portée-dune-modification) pour la règle d'application.

### Agrégats

- **Jour** : km, minutes, charge, minutes par intensité.
- **Semaine** (lundi → dimanche) :
  - km, minutes, minutes par intensité, part de sous-seuil, nombre de séances SS ;
  - charge, monotonie, contrainte, conformité des footings ;
  - ratio 7 j / 30 j au dimanche ;
  - statut : terminée ou en cours.
- **Série quotidienne du modèle de charge** : CTL, ATL, TSB.
- **Allure normalisée hebdomadaire**, **EF hebdomadaire**, **découplage par sortie longue**.
- **Tests et records** : par distance.

## Classification des séances

Règles retenues. Leurs seuils sont à vérifier sur des données réelles (voir [09](09-questions-ouvertes.md#à-vérifier-sur-données-réelles)) :

1. **Course / test** : marquage de la plateforme, ou nom d'activité, selon la règle de [D-014](decisions.md#d-014--marquage-course-ou-test) :
   ```
   si la plateforme marque l'activité comme compétition       → course
   sinon si le nom est un nom par défaut de la plateforme      → aucun
   sinon si le nom contient test | tt | chrono (mot entier)    → test
   sinon si le nom contient semi | marathon | <n>k | 10 000 | corrida | cross | trail | course → course
   sinon                                                       → aucun
   ```
   Les noms par défaut et les motifs sont des constantes versionnées. Distance de référence = distance standard la plus proche (5, 10, 21,1, 42,2 km).
2. **Sous-seuil** : au moins 3 tours de travail d'au moins 2 min, séparés par des récupérations courtes (≤ 2 min), avec une FC de fin de tour ≥ [subtHrLo] − 5 bpm. À défaut de tours, on détecte automatiquement les répétitions dans le flux d'allure et de FC.
3. **Sortie longue** : durée ≥ 90 min, ou plus longue séance de la semaine si elle dépasse 1,5 × la durée médiane des footings. Les segments à allure marathon sont les segments continus ≥ 10 min classés `mp` (voir [04](04-metriques.md#règle-de-classement)).
4. **Footing** : tout le reste. « + lignes droites » si on détecte des accélérations courtes (< 30 s) en fin de séance.

## Données d'exemple de la maquette

`maquette/data.js` génère un athlète fictif, de façon **déterministe** (graine fixe) :
- historique du 1er septembre 2025 au 19 octobre 2026, avec une coupure de 2 semaines fin juin 2026 ;
- semaine type NSA :
  - lundi footing, mardi sous-seuil 6×6', mercredi footing (lignes droites une fois sur deux), jeudi sous-seuil 10×3' ;
  - vendredi repos ou footing, samedi sous-seuil 3×10' ou 5×8', dimanche sortie longue, avec allure marathon à partir de septembre 2026 ;
- **aucune semaine allégée**, car il n'y en a pas en NSA ;
- environ 6 % de footings manqués, environ 12 % de footings au-dessus du plafond ;
- environ 12 % de répétitions courues trop vite (dérive d'allure) ;
- progression lente de l'allure sous-seuil (de 4:30 à 4:09 environ), découplage en baisse, 7 tests ou courses 5 km, 3 courses (semi, 5 km, 10 km).

Le fichier contient encore des notions de plan (`plans`, `planned`, `race.goal`, `lactate`) héritées des premières maquettes. **Jog ne les lit pas.** Elles ne doivent pas être reprises dans le modèle de données de production.
