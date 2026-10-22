# Journal des décisions · Fjord

Décisions prises sur les questions ouvertes de la spécification. Chaque entrée renvoie aux fichiers où la règle est écrite de façon définitive.

## D-001 · Classement des minutes par intensité

- **Date** : 2026-10-20
- **Question** : Comment classer chaque minute de course dans les 4 catégories d'intensité (Facile, Allure marathon, Sous-seuil, Au-dessus du seuil) ?
- **Décision** : règle mixte.
  - Pendant une répétition détectée, toute sa durée prend une seule catégorie : `r.hr > lt2Hr → hard`, sinon `subt` (`r.hr` = FC de fin de répétition).
  - Hors répétition (échauffement, récupérations, retour au calme, footings, sorties longues, courses), on lit la FC lissée (moyenne glissante sur les 30 s précédentes), échantillon par échantillon :
    - `FC > lt2Hr` → `hard` ;
    - échantillon appartenant à un segment continu ≥ 10 min où `z2 × hrMax ≤ FC ≤ lt2Hr` → `mp` ;
    - reste → `easy`.
- **Options écartées** :
  - FC point par point partout : le retard de la FC en début de répétition retire environ 1 min par répétition, soit −2,4 points de part de sous-seuil sur l'exemple, jusqu'à un tiers des minutes d'un 10×3' ;
  - FC moyenne par tour : la FC moyenne d'une répétition courte passe sous la borne, et le résultat dépend de la façon dont l'athlète déclenche ses tours ;
  - correspondance directe avec les zones de FC max : ignore `lt2Hr` et garde le problème du retard de la FC.
- **Raison** : c'est la seule règle où les minutes de sous-seuil correspondent au temps de répétition, l'unité suivie par la NSA, que suppose la cible de 20–25 %.
- **Impacts** : minutes par intensité, charge de séance, CTL / ATL / TSB (signal Fraîcheur, simulateur), part et minutes de sous-seuil (C2, C3, journal, comparateur), barres de répartition (A3, H1, H2), segments à allure marathon des sorties longues. Paramètres branchés : `lt2Hr`, `hrMax`, `z2`.
- **Fichiers modifiés** : `04-metriques.md`, `06-parametres.md`, `07-donnees.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : la fiabilité de la détection des répétitions, dont tout dépend ; la part de dérive cardiaque de fin de sortie longue comptée à tort en allure marathon ; la pertinence du lissage sur 30 s.

## D-002 · Initialisation du modèle de charge

- **Date** : 2026-10-20
- **Question** : Quelles valeurs donner à la forme de fond (CTL) et à la fatigue (ATL) au premier jour de l'historique ?
- **Décision** : `jour 1` = date de la première activité importée ; `n = min(28, nb de jours d'historique)` ; `CTL₀ = ATL₀ = Σ charge(jour 1 … jour n) ÷ n`, jours de repos inclus (charge 0). La fraîcheur vaut donc 0 au jour 1. Les courbes sont tracées dès le jour 1. Si des activités plus anciennes sont importées, le jour 1 change et toute la série est recalculée.
- **Options écartées** :
  - partir de 0 et masquer 42 jours : au jour 43, la forme de fond vaut encore 39 au lieu d'environ 62, les séries ne se rejoignent qu'au jour 144, et sans masquage on aurait 32 jours d'alerte « Fraîcheur » à tort ;
  - valeurs fixes (38 / 40) : elles ne correspondent à aucun athlète, et la série ne converge qu'au jour 105 ;
  - partir de 0 et masquer 126 jours : le résultat est juste, mais rien ne s'affiche pendant 4 mois.
- **Raison** : c'est la seule option où la fraîcheur est juste dès les premières semaines (entre −7 et +5 sur les 42 premiers jours de l'exemple), sans fausse alerte ni long masquage.
- **Impacts** : CTL, ATL, TSB sur tout le début de l'historique ; A4 Forme et fatigue ; signal 2 Fraîcheur ; simulateur ; comparateur (forme de fond moyenne et maximale). Aucun effet sur les valeurs actuelles de l'exemple (CTL 78,6, TSB −18,3 au 19 oct.).
- **Fichiers modifiés** : `04-metriques.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : le cas d'un historique qui commence par une reprise après coupure, où la moyenne sur 28 jours sous-estime la charge habituelle.

## D-003 · Ratio de progressivité en km

- **Date** : 2026-10-20
- **Question** : Le ratio de progressivité 7 j / 30 j se calcule-t-il en km ou en charge ?
- **Décision** : en km, de façon définitive. `r(d) = Σ km(d−6 … d) ÷ (Σ km(d−29 … d) ÷ 30 × 7)`. Aucun ratio en charge n'est calculé ni affiché.
- **Options écartées** :
  - charge : l'intensité serait comptée deux fois avec la fraîcheur, la fourchette en km ne découlerait plus du ratio, et une course suffit à passer en « à surveiller » ;
  - pire des deux états : deux chiffres pour un seul signal, et l'état ne change que 3 % des jours ;
  - km avec le ratio en charge en information secondaire : un chiffre de plus à expliquer pour une différence rare, et un second indicateur de progressivité.
- **Raison** : l'intensité est déjà portée par le signal Fraîcheur, qui est calculé sur la charge. Un ratio en km reste dans la même unité que la fourchette qu'il justifie. Sur l'exemple, les deux ratios donnent le même état 373 jours sur 385.
- **Impacts** : aucun changement de calcul. Signal 1, C1, journal H2, infobulle H1, comparateur et simulateur restent en km.
- **Fichiers modifiés** : `04-metriques.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : les semaines où l'intensité change fortement à volume égal (ajout d'une séance sous-seuil, semaine de course). Vérifier que la fraîcheur les capte bien.

