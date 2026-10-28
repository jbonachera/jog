# 0003 · Sources des données par adaptateurs, à commencer par l'archive Strava

- **Statut** : Remplacée par [0014](0014-app-ios-native.md) (2026-10-28, migration iOS). Historique : Acceptée
- **Date** : 2026-10-20
- **Dépend de** : 0001. Remplace 0002.

## Contexte

Jog a besoin, pour chaque activité de course, des flux échantillonnés (temps, distance, allure, FC, altitude), des tours et du marquage course ou test (`07`). Aucune saisie manuelle n'est autorisée. D-001 et D-005 se calculent sur les flux à environ 1 s, qui doivent rester disponibles (D-006). L'ADR 0001 impose une application tout navigateur, sans serveur.

L'ADR 0002 retenait l'API intervals.icu comme seule source. La validation de la clé tarde. Il faut pouvoir avancer avec les données déjà en main : l'**archive de compte Strava** (« Download your account »), téléchargée en local. L'athlète court avec une **Apple Watch** et une ceinture cardio.

## Options considérées

1. **Un modèle pivot et des adaptateurs** : chaque source a son adaptateur, qui produit des `ActivitePivot`. Le reste du calcul ne lit que ce pivot. Premier adaptateur : l'archive Strava. Avantages : on avance sans dépendre d'une API ; on ajoutera intervals.icu sans toucher au cœur ; chaque adaptateur se teste seul, sur ses fichiers. Limites : l'import est manuel ; il faudra éliminer les doublons entre sources ; le contenu réel de l'archive pour une Apple Watch n'est pas encore connu.
2. **Garder intervals.icu comme seule source (0002)**. Écartée parce que : la clé n'est pas encore validée, et rien ne peut avancer d'ici là.
3. **Un adaptateur de l'archive Strava écrit directement vers les entités de `07`, sans pivot**. Écartée parce que : la source suivante obligerait à reprendre la classification et le calcul.

## Décision

- Le cœur du calcul ne lit **que des `ActivitePivot`** :

  ```
  ActivitePivot {
    cleSource       "strava:1243401459" | "fit:<empreinte>" | "icu:i12345678"
    source          "strava-archive" | "fit" | "intervals-icu"
    recuLe          date-heure de l'import
    debutUtc, decalageLocal_min, duree_s, distance_m
    type            type normalisé ("course", ou "autre" et ignoré)
    nom             texte, ou null
    marquage        "course" | "test" | "aucun" | "inconnu"   # inconnu : la source ne le dit pas
    flux (colonnes de même longueur) : t_s[], dist_m[], fc_bpm[], alt_m[], vitesse_ms[]
                    une colonne absente vaut null ; une valeur manquante vaut NaN
    tours           [{ iDebut, iFin, declenchement, intensite? }]   # indices dans les flux ; declenchement : manuel | distance | temps | fin
    empreinteBrute  condensé du fichier ou de la réponse d'origine
  }
  ```

  La FC moyenne, maximale et de fin de chaque tour est **dérivée du flux** par le cœur. Elle n'est jamais reprise de la source, pour que le calcul soit identique d'une source à l'autre.
- **Adaptateurs, dans l'ordre des lots** :
  1. `strava-archive` : il lit le ZIP dans le navigateur. `activities.csv` sert d'index (identifiant, nom, type, date, fichier). Les fichiers `activities/{id}.fit|.gpx|.tcx`, éventuellement en `.gz`, contiennent les flux et les tours. Il comprend donc trois lecteurs, FIT, GPX et TCX, réutilisables par l'adaptateur `fit`.
  2. `fit` : un ou plusieurs fichiers `.fit` déposés seuls.
  3. `intervals-icu` : quand la clé sera validée, selon la table de correspondance de l'ADR 0002, qui devient la spécification de cet adaptateur.
- Seules les activités de course entrent dans le pivot, sur le type de l'index ou du fichier. Les autres sont comptées dans le journal d'import, puis ignorées.
- Le fait de conserver ou non le fichier d'origine en plus du pivot sera tranché par l'ADR de stockage (sujet 4). Le pivot garde dans tous les cas `empreinteBrute`.

