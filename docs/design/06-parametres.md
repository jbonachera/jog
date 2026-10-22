# 06 · Paramètres

L'onglet **Paramètres** permet à l'athlète d'ajuster ses repères. Toutes les valeurs sont des **mesures ou des repères obtenus avec une montre GPS et une ceinture cardio**.

## Champs

| Groupe | Clé | Libellé | Défaut | Unité | Effet |
|---|---|---|---|---|---|
| Fréquence cardiaque | `hrMax` | FC max | 188 | bpm | Calcul des zones ; borne basse de l'allure marathon (`z2 × hrMax`) |
| | `hrRest` | FC repos | 46 | bpm | Réservé : sans effet sur les calculs pour l'instant |
| | `easyCap` | Plafond des footings | 140 | bpm | Signal « footings », note de discipline, journal, comparateur |
| Seuil | `lt2Hr` | FC au seuil | 172 | bpm | Classement des minutes par intensité : borne entre sous-seuil et au-dessus du seuil, borne haute de l'allure marathon |
| | `lt2Pace` | Allure au seuil | 3:58 | /km (m:ss) | Signal « hors sous-seuil », ligne de seuil de la dernière séance |
| | `refHr` | FC de référence pour l'allure normalisée | 164 | bpm | Allure normalisée : tendances, nuage allure × FC, signal « réponse à l'effort », comparateur |
| | `paceHrK` | Coefficient allure ↔ FC | 1,1 | s/km par bpm | Allure normalisée : mêmes effets que `refHr`. Une valeur suggérée s'affiche à côté du champ (voir [04](04-metriques.md#allure-normalisée-à-fc-de-référence)) |
| Méthode NSA | `subtPctLo` / `subtPctHi` | Part de sous-seuil, min / max | 20 / 25 | % | Cible de discipline, journal |
| | `subtHrLo` / `subtHrHi` | FC de fin de répétition, bas / haut | 160 / 168 | bpm | Bande du nuage allure × FC ; `subtHrHi` sert aussi au signal « hors sous-seuil » |
| Zones | `z1`…`z4` | Limite haute des zones 1 à 4 | 68 / 78 / 85 / 92 | % FC max | Tableau des zones en bpm, mis à jour pendant la saisie. Zone 5 = de `z4` à 100 %. `z2` sert aussi de borne basse de l'allure marathon ; `z1`, `z3` et `z4` n'ont qu'un rôle d'affichage |
| Modèle de charge | `ctlDays` | Forme de fond (CTL) | 42 | jours | Modèle forme / fatigue, note explicative, simulateur |
| | `atlDays` | Fatigue (ATL) | 7 | jours | idem |

Chaque groupe porte une phrase d'aide. Le seuil y est décrit comme « estimé à la FC et à l'allure, par un test de 30 min ou un 10 km couru autour d'une heure ». Il n'y a **aucune** référence au lactate.

## Validation, au moment d'enregistrer

1. Tout champ numérique est présent, fini et strictement positif. Sinon : « Valeur manquante ou invalide : {libellé}. », et le champ reçoit le focus.
2. `lt2Pace` respecte le format `m:ss`. Sinon : « Allure au seuil : utilisez le format m:ss, par exemple 4:02. »
3. `paceHrK` est compris entre 0,6 et 3. Sinon : « Coefficient allure ↔ FC : choisissez une valeur entre 0,6 et 3. »
4. `subtPctLo < subtPctHi`, `subtHrLo < subtHrHi`, et `z1 < z2 < z3 < z4 < 100`. Sinon : « Chaque borne basse doit être inférieure à la borne haute, et les zones doivent croître. »
5. Si le stockage est impossible : « Impossible d'enregistrer dans ce navigateur (stockage bloqué). »

Les messages s'affichent dans une zone `role="status"`, à côté des boutons.

## Actions