## D-004 · Coefficient allure ↔ FC

- **Date** : 2026-10-20
- **Question** : Quel coefficient (s/km par bpm) utiliser pour ramener l'allure des répétitions à la FC de référence ?
- **Décision** : nouveau paramètre `paceHrK`, défaut 1,1 s/km par bpm, borné de 0,6 à 3. `allureNorm(r) = r.pace + (r.hr − refHr) × paceHrK`. L'onglet Paramètres affiche à côté une **valeur suggérée**, que l'athlète n'applique qu'en l'enregistrant :
  ```
  fenêtre : 12 semaines terminant à J−1
  vE, hrE = vitesse moyenne (km/h) et FC moyenne des footings
  vR, hrR = vitesse moyenne et FC de fin moyenne des répétitions
  k = (vR − vE) ÷ (hrR − hrE) × 3600 ÷ vR²    # pente linéaire en vitesse, convertie en s/km à l'allure des répétitions
  suggestion = k arrondi à 0,1, ramené dans [0,6 ; 3]
  ```
  Pas de suggestion s'il y a moins de 5 footings ou moins de 3 séances sous-seuil dans la fenêtre, ou si `hrR − hrE < 10` bpm. Le champ affiche alors « pas assez de données pour suggérer une valeur ».
- **Options écartées** :
  - constante fixe 1,1 : le même coefficient pour tous, alors que l'estimation à deux points donne presque le double pour l'athlète d'exemple ;
  - régression automatique sur 12 semaines : R² ≤ 0,007, car les répétitions NSA sont courues à allure stable. La pente reste collée à la borne basse, et la courbe est réécrite chaque jour ;
  - deux points appliqués automatiquement : la courbe est réécrite chaque jour, et le signal 3 bouge sans nouvelle séance sous-seuil.
