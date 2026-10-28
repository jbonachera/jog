# 0006 · Moteur de calcul : séances mémorisées, reste recalculé en entier, dans un Worker

> **Note (2026-10-28)** : le fond de cette décision reste valable (ADR 0014). Les chemins `src/`, `tests/` et les commandes `npm` cités ont disparu avec le web TypeScript ; l'équivalent Swift est dans `ios/JogCore`.

- **Statut** : Acceptée
- **Date** : 2026-10-21
- **Dépend de** : 0001, 0003, 0004, 0005

## Contexte

Après l'enregistrement des paramètres, tout est recalculé en mémoire, sans rechargement. Le recalcul part de la date d'effet pour un paramètre daté, et porte sur tout l'historique sinon. En cas d'échec, les paramètres précédents restent en vigueur (D-006, D-010, `06`). Le simulateur se met à jour en direct (`05`). Mêmes données et mêmes paramètres donnent le même verdict, et les seuils sont des constantes versionnées (`05`, critères d'acceptation ; D-008). Les calculs s'arrêtent à J−1 (`04`).

Deux dépendances limitent la réutilisation :
- la sortie longue se définit par rapport à sa semaine (`07`, règle 3) ;
- CTL / ATL se calculent en chaîne depuis le jour 1, avec une valeur de départ tirée des 28 premiers jours (D-002).

## Options considérées

1. **Mémoriser l'étape coûteuse de chaque séance, et recalculer le reste en entier**. Avantages : déterministe par construction, aucune donnée périmée, peu de code. Limites : le premier calcul, ou un changement de `hrMax`, `z2` ou `lt2Hr` au début de l'historique, relit tous les flux.
2. **Tout recalculer à chaque fois**. Écartée parce que : environ 30 Mo de flux relus à chaque enregistrement, probablement plusieurs secondes sur un téléphone, et de plus en plus avec les années.
3. **Un calcul incrémental explicite, avec tout matérialisé**. Écartée parce que : la logique d'invalidation s'écrit à la main (D-002, le contexte de la semaine) et menace le déterminisme, pour un gain faible.

## Décision

**Pipeline.** Il s'exécute dans un **Web Worker dédié**, toujours dans cet ordre :

| Étape | Contenu | Lit les flux | Mémorisée |
|---|---|---|---|
| ① mise en forme | rééchantillonnage de la FC à 1 s (D-013), FC lissée sur 30 s (D-001), **distance cumulée interpolée linéairement** entre deux mesures (avant la première : 0 ; après la dernière : dernière valeur), vitesse manquante prolongée sur 10 s au plus | oui | avec ②a |
| ②a séance, partie intrinsèque | tours de travail ou répétitions détectées (`07`, règle 2 ; un tour automatique n'est jamais un tour de travail), minutes par intensité (D-001), segments `mp`, charge, FC moyenne, allure moyenne, EF, découplage candidat (D-005), lignes droites, distance et temps de référence d'une course | oui | **oui** |
| ②b séance, classification | type de séance (`07`, règles 1 à 4 ; D-014) avec le contexte de la semaine | non | non |
| ③ jours | km, minutes, charge, minutes par intensité, par jour local ; repos = 0 | non | non |
| ④ séries | CTL / ATL / TSB (D-002), ratio 7 j / 30 j, semaines, allure normalisée (`refHr`, `paceHrK`), conformité des footings (`easyCap`), répétitions hors sous-seuil (`lt2Pace`, `subtHrHi`), suggestion `paceHrK` (D-004) | non | non |
| ⑤ signaux | 7 signaux à J−1, données insuffisantes (D-007) | non | non |
| ⑥ verdict | règle, phrase, fourchette (`05`) | non | non |

**Clé de mémorisation de ②a** :

```
cle = SHA-256( empreintePivot, versionAdaptateur, REGLES_VERSION,
               { hrMax, z2, lt2Hr, lt2Pace, subtHrLo } en vigueur au jour de la séance, FORMAT_SEANCE )   # lt2Pace : détection dans le flux ; subtHrHi n'est lu qu'en ④
```

Une modification datée ne change la clé que des séances qui suivent sa date d'effet. Elles seules relisent leurs flux. Les étapes ②b à ⑥ sont toujours recalculées sur tout l'historique : environ 900 jours, de l'ordre de la milliseconde. Les entrées de `derive` sans clé correspondante sont purgées après un recalcul réussi.

**Atomicité (D-010).** Le Worker reçoit une copie des paramètres proposés et renvoie une nouvelle **Vue**, l'objet que lit l'interface (sujet 8). Les paramètres ne sont enregistrés dans IndexedDB qu'après un recalcul réussi. En cas d'erreur, l'ancienne Vue et les anciens paramètres restent en place.

**Simulateur.** Il s'exécute dans le fil principal, à partir de CTL et ATL à J−1, de la charge par km sur 30 jours et des km de J−23 à J−1, fournis par la Vue (`05`). Ce sont 7 itérations par mouvement du curseur.

**Versionnage.** Un seul module `constantes` contient les seuils du verdict, les coefficients de la fourchette et les bornes du simulateur (`05`), les poids de charge (`04`), les motifs de D-014, les 10 s de D-013 et les minimums de D-007. Sa version est `REGLES_VERSION` (semver), et elle augmente à chaque décision D-0xx qui touche un calcul. Chaque Vue porte `REGLES_VERSION`.

**Déterminisme numérique.**
- Les calculs se font en `Float64`, avec seulement les opérations de base et `Math.sqrt`, exactement arrondies selon IEEE 754.
- `Math.pow`, `exp` et `log` sont **interdits** dans les étapes ① à ⑥. Seule l'équivalence de Riegel (`04`), un affichage, utilise `pow`.
- Les sommes parcourent les séances dans l'ordre (`dateLocale`, `debutUtc`, `cleSource`), pour éviter les écarts d'arrondi dus à l'ordre d'addition.
- Avant d'être comparée aux **seuils du verdict** (`05`, étapes ⑤ et ⑥), une mesure est arrondie à sa précision d'affichage ([D-015](../design/decisions.md#d-015--arrondi-avant-comparaison-aux-seuils)). Les comparaisons des étapes ① à ④ (classement des minutes, détection des répétitions, conformité des footings) portent sur les valeurs **brutes**.

## Conséquences

- **Positives** : une modification de paramètre ne relit que les flux concernés. Rien ne peut être périmé, puisque tout ce qui n'est pas mémorisé est recalculé. Le même pipeline sert aux tests, hors navigateur.
- **Négatives et dette acceptée** :
  - le premier calcul, ou un changement rétroactif de `hrMax`, `z2` ou `lt2Hr`, relit tous les flux ;
  - la Vue complète est reconstruite à chaque recalcul, alors qu'une partie seulement de l'interface change ;
  - l'interdiction de `pow`, `exp` et `log` contraint les règles futures : il faudra une décision pour en introduire.
- **À vérifier pendant l'implémentation** : la durée du premier calcul et d'un recalcul complet sur l'export, sur ordinateur et sur iPhone (point de `09` sur D-006 et D-010) ; le temps de reconstruction de la Vue ; la détection des répétitions (`07`, règle 2) sur les tours manuels et automatiques de l'export.

## Sources

- Export réel `export_<id>.zip` (2026-10-21) : nombre d'échantillons, nature des tours.
- ECMAScript (brouillon 2027, tc39.es) : `Math.exp` renvoie une valeur « implementation-approximated », tandis que `Math.sqrt` renvoie la racine arrondie au double — https://tc39.es/ecma262/multipage/numbers-and-dates.html — consulté le 2026-10-21, par extraits de recherche. Pour `Math.pow` (`Number::exponentiate`), l'édition 2018 parle d'une « implementation-dependent approximation » — https://262.ecma-international.org/9.0/ — consulté le 2026-10-21. Le texte actuel n'a pas été lu en entier.
- MDN, *Math* (« many Math functions have a precision that's implementation-dependent ») — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math — consulté le 2026-10-21.
