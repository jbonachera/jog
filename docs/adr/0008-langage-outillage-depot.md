# 0008 · Langage, outillage et organisation du dépôt

- **Statut** : Remplacée par [0014](0014-app-ios-native.md) (2026-10-28, migration iOS). Historique : Acceptée
- **Date** : 2026-10-21
- **Dépend de** : 0001, 0003, 0005, 0006

## Contexte

Jog est une application statique (0001). Son cœur de calcul est pur : il ne touche ni au DOM ni à IndexedDB, pour pouvoir être testé hors navigateur (0006). `pow`, `exp` et `log` sont interdits dans le pipeline (0006). Il faut lire des ZIP, du gzip, du FIT, du GPX et du TCX dans un Worker (0003, 0004). La performance dans le navigateur est prioritaire (consigne de l'athlète, 2026-10-21).

Constats tirés de l'export : un lecteur FIT minimal (environ 80 lignes) lit 406 fichiers sur 406 lisibles, pour les messages utiles. La licence du SDK officiel `@garmin/fitsdk` serait restrictive pour une distribution, d'après un tiers (non vérifiée).

## Options considérées

1. **TypeScript strict, Vite, Vitest, un seul paquet, lecteurs de formats écrits dans le projet**. Avantages : des types sur le pivot et la Vue ; le même cœur sert au Worker et aux tests ; une seule dépendance d'exécution. Limites : une étape de compilation.
2. **JavaScript natif et JSDoc, sans compilation**. Écartée parce que : des types plus faibles et des dépendances gérées à la main, pour un pipeline de cette taille.
3. **TypeScript avec `@garmin/fitsdk`**. Écartée parce que : la licence est incertaine pour un site public, et le paquet est plus lourd que le besoin (six types de messages).
4. **Cœur Rust/WASM**. Écartée parce que : le déterminisme n'y gagne rien, et il faudrait une seconde chaîne d'outils.

## Décision

- **Node 24.15.0**, fixé dans `mise.toml` à la racine. npm, avec `package-lock.json` versionné et des **versions exactes**, sans `^` :

  | Rôle | Paquet | Version |
  |---|---|---|
  | exécution | `fflate` (ZIP, gzip) | 0.8.3 |
  | exécution | `@fontsource/schibsted-grotesk`, `@fontsource/ibm-plex-mono` (polices auto-hébergées) | 5.3.0 |
  | dév. | `typescript` | 6.0.3 (`typescript-eslint` exige `<6.1.0`) |
  | dév. | `vite` | 8.3.4 |
  | dév. | `vitest` | 5.0.5 |
  | dév. | `eslint`, `@eslint/js`, `typescript-eslint` | 10.13.0, 10.0.1, 8.72.0 |
  | dév. | `fake-indexeddb` | 6.2.6 |
  | dév. | `happy-dom`, `@testing-library/dom` | 21.0.4, 10.4.2 |
  | dév. | `@types/node` | 24.x, la dernière publiée au moment de l'installation |

- **TypeScript** en `strict`, avec `noUncheckedIndexedAccess`. Modules ES, cible `es2022`.
- **Lecteurs FIT, GPX et TCX écrits dans le projet** (`src/adapters/`). Le lecteur FIT ne décode que `file_id`, `record`, `lap`, `session`, `activity` et `device_info`, et saute tout le reste, champs de développeur compris.
- **ESLint** : `no-restricted-properties` interdit `Math.pow`, `Math.exp` et `Math.log` dans `src/core/`, avec l'exception de `src/core/riegel.ts`. `no-restricted-imports` interdit à `src/core/` d'importer `src/store`, `src/ui` ou `src/worker`.
- **Arborescence** :

  ```
  src/core/        pipeline pur ①–⑥, constantes (REGLES_VERSION), dates civiles, formats fr, sélecteurs de la Vue
  src/adapters/    fit/, gpx/, tcx/, strava-archive/ (puis intervals-icu/)
  src/store/       IndexedDB : schéma, migrations, sauvegarde
  src/worker/      Worker : import, recalcul, cache de la Vue, messages
  src/ui/          interface (0009)
  tests/           comportement (*.test.ts), fixtures/ (construites par code), local/ (données réelles, hors dépôt)
  docs/            design/, adr/, implementation/
  ```

- **Scripts npm** : `dev`, `build`, `preview`, `test`, `test:watch`, `lint`, `typecheck`, `verif:reel` (rapport sur l'export réel, voir 0011).
- `.gitignore` exclut `node_modules/`, `dist/`, `export_*.zip`, `local-data/` et `tests/local/out/`.

## Conséquences

- **Positives** : une seule dépendance d'exécution pour les données. La règle d'ESLint applique automatiquement l'interdit de l'ADR 0006. Le cœur se teste en Node, en quelques secondes.
- **Négatives et dette acceptée** : trois lecteurs de formats à maintenir ; TypeScript reste en 6.0, tant que `typescript-eslint` ne prend pas en charge la 7.
- **À vérifier pendant l'implémentation** : que le lecteur FIT maison lise les 406 FIT de l'export, et explique le cas du fichier illisible ; que les polices auto-hébergées ne contiennent que les graisses utilisées (`08`).

## Sources

- npm, registre public : versions et dates de publication, consultés le 2026-10-21 (`npm view`). `typescript-eslint@8.72.0` déclare `typescript: >=4.8.4 <6.1.0`.
- GitHub, *garmin/fit-javascript-sdk* et npm, *@garmin/fitsdk* — https://github.com/garmin/fit-javascript-sdk — consulté le 2026-10-21, par extraits de recherche. Licence **non vérifiée**.
- npm, *fflate* — https://www.npmjs.com/package/fflate — consulté le 2026-10-21, par extraits de recherche.
- Export réel `export_<id>.zip` (2026-10-21) : lecteur FIT jetable, 406 fichiers lus sur 406 lisibles.
