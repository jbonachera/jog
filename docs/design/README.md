# Jog · Design du tableau de bord

Spécification de référence pour l'implémentation du tableau de bord de suivi de course à pied de Jog. Elle décrit ce que le produit doit permettre, comment il est organisé, chaque composant, chaque calcul et le système visuel. La maquette jointe en est l'illustration exécutable.

> **Design de référence de l'app** : `maquette/mobile.html` (iPhone, iOS 26). `maquette/index.html` est la maquette historique du tableau de bord web.

> **Statut** : design validé sur maquette (v4, octobre 2026). Les valeurs de la maquette sont des **données d'exemple** générées.

## Ouvrir la maquette

```
file:///<chemin du dépôt>/docs/design/maquette/mobile.html
```

- `maquette/index.html` : la maquette historique du tableau de bord web (HTML, CSS et JS dans un seul fichier).
- `maquette/mobile.html` : la maquette iPhone (iOS 26, Liquid Glass, thème Fjord). Mêmes données et mêmes calculs que la maquette bureau. Sur un écran large, elle s'affiche dans un cadre d'iPhone ; sur un téléphone, en plein écran.
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
| [decisions.md](decisions.md) | Journal des décisions D-001 à D-015 : règle retenue, options écartées, impacts |

## Le produit en une phrase

Un tableau de bord **du réalisé**, sans plan ni objectif de course. Il aide un coureur qui suit la Norwegian Singles Approach (NSA) à **décider s'il peut augmenter son volume** et à **mesurer après coup sa progression**, au fil des saisons. Il n'utilise que ce que mesurent une montre GPS et une ceinture cardio.

## Contexte

La recherche initiale (marché, méthode NSA, modèles de charge) est dans [`../../recherche.md`](../../recherche.md). Les maquettes explorées puis écartées (« Piste », « Carnet de labo ») et la planche d'options de volume sont dans [`../../maquettes/`](../../maquettes/).
