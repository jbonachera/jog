# Plan de réalisation · Fjord

Découpage en lots. Chaque lot est une tranche utilisable de bout en bout, qui part des données réelles et va jusqu'à l'écran. Il est livré par une suite de tâches. Les références renvoient à la spécification (`docs/design/`), aux décisions D-0xx et aux ADR (`docs/adr/`). Les types partagés sont dans [contrats.md](contrats.md).

## Méthode, pour toutes les tâches

**TDD centré sur le comportement** (ADR 0011)
1. Écrire d'abord un test qui décrit un comportement observable, à une frontière publique : `calculerVue`, un adaptateur, un message du Worker ou un rendu DOM. Le nommer en français, avec la règle citée : `it("classe en sous-seuil une répétition dont la FC de fin ≤ lt2Hr (D-001)")`.
2. Le lancer et le voir échouer.
3. Écrire le code minimal qui le fait passer, puis remanier.
4. Ne jamais tester une fonction interne, un appel, une structure privée ou un détail d'implémentation. Pas de mock du cœur. Un test survit à une refactorisation.
5. Fixtures construites par code (`tests/fixtures/`). Aucune donnée réelle dans le dépôt.
6. **Tests chronométrés** : on les déclare avec `itPerf` (`tests/fixtures/perf.ts`), jamais avec `it`. Ils ne s'exécutent que par `npm run test:perf`, en série. `npm test` reste ainsi déterministe.

**Définition de « terminé »** pour une tâche : `npm test`, `npm run lint` et `npm run typecheck` passent ; chaque critère d'acceptation cité a au moins un test ; aucun fichier hors du périmètre de la tâche n'est modifié sans raison écrite dans le compte rendu.

**Flux de travail** : un agent Haiku implémente la tâche. Un agent Sonnet relit le code **et les tests** : conformité à la spécification, comportement plutôt qu'implémentation, cas limites, lisibilité. Un agent Haiku corrige ensuite. L'orchestrateur relance les vérifications et passe à la tâche suivante.

---

## Lot 0 · Socle

**But** : un projet qui compile, se teste et se construit, avec les contrats et les briques de base.

