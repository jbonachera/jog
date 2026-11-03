# 03 · Composants

Une fiche par composant : **but**, **données**, **affichage**, **interactions**, **critères d'acceptation**. Les formules sont dans [04-metriques.md](04-metriques.md), et la logique de décision dans [05-decision-volume.md](05-decision-volume.md).

Conventions communes :
- **Fenêtres glissantes** : elles s'arrêtent **aujourd'hui inclus** : une séance du jour compte aussitôt ([D-022](decisions.md#d-022--les-séances-du-jour-comptent-aussitôt)).
- **Semaine** : du lundi au dimanche. Une semaine est « terminée » une fois son dimanche passé.
- **Unité de volume** : le **km** partout. Les heures n'apparaissent qu'en information secondaire.
- **Pastille d'état** : chaque état coloré porte aussi un **texte** (OK, À surveiller, Alerte, Dans la cible…). La couleur seule ne porte jamais l'information.
- **Infobulle** : au survol de chaque marque de graphique (barre, point, ligne avec réticule), elle affiche les valeurs exactes. Fond encre, texte inversé, police à chasse fixe.
- **Bornes des axes** : calculées sur les données, selon la règle de [08](08-systeme-visuel.md#règles-des-graphiques), sauf mention contraire.
- **Vue tableau** : chaque graphique porte un bouton segmenté **Graphique · Tableau** qui le remplace par le tableau de ses séries (voir [08](08-systeme-visuel.md#accessibilité)).

---

## Onglet Aujourd'hui

Refonte [D-024](decisions.md#d-024--accueil-unique-et-deux-onglets) à [D-028](decisions.md#d-028--six-qualités-face-à-il-y-a-un-an). Maquette : [`maquette/accueil.html`](maquette/accueil.html). Ordre fixe : N1, A5, A2, puis S1.

**Ligne de jauge** (A5, A2, S2) : une ligne par mesure, sans texte dessous. Grille : libellé · barre · valeur (chasse fixe, alignée à droite) · écart au trait (chasse fixe, `ink-3`). La barre porte la bande de norme (`Bande`), le trait de référence (`ink-2`) et le point de la valeur (accent). Hors bande, le point et l'écart passent en `Attention`. Toucher la ligne affiche sa phrase de référence. Règles : `04`, « Ligne de jauge ».

### N1 · Niveau

**But** : situer le coureur et sa progression sur un an, d'un coup d'œil.
**Données** : niveau VDOT et six qualités (`04`, « VDOT et niveau », « Six qualités »).
**Affichage** :
- en-tête : surtitre « Niveau (VDOT) », le VDOT en grand chiffre sans unité (« 54,2 ») ; à droite « il y a un an », la valeur d'il y a un an et l'écart signé (vert s'il est positif) ;
- radar hexagonal des six qualités, dans l'ordre horaire depuis le haut : Volume, Seuil, Efficacité, Endurance, Régularité, Résilience. Anneaux à 25, 50, 75 et 100 % ; l'anneau 50 %, tracé en `ink-2`, est l'an dernier. Le polygone actuel est en accent, aire teintée ;
- sous chaque nom d'axe, l'écart à un an dans son unité, vert s'il va dans le bon sens, orange sinon, `ink-2` s'il est nul ;
- légende : Il y a un an · Maintenant.
**Interactions** :
- toucher une qualité ouvre une **bulle** (fond encre, texte inversé) : nom, mesure en clair (`04`), écart « face à il y a un an », bouton de fermeture. Le nom touché passe en accent. La bulle ne déclenche pas la navigation ;
- toucher ailleurs sur la carte ouvre **Courses** (N2).
**Cas particuliers** : sans course ni test, titre « Niveau en cours : cours un test 5 km », radar seul. Moins d'un an d'historique : « face à tes 12 premières semaines » sous le titre.
**Critères** : à 320 pt, aucun nom ni écart d'axe n'est coupé. VoiceOver lit chaque axe comme un bouton « Seuil, −9 s/km face à il y a un an ».

### A5 · Récupération (carte)

**But** : lire le matin, en une carte, si le corps absorbe la charge.
**Données** : `Vue.recuperation` (D-023, `04` « Récupération » et « Récupération (lignes) »).
**Affichage** :
- en-tête : « Récupération » sur une ligne, et à droite une pastille d'état (Dans ta norme · Sous ta norme · Récupération basse · Norme en cours · Pas assez de nuits) suivie d'un chevron ;
- 3 lignes de jauge : **VFC** (« 41 ms », écart « −6 »), **FC repos** (« 47 bpm », « +1 »), **Sommeil** (« 6 h 52 », « −38′ »).
**Sans aucune nuit mesurée** : « Aucune nuit mesurée dans Santé. Porte l’Apple Watch la nuit, avec le suivi du sommeil activé. », sans lignes.
**Interactions** : toucher la carte ouvre l'écran **Récupération** (A6 en tête, puis R1 à R7).
**Critères** : toujours au-dessus du pli. Une valeur absente s'écrit « – ».

### A2 · Volume (carte)

**But** : situer le volume réalisé et rappeler le verdict.
**Données** : `04`, « Volume » ; verdict et fourchette de `05`.
**Affichage** :
- en-tête : « Volume », et à droite la pastille du verdict avec la fourchette (« Maintenir · 62–66 km / 7 j › »), colorée selon le verdict ; « Pas encore de verdict » avant 30 jours ;
- 3 lignes de jauge : **Semaine** (« 37,4 km », « +4 % »), **30 jours** (« 248 km », « +6 % »), **{AAAA}** (« 1 842 km », « +11 % »).
**Interactions** : la pastille ouvre **Décision** (A1). Une ligne affiche sa phrase de référence : « à jeudi soir, d'habitude 32–40 km » · « 30 j précédents 234 km, habituel 210–255 » · « 2025 à date 1 660 km · 42 km/sem · 117 séances ». La ligne Année ouvre ensuite Progrès › Saisons.

### S1 · Séances, par semaine

**But** : tout le réalisé, du plus récent au plus ancien, sans quitter l'accueil.
**Affichage** :
- un **en-tête par semaine** (lundi → dimanche), collé en haut pendant le défilement : « Cette semaine » ou « Sem. du {lundi} », km et durée à droite ; barre de répartition par intensité (4 couleurs) ; ligne « {n} séances · {n} seuils · {min}′ sous-seuil ({part} %) » ;
- sous l'en-tête, une **carte de séance** (S2) par séance, de la plus récente à la plus ancienne. Les séances du jour ont un contour accent ;
- un jour de repos n'a pas de ligne ; une semaine sans séance garde son en-tête avec « aucune séance ».
**Interactions** : une carte ouvre **Séance** (S3) ; un en-tête ouvre le détail de la semaine (ratio 7 j / 30 j au dimanche, footings sous le plafond) ; un sélecteur de mois permet de sauter dans le temps. Chargement au fil du défilement.

### S2 · Carte de séance

**But** : lire une séance selon son type, avec la même carte partout.
**Données** : `04`, « Carte de séance ».
**Affichage** :
- ligne 1 : pastille de couleur du type, nom (« Footing », « Sous-seuil 5×8′ », « Sortie longue », « Course · 10 km ») ; à droite la date (« auj. 12:15 », « mer. 29 · 18:05 ») ;
- ligne 2, chasse fixe : distance · durée · allure (sous-seuil : allure moyenne des répétitions) ;
- ligne 3 : « Verdict » (surtitre) et la réponse en un mot dans une pastille d'état ;
- 2 ou 3 lignes de jauge, selon le type (`04`).
**Critères** : la même carte pour la séance du jour et les séances passées ; seul le contour change. Une jauge sans norme affiche « Norme en cours (n sur 4) ».

## Écrans de détail

### N2 · Courses

Ouvert depuis N1. Titre « Courses », à droite « {n} courses et tests ».
- carte d'en-tête : « Niveau (VDOT) » et sa valeur ; à droite la course qui le fixe ; courbe du VDOT de chaque course dans le temps, avec la valeur d'il y a un an en pointillé ;
- filtres : Toutes · 5 km · 10 km · Semi · Marathon ;
- liste par année, la plus récente en haut ; une ligne par course ou test : date, distance (« Test 5 km » pour un test), temps · allure, VDOT à droite, chevron. Toucher ouvre **Séance** (S3).

### S3 · Séance

Ancienne P4, élargie à tous les types. Mise en page **éditoriale** ([D-034](decisions.md#d-034--résumé-de-séance-éditorial-par-type)) : un récit qui se lit de haut en bas, sans cartes encadrées. Maquette : [`maquette/seance.html`](maquette/seance.html).

**Tronc commun** (tous les types, dans cet ordre) :
1. **Surtitre** « {Type} · {jour} {date} » (capitales, `ink-2`) ; à droite, le verdict de la carte S2 dans une pastille d'état.
2. **Chiffre héros**, police arrondie 800, 104 pt (88 pt si plus de 5 caractères), interlettrage −0,06em, sans retour à la ligne. Il dépend du type (tableau ci-dessous).
3. **Phrase** de 1 à 2 lignes, 19 pt, `ink-2`, les valeurs en gras `ink`. Elle dit le chiffre clé du type et sa comparaison.
4. **Tracé** GPS dessiné comme une ligne, sans fond de carte, sur une grille `--grid`, coloré par l'allure sur la rampe d'intensité (4 classes, plus rapide = plus intense), avec un point de départ `good` et des bornes kilométriques. Légende sous le tracé. Sans GPS, le bloc disparaît.
5. **Blocs du type**, chacun ouvert par un **filet** : trait `ink` de 1 px, titre en capitales à gauche, contexte (« face à tes footings des 8 dernières semaines ») à droite.
6. **Source** (D-033) en dernier.

Blocs réutilisés : **jauges** (lignes de jauge de S2, sans cadre, séparées par `--line`) ; **duo** (grille 2 colonnes de chiffres 30 pt avec libellé et écart, filets `--line`) ; **courbe** (allure, FC, altitude au fil de la distance, réticule et infobulle) ; **barre empilée** d'intensité ; **tableau** des tours (km, allure, ajustée, FC, D+).

| Type | Héros | Phrase | Blocs, dans l'ordre |
|---|---|---|---|
| Footing | distance (« 8,2 km ») | durée, allure, FC moyenne et écart au plafond (« 6 bpm sous ton plafond facile ») | Jauges (FC moyenne, EF) · **Plafond facile** : courbe de FC avec le plafond [easyCap] en pointillé rouge libellé, puis barre « sous le plafond / au-dessus » (`04`, « Temps sous le plafond ») · Les chiffres (allure et allure ajustée, cadence, D+, charge) · Allure (courbe) · Les tours (FC en `Attention` au-dessus du plafond) |
| Sous-seuil | structure (« 5×8′ ») | allure moyenne des répétitions, nombre dans la bande, répétition hors bande nommée | Tracé **bicolore** : répétitions en `ZAuDessus`, le reste en `ZFacile` · **FC de fin de répétition** : sucettes (une par répétition, valeur au-dessus), bande de sous-seuil, seuil en pointillé rouge ; point hors bande en `Attention` · Jauges (FC de fin moyenne, allure normalisée) · Les répétitions (tableau : allure, ajustée, distance, FC de fin) · Allure et FC (courbes, répétitions surlignées en `--band`, seuil sur la FC) · Les chiffres (total, minutes de sous-seuil, charge, part de sous-seuil de la semaine) |
| Course, test | temps (« 41:52 ») | allure, VDOT et écart au niveau, écart entre les moitiés | Jauges (VDOT, FC moyenne, charge) · **Gestion de course** : barres d'allure par km, plus rapide que la moyenne en accent, moyenne en pointillé ; duo 1re et 2de moitié (`04`, « Moitiés de course ») · Équivalences de cette course (5 km, semi, marathon) et record de la distance, avec « nouveau » s'il tombe · FC (courbe) |
| Sortie longue | distance (« 18,4 km ») | durée, allure, découplage, D+ | Jauges (découplage, D+) · **Découplage** : courbe d'efficacité (`04`, « Courbe d'efficacité ») puis duo EF de chaque moitié, avec FC et allure ajustée · Profil : altitude (aire), puis allure brute (accent) et ajustée (pointillé `ink-3`) · Intensité (barre empilée) · Les tours (meilleure allure ajustée en accent) · Les chiffres (EF, charge) |

**Pas de** bloc de synthèse rédigée (« ce qu'il faut retenir »), **pas de** commande flottante entre résumé, carte et tours : l'écran est un seul défilement. Le verre se limite à la barre (retour, menu ⋯) et à la barre d'onglets.

**Critères** : à 320 pt, le héros tient sur une ligne (réduire à 88 pt puis 72 pt) ; chaque graphique a son `aria-label` et sa vue tableau (D-011) ; le tracé n'est jamais la seule source d'une information (les allures sont aussi dans les tours).

**Barre** : un menu ⋯ remplace le bouton « Marquage » ([D-033](decisions.md#d-033--recharger-une-séance)). En tête, le marquage actuel (« Marquage : automatique (Endurance) ») ; puis Course, Test ; puis « Recharger depuis Santé ». Pendant un travail long, les actions sont grisées et une dernière ligne dit « Disponible à la fin du recalcul de l'historique. ».

**Source** : en bas de l'écran, deux lignes : « Lue dans Santé » (« il y a 3 jours », « en cours… » pendant un rechargement) et « Calculée avec » (« FC max 186 »). Pendant le rechargement, la carte S2 est estompée.

### A7 · Accessoire de progression

Accessoire Liquid Glass de la barre d'onglets ([D-030](decisions.md#d-030--progression-dans-laccessoire-de-la-barre-donglets)). Absent hors travail. Maquette : [`maquette/chargement.html`](maquette/chargement.html).

| État | Gauche | Libellé | Sous-libellé | Droite |
|---|---|---|---|---|
| Import | anneau | « Import · prêt jusqu'au 2 mars » | « 78 sur 112 séances · 6 s » | chevron ⌃ |
| Recalcul | anneau | « Recalcul · FC max 186 » (ou « Recalcul · marquage ») | « 38 sur 62 séances · 4 s » | chevron ⌃ |
| Rechargement | anneau | « Sortie longue · dim. 2 » | « Allures ajustées · étape 2 sur 4 » | chevron ⌃ |
| Terminé | coche verte | « Historique à jour » | « 62 séances recalculées » | (rien), disparaît après 3 s |
| Échec | point d'exclamation orange | « Recalcul interrompu » | « FC max 190 rétablie » | bouton « Réessayer » |

Le temps restant n'apparaît qu'après 5 séances traitées. **Détail** (toucher l'accessoire) : feuille avec le pourcentage, une frise de janvier à aujourd'hui (partie avant la date d'effet en gris, « inchangé »), une ligne par mois (coche, roue ou cercle vide, « 17 / 21 »), puis « Charge, forme, tendances · à la fin ». **Accessibilité** : l'accessoire est lu comme « Recalcul FC max 186, 61 %, 4 secondes restantes » et annonce la fin.

### A6 · Cette nuit

En tête de l'écran Récupération. **Affichage** :
- durée endormie en grand (« 6 h 41 »), avec la pastille « −49 min / besoin », orange si l'écart est ≤ −45 min, neutre sinon ;
- la date « Nuit du mar. 28 oct. au mer. 29 oct. » ;
- un **hypnogramme** en 4 couloirs, de haut en bas Éveillé, Paradoxal, Léger, Profond, avec 3 heures sous l'axe (début, milieu, fin) ;
- 4 valeurs : VFC (ms), FC de repos (bpm), Profond (min), Paradoxal (min) ;
Sans nuit mesurée aujourd'hui : « Pas de nuit mesurée cette nuit. ».
**Couleurs** : profond `ZAuDessus`, paradoxal `ZSousSeuil`, léger `ZFacile`, éveillé `Attention`.


### A1 · Décision

Écran ouvert depuis la pastille du verdict de A2. Sur iPhone, les deux colonnes s'empilent ; chaque signal ouvre son graphique (C1, A4, C2-C3, P2).

**But** : dire en un coup d'œil s'il faut augmenter, maintenir ou alléger le volume des 7 prochains jours, et dans quelle fourchette.

**Disposition** : deux colonnes (5/12 et 7/12), une seule sous 980 px.
- **Colonne gauche** :
  1. Surtitre : « Décision volume · données arrêtées au {jour} au soir ».
  2. **Verdict** en grand titre (32 à 54 px, graisse 800), coloré selon l'état : vert pour Augmenter, orange pour Maintenir, rouge pour Alléger. Avant 30 jours d'historique : « Pas encore de verdict » en `ink-2`, sans fourchette ni simulateur (voir [05](05-decision-volume.md#données-insuffisantes)).
  3. Phrase d'explication.
  4. **Fourchette** des 7 prochains jours, en grand chiffre (« 100–105 km »), avec sa référence de calcul en petit.
  5. **Simulateur** dans un encart : curseur et résultats.
- **Colonne droite** : **8 cartes de signaux** (7 sans nuit mesurée) en grille de 2 colonnes (une seule sous 640 px). Chaque carte contient une pastille d'état, le nom du signal, sa valeur en chasse fixe et une explication d'une ligne. Une carte à surveiller ou en alerte a une bordure teintée. Une carte « Données insuffisantes » a une pastille neutre, la valeur « – » et une phrase qui dit ce qui manque.

**Données, règles, simulateur** : voir [05-decision-volume.md](05-decision-volume.md).

**Critères d'acceptation**
- Le verdict, la fourchette et les signaux sont visibles sans défiler sur un écran de 1440 × 900.
- Chaque signal affiche sa valeur chiffrée, et pas seulement un état.
- Le curseur met à jour ses résultats en direct. Les résultats sont annoncés aux lecteurs d'écran (`aria-live="polite"`).
- La phrase d'explication nomme les signaux qui déclenchent « Maintenir » ou « Alléger ».


---

## Graphiques de détail (ex-onglet Charge)

L'onglet Charge et son sélecteur sont supprimés ([D-024](decisions.md#d-024--accueil-unique-et-deux-onglets)). A4, C1, C2 et C3 s'ouvrent depuis les signaux de la Décision (A1) ; C2 et C3 forment un seul écran « Sous-seuil et discipline ». R1 à R7 forment l'écran Récupération, ouvert depuis A5. La note de discipline ne montre plus la monotonie de Foster.

### A4 · Forme et fatigue

*Déplacée de l'Aperçu (D-023).*

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
  - légende des couleurs de barres.


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

---

## Onglet Progrès

Ordre : P1, P2, P3, P5, puis H1 (Saisons). P4 devient l'écran Séance (S3).

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

*Devenu le détail sous-seuil de l'écran Séance (S3), pour toute séance sous-seuil.*

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

## Ex-onglet Historique

L'onglet est fusionné dans Aujourd'hui ([D-024](decisions.md#d-024--accueil-unique-et-deux-onglets)) : le journal hebdomadaire H2 est remplacé par les en-têtes de semaine de S1, et les colonnes charge, ratio, monotonie, contrainte et footings sont retirées (le ratio et les footings restent dans le détail de la semaine).

### H1 · Saisons et volume hebdomadaire

*Dans Progrès, en dernier ([D-024](decisions.md#d-024--accueil-unique-et-deux-onglets)).*

**But** : lire l'historique, saison après saison.

**Affichage**
- Une barre empilée par semaine, en **km**, répartie par intensité au prorata des minutes : Facile, Allure marathon, Sous-seuil, Au-dessus du seuil.
- Axe en km, graduation tous les 20 km.
- **Résultats de course passés** : ligne pointillée verticale et libellé « {distance} · {temps} ».
- Ligne accent « aujourd'hui » dans la semaine en cours.
- Mois sur l'axe X.
- Légende des 4 intensités.

**Sélecteur** : 12 semaines · 26 semaines · Toutes les saisons. Aucune semaine future n'est affichée.

**Interactions** : infobulle par semaine avec la durée, les km, les minutes et la part de sous-seuil, et le ratio 7 j / 30 j.

---

## Onglet Paramètres

Voir [06-parametres.md](06-parametres.md).
