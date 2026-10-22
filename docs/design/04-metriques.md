# 04 · Métriques : définitions et formules

Toutes les métriques sont calculables à partir des données d'une **montre GPS** et d'une **ceinture cardio** (voir [07-donnees.md](07-donnees.md)). Les noms entre crochets renvoient aux paramètres de [06-parametres.md](06-parametres.md). Pour un paramètre daté, c'est la valeur en vigueur à la date de la séance (voir [06](06-parametres.md#portée-dune-modification)).

## Notations

- `J` : aujourd'hui. Les calculs portent sur les jours **terminés**, jusqu'à `J−1` inclus.
- `km(d)`, `min(d)`, `charge(d)` : somme sur toutes les séances du jour `d`. Elle vaut 0 un jour sans séance.
- **Séance sous-seuil** : séance dont des répétitions ont été identifiées. Chaque répétition `r` a une allure moyenne `r.pace` (s/km) et une FC de fin `r.hr` (bpm).
- Allures en **secondes par km**, affichées en `m:ss`.
- **FC** : flux rééchantillonné à 1 s ([D-013](decisions.md#d-013--fc-échantillonnée)). Chaque valeur mesurée est prolongée jusqu'à la suivante, sur 10 s au plus. Au-delà, l'échantillon est manquant et il est exclu des moyennes. La FC de fin d'une répétition ou d'un tour est la dernière valeur mesurée à son dernier échantillon ou avant.

## Intensité et charge

### Catégories d'intensité

Chaque minute de course est classée dans l'une des 4 catégories affichées :

| Catégorie | Libellé | Couleur |
|---|---|---|
| `easy` | Facile | `--z-easy` |
| `mp` | Allure marathon | `--z-mp` |
| `subt` | Sous-seuil | `--z-subt` |
| `hard` | Au-dessus du seuil | `--z-hard` |

### Règle de classement

Règle mixte ([D-001](decisions.md#d-001--classement-des-minutes-par-intensité)) :

```
Pendant une répétition détectée (voir 07) : toute sa durée prend une seule catégorie
   r.hr > [lt2Hr]   → hard
   sinon            → subt

Hors répétition (échauffement, récupérations, retour au calme, footings, sorties longues, courses),
FC lissée = moyenne glissante sur les 30 s précédentes, échantillon par échantillon :
   FC > [lt2Hr]                                                        → hard
   échantillon d'un segment continu ≥ 10 min où [z2] × [hrMax] ≤ FC ≤ [lt2Hr]   → mp
   reste                                                               → easy
```

- Une répétition est classée d'un seul tenant, d'après sa FC de fin. Le retard de la FC en début de répétition n'enlève donc aucune minute de sous-seuil.
- La catégorie `hard` ne dépend que de la FC. Une répétition trop rapide en allure reste `subt`, mais elle est signalée comme « hors sous-seuil » (voir plus bas).
- La maquette reçoit des minutes déjà classées. Elles correspondent à cette règle : toute la durée des répétitions en sous-seuil, le reste de la séance en facile.

### Charge de séance (type TRIMP)

```
charge = Σ minutes(catégorie) × poids(catégorie)
poids : easy 1 · mp 1,7 · subt 2,3 · hard 3,6
```

La charge est une unité arbitraire. Seule sa tendance compte.

### Forme de fond, fatigue, fraîcheur

Modèle impulsion-réponse, mis à jour une fois par jour avec `L = charge(d)` :

```
TSB(d) = CTL(d−1) − ATL(d−1)                # fraîcheur : valeurs de la veille
CTL(d) = CTL(d−1) + (L − CTL(d−1)) / [ctlDays]   # défaut 42
ATL(d) = ATL(d−1) + (L − ATL(d−1)) / [atlDays]   # défaut 7
```

| Fraîcheur (TSB) | Lecture | État |
|---|---|---|
| < −25 | Surcharge | alerte |
| −25 à −10 | Charge productive | OK |
| −10 à +5 | Équilibre | OK |
| > +5 | Fraîcheur, sous-charge | à surveiller |

**Initialisation** ([D-002](decisions.md#d-002--initialisation-du-modèle-de-charge)) :

```
jour 1 = date de la première activité importée
n      = min(28, nb de jours d'historique)
CTL₀ = ATL₀ = Σ charge(jour 1 … jour n) ÷ n     # jours de repos inclus (charge 0)
```

La fraîcheur vaut donc 0 au jour 1, et les courbes sont tracées dès ce jour. Si des activités plus anciennes sont importées, le jour 1 change et toute la série est recalculée. La maquette part de valeurs fixes (CTL 38, ATL 40).

## Volume

### Compteurs

| Compteur | Fenêtre | Comparaison |
|---|---|---|
| Année | 1er janvier → J−1 | moyenne hebdo = km ÷ nb de jours × 7 |
| 30 jours | J−30 → J−1 | J−60 → J−31, écart = (A − B) ÷ B |
| 7 jours | J−7 → J−1 | J−14 → J−8 |

Une séance compte dès que sa durée est non nulle. L'écart est signalé (orange) au-delà de ±30 %.

### Ratio de progressivité 7 j / 30 j

C'est le **seul** indicateur de progressivité du produit. Il remplace l'ACWR 1:4 semaines, qui ne doit plus apparaître nulle part.

```
s7(d)      = Σ km(d−6 … d)
chronic(d) = Σ km(d−29 … d) ÷ 30 × 7      # moyenne par 7 jours sur 30 jours
r(d)       = s7(d) ÷ chronic(d)
```

- `r(d)` n'est défini que si au moins 30 jours d'historique précèdent `d`. Il est exclu sinon, des graphiques comme des pics.
- **Ratio d'une semaine** = `r(dimanche de la semaine)`, ou `r(J−1)` pour la semaine en cours.
- Repères : 0,8–1,3 progression maîtrisée ; 1,3–1,5 à surveiller ; > 1,5 alerte ; < 0,8 nettement sous la moyenne (à surveiller).
- Le calcul se fait en **km**, de façon définitive ([D-003](decisions.md#d-003--ratio-de-progressivité-en-km)) : même unité que les compteurs et la fourchette. L'intensité est déjà portée par la fraîcheur, calculée sur la charge. Aucun ratio en charge n'est calculé ni affiché.

### Palier de volume

```
réf = km de la dernière semaine terminée
palier = nombre de semaines terminées consécutives, en remontant depuis la dernière,
         dont |km / réf − 1| ≤ 10 %
```

## Méthode NSA

### Part et minutes de sous-seuil

```
minutes SS (semaine) = Σ minutes(subt)
part SS (semaine)    = minutes SS ÷ minutes totales
```

La semaine est dans la cible si la part est comprise entre [subtPctLo] et [subtPctHi] (défaut 20–25 %), avec une tolérance de ±1 point.

### Footings sous le plafond

```
part = nb footings avec FC moyenne ≤ [easyCap] ÷ nb footings
```

Fenêtres : par semaine (journal), sur 8 semaines (note de discipline), sur 14 jours (signal de décision).

### Monotonie et contrainte (Foster)

```
monotonie = moyenne(charge quotidienne sur 7 j) ÷ écart-type(charge quotidienne sur 7 j)
contrainte = charge hebdo × monotonie
```

Elles sont structurellement élevées en NSA, puisque les semaines se répètent. On les affiche dans le journal et dans la note de discipline, mais elles n'entrent **pas** dans le verdict.

## Qualité des répétitions

### Allure normalisée à FC de référence

On ramène chaque répétition à une FC commune [refHr] (défaut 164 bpm) :

```
allureNorm(r) = r.pace + (r.hr − [refHr]) × [paceHrK]  # s/km ; défaut 1,1 s/km par bpm
allureNorm(séance) = moyenne des allureNorm(r) de la séance
allureNorm(semaine) = moyenne des séances de la semaine
```

Plus bas = plus rapide à FC égale = progression.

**Coefficient `paceHrK`** ([D-004](decisions.md#d-004--coefficient-allure--fc)) : c'est un paramètre (défaut 1,1, borné de 0,6 à 3). Il ne change que si l'athlète l'enregistre. Les Paramètres affichent une valeur suggérée :

```
fenêtre : 12 semaines terminant à J−1
vE, hrE = vitesse moyenne (km/h) et FC moyenne des footings
vR, hrR = vitesse moyenne et FC de fin moyenne des répétitions
k = (vR − vE) ÷ (hrR − hrE) × 3600 ÷ vR²
suggestion = k arrondi à 0,1, ramené dans [0,6 ; 3]
```

Pas de suggestion s'il y a moins de 5 footings ou moins de 3 séances sous-seuil dans la fenêtre, ou si `hrR − hrE < 10` bpm.

### Répétition hors sous-seuil

```
hors sous-seuil si r.pace < [lt2Pace]  (plus rapide que l'allure seuil)
                ou r.hr  > [subtHrHi]  (FC de fin au-dessus de la bande)
```

### Régularité de séance

C'est la bande de lecture de la dernière séance : allure moyenne des répétitions de la séance ±3 s/km.

### Centres du nuage allure × FC

Pour chaque période, on prend la moyenne des allures et la moyenne des FC de fin de toutes ses répétitions. L'écart affiché est `moyenne(allureNorm, période de référence) − moyenne(allureNorm, période récente)`, en s/km. S'il est positif, la période récente est plus rapide.

## Endurance

### Efficacité en footing (EF)

```
EF(séance) = vitesse moyenne (m/min) ÷ FC moyenne (bpm)
```

Calculée sur les footings seulement : efforts stables, la seule situation où l'EF a du sens. Hausse = meilleure économie aérobie.

### Découplage aérobie (sortie longue)

```
EF1 = EF de la 1re moitié de la séance (en temps), EF2 = EF de la 2e moitié
découplage = (1 − EF2 ÷ EF1) × 100 %
```

Calculé sur chaque sortie longue, **sur les portions faciles seulement** ([D-005](decisions.md#d-005--découplage-des-sorties-longues-avec-allure-marathon)) :

```
portions retenues = échantillons hors segments mp, et hors 5 min qui suivent la fin de chaque segment mp
si durée retenue < 60 min → séance non utilisable pour le découplage
sinon : portions retenues mises bout à bout, coupées en deux moitiés de même durée,
        EF1 et EF2 calculés sur chaque moitié
```

Sans segment à allure marathon, la durée retenue est la séance entière. Repères : < 5 % base solide ; 5–8 % à surveiller ; > 8 % alerte.

## Performance

### Équivalences (niveau estimé)

```
T(distance) = T_test × (distance ÷ distance_test) ^ 1,06      # Riegel
```

La source est le **dernier test 5 km** (contre-la-montre ou course de 5 km). On l'affiche comme un niveau, jamais comme une prédiction de course.

### Records

C'est le meilleur temps réalisé par distance (5 km, 10 km, semi, marathon), depuis les courses et les tests.

## Comparateur de périodes

Pour une période `[début, fin]` de `n` jours, avec `sem = n ÷ 7` :

| Mesure | Formule |
|---|---|
| km / sem., h / sem., séances / sem., min SS / sem. | somme ÷ `sem` |
| % du temps en SS | Σ min SS ÷ Σ min |
| allure à FC réf. | moyenne des `allureNorm(séance)` de la période |
| FC fin de dernière rép. | moyenne, sur les séances SS, de la FC de fin de la dernière répétition |
| efficacité en footing | moyenne des EF des footings |
| footings ≤ plafond | part sur la période |
| découplage | moyenne des sorties longues utilisables de la période |
| forme de fond moyenne / maximale | sur les valeurs quotidiennes de CTL |
| pic du ratio | max de `r(d)` sur la période, jours sans 30 jours d'historique exclus |
| meilleur test 5 km | min des tests et courses 5 km de la période |
