# 0004 · Import : instantanés par source, empreintes et doublons

- **Statut** : Remplacée par [0014](0014-app-ios-native.md) (2026-10-28, migration iOS). Historique : Acceptée
- **Date** : 2026-10-21
- **Dépend de** : 0001, 0003

## Contexte

Il n'y a pas de serveur, donc aucune notification de la plateforme : les données n'arrivent que lorsque l'athlète importe une archive ou un fichier, ou plus tard quand l'application interroge intervals.icu (0001, 0003). Les contraintes de la spécification :
- la barre supérieure affiche la date de la dernière synchronisation (`02`) ;
- une activité plus ancienne que le jour 1 recalcule toute la série CTL / ATL / TSB (D-002) ;
- un renommage à la source doit être repris, puisque le nom sert au marquage (D-014) ;
- les flux bruts restent disponibles (D-006).

L'export réel compte 406 FIT dans un ZIP de 25 Mo.

## Options considérées

1. **Instantané par source, comparé par empreintes** : une archive est l'état complet de sa source. Ajouts, modifications et suppressions se déduisent par comparaison. Avantages : rejouer un import ne change rien, renommages et suppressions sont repris, le résultat ne dépend pas de l'ordre des imports. Limites : une archive partielle effacerait des activités ; Strava ne fournit que des archives complètes.
2. **Instantané, avec suppressions confirmées par l'athlète**. Écartée parce que : un geste de plus, et un refus laisserait des km faux.
3. **Import additif**. Écartée parce que : il ne reprend pas les renommages (contre D-014), et une activité supprimée à la source reste comptée.

## Décision

- **Clé** : `cleSource` (0003). **Empreinte** : SHA-256 du fichier ou de la réponse d'origine, du nom et du marquage de la plateforme. Une activité dont la clé est absente, ou dont l'empreinte a changé, est (re)dérivée.
- **Nature des sources** :

  | Source | Nature | Suppressions |
  |---|---|---|
  | `strava-archive` | instantané complet | les activités `strava:*` absentes de la nouvelle archive sont supprimées |
  | `fit` (fichier isolé) | additif | aucune |
  | `intervals-icu` (plus tard) | instantané, sur la liste complète des activités | les activités `icu:*` absentes de la liste sont supprimées |

  Une suppression ne touche jamais une autre source que celle importée.
- **Doublons entre sources** : deux activités de course qui se recouvrent à plus de **50 % de la plus courte** dans le temps sont un doublon. On en garde une, dans cet ordre de critères :
  1. le pas de FC médian le plus fin ;
  2. le plus grand nombre d'échantillons ;
  3. l'ordre fixe des sources `fit > intervals-icu > strava-archive`.

  L'autre prend le statut `ignorée`. Elle reste stockée, sans entrer dans aucun calcul. Si celle qu'on garde est supprimée plus tard, on réévalue le choix.
  La règle vaut **aussi à l'intérieur d'une même source** : une même sortie enregistrée par la montre et par le téléphone peut figurer deux fois dans Strava. Le recouvrement n'est pas transitif (A recouvre B, B recouvre C, sans que A recouvre C). Les activités sont donc examinées dans l'ordre (`debutUtc`, `cleSource`), et chacune n'est comparée qu'à celles qu'on garde. Un recouvrement de exactement 50 % n'est pas un doublon.
- **Une activité citée par l'archive mais illisible ou absente du ZIP est conservée telle quelle**, puisqu'elle existe encore à la source. Seules les activités absentes de l'index de l'archive sont supprimées, ainsi que celles qui ne sont plus des courses.
- **Lecture** dans un Web Worker, fichier par fichier, avec une barre de progression. Un fichier illisible ne bloque pas l'import : il est compté et nommé dans le journal.
- **Journal d'import**, une entrée par import : `{ date, source, ajoutées, modifiées, supprimées, ignorées, illisibles: [noms], dateMinTouchée }`. Le recalcul part de `dateMinTouchée` (sujet 5).
- **Dernière synchronisation** (barre supérieure, `02`) : la date du dernier import réussi. L'infobulle donne la source et la date de la dernière activité importée.
- Un import qui échoue en cours de route n'écrit rien : la base reste dans l'état précédent, grâce à une transaction IndexedDB par import.

## Conséquences

- **Positives** : l'import est idempotent et déterministe. Les renommages sur Strava sont repris. Le premier import de l'historique n'est rien de plus que l'import de la première archive.
- **Négatives et dette acceptée** :
  - pour être à jour, il faut redemander une archive Strava, avec quelques heures d'attente ; seul l'adaptateur intervals.icu apportera une synchronisation automatique ;
  - une seule transaction pour toute l'archive demande de garder en mémoire le résultat de 400 activités ou plus ; si c'est trop lourd sur le téléphone, on passera à une zone de préparation, avec une bascule finale ;
  - le seuil de 50 % et l'ordre des sources sont des constantes versionnées, à revoir dès que deux sources seront actives.
- **À vérifier pendant l'implémentation** : le temps de lecture de l'archive de 25 Mo et la mémoire consommée sur le téléphone ; la stabilité de l'identifiant Strava d'une activité d'une archive à l'autre (il sert de clé) ; le recouvrement réel entre les FIT Strava et les FIT de l'app tierce pour une même sortie.

## Sources

- Export réel `export_<id>.zip`, inspecté le 2026-10-21 : taille, nombre et formats des fichiers.
- Aucune source externe.
