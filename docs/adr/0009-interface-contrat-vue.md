# 0009 · Interface : DOM et SVG sans framework, contrat « Vue » produit par le Worker

- **Statut** : Acceptée
- **Date** : 2026-10-21
- **Dépend de** : 0001, 0006, 0007, 0008

## Contexte

L'interface comporte 5 onglets, dont un seul est visible à la fois (`02`). Elle compte une vingtaine de composants (`03`) et des graphiques SVG responsives avec infobulles, bornes calculées (D-009) et vue tableau (D-011), selon le système visuel de `08`. Le recalcul se fait sans rechargement (D-010), et le simulateur se met à jour en direct (`05`). Les préférences d'affichage restent locales (`02`, Persistance). La maquette (`docs/design/maquette/index.html`) implémente déjà tous les rendus en JavaScript natif et en SVG sur mesure. La performance est prioritaire.

## Options considérées

1. **TypeScript, DOM et SVG sur mesure, sans framework, rendu à la demande par onglet**. Avantages : aucun runtime, ce qui donne le plus petit paquet et le premier affichage le plus rapide ; on reprend directement la maquette ; on maîtrise entièrement les règles de `08`. Limites : la mise à jour du DOM se fait à la main, en re-rendant le composant entier.
2. **Un framework léger (Preact, Svelte, Lit)**. Écartée parce que : il ajoute un runtime et une couche de rendu, sans apporter de vrai gain sur des écrans redessinés en bloc à chaque nouvelle Vue.
3. **Une bibliothèque de graphiques (Chart.js, ECharts, d3)**. Écartée parce que : 50 à 300 Ko de plus, et les règles de `08` (un seul axe Y, bornes de D-009, infobulle, formes doublant la couleur) seraient à contourner plutôt qu'à suivre.

## Décision

**Rendu**
- Chaque composant est une fonction `rendreXx(conteneur, vue, prefs)`. Elle reconstruit le contenu du composant (chaîne SVG ou HTML échappée, puis `replaceChildren`). Il n'y a pas de DOM virtuel.
- **Seul l'onglet actif est rendu.** Les autres sont marqués « à refaire » quand une nouvelle Vue arrive, et ne sont rendus qu'à leur ouverture.
- Les graphiques s'appuient sur un module commun `src/ui/graph/` : échelles, bornes (D-009), axes, réticule, infobulle unique partagée, vue tableau (D-011). Les séries longues sont échantillonnées comme le prévoit `03` (A4 : un jour sur deux).
- Le simulateur met à jour **seulement** son encart, à chaque `input`, dans le fil principal (0006), sans re-rendre la carte.
- Polices auto-hébergées (0008). Aucune requête vers un tiers à l'exécution.

**Contrat entre le Worker et l'interface**

```
UI → Worker : { type: "demarrer", J }                           → "vue" (depuis le cache, puis recalculée si besoin)
              { type: "importer", fichier: File, J? }            → "progression"*, puis "journal", puis "vue" | "echecRecalcul"
              { type: "enregistrerParams", proposes, J }         → "vue" | "echecRecalcul"   (D-010)
              { type: "exporterSauvegarde" }                     → "sauvegarde" (Blob)
              { type: "importerSauvegarde", fichier }            → "vue" | "erreur"
Worker → UI : { type: "vue", vue: Vue } , { type: "progression", fait, total, etape } , { type: "erreur", message }
              { type: "echecRecalcul", message }   # import validé, recalcul en échec : l'ancienne Vue reste affichée
```

- **Corrélation** : chaque requête porte un identifiant `id`, que le Worker répète dans **toutes** ses réponses (`progression`, `journal`, `vue`, `erreur`…). Une Vue émise sans `id` (Vue recalculée après un démarrage depuis le cache) est une notification adressée aux abonnés de `surVue`, et non une réponse.
- La **Vue** est un objet sérialisable, versionné (`vue.formatVersion`, `vue.reglesVersion`, `vue.J`). Il contient tout ce que l'interface affiche, sans flux bruts :
  - `apercu` : verdict, signaux, fourchette, entrées du simulateur, compteurs, 7 derniers jours, série de charge ;
  - `charge` : séries de ratio et de volume sur 7 jours, semaines ;
  - `progression` : répétitions (date, format, n°, allure, FC de fin, hors sous-seuil), tendances, dernière séance sous-seuil, niveau estimé et records ;
  - `historique` : semaines, avec la répartition par intensité, les courses et les indicateurs du journal ;
  - `parametres` : valeurs en vigueur, historique des modifications, suggestion `paceHrK` ;
  - `base` : jours et séances résumées, pour le comparateur de périodes.

  Les séries numériques sont des `Float64Array`, **transférées** (pas copiées) par `postMessage`.
- Les **sélecteurs locaux** (fenêtre de C1, période de H1 et H2, comparaison de P3, comparateur P1, vue tableau) se calculent **dans le fil principal**, avec des fonctions pures de `src/core/selecteurs/`, à partir de la Vue. Ils ne repassent pas par le Worker.
- **État** : la Vue est en mémoire dans le fil principal. Les préférences d'affichage sont dans `localStorage` (`fjord-view`, `fjord-range`, `fjord-cmp`, `fjord-cmp-p`), chaque lecture et écriture étant protégée (`02`). Tout le reste est dans IndexedDB, que seul le Worker manipule.
- **Démarrage rapide** : la dernière Vue calculée est conservée dans `derive`, avec la clé `(empreinte des entrées, J)`. Au lancement, l'interface affiche cette Vue immédiatement. Le Worker ne recalcule que si J ou les entrées ont changé.

## Conséquences

- **Positives** : un paquet JavaScript visé à moins de 100 Ko compressé, hors polices. Un premier affichage sans attendre le calcul. Des sélecteurs instantanés. La maquette sert de référence de rendu.
- **Négatives et dette acceptée** : chaque composant est entièrement reconstruit à chaque nouvelle Vue (le focus est préservé à la main dans l'onglet Paramètres, pour D-010). La Vue grandit avec l'historique, à surveiller au-delà de 5 ans.
- **À vérifier pendant l'implémentation** : la taille de la Vue pour l'export (visée : moins de 2 Mo) ; le temps de rendu de chaque onglet sur iPhone (visé : moins de 50 ms) ; la conformité aux critères d'acceptation de `03`.

## Sources

- Maquette `docs/design/maquette/index.html` (fonctions de rendu `lineChart`, `drawSeason`, `drawPhr`, `drawLog`…).
- Aucune source externe.
