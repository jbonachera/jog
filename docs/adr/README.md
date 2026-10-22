# Architecture Decision Records · Fjord

Décisions d'architecture prises avant l'implémentation. Les règles fonctionnelles sont dans [`../design/decisions.md`](../design/decisions.md) (D-0xx). Ici, on fixe le comment.

| N° | Titre | Statut | Date |
|---|---|---|---|
| [0001](0001-perimetre-deploiement.md) | Périmètre de déploiement : un athlète, application statique dans le navigateur | Acceptée, amendée par 0002 et 0003 | 2026-10-20 |
| [0002](0002-source-intervals-icu.md) | Source des données : API intervals.icu, clé personnelle | Remplacée par 0003 | 2026-10-20 |
| [0003](0003-sources-par-adaptateurs.md) | Sources des données par adaptateurs, à commencer par l'archive Strava | Acceptée | 2026-10-20 |
| [0004](0004-import-instantanes-empreintes.md) | Import : instantanés par source, empreintes et doublons | Acceptée | 2026-10-21 |
| [0005](0005-stockage-indexeddb-trois-couches.md) | Stockage : IndexedDB en trois couches (brut, pivot, dérivé) | Acceptée | 2026-10-21 |
| [0006](0006-moteur-calcul.md) | Moteur de calcul : séances mémorisées, reste recalculé en entier, dans un Worker | Acceptée | 2026-10-21 |
| [0007](0007-temps-calendrier.md) | Temps et calendrier : heure du lieu, jours civils, J de l'appareil | Acceptée | 2026-10-21 |
| [0008](0008-langage-outillage-depot.md) | Langage, outillage et organisation du dépôt | Acceptée | 2026-10-21 |
| [0009](0009-interface-contrat-vue.md) | Interface : DOM et SVG sans framework, contrat « Vue » produit par le Worker | Acceptée | 2026-10-21 |
| [0010](0010-securite-donnees-personnelles.md) | Sécurité et données personnelles | Acceptée | 2026-10-21 |
| [0011](0011-strategie-de-test.md) | Stratégie de test : comportement, fixtures construites, données réelles en local | Acceptée | 2026-10-21 |
| [0012](0012-exploitation.md) | Exploitation : hébergement statique, journaux locaux, reprise | Acceptée | 2026-10-21 |
| [0013](0013-fc-max-observee.md) | FC max observée : pic soutenu par séance, suggestion dans Paramètres | Acceptée | 2026-10-22 |
