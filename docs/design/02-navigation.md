# 02 · Navigation et structure

> **Refonte (2026-10-30, [D-024](decisions.md#d-024--accueil-unique-et-deux-onglets))** : deux onglets, accueil unique qui fusionne l'ancien Aujourd'hui et l'Historique, onglet Charge supprimé. Maquette de référence : [`maquette/accueil.html`](maquette/accueil.html).

## Barre d'onglets

Deux onglets, en bas d'écran : **Aujourd'hui** · **Progrès**.

- Les **Paramètres** s'ouvrent depuis un bouton dans la barre de titre d'Aujourd'hui. Ce bouton est grisé pendant un import ou un recalcul ([D-031](decisions.md#d-031--verrou-des-paramètres-et-du-marquage-pendant-un-recalcul)).
- Au-dessus de la barre d'onglets, un **accessoire** (A7) montre l'avancement de tout travail long, sur les deux onglets et dans les écrans empilés ; touché, il ouvre le détail en feuille ([D-030](decisions.md#d-030--progression-dans-laccessoire-de-la-barre-donglets)). iOS 26 minimum.
- Le dernier onglet ouvert est rouvert au lancement.
- Chaque onglet a sa propre pile de navigation. Les écrans de détail s'empilent (retour par glissement ou par le bouton de retour) ; on ne change jamais de contenu par un sélecteur segmenté.

## Contenu par onglet

| Onglet | Question | Contenu, dans l'ordre |
|---|---|---|
| **Aujourd'hui** (par défaut) | « Où j'en suis, et qu'ai-je fait ? » | 1. Niveau (N1) · 2. Récupération (A5) · 3. Volume (A2) · 4. Séances par semaine (S1), de la plus récente à la plus ancienne |
| **Progrès** | « Est-ce que je progresse ? » | 1. Comparer deux périodes (P1) · 2. Tendances (P2) · 3. Allure × FC (P3) · 4. Niveau estimé (P5) · 5. Saisons et volume hebdomadaire (H1) |

Règles d'Aujourd'hui :
- **L'ordre ne change jamais.** Niveau, récupération et volume sont toujours en tête ; tout ce qui est dessous est du passé.
- La récupération est **toujours au-dessus du pli**. Le volume peut passer sous le pli quand une séance du jour s'affiche.
- La liste des séances se charge au fil du défilement. Toucher un en-tête de semaine ouvre un sélecteur de mois pour sauter dans le temps.

Les fiches détaillées sont dans [03-composants.md](03-composants.md).

## Écrans de détail

| Depuis | Toucher | Ouvre |
|---|---|---|
| Niveau (N1) | une qualité du radar | une bulle qui explique sa mesure (sans navigation) |
| Niveau (N1) | la carte | **Courses** (N2) |
| Courses (N2) | une course | **Séance** (S3) |
| Récupération (A5) | la carte | **Récupération** : R1 à R7 |
| Volume (A2) | la pastille du verdict | **Décision** : A1 (verdict, fourchette, 8 signaux, simulateur) |
| Décision | un signal | son graphique : Progressivité (C1), Forme et fatigue (A4), Sous-seuil et discipline (C2 + C3), tendance (P2) |
| Volume (A2) | une ligne | sa phrase de référence, puis la ligne Année ouvre Progrès › Saisons (H1) |
| Séances (S1) | une carte de séance | **Séance** (S3) |
| Séance (S3) | le menu ⋯ | marquage (Course, Test) et « Recharger depuis Santé » ([D-033](decisions.md#d-033--recharger-une-séance)) ; actions grisées pendant un recalcul |
| Accessoire (A7) | l'accessoire | la feuille de progression |
| Séances (S1) | un en-tête de semaine | le détail de la semaine (ratio 7 j / 30 j, footings sous le plafond, répartition) |

## Sélecteurs locaux

Chaque sélecteur agit sur son propre graphique.

| Sélecteur | Valeurs | Agit sur | Mémorisé |
|---|---|---|---|
| Fenêtre de la progressivité | 16 semaines (défaut) · 12 mois | Progressivité 7 j / 30 j | Non |
| Période des saisons | 12 semaines · 26 semaines · Toutes les saisons (défaut) | Saisons (H1) | Oui |
| Comparaison allure × FC | vs il y a un an (défaut) · vs 12 semaines précédentes | Allure × FC | Oui |
| Vue d'un graphique | Graphique (défaut) · Tableau | Ce graphique | Non |
| Comparateur de périodes | 12 dernières sem. / 12 précédentes (défaut) · 12 dernières sem. / même période il y a un an · Dates personnalisées | Comparer deux périodes | Oui, avec les dates |
| Fenêtre de la récupération | 8 semaines (défaut) · 6 mois | VFC et FC de repos | Non |
| Filtre des courses | Toutes (défaut) · 5 km · 10 km · Semi · Marathon | Courses (N2) | Non |

Le sélecteur « Partie de Charge » (Entraînement · Récupération) est supprimé.

## Persistance locale

Préférences d'affichage seulement (UserDefaults). Une lecture ou écriture impossible ne doit jamais casser l'affichage.

| Clé | Contenu |
|---|---|
| onglet actif | Aujourd'hui ou Progrès |
| période des saisons | 12 sem. · 26 sem. · toutes |
| comparaison allure × FC | un an · 12 semaines |
| comparateur | préréglage et dates |

La clé `jog-charge-partie` (partie de l'onglet Charge) n'est plus lue ; elle peut être effacée.

## Tailles d'écran

- Aujourd'hui doit tenir sans défilement horizontal de 320 à 440 pt de large, avec Dynamic Type jusqu'à la taille « XXL ». Une valeur de jauge n'est jamais tronquée ; le libellé se coupe avant la valeur.
- Le « pli » de référence est celui d'un iPhone 15 (environ 540 pt de contenu sous le titre).
