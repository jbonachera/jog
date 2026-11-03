# Jog · Design du tableau de bord

Spécification de référence pour l'implémentation du tableau de bord de suivi de course à pied de Jog. Elle décrit ce que le produit doit permettre, comment il est organisé, chaque composant, chaque calcul et le système visuel. La maquette jointe en est l'illustration exécutable.

> **Design de référence de l'app** : `maquette/accueil.html` pour la navigation et l'écran Aujourd'hui (refonte D-024 à D-028, octobre 2026) ; `maquette/ensemble.html` (iPhone, iOS 26) pour le système visuel et les écrans de détail. `maquette/index.html` liste toutes les maquettes (une par écran de l'app).

> **Statut** : design validé sur maquette (v4, octobre 2026). Les valeurs de la maquette sont des **données d'exemple** générées.

## Ouvrir la maquette

```
file:///<chemin du dépôt>/docs/design/maquette/ensemble.html
```

- `maquette/accueil.html` : l'accueil retenu (Niveau, Récupération, Volume, séances par semaine), l'écran Courses et la carte de séance par type. Ses données sont un scénario fixe : jeudi 30 octobre.
- `maquette/index.html` : l'index des maquettes ; `maquette/maquette.css` : la pastille de retour à l'index, commune à toutes les pages.
- `maquette/recuperation.html` : l'onglet Récupération (R1 à R7, D-023).
- `maquette/ensemble.html` : la maquette iPhone (iOS 26, Liquid Glass, thème Fjord). Vue d'ensemble : système visuel, Progression, Historique, Paramètres, Décision. Mêmes calculs que `data.js`. Sur un écran large, elle s'affiche dans un cadre d'iPhone ; sur un téléphone, en plein écran.
- `maquette/chargement.html` : la progression des travaux longs (import, recalcul après un réglage ou un marquage, rechargement d'une séance) dans l'accessoire Liquid Glass de la barre d'onglets, et le verrou des Paramètres et du marquage pendant un recalcul (iOS 26 minimum).
- `maquette/seance.html` : l'écran Séance (S3) retenu, en mise en page éditoriale, décliné pour un footing, une séance sous-seuil, une course et une sortie longue (D-034). Données synthétiques propres au fichier.
- `maquette/data.js` : le générateur de données d'exemple, déterministe. Il produit un athlète fictif sur 14 mois en méthode NSA.

La maquette n'a besoin d'aucun serveur. Elle charge seulement les polices depuis Google Fonts, et reste lisible hors ligne avec les polices de repli.

## Sommaire

| Document | Contenu |
|---|---|
| [01-vision.md](01-vision.md) | Ambitions, utilisateur, questions auxquelles le produit répond, principes, non-objectifs |
| [02-navigation.md](02-navigation.md) | Structure en onglets, rôle et contenu de chaque onglet, persistance |
| [03-composants.md](03-composants.md) | Fiche détaillée de chaque composant : but, données, affichage, interactions, critères d'acceptation |
| [04-metriques.md](04-metriques.md) | Définition et formule exacte de chaque métrique, fenêtres et seuils |
| [05-decision-volume.md](05-decision-volume.md) | Le cœur du produit : signaux, règles du verdict, fourchette, simulateur |
| [06-parametres.md](06-parametres.md) | Réglages de l'athlète, valeurs par défaut, validation, effets |
| [07-donnees.md](07-donnees.md) | Données d'entrée (montre GPS + ceinture cardio), entités dérivées, classification des séances |
| [08-systeme-visuel.md](08-systeme-visuel.md) | Tokens, typographie, grille, règles des graphiques, accessibilité, rédaction |
| [09-questions-ouvertes.md](09-questions-ouvertes.md) | Questions tranchées (renvois), points à vérifier sur données réelles, écarts connus de la maquette, backlog priorisé |
| [decisions.md](decisions.md) | Journal des décisions D-001 à D-028 : règle retenue, options écartées, impacts |

## Le produit en une phrase

Un tableau de bord **du réalisé**, sans plan ni objectif de course. Il aide un coureur qui suit la Norwegian Singles Approach (NSA) à **décider s'il peut augmenter son volume** et à **mesurer après coup sa progression**, au fil des saisons. Il n'utilise que ce que mesurent une montre GPS et une ceinture cardio.

## Contexte

La recherche initiale (marché, méthode NSA, modèles de charge) est dans [`../../recherche.md`](../../recherche.md). Les maquettes explorées puis écartées (« Fjord » bureau, « Piste », « Carnet de labo », planche d'options de volume, pistes de résumé de séance) ont été supprimées ; elles restent dans l'historique git (dossier `maquettes/` avant le commit « Réorganise les maquettes »).
