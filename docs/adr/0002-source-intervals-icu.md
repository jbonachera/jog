# 0002 · Source des données : API intervals.icu, clé personnelle

- **Statut** : Remplacée par [0003](0003-sources-par-adaptateurs.md). Sa table de correspondance sert de spécification à l'adaptateur `intervals-icu`.
- **Date** : 2026-10-20
- **Dépend de** : 0001

## Contexte

Jog a besoin, pour chaque activité de course, des flux échantillonnés (temps, distance, allure, FC, altitude), des tours et du marquage course ou test (`07`, Sources autorisées et entité Activité). Aucune saisie manuelle n'est autorisée. Le classement des minutes (D-001) et le découplage (D-005) se calculent sur les flux à environ 1 s, et les flux bruts doivent rester disponibles pour le recalcul rétroactif (D-006). L'ADR 0001 impose une application tout navigateur, sans serveur ni secret à protéger.

L'athlète court avec une **Apple Watch** et une ceinture cardio. Ses activités arrivent déjà dans intervals.icu.

## Options considérées

1. **API intervals.icu en JSON, avec une clé personnelle** : `GET /api/v1/athlete/0/activities`, `GET /api/v1/activity/{id}?intervals=true` (intervalles, et tours d'origine du FIT avec leur intensité) et `GET /api/v1/activity/{id}/streams.json` (dont `time` et `heartrate`). L'authentification se fait en Basic `API_KEY:<clé>`, et CORS est accepté sur `/api/v1/`, d'après l'auteur sur le forum. Avantages : synchronisation sans geste de l'athlète, sans serveur ni secret partagé, et des tours exploitables. Limites : on dépend d'un tiers ; le format JSON est propre à intervals.icu ; aucun champ « course » documenté.
2. **Le FIT comme format pivot** (import de fichiers, puis FIT par intervals.icu). Écartée parce que : l'athlète préfère une synchronisation automatique dès le départ. Avec une Apple Watch, il n'y a pas d'accès USB aux fichiers FIT.
3. **API Strava**. Écartée parce que : l'abonnement est obligatoire depuis juin 2026 (sources tierces), la conservation est limitée à 7 jours, données dérivées comprises (API Policy, §5.5 et §6.2), et CORS n'est pas vérifié.
4. **API Garmin Connect**. Écartée parce que : le programme est réservé aux entreprises, et les nouvelles demandes sont suspendues (d'après le forum Garmin). De plus, la montre n'est pas une Garmin.

## Décision

- La **seule source** des activités est l'**API intervals.icu `/api/v1/`**, appelée directement depuis le navigateur avec la **clé personnelle** de l'athlète, en Basic auth.
- La clé est saisie une fois dans l'onglet Paramètres. Elle est stockée **dans IndexedDB seulement** et n'est **pas incluse** dans le fichier de sauvegarde (D-012).
- Jog ne retient que les activités de type course à pied (`type = Run`). L'ADR de synchronisation fixe le filtre exact des sous-types : tapis, trail.
- Le stockage brut conserve, pour chaque activité, la réponse du détail et celle des flux **telles que reçues**, avec la date de réception. Les entités de `07` en sont dérivées. Le format brut n'est donc pas réinterprété en amont.
- Correspondance avec `07` :

  | Besoin de `07` | Champ intervals.icu | Statut |
  |---|---|---|
  | début, durée, distance, type | `start_date_local`, `elapsed_time` / `moving_time`, `distance`, `type` | forum |
  | flux temps, distance, allure, FC, altitude | `streams.json` : `time`, `distance`, `velocity_smooth`, `heartrate`, `altitude` | forum, à vérifier sur export |
  | tours | collection des tours d'origine (avec `intensity`) ; à défaut, `icu_intervals` | forum, à vérifier sur export |
  | FC de fin de tour | `heartrate[end_index]` du flux | dérivé |
  | marquage course / test | **aucun champ trouvé** ; `name` seulement | écart, voir ci-dessous |
  | nom | `name` | forum |

## Conséquences

- **Positives** : les activités arrivent sans geste de l'athlète, quelle que soit la montre dont intervals.icu reçoit les données. Il n'y a aucun secret OAuth.
- **Négatives et dette acceptée** :
  - on dépend d'intervals.icu : son API, ses quotas, ses conditions. Si l'accès se ferme, il faudra une nouvelle ADR pour la source ; l'import de fichiers FIT reste la solution de repli ;
  - le format brut est propre à intervals.icu ; changer de source demandera un nouvel adaptateur ;
  - la clé personnelle donne accès à tout le compte intervals.icu, écriture comprise ; elle est donc conservée sur l'appareil seulement (sujet 9).
- **Écarts de spécification à traiter** (proposés après l'examen de l'export réel) :
  - **marquage course / test** : `07`, règle 1, prévoit « marquage de la plateforme, ou nom d'activité ». Si aucun champ n'existe, la règle reposera sur le nom seul, ou demandera une décision D-0xx ;
  - **« FC battement par battement »** (`01`, principe 2 ; `07`) : la source donne une FC échantillonnée. Une décision D-0xx de reformulation est à proposer.
- **À vérifier pendant l'implémentation** (sur l'export réel, puis au lot 1) :
  - le pas réel des flux `time` et `heartrate` d'une Apple Watch avec ceinture : 1 s, ou plus espacé ou irrégulier ;
  - la présence des tours (segments ou intervalles de l'app Exercice) et le nom exact de la collection des tours d'origine dans le JSON ;
  - la présence de `altitude` et de `velocity_smooth` ;
  - l'existence d'un indicateur de course dans le détail d'une activité de course ;
  - les en-têtes CORS de `/api/v1/` ;
  - les quotas réels de la clé personnelle (en-têtes `X-RateLimit-*`).

## Sources

- Forum intervals.icu, *API access to Intervals.icu* (clé personnelle, Basic auth, athlète `0`, quotas évoqués de 5 000 requêtes par jour) — https://forum.intervals.icu/t/api-access-to-intervals-icu/609 — consulté le 2026-10-20.
- Forum intervals.icu, *[Solved] Add 'Access-Control-Allow-Origin' header* (CORS sur `/api/v1/`) — https://forum.intervals.icu/t/solved-add-access-control-allow-origin-header/30152 — consulté le 2026-10-20.
- Forum intervals.icu, *Access Activities Streams via API* — https://forum.intervals.icu/t/access-activities-streams-via-api/101065 — consulté le 2026-10-20.
- Forum intervals.icu, *[solved] How to fetch Lap/Interval data via API* — https://forum.intervals.icu/t/solved-how-to-fetch-lap-interval-data-via-api-similar-to-csv-export/126341 — consulté le 2026-10-20.
- Forum intervals.icu, *Lap intensity now used for intervals from laps* — https://forum.intervals.icu/t/lap-intensity-now-used-for-intervals-from-laps/86812 — consulté le 2026-10-20.
- Forum intervals.icu, *Intervals.icu API Terms and Conditions* (en vigueur au 23 octobre 2025) — https://forum.intervals.icu/t/intervals-icu-api-terms-and-conditions/114087 — consulté le 2026-10-20.
- Strava : changements d'accès de 2026 — https://appsforstrava.com/blog/strava-developer-program-changes-2026 et https://communityhub.strava.com/developers-api-7/regarding-the-issue-of-api-subscription-for-use-13587 — consultés le 2026-10-20. Source tierce, **non vérifiée officiellement**.
- Garmin, *Program FAQ* — https://developer.garmin.com/gc-developer-program/program-faq/ — consulté le 2026-10-20.
- Toutes ces pages ont été lues par extraits de recherche, la lecture directe étant bloquée dans la session. Il n'y a pas encore d'export réel.