- **Raison** : le coefficient est propre à l'athlète, mais le calcul ne change que sur une action explicite. Le verdict reste reproductible et explicable.
- **Impacts** : allure normalisée (séances, semaines), tendance P2, note du nuage P3, signal 3 Réponse à l'effort, comparateur (allure à FC réf.). Nouveau champ dans le groupe Seuil des Paramètres.
- **Fichiers modifiés** : `04-metriques.md`, `05-decision-volume.md`, `06-parametres.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : l'écart entre la valeur suggérée et une pente mesurée lors d'un test progressif ; le biais introduit par le mélange FC moyenne (footings) et FC de fin (répétitions) ; la stabilité de la suggestion d'un mois sur l'autre.

## D-005 · Découplage des sorties longues avec allure marathon

- **Date** : 2026-10-20
- **Question** : Comment calculer le découplage d’une sortie longue qui contient des segments à allure marathon ?
- **Décision** : on le calcule sur les portions faciles seulement, pour toutes les sorties longues :
  ```
  portions retenues = échantillons hors segments mp, et hors 5 min qui suivent la fin de chaque segment mp
  si durée retenue < 60 min → séance non utilisable pour le découplage
  sinon : portions retenues mises bout à bout, coupées en deux moitiés de même durée
          découplage = (1 − EF₂ ÷ EF₁) × 100 %
  ```
  Sans segment à allure marathon, la durée retenue est la séance entière. Le signal 6 porte sur la **dernière sortie longue utilisable**. Quand des minutes ont été retirées, sa phrase précise « portions faciles : {retenu} min sur {total} ». En P2, ces sorties sont tracées avec un losange au lieu d'un rond.
- **Options écartées** :
  - exclure ces sorties : sur l'exemple, plus aucune sortie utilisable depuis le 20 sept., et le verdict perd un signal décisif pendant toute une période de travail à allure marathon ;
  - séance entière avec une mention : la 2e moitié, plus rapide et à FC plus haute, fausse le découplage dans un sens imprévisible ;
  - portions faciles, mais signal non décisif pour ces sorties : la règle du verdict changerait selon le type de sortie.
- **Raison** : le signal décisif reste alimenté, et il est toujours mesuré sur un effort stable, sans changer la règle du verdict.
- **Impacts** : découplage par sortie longue, signal 6, tendance P2 (forme des points), comparateur (découplage moyen), entité Séance (minutes retenues).
- **Fichiers modifiés** : `03-composants.md`, `04-metriques.md`, `05-decision-volume.md`, `07-donnees.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : la durée de 5 min de retour de la FC après un segment ; l'écart de découplage entre les sorties avec et sans allure marathon, à volume égal (si les premières sont systématiquement plus hautes, il faudra le dire dans la phrase du signal).

## D-006 · Paramètres datés ou globaux

