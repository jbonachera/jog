# 0001 · Périmètre de déploiement : un athlète, application statique dans le navigateur

- **Statut** : Acceptée, amendée le 2026-10-20 par [0002](0002-source-intervals-icu.md), puis par [0003](0003-sources-par-adaptateurs.md)
- **Date** : 2026-10-20
- **Dépend de** : aucune

## Contexte

Jog sert un coureur qui veut une lecture rapide le matin (`01`, Utilisateur). La spécification prévoyait des paramètres « stockés côté serveur, rattachés à l'athlète » (`06`, Stockage en production ; `02`, Persistance locale), avec l'historique des modifications datées (D-006). La barre supérieure affiche la date de la dernière synchronisation (`02`). L'athlète ne veut administrer aucun serveur.

Les sources passent par des adaptateurs ([0003](0003-sources-par-adaptateurs.md)) : d'abord l'archive Strava importée en local, puis l'API intervals.icu, avec une clé personnelle. L'API Strava a été écartée : abonnement obligatoire et conservation limitée à 7 jours.

## Options considérées

1. **Application statique, entièrement dans le navigateur** : pages HTML/JS servies par un hébergement statique en HTTPS. Le calcul s'exécute dans le navigateur, et les données sont dans IndexedDB. Avantages : aucun serveur à administrer, aucun coût, les données ne quittent pas l'appareil, pas de comptes. Limites : une base par appareil, sans synchronisation entre le téléphone et l'ordinateur ; le navigateur peut effacer son stockage, d'où une sauvegarde par fichier ; l'accès à l'API depuis une page web dépend de CORS.
2. **Application navigateur, plus une fonction en ligne sans serveur à administrer** (de type Worker), pour cacher un `client_secret` OAuth ou recevoir des notifications. Écartée parce que : un compte et un déploiement de plus, alors que la source retenue (0002) s'utilise avec une clé personnelle, sans secret OAuth.
3. **Un athlète, serveur personnel (VPS ou NAS)**. Écartée parce que : l'athlète refuse d'administrer un serveur (authentification, HTTPS, sauvegardes).
4. **Service en ligne, plusieurs athlètes**. Écartée parce que : comptes, isolation des données, FC traitée comme donnée de santé (RGPD art. 9), et des conditions d'API plus strictes pour une application ouverte à plusieurs utilisateurs. Coût trois à cinq fois plus élevé.

## Décision

- Jog sert **un seul athlète**. C'est une **application statique** qui s'exécute entièrement dans son navigateur. Il n'y a ni serveur applicatif, ni fonction en ligne.
- Elle est servie en **HTTPS par un hébergement statique** (GitHub Pages ou équivalent), ou en local sur `http://localhost` pendant le développement. Elle ne fonctionne pas depuis `file://`, parce que CORS exige une origine web.
- Toutes les données (activités importées, dérivées, paramètres, historique des modifications) sont stockées **dans IndexedDB, sur l'appareil**, avec export et import d'une sauvegarde : [D-012](../design/decisions.md#d-012--stockage-local-dans-le-navigateur).

## Conséquences

- **Positives** : aucun coût d'hébergement ni d'administration. L'authentification est sans objet, faute de serveur (à confirmer au sujet 9). Les données de FC ne quittent l'appareil que vers la plateforme d'origine.
- **Négatives et dette acceptée** :
  - chaque appareil importe et calcule de son côté ; le téléphone et l'ordinateur peuvent diverger jusqu'à la synchronisation suivante, et les paramètres modifiés sur l'un doivent être reportés sur l'autre, par export et import ;
  - la synchronisation n'a lieu que lorsque l'application est ouverte : aucune notification de plateforme, puisqu'il n'y a pas d'URL pour la recevoir ;
  - le premier import de l'historique se fait onglet ouvert, et peut demander plusieurs sessions (sujet 3) ;
  - si l'API intervals.icu refuse les appels navigateur, ou si elle se ferme, il faudra une nouvelle ADR (repli : import de fichiers FIT).
- **À vérifier pendant l'implémentation** :
  - pour l'adaptateur `intervals-icu` : que `https://intervals.icu/api/v1/*` accepte les appels navigateur avec un en-tête `Authorization` (en-têtes CORS). L'adaptateur de l'archive Strava n'en dépend pas ;
  - le temps du recalcul complet dans le navigateur du téléphone (D-006, D-010) ;
  - la taille de la base IndexedDB pour plusieurs années de flux, et la tenue du stockage persistant sur le téléphone.

## Sources

- Strava, *API Policy (2026)*, §5.5 et §6.2 — https://www.strava.com/legal/api_policy — consulté le 2026-10-20, par extraits de recherche (lecture directe bloquée dans la session).
- Forum intervals.icu, *[Solved] Add 'Access-Control-Allow-Origin' header* — https://forum.intervals.icu/t/solved-add-access-control-allow-origin-header/30152 — consulté le 2026-10-20. CORS annoncé par l'auteur ; **non vérifié** sur un appel réel.
