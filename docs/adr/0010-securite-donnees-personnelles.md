# 0010 · Sécurité et données personnelles

- **Statut** : Acceptée
- **Date** : 2026-10-21
- **Dépend de** : 0001, 0003, 0005, 0008, 0009

## Contexte

La FC est une donnée de santé. Fjord n'a ni serveur ni comptes (0001). Les données sont dans IndexedDB, sur l'appareil, avec une sauvegarde par fichier (D-012, 0005). L'archive Strava contient aussi des messages, des contacts et des connexions (0003). L'adaptateur intervals.icu utilisera une clé personnelle qui donne accès à tout le compte (0002).

## Options considérées

1. **Aucune donnée ne quitte l'appareil, aucune authentification, une politique CSP stricte**. Avantages : rien à protéger côté serveur ; aucune fuite possible vers un tiers à l'exécution. Limites : la protection de l'appareil repose sur l'athlète (verrouillage, session du navigateur).
2. **Chiffrer IndexedDB avec une phrase secrète**. Écartée parce que : il faudrait saisir la phrase à chaque ouverture, le calcul serait plus lent, et cela ne protège que contre un accès physique à un navigateur déjà ouvert.
3. **Une authentification**. Sans objet : il n'y a pas de serveur à protéger.

## Décision

- **Authentification : sans objet**, puisqu'il n'y a ni serveur ni données distantes.
- **Aucune requête vers un tiers à l'exécution** : polices auto-hébergées, aucun script externe, aucune mesure d'audience. Une politique CSP, posée par une balise `<meta>`, l'impose :
  `default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`.
  L'adaptateur intervals.icu ajoutera `https://intervals.icu` à `connect-src`, et à rien d'autre.
- **Lecture minimale de l'archive** : l'adaptateur `strava-archive` n'ouvre que `activities.csv` et `activities/*`. Les coordonnées GPS ne sont pas copiées dans le pivot (0003 ne prévoit pas de colonne `latlng`). Elles restent dans le fichier d'origine conservé dans `brut`.
- **Clé d'API** (adaptateur futur) : dans IndexedDB seulement, jamais dans la sauvegarde ni dans le journal ; affichée masquée.
- **Données réelles hors du dépôt** : `export_*.zip` et `local-data/` figurent dans `.gitignore`. Les tests sur données réelles lisent un chemin donné par la variable d'environnement `JOG_EXPORT`, et n'écrivent leurs résultats que dans `tests/local/out/` (ignoré par git).
- **Suppression** : en l'absence d'action définie par la spécification, on efface les données par la fonction « Effacer les données du site » du navigateur. Une action « Supprimer toutes mes données » dans l'onglet Paramètres est **proposée** (D-016), mais pas écrite : elle attend l'accord de l'athlète, parce qu'elle modifierait `06`.

## Conséquences

- **Positives** : aucune donnée de santé ne transite par un tiers. La CSP bloque toute exfiltration par injection de script.
- **Négatives et dette acceptée** : l'appareil n'est pas chiffré par Fjord, et sa protection relève du système d'exploitation. Les points GPS restent dans `brut` : seule une suppression complète les efface.
- **À vérifier pendant l'implémentation** : que la CSP n'empêche ni le Worker (mode module) ni les polices en production (`vite build`) ; qu'aucun test ni aucun fichier versionné ne contienne de données de l'export.

## Sources

- Aucune source externe.