- **Enregistrer et recalculer** : valide, enregistre, puis recalcule tout le tableau de bord **sans recharger la page** ([D-010](decisions.md#d-010--recalcul-sans-rechargement)) :
  - le recalcul part de la date d'effet pour un paramètre daté, et porte sur tout l'historique sinon ;
  - on reste sur l'onglet Paramètres, à la même position. Les sélecteurs locaux sont conservés et l'infobulle est fermée ;
  - la zone `role="status"` annonce « Enregistré. Tableau de bord recalculé. » ;
  - si le recalcul échoue, les paramètres précédents restent en vigueur, et la zone annonce « Le recalcul a échoué : les paramètres précédents sont conservés. »

  La maquette, elle, recharge la page et rouvre l'onglet Paramètres.
- **Revenir aux valeurs par défaut** : remet les paramètres globaux à leur défaut, et enregistre pour chaque paramètre daté une modification datée d'aujourd'hui vers sa valeur par défaut. L'historique des modifications est conservé. Puis recalcule.

## FC max observée

Règle de [D-019](decisions.md#d-019--fc-max-observée). Quand une séance de J−365 à J−1 a tenu 15 s une FC ≥ `hrMax` + 3 bpm (hors 5 premières minutes, et pas avant la dernière modification de `hrMax`), un encart du groupe « Données » propose d'enregistrer ce pic comme FC max, à la date de la séance. « Ignorer » le masque sur cet appareil. Textes exacts dans D-019.

## Recalculs déclenchés

Pour un paramètre daté, le recalcul part de la date d'effet. Pour un paramètre global, il porte sur tout l'historique.

| Paramètre modifié | À recalculer |
|---|---|
| `easyCap` | conformité des footings (semaines, 8 sem., 14 j, périodes) |
| `refHr`, `paceHrK` | allure normalisée (séances, semaines), tendances, nuage, signal 3, comparateur |
| `lt2Pace`, `subtHrHi` | répétitions hors sous-seuil (signal 4, dernière séance) |
| `subtHrLo`, `subtHrHi` | détection des répétitions (donc classement des minutes), bande du nuage allure × FC |
| `ctlDays`, `atlDays` | CTL, ATL et TSB sur tout l'historique, simulateur |
| `subtPctLo/Hi` | cible de discipline, pastilles du journal |
| `hrMax`, `z2`, `lt2Hr` | classement des minutes par intensité, donc charge, CTL / ATL / TSB, répartition, part de sous-seuil, segments à allure marathon et tout ce qui en dépend |
| `z1`, `z3`, `z4` | tableau des zones en bpm seulement |

## Portée d'une modification

Règle de [D-006](decisions.md#d-006--paramètres-datés-ou-globaux) :

| Portée | Paramètres | Règle |
|---|---|---|
| **Datés** (mesures de l'athlète) | `hrMax`, `hrRest`, `z1`…`z4`, `lt2Hr`, `lt2Pace`, `easyCap`, `subtHrLo`, `subtHrHi` | Une séance du jour `d` utilise la valeur de la dernière modification dont la date d'effet est ≤ `d`. Avant la première modification, c'est la première valeur enregistrée qui s'applique. |
| **Globaux** (références de comparaison, constantes du modèle) | `refHr`, `paceHrK`, `ctlDays`, `atlDays`, `subtPctLo`, `subtPctHi` | La valeur s'applique à tout l'historique. |

- Le formulaire présente les paramètres datés et les paramètres globaux dans deux ensembles distincts. Les paramètres datés ont un champ **« À partir du »** (date, aujourd'hui par défaut). Une date future est refusée : « La date d'effet ne peut pas être dans le futur. »
- Sous les paramètres datés, une liste des modifications passées (date, paramètre, ancienne → nouvelle valeur) permet d'en supprimer une. La suppression déclenche un recalcul.
- Deux modifications du même paramètre à la même date : la dernière enregistrée remplace l'autre.
- Les règles de validation s'appliquent au jeu de valeurs en vigueur à chaque date touchée.
- Un libellé qui cite un paramètre daté affiche la valeur en vigueur à la date concernée. Pour un signal, c'est la valeur à J−1.

## Stockage en production

Les paramètres appartiennent à l'athlète. Ils sont stockés dans le navigateur (IndexedDB, sur l'appareil), avec l'historique des modifications des paramètres datés ([D-012](decisions.md#d-012--stockage-local-dans-le-navigateur)). Tout recalcul applique à chaque séance les valeurs en vigueur à sa date.

Deux actions de plus, dans l'onglet Paramètres :
- **Exporter mes données** : télécharge un fichier JSON de sauvegarde, qui contient au minimum les paramètres et l'historique de leurs modifications ;
- **Importer une sauvegarde** : remplace la base locale par le contenu du fichier, après confirmation, puis recalcule.
