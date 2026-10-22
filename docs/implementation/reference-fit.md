# Référence FIT utile à Fjord

Le profil FIT décrit chaque message par un numéro global, et chacun de ses champs par un numéro, une échelle et un décalage. Voici les numéros utiles à Fjord. Ils ont été **contrôlés sur l'export réel** le 2026-10-21, avec un lecteur jetable : les valeurs lues étaient plausibles (distances des tours, durées, FC, décalages horaires). Les messages et champs non listés doivent être **sautés**.

Structure du fichier : un en-tête de 12 ou 14 octets (le premier octet donne sa taille ; les octets 8 à 11 valent `.FIT`), puis les enregistrements, puis 2 octets de CRC. L'octet 4 de l'en-tête donne la taille des données (uint32 LE).

En-tête d'enregistrement :
- bit 7 = 1 : **en-tête à horodatage compressé**. Le type local est dans les bits 5 et 6 ; le décalage de temps dans les bits 0 à 4. Le temps vaut `(dernier & ~0x1F) + décalage`, plus `0x20` si le décalage est inférieur à `dernier & 0x1F`.
- bit 6 = 1 : **définition**. Le bit 5 = 1 signale des champs de développeur. Le type local est dans les bits 0 à 3.
- sinon : **données**, avec le type local dans les bits 0 à 3.

Message de définition :
- un octet réservé, puis l'architecture (0 = petit-boutiste) ;
- le numéro global (uint16), puis le nombre de champs ;
- 3 octets par champ (numéro, taille, type de base) ;
- avec des champs de développeur : un octet donnant leur nombre, puis 3 octets par champ ; à sauter.

Types de base : `0x00` enum, `0x01` sint8, `0x02` uint8, `0x83` sint16, `0x84` uint16, `0x85` sint32, `0x86` uint32, `0x07` string, `0x88` float32, `0x89` float64, `0x0A` uint8z, `0x8B` uint16z, `0x8C` uint32z, `0x0D` octets, `0x8E` sint64, `0x8F` uint64, `0x90` uint64z. Valeur invalide = maximum du type non signé (`0xFF`, `0xFFFF`, `0xFFFFFFFF`), ou maximum positif du type signé (`0x7F`, `0x7FFF`, `0x7FFFFFFF`).

Horodatage FIT : secondes depuis le **1989-12-31T00:00:00Z** (soit 631065600 s Unix).

| Message (n° global) | Champ (n°) | Échelle / décalage | Usage |
|---|---|---|---|
| `file_id` (0) | `manufacturer` (1), `product` (2) | — | journal (265 = Strava, 255 = développement dans l'export) |
| `session` (18) | `start_time` (2), `sport` (5), `sub_sport` (6), `total_elapsed_time` (7), `total_timer_time` (8), `total_distance` (9) | 7 et 8 : ÷1000 s ; 9 : ÷100 m | `sport = 1` : course. `sub_sport` : 1 tapis, 2 route, 3 trail, 4 piste, 0 ou absent = inconnu |
| `lap` (19) | `timestamp` (253), `start_time` (2), `total_elapsed_time` (7), `total_timer_time` (8), `total_distance` (9), `intensity` (23), `lap_trigger` (24) | 7 et 8 : ÷1000 ; 9 : ÷100 | `lap_trigger` : 0 manuel, 1 temps, 2 distance, 3 à 6 position, 7 fin de séance. `intensity` : 0 actif, 1 repos, 2 échauffement, 3 retour au calme, 4 récupération |
| `record` (20) | `timestamp` (253), `altitude` (2), `heart_rate` (3), `distance` (5), `speed` (6), `enhanced_speed` (73), `enhanced_altitude` (78) | altitude : ÷5 − 500 m ; distance : ÷100 m ; vitesse : ÷1000 m/s | flux. Les champs `position_lat` (0) et `position_long` (1) ne sont **pas** lus (ADR 0010) |
| `activity` (34) | `timestamp` (253), `local_timestamp` (5) | — | `decalageLocal_min = (local_timestamp − timestamp) ÷ 60` |
| `device_info` (23) | `manufacturer` (2), `product` (4) | — | journal |

Constats tirés de l'export (2026-10-21) :
- 316 fichiers produits par Strava. Leurs enregistrements sont à 1 s, mais la FC n'est présente que toutes les 5 s : les autres enregistrements n'ont pas de champ `heart_rate` valide.
- Dans ces 316 fichiers, la **vitesse** est à 1 s, mais la **distance** n'est présente que toutes les 2 à 3 s (47 % des échantillons sans distance, mesuré le 2026-10-21 avec `fitVersPivot`). L'adaptateur laisse NaN, et l'étape ① du cœur interpole (ADR 0006).
- 90 fichiers produits par une app tierce, avec la FC, la vitesse et la distance à 1 s.
- Les tours de séance sont `manuel` ; les tours au km sont `distance`. Un tour final de quelques secondes porte `lap_trigger = 7`.
- `activity.local_timestamp` est toujours présent. Décalages observés : +60, +120 et −180 min.
- Mon lecteur jetable n'arrivait pas à lire 1 fichier sur 406. `fitVersPivot` (tâche 1.1) les lit tous : 406 courses lues, 0 erreur, en 326 ms au total. Un fichier illisible doit malgré tout être signalé dans le journal, sans bloquer l'import.
