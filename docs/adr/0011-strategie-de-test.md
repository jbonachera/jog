# 0011 · Stratégie de test : comportement, fixtures construites, données réelles en local

- **Statut** : Acceptée
- **Date** : 2026-10-21
- **Dépend de** : 0003, 0005, 0006, 0007, 0008, 0009

## Contexte

`05` impose des tests unitaires qui couvrent au moins un cas par verdict, les bornes de chaque seuil, l'absence de verdict avant 30 jours, « Maintenir » quand seul un signal décisif est insuffisant, et un signal non décisif insuffisant sans effet. Le verdict doit être déterministe. `09` liste des points « À vérifier sur données réelles ». La maquette contient un générateur déterministe (`data.js`), mais il produit des séances déjà classées, sans flux, et des notions exclues (plans, objectifs, lactate). Consigne de l'athlète : du TDD moderne, qui teste le comportement et non l'implémentation.

## Options considérées

1. **Tests de comportement aux frontières publiques, fixtures construites par code, rapport sur données réelles en local**. Avantages : les tests survivent aux refactorisations ; les fixtures expriment des scénarios lisibles (« 3 séances de 6×6' à 165 bpm ») ; aucune donnée personnelle versionnée. Limites : il faut écrire des constructeurs de fixtures, et un encodeur FIT de test.
2. **Tests unitaires de chaque fonction interne**. Écartée parce qu'ils figent l'implémentation, ce qui va contre la consigne.
3. **Le générateur `data.js` comme seule fixture**. Écartée parce qu'il n'a pas de flux (D-001, D-005 ne sont pas testables) et qu'il porte des notions hors modèle. Il reste utile pour un seul test d'acceptation (voir ci-dessous).

## Décision

**Frontières testées** (une suite par frontière, sans mock interne) :

| Frontière | Entrée → sortie observée |
|---|---|
| adaptateurs | octets d'un FIT, GPX ou TCX, ou un ZIP d'archive → `ActivitePivot[]`, avec le journal (illisibles, ignorées) |
| cœur | `calculerVue({ activites, params, J })` → `Vue` (verdict, signaux, séries, séances) |
| sélecteurs | `Vue` + choix d'un sélecteur → données du composant (comparateur, fenêtres) |
| store et Worker | messages du Worker sur une base `fake-indexeddb` → Vue, journal, sauvegarde, atomicité (D-010) |
| interface | rendu dans `happy-dom`, requêtes par rôle et par texte (`@testing-library/dom`) : onglets ARIA, textes des signaux, `role="status"`, vue tableau |

**Règles d'écriture**
- Un test décrit un comportement observable, en français, avec la référence de la règle : `it("Alléger si un signal décisif est en alerte (05)")`.
- On ne vérifie jamais un appel de fonction interne, ni une structure privée. Pas de mock du cœur.
- On écrit le test d'abord, on le voit échouer, puis on écrit le code minimal (TDD).
- Chaque seuil de `05` a ses tests de bornes : la valeur exacte du seuil, et la valeur juste au-delà après l'arrondi de D-015.

**Fixtures**
- `tests/fixtures/construire.ts` : des constructeurs de scénarios. Par exemple `footing({ jour, min, fc })`, `sousSeuil({ jour, reps: [6, 6, …], fcFin, allure })`, `sortieLongue({ min, mp: [{debut, duree}] })` et `historique(semaines)`. Ils produisent des `ActivitePivot` avec des flux synthétiques à 1 s ou à 5 s.
- `tests/fixtures/encodeur-fit.ts` : un encodeur FIT minimal, réservé aux tests. Il fabrique des fichiers avec un pas de FC choisi, des tours (manuels, au km), un `local_timestamp`, ainsi qu'un fichier corrompu.
- **Test d'acceptation sur `data.js`** : la maquette, chargée dans un `vm` Node, sert de source de séances déjà classées (km, minutes par intensité, répétitions). Elles alimentent les étapes ③ à ⑥ pour J = 2026-10-20. On attend le résultat de l'exemple de `05` : **AUGMENTER, 100–105 km**, progressivité 1,04, 0 répétition hors sous-seuil sur 21, palier de 3 semaines. Les notions de plan, d'objectif et de lactate n'y sont pas lues.

**Données réelles** (`npm run verif:reel`, avec `JOG_EXPORT=/chemin/export.zip`)
- Ce script n'est pas un test bloquant. Il produit un rapport dans `tests/local/out/rapport.md`, jamais versionné, qui couvre chaque point de `09` :

  | Point de `09` | Mesure du rapport |
  |---|---|
  | classification et détection des répétitions (D-001) | nombre de séances par type ; liste des séances SS avec leurs tours retenus ; séances à tours manuels non classées SS |
  | dérive cardiaque comptée en `mp`, lissage 30 s (D-001) | minutes `mp` dans le dernier quart des sorties longues sans segment déclaré |
  | reprise après coupure (D-002) | CTL₀ et CTL au jour 43 |
  | intensité forte à volume égal (D-003) | semaines où le ratio km reste OK et la fraîcheur passe sous −25 |
  | suggestion `paceHrK` (D-004) | suggestion mois par mois |
  | retour de FC 5 min, découplage avec ou sans `mp` (D-005) | découplage moyen des deux groupes |
  | durée du recalcul (D-006, D-010) | temps du premier calcul, puis d'un recalcul après une modification de `lt2Hr` |
  | fenêtre de 21 jours, « Maintenir » par manque de données (D-007) | nombre de jours par cause |
  | répartition des verdicts (D-008) | % par verdict sur tout l'historique |
  | plages minimales des axes (D-009) | domaines calculés sur les 12 premières semaines |
  | FC 1 s face à 5 s (D-013) | sur les FIT à 1 s, écart quand on les ramène à 5 s |
  | courses et tests (D-014) | liste des courses détectées ; présence d'un test 5 km |

- Un second script, `verif:reel:snapshot`, enregistre la Vue calculée dans `tests/local/out/`, pour comparer deux versions des règles en local (non-régression sur données réelles).

**Non-régression versionnée** : un instantané de la Vue calculée sur le scénario `historique()` de référence (14 mois synthétiques) est versionné dans `tests/regression/`. Si une valeur change sans nouvelle `REGLES_VERSION`, le test échoue.

## Conséquences

- **Positives** : chaque critère de `05` a un test nommé. Les points de `09` ont tous un moyen de vérification. Aucune donnée personnelle n'est versionnée.
- **Négatives et dette acceptée** : il faut écrire et maintenir l'encodeur FIT de test et les constructeurs de scénarios ; le rapport sur données réelles demande l'archive en local.
- **À vérifier pendant l'implémentation** : que le scénario `data.js` reproduise bien l'exemple de `05`. Son CTL de départ est fixe (38 / 40), alors que D-002 en fixe un autre ; l'écart, d'après D-002, est nul au 19 octobre.

## Sources

- Aucune source externe.