- **Date** : 2026-10-20
- **Question** : Un changement de paramètre s'applique-t-il à tout l'historique, ou à partir d'une date d'effet ?
- **Décision** : cela dépend de la nature du paramètre.
  - **Datés** (mesures de l'athlète) : `hrMax`, `hrRest`, `z1`…`z4`, `lt2Hr`, `lt2Pace`, `easyCap`, `subtHrLo`, `subtHrHi`. Chaque modification porte une date d'effet, aujourd'hui par défaut, qui peut être passée mais jamais future. Une séance du jour `d` est calculée avec la valeur de la dernière modification dont la date d'effet est ≤ `d`. Avant la première modification, c'est la première valeur enregistrée qui s'applique. Deux modifications à la même date : la dernière enregistrée remplace l'autre.
  - **Globaux** (références de comparaison et constantes du modèle) : `refHr`, `paceHrK`, `ctlDays`, `atlDays`, `subtPctLo`, `subtPctHi`. Une modification s'applique à tout l'historique.
  - Les libellés qui citent un paramètre daté (« FC moyenne ≤ {easyCap} bpm », ligne de seuil de P4…) affichent la valeur en vigueur à la date concernée. Pour un signal, c'est la valeur à J−1.
- **Options écartées** :
  - tout daté : changer la FC de référence crée un saut artificiel dans P2 (2 s/km sur l'exemple, plus que le seuil OK du signal 3), et un `ctlDays` daté rend la forme de fond incohérente ;
  - tout global : relever le plafond réécrit la discipline passée (85 % → 89 % sur sept.–fév. dans l'exemple), et changer `lt2Hr` réécrit la charge passée ;
  - tout daté, sans rétroactivité : les mêmes sauts, et un test passé ne peut pas être reporté à sa date.
- **Raison** : le passé est jugé avec les repères qui étaient vrais à l'époque, et les comparaisons gardent une référence unique.
- **Impacts** : stockage des paramètres (historique des modifications), formulaire Paramètres (champ « à partir du », liste des modifications), recalcul rétrospectif de tout ce qui dépend des paramètres datés, entité Paramètres.
- **Fichiers modifiés** : `04-metriques.md`, `06-parametres.md`, `07-donnees.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : le temps du recalcul complet après une modification rétroactive sur plusieurs années d'historique.

## D-007 · Données insuffisantes

- **Date** : 2026-10-20
- **Question** : À partir de quand un signal a-t-il assez de données, et que devient le verdict quand ce n'est pas le cas ?
- **Décision** :
  - Minimum requis par signal (fenêtres jusqu'à J−1) :

    | Signal | Minimum |
    |---|---|
    | 1 Progressivité | 30 jours d'historique |
    | 2 Fraîcheur | 28 jours d'historique |
    | 3 Réponse à l'effort | 9 séances sous-seuil au total, dont les 3 dernières entre J−21 et J−1 |
    | 4 Hors sous-seuil | 3 séances sous-seuil entre J−21 et J−1 |
    | 5 Footings | 3 footings entre J−14 et J−1 |
    | 6 Découplage | une sortie longue utilisable (D-005) entre J−14 et J−1 |
    | 7 Palier | 2 semaines terminées |

  - Un signal sous son minimum prend l'état **Données insuffisantes** : pastille neutre, valeur « – », phrase qui dit ce qui manque.
  - Verdict :
    ```
    si Progressivité est insuffisante → pas de verdict (« Pas encore de verdict »), ni fourchette ni simulateur
    sinon : on applique la règle habituelle aux seuls signaux qui ont assez de données,
            (ALLÉGER si un décisif est en Alerte, MAINTENIR si un signal est À surveiller ou en Alerte),
            puis, si un signal décisif est insuffisant, AUGMENTER devient MAINTENIR
    ```
- **Options écartées** :
  - neutre et sans effet : sans aucune donnée, le verdict serait « Augmenter » (6 jours au début de l'exemple) ;
  - un signal insuffisant supprime le verdict : 45 jours sans verdict sur l'exemple, et deux semaines sans sortie longue suffisent à le supprimer ;
  - insuffisant compté comme « à surveiller » : la pastille orange présente un manque de données comme un problème, et peu de footings suffirait à bloquer à « Maintenir ».
- **Raison** : on ne conseille jamais d'augmenter sans avoir vu tous les signaux décisifs, et il y a un verdict dès que l'essentiel est disponible.
- **Impacts** : les 7 signaux (état, valeur, phrase), règle et phrases du verdict, fourchette, simulateur, carte A1. Sur l'exemple (414 jours) : 29 jours sans verdict, 33 « Augmenter », 330 « Maintenir », 22 « Alléger ». Aucun changement au 19 oct.
- **Fichiers modifiés** : `03-composants.md`, `05-decision-volume.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : la fenêtre de 21 jours pour les séances sous-seuil, après une coupure ou une période sans sous-seuil ; le nombre de jours où « Maintenir » vient seulement d'un manque de données.

## D-008 · Seuils du verdict fixes et publiés

- **Date** : 2026-10-20
- **Question** : Les seuils du verdict sont-ils réglables dans les Paramètres, ou fixes ?
- **Décision** : les seuils des 7 signaux, les coefficients de la fourchette et les bornes du simulateur sont des **constantes du produit**. Ils sont publiés dans un tableau unique de `05-decision-volume.md` (« Seuils du verdict ») et ne sont pas exposés dans les Paramètres. Une modification passe par une nouvelle entrée de ce journal, après retour d'usage. Le principe 5 de `01-vision.md` est reformulé : les repères de l'athlète sont réglables, les seuils du verdict sont fixes et publiés.
- **Options écartées** :
  - réglables : 11 champs de plus, un verdict qui n'est plus comparable dans le temps, et la possibilité d'ajuster jusqu'à obtenir du vert (tout assoupli d'un cran : « Augmenter » passe de 33 à 85 jours sur l'exemple) ;
  - trois profils prédéfinis : trois tableaux à calibrer sans données réelles, et le profil « souple » a le même effet que des seuils réglables ;
  - percentiles de l'historique de l'athlète : les seuils bougent chaque jour, ce qui va contre la contrainte d'un verdict déterministe et explicable.
- **Raison** : le verdict est le cœur du produit. Ses seuils doivent garder le même sens, et leur calibrage doit être tracé.
- **Impacts** : aucun changement de calcul. Tableau de référence ajouté dans `05`, principe 5 reformulé dans `01`.
- **Fichiers modifiés** : `01-vision.md`, `05-decision-volume.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : la répartition des verdicts. Sur l'exemple, « Maintenir » représente 86 % des jours avec verdict, surtout à cause des footings au-dessus du plafond et des répétitions trop rapides. Si ce chiffre se confirme, il faudra revoir en priorité les seuils des signaux 4 et 5, et le découplage (le seuil le plus sensible).

## D-009 · Bornes des axes calculées sur les données

- **Date** : 2026-10-20
- **Question** : Comment fixer les bornes des axes que la maquette code en dur (nuage allure × FC, tendances, forme de fond, fraîcheur, ratio, part de sous-seuil) ?
- **Décision** :
  ```
  domaine = [min ; max] des valeurs affichées (brutes et lissées)
            ∪ repères du graphique (bandes, lignes d'alerte, zéro)
            ∪ plage minimale du graphique
  élargi de 5 % de l'étendue de chaque côté, puis arrondi au pas de graduation (vers l'extérieur)
  ```
  | Graphique | Pas | Plage minimale |
  |---|---|---|
  | FC de fin (nuage P3) | 2 bpm | 10 bpm, bande `subtHrLo`–`subtHrHi` incluse |
  | Allure (nuage P3, tendance P2) | 5 s/km | 20 s/km |
  | Efficacité en footing (P2) | 0,05 | 0,10 |
  | Découplage (P2) | 1 %, plancher à 0 | 0 à 10 % |
  | Forme de fond et fatigue (A4) | 10 | étendue de 30 |
  | Fraîcheur (A4) | 10 | −30 à +30 |
  | Ratio (C1) | 0,2 | 0,4 à 1,8 |
  | Part de sous-seuil (C3) | 5 % | 0 à 35 % |
- **Options écartées** : bornes fixes, comme dans la maquette : elles coupent les athlètes hors des valeurs de l'exemple (forme de fond > 110, ratio > 1,8 après une coupure, découplage > 10 %).
- **Raison** : les repères restent toujours visibles, aucune valeur n'est coupée, et la plage minimale évite de grossir du bruit.
- **Impacts** : A4, C1, C3, P2, P3.
- **Fichiers modifiés** : `03-composants.md`, `08-systeme-visuel.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : les plages minimales, en particulier celle de l'allure (20 s/km) sur un historique court.

## D-010 · Recalcul sans rechargement

- **Date** : 2026-10-20
- **Question** : Que se passe-t-il après l'enregistrement des paramètres, en production ?
- **Décision** : après un enregistrement valide, toutes les données dérivées sont recalculées en mémoire, à partir de la date d'effet pour un paramètre daté, sur tout l'historique sinon (D-006). La page n'est pas rechargée. On reste sur l'onglet Paramètres, à la même position de défilement. Les sélecteurs locaux sont conservés et l'infobulle est fermée. La zone `role="status"` annonce « Enregistré. Tableau de bord recalculé. » Si le recalcul échoue, les paramètres précédents restent en vigueur, et la zone annonce « Le recalcul a échoué : les paramètres précédents sont conservés. »
- **Options écartées** : recharger la page, comme la maquette : perte de la position et du contexte, et annonce impossible pour les lecteurs d'écran.
- **Raison** : la règle de `06` le demandait déjà ; cette décision en fixe le comportement observable.
- **Impacts** : onglet Paramètres, tous les composants.
- **Fichiers modifiés** : `06-parametres.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : la durée du recalcul complet sur plusieurs années (voir aussi D-006).

## D-011 · Vue tableau des graphiques

- **Date** : 2026-10-20
- **Question** : Quelle forme donner à la vue tableau alternative aux graphiques ?
- **Décision** : chaque graphique porte un bouton segmenté **Graphique · Tableau**. « Tableau » remplace le graphique par un tableau des mêmes séries sur la même période, avec une ligne par point (date ou semaine) et une colonne par série, des en-têtes réels et les formats de `08`. Le tableau défile dans son propre conteneur. Le choix n'est pas mémorisé.
- **Options écartées** : un tableau toujours visible sous chaque graphique, qui double la hauteur des onglets (contre le principe « un à deux écrans ») ; le seul `aria-label`, qui ne donne pas les valeurs.
- **Raison** : toutes les valeurs sont accessibles sans alourdir l'affichage par défaut.
- **Impacts** : tous les graphiques (A2, A4, C1, C2, C3, P2, P3, P4, H1).
- **Fichiers modifiés** : `02-navigation.md`, `03-composants.md`, `08-systeme-visuel.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : rien.

## D-012 · Stockage local dans le navigateur

- **Date** : 2026-10-20
- **Question** : Où sont stockés les activités importées, les paramètres et l'historique de leurs modifications, alors que Fjord est une application sans serveur, pour un seul athlète ([ADR 0001](../adr/0001-perimetre-deploiement.md)) ?
- **Décision** :
  - Les activités importées (flux et tours compris), les données dérivées, les paramètres et l'historique des modifications datées sont stockés dans **IndexedDB, sur l'appareil**. Ils sont rattachés au seul athlète connecté.
  - Au premier lancement, Fjord demande au navigateur un stockage persistant (`navigator.storage.persist()`).
  - L'onglet Paramètres propose **« Exporter mes données »** et **« Importer une sauvegarde »**. Le fichier JSON contient tout ce qui ne peut pas être retéléchargé, c'est-à-dire au minimum les paramètres et l'historique de leurs modifications, et tout ce qui est nécessaire pour restaurer la base (le contenu exact est fixé par l'ADR de stockage).
  - La barre supérieure affiche la date de la dernière synchronisation (inchangé).
  - Le message de validation n° 5 de `06` (« Impossible d'enregistrer dans ce navigateur (stockage bloqué). ») s'applique tel quel.
- **Options écartées** :
  - stockage côté serveur : il demande un serveur à administrer, que l'athlète refuse (ADR 0001) ;
  - stockage local sans sauvegarde : si le navigateur efface ses données, les paramètres datés et leur historique sont perdus, et ils ne peuvent pas être retéléchargés.
- **Raison** : sans serveur, le navigateur est le seul stockage possible. La sauvegarde par fichier protège ce qui ne vient pas de la plateforme.
- **Impacts** : persistance (`02`), stockage des paramètres (`06`), entité Paramètres (`07`), onglet Paramètres (deux actions de plus). Chaque appareil a sa propre base, sans synchronisation entre appareils.
- **Fichiers modifiés** : `02-navigation.md`, `06-parametres.md`, `07-donnees.md`, `README.md`.
- **À valider sur données réelles** : la taille de la base et du fichier de sauvegarde pour plusieurs années de flux ; la tenue du stockage persistant sur le navigateur du téléphone.

## D-013 · FC échantillonnée

- **Date** : 2026-10-21
- **Question** : La spécification parle de « FC battement par battement ». Que fournissent réellement la montre et la ceinture, et comment les calculs traitent-ils un pas de FC variable ?
- **Constat** (export réel de l'athlète, archive Strava, 2026-10-21) : sur 406 fichiers FIT de course, la FC est enregistrée toutes les **5 s** dans 290 fichiers (convertis par Strava depuis Apple Santé) et toutes les **1 s** dans 108 fichiers. Aucun fichier ne contient d'intervalles R-R. Les autres flux (temps, distance, vitesse, altitude) sont à 1 s.
- **Décision** :
  - `01` (principe 2) et `07` disent « FC échantillonnée par la ceinture (1 à 5 s selon l'appareil) ». Aucun calcul n'utilise d'intervalles R-R.
  - Avant tout calcul, la FC est rééchantillonnée à 1 s, sur la grille des autres flux. Chaque valeur mesurée est prolongée jusqu'à la suivante, sur **10 s au plus**. Au-delà, l'échantillon est manquant (NaN) et il est exclu des moyennes et du lissage.
  - La FC de fin d'une répétition ou d'un tour est la dernière valeur mesurée à son dernier échantillon ou avant.
- **Options écartées** :
  - interpolation linéaire : elle invente des valeurs entre deux mesures, et la FC de fin de répétition dépendrait de la mesure suivante, prise pendant la récupération ;
  - garder les deux résolutions sans rééchantillonner : les moyennes pondérées par échantillon donneraient des poids différents selon l'appareil ;
  - exiger une FC à 1 s : 71 % de l'historique réel serait exclu.
- **Raison** : les règles restent calculables à 5 s. Le lissage sur 30 s de D-001 couvre 6 mesures. La FC de fin de répétition a au plus 5 s de retard. Le rééchantillonnage donne le même traitement aux deux pas de FC.
- **Impacts** : classement des minutes (D-001), FC de fin des répétitions (signal 4, nuage P3), EF, découplage (D-005), FC moyenne des footings (signal 5). Aucune règle de seuil ne change.
- **Fichiers modifiés** : `01-vision.md`, `04-metriques.md`, `07-donnees.md`.
- **À valider sur données réelles** : l'écart de FC de fin de répétition entre un fichier à 1 s et le même fichier ramené à 5 s ; la part des minutes `mp` et `hard` qui change entre les deux pas de FC.

## D-014 · Marquage course ou test

- **Date** : 2026-10-21
- **Question** : Comment reconnaître une course ou un test (`07`, règle 1) quand la plateforme ne marque rien ?
- **Constat** (export réel, archive Strava, 2026-10-21) : la colonne « Compétition » est vide pour les 407 courses à pied, et l'athlète confirme n'avoir jamais rien marqué. Les noms par défaut de Strava (« Course à pied le midi »…) contiennent tous le mot « course », et ils couvrent 310 activités. Les courses portent un nom personnalisé (« Semi De Porto Vecchio », « 10k adidas »).
- **Décision** :
  ```
  si la plateforme marque l'activité comme compétition       → course
  sinon si le nom est un nom par défaut de la plateforme      → aucun
  sinon si /\b(test|tt|chrono)\b/i                           → test
  sinon si /(semi|marathon|\d+ ?k\b|10 ?000|corrida|cross|trail|course)/i → course
  sinon                                                       → aucun

  noms par défaut (Strava, fr) = /^Course à pied (le matin|le midi|dans l'après-midi|en soirée|de nuit)$/
  ```
  - Les noms par défaut et les motifs sont des **constantes versionnées**, comme les seuils du verdict (D-008). Chaque adaptateur fournit ses propres noms par défaut, par langue.
  - Le marquage se fait **sur la plateforme** (case « Compétition », ou nom de l'activité), jamais dans Fjord. Un renommage à la source est repris à la synchronisation suivante.
- **Options écartées** :
  - détection par l'effort (distance standard, FC moyenne haute, allure stable) : elle confond les courses avec les séances au seuil et les longs continus, et ses seuils n'ont pas de référence pour être calibrés ;
  - case à cocher dans Fjord : c'est une saisie manuelle, que `01` (principe 2) et `07` excluent ;
  - motif `\d+ ?km` : sur l'export, il classe en course « Paris / Pantin • 11km endurance », un entraînement.
- **Raison** : la règle de `07` reste « marquage ou nom ». Elle est seulement rendue précise et vérifiable. Sur l'export, elle détecte 8 courses, sans faux positif connu.
- **Impacts** : classification des séances (course et test), records, niveau estimé (P5), exclusion des courses dans les autres types de séance.
- **Fichiers modifiés** : `07-donnees.md`, `09-questions-ouvertes.md`.
- **À valider sur données réelles** : les courses gardées sous leur nom par défaut (non détectées) ; l'absence de tests nommés dans l'export, alors que le niveau estimé repose sur le dernier test 5 km (`04`, Équivalences). Si aucun test ni aucune course de 5 km n'existe, le niveau estimé n'a pas de source.

## D-015 · Arrondi avant comparaison aux seuils

- **Date** : 2026-10-21
- **Question** : Un signal compare-t-il aux seuils la valeur brute, ou la valeur affichée ?
- **Décision** : chaque mesure est **arrondie à sa précision d'affichage**, puis comparée aux seuils de `05`. « à » est inclusif ; `>`, `<`, `≥` et `≤` s'appliquent tels qu'écrits. On arrondit au plus proche, et une valeur à mi-chemin s'éloigne de zéro. Précisions : ratio 0,01 ; fraîcheur 1 ; réponse à l'effort 1 s/km ; hors sous-seuil et palier entiers ; footings 1 % ; découplage 0,1 % ; écart du palier 0,1 point de %. Le tableau de référence est dans `05`, « Seuils du verdict ».
- **Options écartées** : comparer les valeurs brutes. Une progressivité de 1,3004 s'afficherait « 1,30 » avec l'état « À surveiller », alors que `05` place 1,3 dans la bande OK. Ce serait contraire au principe 4 de `01`, « Toujours expliquer ».
- **Raison** : ce que l'athlète lit est exactement ce qui a été jugé. Les tests de bornes portent sur des valeurs affichables.
- **Impacts** : les 7 signaux, le verdict, les pastilles du simulateur, les tests de bornes (`05`, critères d'acceptation). Aucun seuil ne change.
- **Fichiers modifiés** : `05-decision-volume.md`.
- **À valider sur données réelles** : rien.

## D-019 · FC max observée

- **Date** : 2026-10-22
- **Question** : Quand l'historique montre une FC plus haute que `hrMax`, Fjord doit-il le dire, et changer le réglage ?
- **Décision** : Fjord **propose**, l'athlète **décide**.
  - Pic d'une séance : la plus haute FC tenue au moins 15 s d'affilée, hors des 5 premières minutes.
  - Séances examinées : de J−365 à J−1, et pas avant la date d'effet de la dernière modification de `hrMax`.
  - Proposition si le plus haut pic, arrondi au bpm, est ≥ `hrMax` en vigueur à J−1 + 3 bpm. À égalité, la séance la plus récente.
  - Encart dans Paramètres, groupe « Données », sous l'import :
    - titre « FC max observée » ;
    - phrase « {bpm} bpm tenus 15 s le {date} (« {nom} », {km} km), au-dessus de votre réglage de {hrMax} bpm. » ; sans nom : « ({km} km) » ;
    - si l'écart dépasse 15 bpm, phrase ajoutée : « Écart important : vérifiez qu’il ne s’agit pas d’un artefact du capteur. » ;
    - boutons « Utiliser {bpm} bpm à partir du {date} » et « Ignorer ».
  - « Utiliser » enregistre une modification datée de `hrMax` à la date de la séance (D-006), avec le recalcul et l'annonce de D-010. « Ignorer » masque cette proposition sur cet appareil ; un autre pic la remplace.
- **Options écartées** : mise à jour automatique (contraire au principe 5 de `01`) ; maximum brut (pointes de capteur).
- **Raison** : un pic soutenu est une borne basse fiable de la FC max ; l'athlète reste maître de ses repères et peut écarter un artefact.
- **Impacts** : séance ②a (`fcPic`), Vue (`suggestionHrMax`), onglet Paramètres. Architecture : ADR 0013.
- **Fichiers modifiés** : `06-parametres.md`.
- **À valider sur données réelles** : le pic retenu sur l'export et la séance citée.

