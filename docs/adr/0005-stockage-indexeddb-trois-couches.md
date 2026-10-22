# 0005 · Stockage : IndexedDB en trois couches (brut, pivot, dérivé)

- **Statut** : Acceptée
- **Date** : 2026-10-21
- **Dépend de** : 0001, 0003, 0004

## Contexte

Tout est stocké dans le navigateur, avec une sauvegarde par fichier ([D-012](../design/decisions.md#d-012--stockage-local-dans-le-navigateur)). Les flux bruts restent disponibles pour le recalcul depuis une date d'effet (D-006). Les paramètres datés gardent l'historique de leurs modifications, et une modification peut être supprimée. Deux modifications du même paramètre à la même date : la dernière enregistrée l'emporte. Avant la première modification, c'est la première valeur enregistrée qui s'applique (`06`, Portée d'une modification). Les seuils et les règles sont des constantes versionnées (D-008, D-014).

Ordres de grandeur tirés de l'export réel (406 courses, 2,5 ans) : environ 30 Mo de flux en `Float32`, et environ 22 Mo de FIT d'origine compressés.

## Options considérées

1. **IndexedDB en trois couches : brut d'origine, pivot, dérivé**. Avantages : tout peut être reconstruit sans réimporter ; la non-régression se teste sur les FIT d'origine ; la sauvegarde reste petite. Limites : environ 50 Mo pour 2,5 ans, environ 20 Mo de plus par an.
2. **Pivot et dérivé, sans brut**. Écartée parce que : corriger un défaut de lecture obligerait à redemander une archive Strava.
3. **SQLite en WASM, sur OPFS**. Écartée parce que : environ 1 Mo de WASM en plus, une prise en charge d'OPFS non vérifiée sur iOS, et des calculs qui se font de toute façon sur des tableaux en mémoire.

## Décision

Une base IndexedDB `fjord`, avec les magasins suivants :

```
meta          { schemaVersion, athlete: { nom }, derniereSynchro }
brut          cleSource → { source, format, blob (.gz), empreinte, recuLe }
activite      cleSource → { statut: "active" | "ignoree", debutUtc, decalage_min, dateLocale,
                            nom, marquage, type, duree_s, distance_m, tours[], pasFC_s,
                            versionAdaptateur }
              index : dateLocale, statut
flux          cleSource → { t, dist, fc, alt, vit : Float32Array, NaN = manquant }
param_global  cle → valeur                       # refHr, paceHrK, ctlDays, atlDays, subtPctLo, subtPctHi
param_date    id → { cle, valeur, dateEffet, enregistreLe }
              index unique : [cle, dateEffet]    # même date : la nouvelle remplace l'ancienne
journal       id → { date, source, ajoutees, modifiees, supprimees, ignorees, illisibles[], dateMinTouchee }
derive        cle → { versionRegles, versionParams, contenu }   # séances, jours, semaines, série de charge
```

- **Brut** : le fichier d'origine, compressé tel que reçu. On ne le modifie jamais.
- **Pivot** (`activite` et `flux`) : produit à partir du brut par un adaptateur, et marqué de la version de cet adaptateur (`versionAdaptateur`). Une nouvelle version de l'adaptateur relit le brut. Les flux sont séparés des résumés, pour que la liste des activités se charge sans les flux.
- **Dérivé** : le moteur de calcul y garde ce qu'il choisit de garder (sujet 5). Chaque entrée porte la version des règles et l'empreinte des paramètres qui ont servi à la calculer. Le dérivé n'est **jamais migré** : il est invalidé et recalculé.
- **Paramètres datés** : la valeur en vigueur au jour `d` est celle de la dernière entrée dont `dateEffet ≤ d`. Avant la première entrée, c'est la valeur de la première entrée. La liste des modifications (ancienne → nouvelle valeur) se déduit de l'ordre des entrées. Supprimer une modification efface son entrée. « Revenir aux valeurs par défaut » ajoute une entrée datée d'aujourd'hui pour chaque paramètre daté (`06`).
- **Migrations** : `meta.schemaVersion` augmente à chaque changement de forme. Une fonction de migration par version s'exécute dans `onupgradeneeded`. Elle ne touche que `brut`, `activite`, `flux`, `param_*` et `journal`. Le dérivé est vidé.
- **Sauvegarde** (D-012) : `sauvegarde.json = { formatVersion, meta.athlete, param_global, param_date, journal }`, soit quelques kilo-octets. La clé d'API (0002) n'y figure pas. Les activités se retrouvent en réimportant l'archive. L'import d'une sauvegarde remplace les paramètres et le journal, puis lance un recalcul complet.
- Au premier lancement, Jog appelle `navigator.storage.persist()`. Le résultat est écrit dans le journal de recalcul (0012). L'afficher dans l'onglet Paramètres est **proposé** (D-017), pas décidé.

## Conséquences

- **Positives** : tout se reconstruit à partir du brut. Les règles peuvent évoluer sans migration des données dérivées. Le jeu de non-régression vient tout seul : les FIT d'origine et leur pivot attendu.
- **Négatives et dette acceptée** :
  - le volume double, entre brut et pivot ;
  - une sauvegarde ne suffit pas à restaurer les activités sur un nouvel appareil : il faut aussi l'archive ;
  - le format `Float32` arrondit les distances à environ 1 cm au-delà de 100 km, ce qui reste sans effet sur les calculs.
- **À vérifier pendant l'implémentation** : la taille réelle de la base après l'import de l'export ; l'acceptation de `persist()` et le quota sur Safari iOS ; le temps de lecture de l'index `dateLocale` pour 2,5 ans d'activités.

## Sources

- Export réel `export_<id>.zip`, inspecté le 2026-10-21 : volumes et pas d'échantillonnage.
- Aucune source externe consultée pour cette décision. Quotas et persistance sur iOS : **non vérifiés**.
