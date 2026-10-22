# Recherche : suivi d'entraînement course à pied & méthode NSA

Synthèse de la phase de recherche (octobre 2026) qui a servi de base aux maquettes de `maquettes/`.

## 1. La Norwegian Singles Approach (NSA / NSM)

**Origine.** Popularisée par James Copeland (« sirpoc84 ») sur le fil LetsRun *Modifying the Norwegian approach to lower mileage*. C'est une adaptation amateur du double seuil norvégien (Bakken, Ingebrigtsen), pas une méthode officielle. Elle vise surtout les coureurs qui s'entraînent 5 à 9 h par semaine.

**Structure type**
- 2 à 3 séances **sous-seuil** par semaine, jamais deux jours durs d'affilée.
- 1 sortie longue facile.
- Tout le reste en footing vraiment facile : plafond ≈ 70–75 % FCmax.
- Sous-seuil ≈ **20–25 % du temps** de course hebdo. Certains posts LetsRun visent plutôt ~10 % au départ.
- Semaine très répétitive, par exemple : L footing · M 6×6' · M footing · J 10×3' · V repos · S 3×10' · D sortie longue.

**Séances et intensités**

| Format | Récup | Allure de départ indicative |
|---|---|---|
| 8–12 × 3' | 60" | allure 12–15 km |
| 4–6 × 6–8' | 60–90" | allure semi / 20 km (les sources varient jusqu'à l'allure 30 km) |
| 3 × 10–12' | 90–120" | allure 25–30 km |