## Conséquences

- **Positives** : le développement commence sur des données réelles. Le changement de source n'atteint jamais le calcul. Chaque adaptateur se teste sur des fichiers fixes.
- **Négatives et dette acceptée** :
  - la synchronisation est manuelle : on demande une nouvelle archive, puis on la réimporte ; la barre affiche la date de la dernière archive importée ;
  - plusieurs lecteurs de formats sont à maintenir ;
  - il faudra éliminer les doublons entre sources (sujet 3) dès que deux adaptateurs seront actifs ;
  - une activité GPX n'a pas de tours ; la règle de `07` prévoit alors de détecter les répétitions dans le flux.
- **À vérifier pendant l'implémentation** (sur l'export réel) :
  - le format d'origine des activités Apple Watch dans l'archive (FIT, GPX ou TCX) ;
  - la présence de la FC, et son pas réel (1 s ou plus espacé) ;
  - la présence de l'altitude et des tours (segments ou intervalles de l'app Exercice) ;
  - les colonnes réelles de `activities.csv`, en particulier un éventuel champ qui marque les courses ; sinon, `marquage = "inconnu"`, et l'écart avec `07`, règle 1, est à trancher ;
  - le fuseau horaire : comment obtenir `decalageLocal_min` selon le format (sujet 6) ;
  - la taille de l'archive, et le temps de lecture dans le navigateur du téléphone.

## Constats de l'export réel (2026-10-21)

Archive `export_<id>.zip`, de juin 2024 à octobre 2026. Seuls `activities.csv` et les fichiers des courses ont été lus.
- 407 courses à pied sur 497 activités ; 496 fichiers en `.fit.gz` et 1 en `.gpx` ; 1 FIT illisible.
- Deux producteurs de FIT : 316 fichiers produits par Strava (fabricant 265, depuis Apple Santé), 90 par une app tierce (fabricant 255).
- Enregistrements à 1 s (7 fichiers à 2 s). FC à 5 s dans 290 fichiers, à 1 s dans 108 ; aucun intervalle R-R : voir [D-013](../design/decisions.md#d-013--fc-échantillonnée).
- Altitude et vitesse présentes dans 399 et 400 fichiers sur 406.
- Tours : segments manuels ou programmés (`lap_trigger = manual`) dans les FIT produits par Strava ; tours automatiques au km (`distance`) ou au temps (`time`) dans ceux de l'app tierce. `intensity` est presque toujours vide. L'adaptateur conserve donc `declenchement` dans chaque tour, et un tour automatique n'est jamais un tour de travail.
- Fuseau : `activity.local_timestamp` est présent dans 406 fichiers sur 406 (décalages +1 h, +2 h, −3 h). La date du CSV est en UTC.
- `activities.csv` : en-têtes traduits (fr), noms de colonnes répétés, dates au format local. La colonne « Compétition » est vide partout : voir [D-014](../design/decisions.md#d-014--marquage-course-ou-test). L'adaptateur prend le début, le type, les flux et les tours **dans le FIT**, et seulement le nom, le fichier et « Compétition » dans le CSV.
- L'archive contient aussi des données sans rapport avec Jog (messages, contacts, connexions…). L'adaptateur ne lit que `activities.csv` et `activities/`.

## Sources

- Strava, *Exporter des données et fichiers en bloc* (contenu et formats d'origine de l'archive) — https://support.strava.com/hc/es-es/articles/216918437 — consulté le 2026-10-20, par extraits de recherche.
- Strava, *How Do I Export My Strava Data?* — https://support.strava.com/en-us/articles/15401919-how-do-i-export-my-strava-data — consulté le 2026-10-20, par extraits de recherche.
- Structure de l'archive (`activities.csv`, fichiers `{id}.fit.gz`, `.gpx`, `.tcx`) : sources tierces, https://github.com/hugovk/strava-tools et https://takeoutday.org/guides/how-to-export-strava-data — consultées le 2026-10-20. **Non vérifiée** sur un export réel.
- Export réel de l'athlète `export_<id>.zip`, inspecté le 2026-10-21 avec un script jetable hors du dépôt.