| Tâche | Contenu | Tests attendus |
|---|---|---|
| 0.1 Projet | `package.json` (versions exactes de l'ADR 0008), `tsconfig` strict, Vite (`base: './'`), Vitest (environnement `node` ; `happy-dom` pour `tests/ui/**`), ESLint (règles `no-restricted-properties` et `no-restricted-imports` de 0008), `.gitignore`, `index.html` minimal avec la CSP de 0010, polices auto-hébergées | un test fumée ; `npm run build` produit `dist/` |
| 0.2 Contrats et constantes | `src/core/types.ts` (contrats.md), `src/core/constantes.ts` (`REGLES_VERSION = "1.0.0"`, seuils de `05`, poids de charge de `04`, minimums de D-007, motifs de D-014, 10 s de D-013, précisions de D-015), `src/core/parametres.ts` (défauts de `06`, `parametresAuJour(params, date)` selon D-006) | valeur en vigueur avant, pendant et après une modification datée ; même date : la dernière enregistrée l'emporte ; avant la première modification : la première valeur |
| 0.3 Dates et formats | `src/core/dates.ts` (ADR 0007 : numéro de jour, lundi ISO, J−n, `dateLocale`), `src/core/format.ts` (`08`, Rédaction : virgule décimale, espace des milliers, vrai signe moins, `m:ss`, `h:mm`, « 7h59 », « 19 oct. »), `src/core/arrondi.ts` (D-015) | passage à l'heure d'été et d'hiver, 29 février, semaine à cheval sur deux années ; formats de `08` ; arrondi à mi-chemin qui s'éloigne de zéro |

**Critères d'acceptation** : la règle ESLint refuse `Math.pow` dans `src/core/` ; la CSP est présente dans `dist/index.html`.

## Lot 1 · Importer l'archive réelle et voir les 7 derniers jours

**But** : l'athlète importe `export_*.zip`. Fjord affiche, dans l'Aperçu, les 7 derniers jours (A3) : séances classées, minutes par intensité, et la date de la dernière synchronisation dans la barre.

| Tâche | Contenu | Tests attendus |
|---|---|---|
| 1.1 Lecteur FIT | `src/adapters/fit/` : en-tête, définitions, en-tête compressé, champs de développeur sautés ; messages `file_id`, `record`, `lap`, `session`, `activity`, `device_info` ; vers `ActivitePivot` (FC à son pas d'origine, NaN ailleurs ; `local_timestamp` donne `decalageLocal_min` ; `lap_trigger` donne `declenchement` ; `sub_sport` donne `sousType`). Avec `tests/fixtures/encodeur-fit.ts` | fichier construit → pivot attendu ; FC à 5 s ; tours manuels et au km ; fichier tronqué → erreur explicite ; activité non course → ignorée |
| 1.2 Lecteurs GPX et TCX | `src/adapters/gpx/`, `src/adapters/tcx/` (FC par extension, tours TCX) | fichiers construits → pivot ; GPX sans FC → `fc_bpm` null |
| 1.3 Adaptateur de l'archive Strava | `src/adapters/strava-archive/` : ZIP (fflate), `activities.csv` (colonnes par occurrence, en-têtes fr), `.gz`, `cleSource = strava:{id}`, `competition` (colonne « Compétition »), `nom`, empreinte SHA-256 (WebCrypto `crypto.subtle`) ; seuls `activities.csv` et `activities/*` sont ouverts (0010) | ZIP construit → pivots et journal (illisibles, non-courses) ; les autres fichiers ne sont jamais lus |
| 1.4 Séance ①, ②a et ②b | `src/core/seance/` : rééchantillonnage de la FC (D-013), FC lissée sur 30 s, répétitions (`07`, règle 2 : tours de travail ≥ 2 min, récupérations ≤ 2 min, FC de fin ≥ subtHrLo − 5 ; tours automatiques exclus ; sinon détection dans le flux), minutes par intensité (D-001), segments `mp` ≥ 10 min, charge (`04`), FC moyenne, allure, EF, découplage candidat (D-005), lignes droites (< 30 s en fin de séance), marquage (D-014), distance et temps de référence d'une course ; classification ②b (`07`, règles 1 à 4) | un scénario par règle de D-001 (répétition hard ou subt, mp ≥ 10 min, segment de 9 min classé easy, lissage) ; FC à 1 s et à 5 s → mêmes minutes (D-013) ; un cas par type de séance ; un footing à tours au km n'est pas un sous-seuil ; D-014 sur les noms de l'export (« Semi De Porto Vecchio » → course, « Paris / Pantin • 11km endurance » → aucun) |
| 1.5 Jours, store, import, Worker | `src/core/jours.ts` (③) ; `src/store/` (schéma de 0005, migration v1, transactions) ; `src/worker/` (messages de 0009 : `demarrer`, `importer`, `progression`, `vue`) ; import de 0004 (empreintes, instantané par source, doublons par recouvrement, journal) ; une Vue minimale (`seances`, `jours`, `derniereSynchro`, `J`) | sur `fake-indexeddb` : importer deux fois la même archive ne change rien ; une archive qui renomme une activité la reclasse ; une activité absente est supprimée ; un doublon entre sources garde la FC la plus fine ; une erreur au milieu de l'import n'écrit rien |
| 1.6 Interface : coque et A3 | `src/ui/` : barre fixe (`02` : marque, onglets ARIA avec flèches et `tabindex`, mention « Dernière synchronisation : … »), onglet persistant (`fjord-view`), un panneau visible à la fois, `[hidden]{display:none!important}` ; tokens de `08`, thème sombre ; A3 « 7 derniers jours » (`03`) ; bouton « Importer une archive Strava » avec une barre de progression (voir « Écarts proposés ») | navigation au clavier ; persistance de l'onglet ; A3 : 7 lignes de J−7 à J−1, repos compris ; libellé « Sous-seuil 6×6' » ; résumé « n séances · km · min de sous-seuil » ; aucune mention de « prévu » |

**Critères d'acceptation** (`03`, A3 ; `02`) : une ligne par jour, de J−7 à hier ; « Repos » grisé, sans cadre plein ; un seul panneau visible ; les flèches font défiler les onglets en boucle.
**Points de `09` vérifiés** : classification et détection des répétitions (premier aperçu), FC à 1 s et à 5 s (D-013), courses détectées (D-014).

## Lot 2 · Décision volume et Aperçu complet

**But** : l'Aperçu complet : verdict, signaux, fourchette, simulateur (A1), volume réalisé (A2), forme et fatigue (A4).

| Tâche | Contenu | Tests attendus |
|---|---|---|
| 2.1 Séries | `src/core/series/` (④) : CTL / ATL / TSB avec l'initialisation de D-002, `r(d)` 7 j / 30 j (`04`, défini seulement après 30 jours d'historique), semaines lundi → dimanche, palier, compteurs (année, 30 j, 7 j), conformité des footings, monotonie et contrainte | D-002 : la fraîcheur vaut 0 au jour 1 ; changer le jour 1 recalcule toute la série ; ratio non défini avant 30 jours ; palier |
| 2.2 Signaux et verdict | `src/core/decision/` (⑤ et ⑥) : 7 signaux, états, valeurs, phrases exactes de `05`, données insuffisantes (D-007), verdict, phrase, fourchette, entrées du simulateur ; arrondi de D-015 ; `simuler(km, simulateur, fourchette)` pur | **critères de `05`** : un cas par verdict ; les bornes de chaque seuil, à la valeur exacte et juste au-delà ; aucun verdict avant 30 jours ; « Maintenir » si seul un décisif est insuffisant ; un non décisif insuffisant sans effet ; chaque signal cité dans la phrase est visible dans la liste ; **acceptation `data.js`** (0011) : AUGMENTER, 100–105 km au 2026-10-20 |
| 2.3 `calculerVue` | assemblage ① à ⑥, mémorisation de ②a par clé (0006), ordre déterministe des sommes ; Vue `decision`, `serieCharge`, `ratio`, `semaines` | mêmes entrées → Vue identique, octet pour octet ; mémorisation : une modification datée ne recalcule que les séances qui suivent sa date (observé par compteur exposé dans la Vue de diagnostic, et non par espion interne) |
| 2.4 Module de graphiques | `src/ui/graph/` : échelles, bornes de D-009, axes, réticule, infobulle unique, vue tableau de D-011, `role="img"` et `aria-label` | domaines de D-009 (pas, plages minimales, repères inclus) ; bouton Graphique · Tableau qui remplace le graphique par un tableau aux en-têtes réels |
| 2.5 Interface A1, A2, A4 | A1 (verdict coloré, phrase, fourchette, simulateur avec `aria-live`, 7 cartes), A2 (3 compteurs, pastille orange au-delà de ±30 %), A4 (deux graphiques, bande de −25 à −10, note en 4 paragraphes) | textes et états des cartes ; « Pas encore de verdict » sans fourchette ni simulateur ; le curseur met à jour ses résultats ; A2 « pas d'historique » |

**Critères d'acceptation** : ceux de `05` et de `03` (A1, A2, A4).
**Points de `09` vérifiés** : reprise après coupure (D-002), répartition des verdicts (D-008), fenêtre de 21 jours (D-007), intensité à volume égal (D-003), par le rapport `verif:reel`.

## Lot 3 · Onglets Charge et Historique

**But** : C1, C2, C3, H1, H2, avec leurs sélecteurs.

| Tâche | Contenu | Tests attendus |
|---|---|---|
| 3.1 Sélecteurs et Vue | `src/core/selecteurs/` : fenêtre de C1 (16 sem. / 12 mois), période de H1 et H2 (12 / 26 / toutes), données de C2 et C3 ; résultats de course pour H1 | 29 premiers jours non tracés (C1) ; 26 et 30 semaines terminées ; cible ±1 point (C3) |
| 3.2 Interface Charge | C1 (deux graphiques empilés, réticule partagé, bande 0,8–1,3, ligne 1,5), C2 (moyenne sur 4 semaines), C3 (bande cible, note de Foster) | critères de `03` (C1, C2, C3) ; vue tableau |
| 3.3 Interface Historique | H1 (barres empilées par intensité, courses, ligne « aujourd'hui »), H2 (journal, en-tête collant, semaine en cours surlignée, pastilles) ; `fjord-range` | sélecteur partagé par H1 et H2 et mémorisé ; aucune semaine future |

## Lot 4 · Onglet Progression

| Tâche | Contenu | Tests attendus |
|---|---|---|
| 4.1 Calculs | allure normalisée (`04`, `refHr`, `paceHrK`), hors sous-seuil (`lt2Pace`, `subtHrHi`), tendances P2 (lissages sur 4 et 3 points), centres du nuage P3, dernière séance P4, niveau P5 (Riegel dans `riegel.ts`, records), comparateur P1 (`04`, Comparateur), suggestion `paceHrK` (D-004) | une formule par mesure du comparateur ; « historique partiel » ; période invalide ; pic du ratio sans les 29 premiers jours ; suggestion absente quand il manque des données |
| 4.2 Interface | P1 (préréglages, dates, `fjord-cmp-p`), P2 (losange quand il y a de l'allure marathon), P3 (cercles et carrés, flèche, `fjord-cmp`), P4 (sucettes, ligne de seuil), P5 (tableau) | critères de `03` (P1 à P5) |

## Lot 5 · Paramètres et recalcul

| Tâche | Contenu | Tests attendus |
|---|---|---|
| 5.1 Formulaire | 5 groupes (`06`), datés et globaux séparés, « À partir du » (date future refusée), tableau des zones mis à jour pendant la saisie, liste des modifications avec suppression, valeur suggérée `paceHrK` | les 5 règles de validation et leurs messages exacts ; focus sur le champ fautif |
| 5.2 Enregistrer et recalculer | message `enregistrerParams` : recalcul dans le Worker, puis écriture seulement en cas de succès (D-010) ; on reste sur l'onglet, à la même position, l'infobulle fermée ; annonces exactes dans `role="status"` ; « Revenir aux valeurs par défaut » | succès → « Enregistré. Tableau de bord recalculé. » ; échec → paramètres conservés et message exact ; les signaux concernés changent (`05`, critère 3) |
| 5.3 Sauvegarde | « Exporter mes données » et « Importer une sauvegarde » (D-012, 0005) | aller-retour : exporter puis importer redonne la même Vue ; la clé d'API n'est jamais dans le fichier |

## Lot 6 · Finition et vérification sur données réelles

| Tâche | Contenu | Tests attendus |
|---|---|---|
| 6.1 Rapport réel | `npm run verif:reel` (0011) : un rapport par point de `09`, plus les mesures de performance | le script tourne sur l'export ; il n'écrit que dans `tests/local/out/` |
| 6.2 Performance | budgets de 0012 : Vue en cache au démarrage, `Float64Array` transférées, rendu de l'onglet actif seulement | mesures dans le rapport ; taille du paquet |
| 6.3 Accessibilité et responsive | `08` (focus visible, contrastes, `prefers-reduced-motion`), seuils à 980 et 640 px, défilement horizontal limité aux tableaux larges | tests ARIA ; contrôle manuel |

---

## Écarts proposés à la spécification (non écrits, en attente d'accord)

- **D-016 · Supprimer toutes mes données** : une action dans l'onglet Paramètres (ADR 0010). En attendant, on passe par l'effacement des données du site dans le navigateur.
- **D-017 · État des données dans Paramètres** : afficher l'état du stockage persistant, la date du dernier export de sauvegarde et les versions (ADR 0005, 0012).
- **D-018 · Importer une archive Strava** : ADR 0003 et 0004 imposent un import manuel, que `06` ne décrit pas. Le lot 1 place un bouton « Importer une archive Strava » dans l'onglet Paramètres, dans un groupe « Données » à côté de l'export et de l'import de la sauvegarde (D-012). Au premier lancement, sans données, l'Aperçu affiche ce bouton. **Implémenté, parce que l'application est inutilisable sans lui ; à confirmer.**
- **Tours automatiques** : « un tour automatique, au km ou au temps, n'est jamais un tour de travail » (ADR 0003, 0006). C'est une précision de `07`, règle 2, à inscrire si elle est confirmée.
- **Tours d'échauffement et de retour au calme** (constat sur l'export réel, 2026-10-21) : dans 74 des 114 séances sous-seuil, le premier tour manuel était l'échauffement d'une séance programmée sur la montre, et il était compté comme répétition. Règle implémentée : le tour qui contient le premier échantillon n'est jamais un tour de travail, ni le dernier tour (hors tours `fin`) qui va jusqu'au dernier échantillon. Précision de `07`, règle 2, **à confirmer**.
- **Contraste de `--ink-3`** : `#7c8b97` sur `#f4f7f9` ne donne que 3,25:1, sous le niveau AA (4,5:1) que `08` exige. En attendant une décision, les textes courants passent en `--ink-2`, et `--ink-3` reste réservé aux axes. Proposition : assombrir `--ink-3` en thème clair (par exemple `#66757f`, environ 4,6:1).
- **Arrondi** : D-015 ne s'applique qu'aux seuils du verdict (`05`). Le classement des minutes et la détection se font sur les valeurs brutes (ADR 0006, précisée).

---

## Avancement

| Lot | État | Vérification |
|---|---|---|
| 0 · Socle | terminé, relu, corrigé | 2026-10-21 |
| 1 · Import réel et 7 derniers jours | terminé, relu, corrigé | 2026-10-21 : 773 tests ; archive réelle de 407 séances importée en 1,0 s, réimport idempotent, Vue de 398 Ko |
| 2.1 Séries · 2.2 Décision · 2.4 Graphiques | terminés, relus, corrigés | 2026-10-21 : acceptation `data.js` = exemple de `05` exact (AUGMENTER 100–105 km, simulateur 1,06 / −15) |
| 2 · Aperçu complet (2.3 Vue, mémorisation et cache ; 2.5 A1, A2, A4) | terminé, relu, corrigé | 2026-10-21 : 1 453 tests ; Vue à 10 ans 1,65 Mo ; démarrage depuis le cache 4 ms ; verdict réel calculé sur l'archive |
| 3.1 Sélecteurs · 4.1 Calculs Progression · 5.2/5.3 côté Worker | terminés, relus, corrigés | 2026-10-21 : 1 706 tests ; corrélation des messages par `id` ; paramètres et Vue écrits dans une seule transaction |
| 3 · Charge et Historique · 4 · Progression · 5 · Paramètres | terminés, relus, corrigés | 2026-10-22 : 2 017 tests ; JS principal 34,7 Ko compressé |
| 6 · Finition (rapport réel, navigateur réel, budgets) | terminé | 2026-10-22 : 2 022 tests unitaires + 16 scénarios Chromium ; tous les budgets de l'ADR 0012 tenus (JS 33,5 Ko, Vue en cache 47 ms, onglet ≤ 7 ms, curseur 0,2 ms, recalcul 63 ms) |
| 6.2 Performance · 6.3 Accessibilité et responsive (vérification en navigateur) | terminés | 2026-10-22 : 2 022 tests unitaires ; `npm run test:e2e` : 16 scénarios Chromium, budgets de 0012 tenus (mesures dans `tests/e2e/out/mesures.md`) ; mode de secours sans socket (voir `scripts/e2e.mjs`) |

### Écart proposé (lot 2.2)
- **Ratio indéfini malgré 30 jours d'historique** (aucun km sur les 30 derniers jours, donc `chronic = 0`) : `05` ne prévoit pas ce cas. Le signal Progressivité est traité comme insuffisant, donc **pas de verdict**, avec la phrase « Aucun km sur les 30 derniers jours. ». **À confirmer.**
- **Valeur non finie d'un signal** (NaN venu d'une donnée dégradée) : signal insuffisant, avec la phrase « Mesure non calculable. ». Cette phrase n'est pas dans `05`. **À confirmer.**
- **Conflit dans la spécification** : `05` (« Fourchette ») et `03` (A1) demandent la mention « c'est une borne calculée sur le réalisé, pas un plan ». Or `08` interdit le mot « plan ». Dans l'implémentation : « …, pas un programme d'entraînement ». **À trancher**, par la correction de `05` ou de `08`.
- **Écart des compteurs A2 (±30 %)** : `03` ne dit pas s'il se compare à la valeur brute ou affichée. Il est comparé **à la précision affichée (1 %)**, comme le veut l'esprit de D-015 : un écart affiché « +30 % » reste neutre. **À confirmer.**
- **Part de sous-seuil (C3, H2)** : jugée à la précision affichée (1 point) avant la tolérance de ±1 point, comme les compteurs de A2. **À confirmer.**
- **Choix implicites du lot 3**, conformes à la maquette :
  - les tests (type `test`) ne sont pas des « résultats de course » de H1 ;
  - « 12 mois » vaut 365 jours ;
  - la note de discipline porte sur 8 semaines **terminées** ;
  - la moyenne de C2 sur 4 semaines n'existe qu'à partir de 4 semaines ;
  - si J est un lundi, il n'y a pas de semaine en cours ;
  - les km sans minute classée comptent en « facile » dans la répartition de H1.
- **Comparateur P1 et niveau P5** : l'état d'un écart (mieux, moins bien, égal) et « l'équivalence bat le record » sont jugés sur les valeurs **arrondies à leur précision d'affichage** (esprit de D-015). Précisions : km/sem. 0,1 ; h/sem. 1 min ; séances/sem. 0,1 ; min SS/sem. 1 ; parts en % 1 point ; allure 1 s/km ; FC 1 bpm ; EF 0,01 ; découplage 0,1 point ; forme de fond 1 ; ratio 0,01 ; temps 1 s. **À confirmer.**
- **Suggestion `paceHrK` (D-004)** : vitesses = Σ km ÷ Σ h ; FC des footings et FC de fin des répétitions pondérées par la durée. **À confirmer.**
- **Validation des paramètres** : un message de plus que `06`, « La date d'effet n'est pas une date valide. », pour une date d'effet mal formée. **À confirmer.**
- **Sauvegarde** : un message de plus, « Sauvegarde trop volumineuse. » (au-delà de 5 Mo ou de 10 000 entrées par liste). **À confirmer.**
- **Année dans les dates longues** (H1, H2) : `08` donne « 19 oct. » sans année. Sur plusieurs saisons, H2 et les infobulles et libellés de janvier de H1 ajoutent l'année sur 2 chiffres (« 12 oct. 26 »), comme la maquette. **À confirmer.**
- **Barres sans préréglage D-009** (A2, C2, H1) : domaine planché à 0 tant qu'aucune valeur n'est négative. D-009 ne les cite pas. **À confirmer.**
- **Apostrophe typographique `’` partout** dans les textes de l'interface, messages de `06` et phrases de `05` compris. Les apostrophes droites de la spécification ne viennent que de la saisie en Markdown. **À confirmer.**
