# 09 · Questions ouvertes, écarts connus, backlog

## Questions tranchées

Le détail de chaque décision est dans [decisions.md](decisions.md).

### Classement des minutes par intensité
Tranché : voir [D-001](decisions.md#d-001--classement-des-minutes-par-intensité).

### Initialisation du modèle de charge
Tranché : voir [D-002](decisions.md#d-002--initialisation-du-modèle-de-charge).

### Ratio en km ou en charge
Tranché : voir [D-003](decisions.md#d-003--ratio-de-progressivité-en-km).

### Coefficient allure ↔ FC
Tranché : voir [D-004](decisions.md#d-004--coefficient-allure--fc).

### Découplage et sorties longues avec allure marathon
Tranché : voir [D-005](decisions.md#d-005--découplage-des-sorties-longues-avec-allure-marathon).

### Paramètres datés
Tranché : voir [D-006](decisions.md#d-006--paramètres-datés-ou-globaux).

### Données insuffisantes
Tranché : voir [D-007](decisions.md#d-007--données-insuffisantes).

### Calibrage des seuils
Tranché : voir [D-008](decisions.md#d-008--seuils-du-verdict-fixes-et-publiés).

## À vérifier sur données réelles

Ce ne sont pas des questions ouvertes : les règles sont fixées. Il faudra en contrôler l'effet une fois de vraies activités importées.

- Classification des séances ([07](07-donnees.md#classification-des-séances)) et détection des répétitions, dont dépend le classement des minutes (D-001).
- Dérive cardiaque de fin de sortie longue comptée à tort en allure marathon, et lissage sur 30 s (D-001).
- Historique qui commence par une reprise après coupure (D-002).
- Semaines où l'intensité change fortement à volume égal (D-003).
- Valeur suggérée du coefficient allure ↔ FC : stabilité et biais (D-004).
- Retour de la FC de 5 min après un segment à allure marathon, et écart de découplage avec ou sans allure marathon (D-005).
- Durée du recalcul complet sur plusieurs années (D-006, D-010).
- Fenêtre de 21 jours des séances sous-seuil, et part des « Maintenir » dus à un manque de données (D-007).
- Répartition des verdicts : 86 % de « Maintenir » sur l'exemple ; revoir en priorité les signaux 4 et 5 et le découplage (D-008).
- Plages minimales des axes sur un historique court (D-009).
- Écart de FC de fin de répétition et de minutes `mp` / `hard` entre une FC à 1 s et à 5 s (D-013).
- Courses gardées sous un nom par défaut, et absence de test 5 km pour le niveau estimé (D-014).

## Écarts connus de la maquette

| Écart | Attendu en production |
|---|---|
| La bande de fraîcheur est tracée de −30 à −10, alors que le texte dit −10 à −25 | Bande de −25 à −10 |
| L'axe FC du nuage allure × FC est fixe (154–172 bpm) | Bornes calculées sur les données (D-009) |
| Les axes des tendances sont fixes (allure 4:00–4:30, EF 1,2–1,45, découplage 0–10 %) | Bornes calculées sur les données (D-009) |
| Les axes de forme de fond (20–110), de fraîcheur (−30 à +30), du ratio (0,4–1,8) et de la part de sous-seuil (0–35 %) sont fixes | Bornes calculées, ces plages devenant des minimums (D-009) |
| `hrRest`, `lt2Hr` et les zones n'ont pas d'effet sur l'affichage | `lt2Hr`, `hrMax` et `z2` pilotent le classement des minutes (D-001) ; `hrRest` reste réservé |
| CTL et ATL partent de valeurs fixes (38 / 40) | Moyenne de la charge quotidienne des 28 premiers jours (D-002) |
| Le coefficient allure ↔ FC est écrit en dur (1,1), sans champ ni valeur suggérée | Paramètre `paceHrK` avec valeur suggérée (D-004) |
| Le découplage des sorties avec allure marathon porte sur toute la séance, et P2 ne les distingue pas | Portions faciles seulement, losange en P2, mention dans le signal 6 (D-005) |
| Un seul jeu de paramètres, appliqué à tout l'historique, sans date d'effet | Paramètres datés et globaux, champ « À partir du », liste des modifications (D-006) |
| Pas de gestion des données insuffisantes | Minimums par signal, pastille neutre, « Pas encore de verdict » avant 30 jours, « Maintenir » au mieux si un signal décisif manque (D-007) |
| L'enregistrement des paramètres recharge la page | Recalcul sans rechargement, annonce dans `role="status"` (D-010) |
| Le fichier de données contient des notions de plan, d'objectif et de lactate, non lues | À ne pas reprendre |
| Aucune vue tableau alternative aux graphiques | Bouton segmenté Graphique · Tableau sur chaque graphique (D-011) |

## Backlog, hors du périmètre validé

Priorité 2 :
- **Charge face à la réponse** : volume par semaine et FC de fin de répétition à allure fixe, empilés sur le même axe de temps, dans l'onglet Charge.
- **Allure corrigée de la pente** (GAP), calculée depuis l'altitude, et utilisée dans toute allure normalisée.
- **Rendement du volume** : nuage du volume moyen sur 8 semaines face au gain d'allure à FC constante.
- **Évolution du niveau estimé** : courbe des équivalences à chaque test ou course.
- **Repères automatiques** sur les frises : tests et courses détectés depuis la montre.

Priorité 3 :
- Sélecteur de période commun aux tendances de l'onglet Progression.
- FC de repos et variabilité cardiaque au réveil, par un test de 2 min avec la ceinture. **Optionnel** : demande une routine quotidienne.
