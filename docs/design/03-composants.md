# 03 · Composants

Une fiche par composant : **but**, **données**, **affichage**, **interactions**, **critères d'acceptation**. Les formules sont dans [04-metriques.md](04-metriques.md), et la logique de décision dans [05-decision-volume.md](05-decision-volume.md).

Conventions communes :
- **Fenêtres glissantes** : elles s'arrêtent **hier soir**, dernier jour complet. La journée en cours n'entre dans aucun calcul.
- **Semaine** : du lundi au dimanche. Une semaine est « terminée » une fois son dimanche passé.
- **Unité de volume** : le **km** partout. Les heures n'apparaissent qu'en information secondaire.
- **Pastille d'état** : chaque état coloré porte aussi un **texte** (OK, À surveiller, Alerte, Dans la cible…). La couleur seule ne porte jamais l'information.
- **Infobulle** : au survol de chaque marque de graphique (barre, point, ligne avec réticule), elle affiche les valeurs exactes. Fond encre, texte inversé, police à chasse fixe.
- **Bornes des axes** : calculées sur les données, selon la règle de [08](08-systeme-visuel.md#règles-des-graphiques), sauf mention contraire.
- **Vue tableau** : chaque graphique porte un bouton segmenté **Graphique · Tableau** qui le remplace par le tableau de ses séries (voir [08](08-systeme-visuel.md#accessibilité)).

---

## Onglet Aperçu

### A1 · Décision volume

**But** : dire en un coup d'œil s'il faut augmenter, maintenir ou alléger le volume des 7 prochains jours, et dans quelle fourchette.

**Disposition** : deux colonnes (5/12 et 7/12), une seule sous 980 px.
- **Colonne gauche** :
  1. Surtitre : « Décision volume · données arrêtées au {jour} au soir ».
  2. **Verdict** en grand titre (32 à 54 px, graisse 800), coloré selon l'état : vert pour Augmenter, orange pour Maintenir, rouge pour Alléger. Avant 30 jours d'historique : « Pas encore de verdict » en `ink-2`, sans fourchette ni simulateur (voir [05](05-decision-volume.md#données-insuffisantes)).
  3. Phrase d'explication.
  4. **Fourchette** des 7 prochains jours, en grand chiffre (« 100–105 km »), avec sa référence de calcul en petit.
  5. **Simulateur** dans un encart : curseur et résultats.
- **Colonne droite** : **7 cartes de signaux** en grille de 2 colonnes (une seule sous 640 px). Chaque carte contient une pastille d'état, le nom du signal, sa valeur en chasse fixe et une explication d'une ligne. Une carte à surveiller ou en alerte a une bordure teintée. Une carte « Données insuffisantes » a une pastille neutre, la valeur « – » et une phrase qui dit ce qui manque.

**Données, règles, simulateur** : voir [05-decision-volume.md](05-decision-volume.md).

**Critères d'acceptation**
- Le verdict, la fourchette et les 7 signaux sont visibles sans défiler sur un écran de 1440 × 900.
- Chaque signal affiche sa valeur chiffrée, et pas seulement un état.
- Le curseur met à jour ses résultats en direct. Les résultats sont annoncés aux lecteurs d'écran (`aria-live="polite"`).
- La phrase d'explication nomme les signaux qui déclenchent « Maintenir » ou « Alléger ».

### A2 · Volume réalisé

**But** : valoriser l'accompli et situer le volume récent.

**Disposition** : bandeau de 3 compteurs côte à côte, séparés par des filets verticaux, sur fond de surface avec bordure et coins arrondis. Ils s'empilent sous 980 px.

| Compteur | Fenêtre | Comparaison | Mini-graphique |
|---|---|---|---|
| Année {AAAA} | du 1er janvier à hier | moyenne en km par semaine, pastille neutre | une barre par semaine |
| 30 derniers jours | J−30 à hier | face aux 30 jours d'avant | une barre par jour |
| 7 derniers jours | J−7 à hier | face aux 7 jours d'avant | une barre par jour |

Chaque compteur contient :
- le libellé et la plage de dates ;
- le **km** en grand, avec séparateur de milliers ;
- une ligne secondaire « {durée} · {n} séances » ;
- la comparaison ;
- le mini-graphique.

La pastille d'écart est **orange si |écart| > 30 %**, neutre sinon. Les barres journalières des jours sous-seuil sont en couleur sous-seuil, les autres en couleur facile.

**Interactions** : infobulle par barre, avec la date, le type de séance et les km.

**Critères** : une période sans historique précédent affiche « pas d'historique ». Les jours de repos ont une barre de hauteur nulle, pas de trou.

### A3 · 7 derniers jours

**But** : voir ce qui a été réellement fait cette semaine glissante.

**Disposition** : liste verticale, la plus récente en haut, une ligne par jour de J−7 à hier, jours sans séance compris.
- **En-tête** : « 7 derniers jours » et un résumé « {n} séances · {km} km · {min} min de sous-seuil ».
- **Ligne** (grille : jour 72 px, contenu, détails) :
  - jour court et quantième ;
  - libellé de séance (Footing, Footing + lignes droites, Sous-seuil 6×6', Sortie longue dont 40' allure marathon…) ou **Repos** grisé ;
  - détails en chasse fixe : durée · km · FC moyenne, plus, pour une séance sous-seuil, l'allure moyenne des répétitions ;
  - barre de répartition par intensité.

**Critères** : aucune notion de « prévu ». Une ligne Repos n'a pas de cadre plein.

### A4 · Forme et fatigue

**But** : situer la charge chronique, la fatigue aiguë et la fraîcheur, avec une explication en clair.

**Disposition** : deux graphiques empilés, puis une note.
1. **Graphique forme / fatigue** (hauteur 200) :
   - Forme de fond (CTL) : courbe 2 px couleur accent, avec aire teintée à 12 % ;
   - Fatigue (ATL) : courbe 2 px couleur `ink-3` ;
   - axe Y calculé sur les données, au pas de 10, avec une étendue d'au moins 30 (règle des bornes de [08](08-systeme-visuel.md#règles-des-graphiques)) ;
   - historique complet, échantillonné un jour sur deux.
2. **Graphique de fraîcheur** (TSB, hauteur 130) :
   - axe calculé sur les données, au pas de 10, d'au moins −30 à +30, ligne zéro marquée ;
   - **bande teintée de −25 à −10** (zone productive) ;
   - format signé (+5, −18).
3. **Note**, avec un filet accent à gauche, en 4 paragraphes :
   - définition de la forme de fond, avec sa constante de temps ;
   - définition de la fatigue, avec sa constante ;
   - définition de la fraîcheur et repères de lecture (−10 à −25 productif ; sous −25 surcharge, en alerte ; au-dessus de +5 frais, à surveiller, car le stimulus baisse si ça dure) ;
   - lecture du jour : « forme X, fatigue Y, fraîcheur Z, soit {état} », plus un rappel que seule la tendance compte.

**Interactions** : réticule vertical et infobulle multi-séries (date, CTL, ATL).

**Critères** : un seul axe Y par graphique. La forme et la fraîcheur ne partagent pas un axe. Les constantes affichées suivent les paramètres.

---

## Onglet Charge

### C1 · Progressivité : 7 jours face à 30 jours

**But** : mesurer chaque jour si le volume monte trop vite.

**Disposition** : deux graphiques empilés, sur un axe de temps commun.
1. **Volume** (hauteur 220) :
   - une barre par jour : km des 7 derniers jours à cette date, couleur facile ;
   - par-dessus, une courbe 2 px couleur encre : moyenne hebdomadaire des 30 derniers jours ;
   - point final marqué ;
   - axe en km sur 7 jours.
2. **Ratio** (hauteur 120) :
   - axe calculé sur les données, au pas de 0,2, d'au moins 0,4 à 1,8, bande teintée 0,8–1,3, ligne rouge pointillée à 1,5 libellée « vigilance 1,5 » ;
   - courbe 2 px couleur accent ;
   - points orange quand le ratio dépasse 1,3, rouges au-delà de 1,5 ;
   - dernière valeur libellée.

**Sélecteur** : 16 semaines (défaut) · 12 mois.
**Interactions** : réticule et infobulle partagés par les deux graphiques (date, km sur 7 jours, moyenne sur 30 jours, ratio).
**Critères** : les 29 premiers jours d'historique ne sont pas tracés, car la fenêtre de 30 jours est incomplète. C'est le **seul** ratio de progressivité du produit (voir [04](04-metriques.md#ratio-de-progressivité-7-j--30-j)).

### C2 · Minutes de sous-seuil par semaine

**But** : suivre le volume de travail sous-seuil, unité de base de la NSA.

**Affichage** :
- les 26 dernières semaines terminées, une barre par semaine en couleur sous-seuil ;
- une ligne pointillée encre pour la moyenne des 4 dernières semaines, libellée « moyenne 4 sem. : X min » ;
- une date sur l'axe toutes les 5 semaines.

**Interactions** : infobulle avec la semaine, les minutes et le nombre de séances.

### C3 · Discipline NSA

**But** : vérifier la part de sous-seuil dans la cible et la discipline des footings.

**Affichage** :
- **Graphique** :
  - les 30 dernières semaines terminées, avec la part du temps en sous-seuil, axe calculé sur les données, au pas de 5 %, d'au moins 0 à 35 % ;
  - bande cible teintée, libellée « cible X–Y % » ;
  - barres dans la cible (tolérance ±1 point) en couleur sous-seuil, les autres en couleur facile.
- **Note** :
  - part des footings sous le plafond sur 8 semaines ;
  - monotonie de Foster moyenne, avec cet avertissement : « élevée par construction en NSA, à lire avec la charge et non comme une alerte isolée » ;
  - légende des couleurs de barres.

---

## Onglet Progression

### P1 · Comparer deux périodes

**But** : répondre à « ai-je progressé ? » période contre période, sans dépendre de cycles.

**Contrôles** :
- liste déroulante de préréglages :
  - 12 dernières semaines / 12 précédentes (défaut) : B = J−84 à hier, A = les 84 jours d'avant ;
  - 12 dernières semaines / même période il y a un an : A = B décalée de 364 jours ;
  - Dates personnalisées.
- deux couples de dates, Période A (référence) et Période B (comparée), bornés à l'historique disponible ;
- modifier une date bascule automatiquement sur « Dates personnalisées ».

**Tableau**, en 5 colonnes : groupe · mesure · A · B · écart.
- Les en-têtes A et B rappellent la plage et le nombre de jours. La mention « historique partiel » apparaît si A est plus courte que B de plus de 6 jours.
- Les lignes sont regroupées, avec un filet entre les groupes :

| Groupe | Mesure | Meilleur si |
|---|---|---|
| Volume | km / sem. | plus haut |
| Volume | h / sem. | plus haut |
| Volume | séances / sem. | (neutre) |
| Sous-seuil | min / sem. | plus haut |
| Sous-seuil | % du temps | (neutre) |
| Sous-seuil | allure à {FC réf.} bpm | plus rapide |
| Sous-seuil | FC fin de dernière rép. | (neutre) |
| Endurance | efficacité en footing | plus haut |
| Endurance | footings ≤ plafond | plus haut |
| Endurance | découplage sortie longue | plus bas |
| Charge | forme de fond moyenne | plus haut |
| Charge | forme de fond maximale | plus haut |
| Charge | pic du ratio 7 j / 30 j | (neutre) |
| Performance | meilleur test 5 km | plus rapide |

**Règles d'affichage**
- Les valeurs sont ramenées **à la semaine** pour comparer des périodes de longueurs différentes.
- **Écart** : pastille verte si B fait mieux, orange si B fait moins bien, neutre pour les mesures sans sens de progression. Un écart nul affiche « = ». Une valeur absente affiche « – ».
- Formats des écarts :
  - allure : « −6 s/km » ;
  - pourcentages : en points (« +2 pt ») ;
  - durées : « +1h51 » ;
  - tests : « −1:36 ».
- Une période invalide (début après fin) affiche un message et ne recalcule pas.

**Critères** : le pic du ratio ignore les 29 premiers jours d'historique. Le préréglage et les dates sont mémorisés.

### P2 · Tendances (3 petits graphiques)

**But** : isoler trois signaux de progression sur tout l'historique.

| Graphique | Série | Lissage | Repère | Meilleur si |
|---|---|---|---|---|
| Allure sous-seuil à {FC réf.} bpm | allure normalisée, une valeur par semaine | moyenne glissante sur 4 points | — | plus bas |
| Efficacité en footing | EF moyen par semaine | moyenne glissante sur 4 points | — | plus haut |
| Découplage en sortie longue | découplage de chaque sortie longue utilisable, sur ses portions faciles | moyenne glissante sur 3 points | bande 0–5 % ; losange pour une sortie avec allure marathon, rond sinon | plus bas |

Chaque panneau contient :
- le titre ;
- la **dernière valeur** en grand ;
- une pastille d'écart depuis le début de l'historique, verte si l'évolution va dans le bon sens ;
- le graphique (hauteur 150), avec réticule, et des bornes calculées sur les données : allure au pas de 5 s/km (étendue ≥ 20 s/km), EF au pas de 0,05 (étendue ≥ 0,10), découplage au pas de 1 % (de 0 à au moins 10 %) ;
- une note de méthode d'une ligne.

### P3 · Allure × FC par répétition

**But** : visualiser le gain « même FC, allure plus rapide » sur toutes les répétitions.

**Affichage**
- **Nuage de points** : un point par répétition sous-seuil.
  - X : allure, **axe inversé**, plus rapide à droite, graduation tous les 5 s/km, bornes calculées sur les données.
  - Y : FC de fin de répétition, bornes calculées sur les données (pas de 2 bpm, étendue d'au moins 10 bpm, bande de FC incluse).
  - Bande teintée : plage de FC de fin de répétition des paramètres.
- **Deux périodes** :
  - référence : cercles, couleur facile ;
  - récente : carrés, couleur sous-seuil.
  - La forme double la couleur, pour rester lisible sans distinguer les couleurs.
- **Centres des deux nuages**, marqués en gros, reliés par une **flèche** encre.
- **Légende** : période, plage de dates et nombre de répétitions.
- **Note** : centres « allure à FC → allure à FC », puis l'écart ramené à la FC de référence (« 16 s/km plus rapide »).

**Sélecteur** :
- vs il y a un an : 12 dernières semaines comparées aux mêmes dates un an plus tôt, tronquées au début de l'historique ;
- vs 12 semaines précédentes.

**Interactions** : infobulle par point (date, format, n° de répétition, allure, FC).

### P4 · Dernière séance sous-seuil

**But** : juger la maîtrise de la séance la plus récente : régularité, et rien au-dessus du seuil.

**Affichage**
- **Graphique en sucettes**, une par répétition.
  - Y : allure, plus rapide en haut.
  - Bande teintée : allure moyenne de la séance ±3 s/km.
  - Tige depuis la moyenne jusqu'à l'allure de la répétition.
  - Point couleur sous-seuil, ou **rouge si la répétition est hors sous-seuil** : plus rapide que l'allure seuil, ou FC de fin au-dessus de la borne haute.
  - **Ligne rouge pointillée à l'allure seuil**, libellée « seuil m:ss ».
  - Sous chaque répétition : « #n » et la FC de fin.
- **Sous-titre** : date, format (« 5×8' ») et récupération.

**Interactions** : l'infobulle donne l'allure, l'écart à la moyenne, la FC de fin et la raison du hors sous-seuil le cas échéant.

### P5 · Niveau estimé

**But** : situer le niveau actuel sur chaque distance, sans pronostic de course.

**Tableau** :
- Distance (5 km, 10 km, Semi, Marathon) ;
- équivalence actuelle (Riegel, depuis le dernier test 5 km) ;
- allure ;
- record ;
- date du record (« pas encore couru » sinon) ;
- écart au record, avec une pastille verte si l'équivalence bat le record.

Le sous-titre rappelle la source et la nuance : « c'est un niveau, pas une prédiction ; la performance sur longue distance dépend aussi du volume ».

---

## Onglet Historique

### H1 · Saisons et volume hebdomadaire

**But** : lire l'historique, saison après saison.

**Affichage**
- Une barre empilée par semaine, en **km**, répartie par intensité au prorata des minutes : Facile, Allure marathon, Sous-seuil, Au-dessus du seuil.
- Axe en km, graduation tous les 20 km.
- **Résultats de course passés** : ligne pointillée verticale et libellé « {distance} · {temps} ».
- Ligne accent « aujourd'hui » dans la semaine en cours.
- Mois sur l'axe X.
- Légende des 4 intensités.

**Sélecteur** : 12 semaines · 26 semaines · Toutes les saisons. Il pilote aussi H2. Aucune semaine future n'est affichée.

**Interactions** : infobulle par semaine avec la durée, les km, les minutes et la part de sous-seuil, et le ratio 7 j / 30 j.

### H2 · Journal hebdomadaire

**But** : le détail chiffré, semaine par semaine.

**Tableau** :
- conteneur à hauteur maximale de 560 px qui défile, avec en-tête collant ;
- la semaine la plus récente en haut, la semaine en cours surlignée ;
- colonnes :

| Colonne | Contenu |
|---|---|
| Semaine | date du lundi |
| km | réalisés |
| Durée | h:mm |
| Répartition | barre par intensité, 120 px |
| Sous-seuil | pastille verte dans la cible, orange sinon ; « en cours » pour la semaine courante |
| Séances SS | nombre |
| Charge | somme de la charge |
| Ratio 7 j / 30 j | au dimanche de la semaine, ou à hier pour la semaine en cours ; pastille orange au-delà de 1,3 ou sous 0,8, rouge au-delà de 1,5 |
| Monotonie | Foster |
| Contrainte | Foster |
| Footings ≤ {plafond} bpm | part ; pastille orange sous 90 %, rouge sous 75 % |

---

## Onglet Paramètres

Voir [06-parametres.md](06-parametres.md).
