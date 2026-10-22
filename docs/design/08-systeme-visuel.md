# 08 · Système visuel « Fjord »

Direction : **minimalisme nordique**. Grille stricte, beaucoup d'air, palette de bleus froids issue d'un seul ton, chiffres en chasse fixe. Le design s'efface derrière les données. La seule emphase est celle de l'état (vert, orange, rouge) et de l'accent bleu.

## Tokens de couleur

Tous les composants passent par ces tokens. Aucune couleur n'est écrite en dur.

| Token | Clair | Sombre | Rôle |
|---|---|---|---|
| `--bg` | `#f4f7f9` | `#0b141c` | fond de page |
| `--surface` | `#ffffff` | `#0f1a24` | cartes, compteurs, tableaux |
| `--ink` | `#0f1e2b` | `#e6eef4` | texte principal, filets forts |
| `--ink-2` | `#4b5d6c` | `#a4b4c1` | texte secondaire |
| `--ink-3` | `#7c8b97` | `#6f8293` | texte tertiaire, axes |
| `--line` | `#dde5eb` | `#1f2f3d` | bordures |
| `--grid` | `#e9eef2` | `#172532` | lignes de grille des graphiques |
| `--accent` | `#2a6390` | `#8bb8d9` | accent, onglet actif, série principale |
| `--band` | `rgba(42,99,144,.10)` | `rgba(139,184,217,.12)` | bandes cibles des graphiques |
| `--z-easy` | `#93b3c9` | `#3b5f7a` | intensité Facile |
| `--z-mp` | `#5f8db0` | `#5c8bb0` | intensité Allure marathon |
| `--z-subt` | `#2a6390` | `#8bb8d9` | intensité Sous-seuil |
| `--z-hard` | `#0f3150` | `#cfe5f4` | intensité Au-dessus du seuil |
| `--good` | `#2f7d4f` | `#5cbf85` | état OK, Augmenter |
| `--warn` | `#a66a00` | `#e0a440` | état À surveiller, Maintenir |
| `--bad` | `#b3372f` | `#ec7a70` | état Alerte, Alléger, seuil |

- Les 4 intensités forment une **rampe ordinale à une seule teinte**, du clair au foncé. En sombre, l'ordre de luminosité s'inverse : plus intense = plus clair. Elle a été validée par le script de contrôle de palette : monotonie de la luminosité, écarts visibles, contraste de l'extrémité claire.
- **Couleurs d'état réservées** : `--good`, `--warn` et `--bad` ne servent qu'aux états. Elles ne sont jamais utilisées pour une série de données.
- Le thème sombre est **un vrai thème** : mêmes tokens, valeurs choisies, pas une inversion automatique. Il suit `prefers-color-scheme` et respecte une surcharge explicite (`data-theme="light|dark"`).

## Typographie

| Rôle | Police | Usage |
|---|---|---|
| Titres et texte | **Schibsted Grotesk** (400–800), repli Helvetica Neue, Arial | tout le texte |
| Chiffres et données | **IBM Plex Mono** (400–500), repli ui-monospace, Menlo | valeurs, axes, infobulles ; toujours `font-variant-numeric: tabular-nums` |

Échelle :

| Élément | Taille | Graisse |
|---|---|---|
| Verdict | `clamp(32px, 4.2vw, 54px)`, interligne 1, interlettrage −0,035em | 800 |
| Grands chiffres des compteurs | 44 px | 800 |
| Fourchette | 34 px | 700 |
| Valeur de tendance | 28 px | 700 |
| Titre de section (`h2`) | 13 px, capitales, interlettrage 0,08em | 600, `ink-2` |
| Sous-titre de composant | 15 px | 600 |
| Texte courant | 15 px, interligne 1,5 | 400 |
| Notes et légendes | 12,5–13,5 px | 400 |
| Axes de graphique | 11 px, chasse fixe | 400, `ink-3` |

Les titres utilisent `text-wrap: balance`.

## Grille et espacement

- Conteneur : largeur max **1320 px**, marges latérales `clamp(16px, 4vw, 48px)`.
- Espacement : 28 px entre composants majeurs, 36 px entre sections d'un onglet, 32–48 px de gouttière dans les grilles.
- Grilles :
  - `g2` (2 colonnes égales) ;
  - `g3` (3 colonnes) ;
  - `subgrid` (2 colonnes égales) ;
  - décision (5/12 et 7/12) ;
  - compteurs (3 colonnes).

  Toutes passent à une colonne sous 980 px.
- Les espacements utilisent `gap`, jamais des marges sur les éléments.
- Cartes : surface blanche, bordure `--line`, rayon 10–12 px, **sans ombre**. On les réserve aux éléments qui doivent se détacher : compteurs, signaux, simulateur, jours, journal. Les sections ne sont pas encadrées.

## Composants de base