- Repère physiologique : juste sous LT2. Viser **≈ 2,5–3,5 mmol/L** en fin de dernière répétition (les sources ne s'accordent pas entre LT1 et LT2). RPE ≈ 6/10, « contrôlé ».
- Le piège principal est la **dérive d'allure** (*pace creep*) : courir les répétitions trop vite. Le lactate, la FC de fin de rép. et la régularité sont donc les vrais indicateurs de qualité d'une séance.
- Réévaluer les allures par un **test 5 km toutes les 4 à 6 semaines**.

**Adaptations par distance**
- Méthode plutôt calibrée 5 km → semi.
- **Marathon** : après 6 à 8 semaines de base NSA, remplacer une séance sous-seuil par du travail à allure marathon. Souvent la sortie longue intègre des blocs AM. Ensuite, progression du volume de sortie longue et du volume sous-seuil. Des plans TrainingPeaks et FinalSurge « Norwegian Singles » marathon le formalisent.
- Critique fréquente : risque de stagnation si l'on ne fait que du NSA d'année en année. C'est un argument pour une **vue multi-saisons**.

**Conséquences pour le produit**
1. Unité clé : **minutes sous-seuil par semaine et % du temps**, avec une cible visible.
2. Qualité de séance : **allure par répétition vs cible**, FC de fin de rép., lactate optionnel.
3. Discipline facile : **% de footings sous le plafond FC**.
4. Progression : **allure sous-seuil à FC constante**, courbe lactate/allure, chronos 5 km.
5. La **monotonie de Foster sera structurellement élevée** en NSA. Il faut l'afficher avec du contexte, sans en faire une alerte brute.

## 2. Marché : ce que font les outils existants

| Outil | Points forts pour notre usage | Limites |
|---|---|---|
| **TrainingPeaks** | Performance Management Chart (CTL/ATL/TSB), rTSS / hrTSS, plans TSS. Référence des coachs. | Pensé triathlon / vélo, payant ; peu de lecture « séance par répétition ». |
| **Intervals.icu** | Gratuit. Fitness / fatigue / forme colorée, choix du modèle de charge (TRIMP, temps en zones, FC moyenne), constantes réglables, découplage et EF. Très apprécié des pratiquants NSA. | Dense, courbe d'apprentissage. |
| **Runalyze** | VO2max effective par sortie, *marathon shape* (et équivalents 10 km / semi) pour corriger les prédictions trop optimistes, statut de performance vs résultats, ATL/CTL. | Interface datée. |
| **Garmin Connect** | Statut d'entraînement, *Training Load Focus* (aérobie basse / haute / anaérobie, 4 semaines). | Boîte noire, peu exportable. |
| **Coros EvoLab** | Charge aiguë / chronique, prédicteur de course, gratuit avec la montre. | Tendances long terme limitées. |
| **Polar Flow** | Training Load Pro, Nightly Recharge, test orthostatique. | Interface vieillissante. |
| **Stryd PowerCenter** | Puissance, charge, tendance de forme. | Nécessite le capteur. |
| **Strava / Runna** | Social, Relative Effort ; Runna = générateur de plans adaptatif. | Analyse de charge légère. |
| **Apps NSA** (NSA Running, Norwegian Singles, Lactrace, thethresholdapp…) | Calculateurs d'allures sous-seuil depuis un 5 km / VDOT, paces 3' / 6' / 10'. | Ce sont des **calculateurs** : aucun suivi longitudinal. |
| **Dashboards Strava auto-hébergés** (Statistics for Strava / Dreeve…) | Heatmap calendrier, stats multi-années. | Génériques, aucun concept NSA. |

**Le créneau.** Les outils de charge sont génériques, et les outils NSA sont de simples calculateurs. Personne ne propose un tableau de bord **longitudinal, multi-saisons, pensé NSA** : minutes sous-seuil, qualité des répétitions, lactate, discipline facile, comparaison bloc par bloc.

## 3. Métriques et modèles retenus

| Métrique | Définition | Usage / repères |
|---|---|---|
| **Charge de séance** | TRIMP (FC) ou sRPE × durée ; ici pondération par zone. | Base de tous les modèles. |
| **CTL / ATL / TSB** | Moyennes exponentielles 42 j / 7 j ; TSB = CTL − ATL (veille). | TSB −10 à −25 = charge productive ; < −25 = surcharge ; > +5 = fraîcheur (affûtage). |
| **ACWR** | Charge 1 sem. / moyenne 4 sem. | 0,8–1,3 « zone sûre », > 1,5 vigilance. Preuve scientifique débattue (Dijkhuis 2020, Frontiers 2021) : un signal parmi d'autres. |
| **Monotonie / contrainte (Foster)** | moyenne / écart-type de la charge quotidienne ; contrainte = charge × monotonie. | À contextualiser pour la NSA. |
| **Répartition d'intensité** | Temps facile / AM / sous-seuil / > seuil. | Cible NSA ≈ 75–80 % facile, 20–25 % sous-seuil. |
| **Efficiency Factor** | vitesse ÷ FC (footings stables). | Tendance hausse = meilleure base. |
| **Découplage aérobie** | EF 2e moitié vs 1re moitié (sortie longue). | < 5 % = base solide ; à lire sur des efforts stables uniquement. |
| **Allure à FC constante** | allure sous-seuil normalisée à une FC de référence. | Signal de progression propre à la NSA. |
| **Prédictions** | Riegel (1,06), VDOT, corrigées par une « préparation spécifique » (volume de sortie longue) comme le *marathon shape* de Runalyze. | Éviter les prédictions marathon trop optimistes. |

## 4. Bonnes pratiques de dashboard relevées

- Commencer par un résumé (état du jour, compte à rebours, forme), le détail vient ensuite.
- Volume hebdo **empilé par intensité** : volume et répartition se lisent ensemble.
- **Heatmap calendrier** pour la régularité sur plusieurs années, avec une échelle propre à l'athlète.
- **Vue par blocs / plans** (base → construction → spécifique → affûtage) avec les courses posées dessus. C'est la lecture « au fil des saisons ».
- Bandes cibles visibles : 20–25 % sous-seuil, ACWR 0,8–1,3, découplage < 5 %.
- Comparer **prévu vs réalisé** sans devenir un outil de construction de plan : le plan est importé, seulement affiché.
- Fenêtres de temps sélectionnables : plan en cours, 26 semaines, tout.

## 5. Les trois maquettes

| Fichier | Direction | Pour qui / quand |
|---|---|---|
| `maquettes/a-fjord.html` | **Fjord** : minimalisme nordique, grille suisse, clair et sombre. Bandeau des saisons empilé par zone, PMC, discipline NSA, petits multiples de progression. | Usage quotidien, lecture rapide, équilibré. |
| `maquettes/b-piste.html` | **Piste** : stade d'athlétisme, tableau d'affichage LED, plan représenté comme un tour de piste, semaine en couloirs, séance en feuille de résultats. | Motivation, mobile, vue « où j'en suis ». |
| `maquettes/c-carnet.html` | **Carnet de labo** : papier millimétré, tableaux denses (journal hebdo, registre des plans), courbe lactate/allure, nuage FC × allure, annotations manuscrites générées. | Analyse fine, athlète « data » ou coach. |

**Itération 2 (retenue : Fjord).** Le suivi n'est plus borné à une course : pas de compte à rebours, d'objectif ni de prédiction. Les blocs portent des noms neutres et les courses passées n'apparaissent que comme des résultats. Le niveau est donné en équivalences de Riegel. Fjord reprend aussi deux éléments du Carnet de labo : le nuage allure × FC par répétition (comparé à il y a un an ou au bloc précédent) et le journal hebdomadaire.

Les trois partagent `maquettes/data.js`, un jeu d'exemple déterministe de 14 mois : base, prépa semi, 5 km, prépa 10 km, coupure, base été et prépa marathon en cours (S10/16).

## Sources

- [Norwegian Singles Training Guide](https://norwegiansingles.run/) · [PDF](https://norwegiansingles.run/Norwegian-Singles.pdf)
- [Marathon Handbook : Norwegian Singles](https://marathonhandbook.com/norwegian-singles-training/)
- [The Running Channel : Norwegian Singles](https://therunningchannel.com/norwegian-singles/)
- [LetsRun : Modifying the Norwegian approach to lower mileage](https://www.letsrun.com/forum/flat_read.php?thread=12130781&page=59)
- [Outside : Norwegian method for everyone](https://run.outsideonline.com/training/norwegian-method-for-everyone/)
- [geeks on feet : Norwegian Singles Method](https://geeksonfeet.com/posts/norwegian-singles-method/)
- [norwegian-singles.app : calculateur NSM](https://norwegian-singles.app/en/nsm-calculator/) · [thethresholdapp](https://thethresholdapp.com/calculator) · [Lactrace](https://lactrace.com/norwegian-singles) · [NSA Running (iOS)](https://apps.apple.com/app/id6756863486) · [sweetspot.run](https://sweetspot.run/method)
- [GagaRun : sub-threshold BPM guide](https://www.gagarun.com/blog/norwegian-singles-sub-threshold-bpm-guide)
- [FinalSurge : plan marathon « Norwegian Singles »](https://www.finalsurge.com/coach/StevePalladino/plan/98686) · [TrainingPeaks : NSM 12 semaines marathon](https://www.trainingpeaks.com/training-plans/running/marathon/tp-582642/norwegian-singles-method-12-week-marathon-plan)
- [Intervals.icu forum : fitness / fatigue / form](https://forum.intervals.icu/t/fitness-fatigue-and-form-strava-training-peaks-and-intervals-icu/2803) · [découplage en course à pied](https://forum.intervals.icu/t/decoupling-for-running/24856)
- [Guide TSS / CTL / ATL / TSB](https://ctyeh.com/articles/3608?lang=en)
- [TrainingPeaks : Aerobic Decoupling and Efficiency Factor](https://help.trainingpeaks.com/hc/en-us/articles/204071724-Aerobic-Decoupling-and-Efficiency-Factor) · [Advanced Metrics](https://help.trainingpeaks.com/hc/en-us/categories/48360684672653)
- [Runalyze : marathon shape](https://blog.runalyze.com/features/new-marathon-shape-for-other-distances) · [Running Performance Status](https://blog.runalyze.com/features/new-view-for-your-running-performance-status/) · [glossaire](https://runalyze.com/glossary)
- [Garmin : Training Load Focus](https://www8.garmin.com/manuals/webhelp/GUID-FFD1507E-4334-4F3A-A927-C80BA10A9918/EN-US/GUID-C3205D96-DAB6-4C93-A225-5B8D7B5A5621.html)
- [Dijkhuis et al. 2020 : ACWR et blessures chez les coureurs](https://www.thieme-connect.de/products/ejournals/html/10.1055/a-1171-2331) · [Frontiers 2021 : critique ACWR](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.661200/pdf) · [MDPI 2020 : monotonie / contrainte](https://www.mdpi.com/1660-4601/17/11/4037)
- [Comparatif 2026 : alternatives à TrainingPeaks](https://en.run-motion.com/trainingpeaks-alternatives/) · [Coros vs Polar 2026](https://www.runifyapp.com/blog/coros-app-vs-polar-flow-2026) · [Stryd vs Coros 2026](https://www.runifyapp.com/blog/stryd-vs-coros-pace-2026)
- [Statistics for Strava / Dreeve](https://github.com/robiningelbrecht/statistics-for-strava) · [Smashrun overview](https://discuss.smashrun.com/t/tips-for-using-the-overview/294)