- **Pastille d'état** : capsule avec puce ronde et texte, fond teinté à 12–14 % de la couleur d'état. Variantes `good`, `warn`, `bad`, `neutral`.
- **Onglet** : texte 15 px. Onglet actif en graisse 700 avec un soulignement accent de 2 px.
- **Bouton segmenté** (sélecteurs locaux) : capsules ; l'état actif a une bordure et un fond de surface (`aria-pressed`).
- **Note** : filet accent de 2 px à gauche, texte `ink-2`, 70 caractères max par ligne.
- **Infobulle** : fond `--ink`, texte `--bg`, chasse fixe 12 px, rayon 6 px, au-dessus du curseur. Elle ne capte pas le pointeur.

## Règles des graphiques

1. **Un seul axe Y par graphique.** Deux mesures d'échelle différente vont dans deux graphiques empilés sur le même axe de temps (forme / fraîcheur, volume / ratio).
2. **Marques fines** :
   - courbes 2 px, jointures arrondies ;
   - point final de 4–5 px avec anneau couleur de fond ;
   - barres à coins arrondis de 1,5–3 px ;
   - 1–2 px d'espace entre barres et entre segments empilés.
3. **Grille discrète** : lignes `--grid`. Les axes en `ink-3`, 11 px, chasse fixe.
4. **Bandes de repère** (`--band`) pour les zones cibles : 0,8–1,3, cible de sous-seuil, bande de FC, découplage < 5 %, fraîcheur productive. Les seuils d'alerte sont en **ligne pointillée rouge** libellée.
5. **Survol obligatoire** :
   - réticule vertical et infobulle multi-séries sur les courbes ;
   - infobulle par marque sur les barres et les points ;
   - zones de survol plus grandes que les marques.
6. **Identité jamais portée par la seule couleur** :
   - légende dès 2 séries ;
   - forme différente pour les deux périodes du nuage (cercle et carré) ;
   - états toujours libellés.
7. Texte des graphiques en couleurs de texte (`ink-*`), jamais dans la couleur de la série.
8. Graphiques en SVG responsive (`viewBox`, largeur 100 %). La largeur de référence dépend de la colonne : environ 600 en demi-largeur, 1200 en pleine largeur, 400 en tiers.
9. **Bornes des axes calculées** ([D-009](decisions.md#d-009--bornes-des-axes-calculées-sur-les-données)) : domaine = [min ; max] des valeurs affichées (brutes et lissées), auquel on ajoute les repères du graphique (bandes, lignes d'alerte, zéro) et sa plage minimale ; on l'élargit de 5 % de chaque côté, puis on arrondit au pas de graduation, vers l'extérieur. Pas et plages minimales : FC de fin 2 bpm / 10 bpm ; allure 5 s/km / 20 s/km ; EF 0,05 / 0,10 ; découplage 1 % / 0–10 % (plancher 0) ; forme de fond 10 / étendue 30 ; fraîcheur 10 / −30 à +30 ; ratio 0,2 / 0,4–1,8 ; part de sous-seuil 5 % / 0–35 %.

## Accessibilité

- Les onglets suivent le modèle ARIA, avec navigation au clavier (voir [02](02-navigation.md)).
- Chaque graphique a `role="img"` et un `aria-label` qui décrit son contenu.
- Le focus est visible : contour accent de 2 px sur tous les éléments interactifs.
- Les résultats du simulateur et les messages des paramètres sont annoncés (`aria-live` / `role="status"`).
- Les contrastes de texte sont conformes WCAG AA dans les deux thèmes.
- Les tableaux ont des en-têtes réels. Le journal a un en-tête collant.
- **Vue tableau** ([D-011](decisions.md#d-011--vue-tableau-des-graphiques)) : chaque graphique porte un bouton segmenté **Graphique · Tableau**. « Tableau » remplace le graphique par un tableau des mêmes séries sur la même période : une ligne par point (date ou semaine), une colonne par série, des en-têtes réels, les formats de la section Rédaction, et un défilement dans son propre conteneur. Le choix n'est pas mémorisé.
- Respect de `prefers-reduced-motion`. La maquette n'anime rien.

## Rédaction

- En **français**, phrases courtes, voix active, vocabulaire du coureur : « footing », « sortie longue », « sous-seuil », « répétition ».
- Nombres : virgule décimale (« 1,04 »), espace pour les milliers (« 2 813 »), vrai signe moins (« −18 »), signe plus explicite pour les écarts (« +22,6 »).
- Unités : km, min, h:mm (« 7h59 »), allures en m:ss/km, FC en bpm, pourcentages avec une espace (« 22 % ») et écarts de pourcentage en points (« +2 pt »).
- Dates : « 19 oct. », « dim. 18 oct. », « semaine du 12 oct. ».
- Pas de jargon non expliqué : CTL, ATL et TSB sont toujours accompagnés de leur nom en clair (forme de fond, fatigue, fraîcheur).
- **Vocabulaire interdit** : plan, cycle, bloc, semaine allégée, prévu, objectif, préparation, compte à rebours, lactate.
