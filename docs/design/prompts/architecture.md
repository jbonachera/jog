# Prompt : décisions d'architecture avant l'implémentation de Fjord

À coller tel quel dans une nouvelle session Claude (Opus), ouverte à la racine du dépôt `jog`.

---

Tu vas m'aider à prendre, une par une et de façon interactive, les décisions d'architecture du tableau de bord « Fjord » de Jog, avant d'écrire la moindre ligne de code. **Tu n'écris pas de code de production.** Les livrables sont des ADR (Architecture Decision Records), leur index et un découpage de l'implémentation en lots.

## Contexte à lire avant de commencer

Lis intégralement, dans cet ordre :
1. `docs/design/README.md`
2. `docs/design/01-vision.md`
3. `docs/design/07-donnees.md` : données d'entrée et entités. **C'est le point de départ de l'architecture.**
4. `docs/design/04-metriques.md`
5. `docs/design/05-decision-volume.md`
6. `docs/design/06-parametres.md`
7. `docs/design/02-navigation.md`
8. `docs/design/decisions.md` : décisions D-001 à D-011. Elles contraignent l'architecture.
9. `docs/design/09-questions-ouvertes.md` : en particulier « À vérifier sur données réelles ».

Consulte `03-composants.md`, `08-systeme-visuel.md` et la maquette `docs/design/maquette/index.html` (avec `data.js`) dès qu'un sujet touche l'interface. `recherche.md`, à la racine, liste les outils du marché et leurs API.

## Ce que la spécification impose déjà à l'architecture

Relève ces exigences dans les fichiers et cite-les quand une option les touche :
- **Données** : uniquement ce qu'enregistrent une montre GPS et une ceinture cardio. Il faut les flux échantillonnés (temps, distance, allure, FC, altitude), les tours, et le marquage course ou test (`07`). Aucune saisie manuelle.
- **Flux conservés** : le classement des minutes (D-001) et le découplage sur les portions faciles (D-005) se calculent sur les flux à environ 1 s, pas sur des résumés d'activité.
- **Recalcul rétroactif** : un paramètre daté peut prendre une date d'effet passée, et tout ce qui en dépend est recalculé à partir de cette date (D-006). Les flux bruts doivent donc rester disponibles.
- **Recalcul sans rechargement** : l'enregistrement des paramètres recalcule en mémoire et annonce le résultat (D-010). Le simulateur recalcule en direct (`05`).
- **Déterminisme** : mêmes données et mêmes paramètres donnent le même verdict (`05`, critères d'acceptation). Les seuils du verdict sont des constantes versionnées (D-008).
- **Calendrier** : les fenêtres s'arrêtent à J−1 au soir, en jours locaux ; la semaine va du lundi au dimanche (`03`, conventions).
- **Synchronisation** : la barre supérieure affiche la date de la dernière synchronisation (`02`).
- **Paramètres** : stockés côté serveur et rattachés à l'athlète, avec l'historique des modifications des paramètres datés. Les préférences d'affichage restent locales (`02`, `06`).
- **Hors du modèle de production** : les notions de plan, de séance prévue, d'objectif et de lactate de `data.js` (`07`).

## Contraintes du produit, non négociables

Toute option que tu proposes doit les respecter :
- **Le réalisé uniquement** : pas de plan, de séance prévue, de cycle, de bloc, de semaine allégée, d'objectif ni de compte à rebours de course. Aucune entité, aucune table et aucun champ d'API ne doit les porter.
- **Seulement ce que mesurent une montre GPS et une ceinture cardio**. Une source qui ne fournit pas la FC échantillonnée et les tours ne suffit pas seule.
- **Le verdict reste déterministe et explicable**.
- **La spécification fait foi.** Si une option d'architecture oblige à changer une règle de la spécification, tu ne la changes pas en silence. Signale l'écart, et propose une décision `D-0xx` à ajouter à `docs/design/decisions.md`. N'écris cette décision qu'avec mon accord.

Si une option viole une contrainte, écarte-la et dis pourquoi en une ligne.

## Faits externes

Les capacités des API (données exposées, résolution des flux, tours, quotas, conditions d'accès, licence) changent. Ne les donne jamais de mémoire. Vérifie-les dans la documentation officielle avec WebSearch ou WebFetch, et cite chaque source avec sa date de consultation. Si tu ne trouves pas de source officielle, dis-le et classe l'information comme « non vérifiée ».

Dès le premier sujet, demande-moi si je peux fournir un **export réel** d'une ou deux activités (fichier FIT, GPX ou TCX, ou réponse d'API). Avec mon accord, tu peux l'inspecter avec un script jetable placé dans le répertoire scratchpad de la session, jamais dans le dépôt. Le but est de vérifier les champs réellement présents : résolution de la FC, tours, FC de fin de tour, altitude, marquage course. Dis toujours quand un constat vient de cet export.

## Sujets à traiter, dans cet ordre

Les premiers conditionnent les suivants :
1. **Périmètre de déploiement** : un seul athlète ou plusieurs, auto-hébergé ou service en ligne, sur poste local ou sur serveur.
2. **Source des données d'activité** : quelle plateforme ou quel format (import de fichiers FIT, API d'une plateforme de montre ou d'agrégation…), et ce que chaque option fournit réellement par rapport aux besoins de `07`. Traite aussi l'écart entre « FC battement par battement » (`07`) et des flux échantillonnés à 1 s. S'il faut changer la formulation de la spécification, applique la règle « la spécification fait foi ».
3. **Synchronisation et import** : déclenchement (manuel, périodique, notification de la plateforme), idempotence, doublons entre sources, activité modifiée ou supprimée à la source, rattrapage de l'historique au premier import.
4. **Stockage** : données brutes (flux, tours) et données dérivées (séances, minutes par intensité, agrégats, séries quotidienne CTL / ATL / TSB), moteur de stockage, schéma, historique des paramètres (D-006), migrations.
5. **Moteur de calcul** : où il s'exécute (serveur, navigateur, les deux), découpage du pipeline (import → séance → répétitions → minutes par intensité → agrégats → signaux → verdict), recalcul incrémental depuis une date d'effet, matérialisation ou calcul à la demande, versionnage des règles et des constantes (D-008), déterminisme numérique (arrondis, flottants).
6. **Temps et calendrier** : fuseau horaire de référence, date locale d'une activité, changement d'heure, activité à cheval sur minuit, définition de J−1.
7. **Langage, outillage et organisation du dépôt** : langages, partage éventuel du code de calcul entre serveur et navigateur, structure des dossiers, gestion des dépendances. Le dossier n'est pas encore un dépôt git : ne lance pas `git init` sans mon accord.
8. **Interface et contrat d'API** : technologie de l'interface, rendu des graphiques (SVG sur mesure comme la maquette, ou bibliothèque), contrat de données entre serveur et interface, répartition entre état local et état serveur.
9. **Sécurité et données personnelles** : authentification, stockage des jetons des plateformes, chiffrement, statut des données de FC (données de santé), export et suppression des données.
10. **Stratégie de test** : tests unitaires des règles du verdict et des bornes de seuils (`05`), jeu d'essai déterministe (le générateur de `data.js` peut-il servir de fixture ?), jeu de données réelles anonymisées pour les points de `09` « À vérifier sur données réelles », tests de non-régression des calculs.
11. **Exploitation** : déploiement, sauvegardes, journalisation des imports et des recalculs, reprise après erreur.

Si un sujet ne demande pas de décision dans le contexte retenu (par exemple l'authentification pour un outil local mono-utilisateur), dis-le, propose de le clore par une courte ADR « sans objet, parce que… », et passe au suivant.

## Déroulé pour chaque sujet

1. **Situe** le sujet en 3 à 5 lignes :
   - les exigences de la spécification qui le contraignent, avec leurs références (fichier, section, D-0xx) ;
   - les ADR déjà acceptées dont il dépend ;
   - ce que la décision va conditionner ensuite.
2. **Propose 2 à 4 options concrètes.** Pour chacune, donne :
   - ce qu'elle implique concrètement (composants, technologies, flux de données) ;
   - ses avantages et ses limites, en particulier face aux exigences listées plus haut ;
   - son coût de mise en œuvre et de maintenance, en ordre de grandeur ;
   - ce qui serait difficile à changer plus tard.
3. **Recommande** une option, avec la raison principale en une phrase. Place-la en premier, suivie de « (recommandé) ».
4. **Pose la question avec l'outil AskUserQuestion**, une seule à la fois. Mets les options en choix, avec un aperçu (`preview`) quand un schéma, un extrait de schéma de données ou un exemple d'API aide à comparer. Je peux toujours répondre « Autre » avec une réponse libre. Intègre-la, et repose une question si elle reste ambiguë.
5. **Écris l'ADR** dès que la décision est prise, avant de passer au sujet suivant :
   - crée `docs/adr/NNNN-titre-court.md`, en numérotant à partir de `0001`, au format ci-dessous ;
   - ajoute une ligne à l'index `docs/adr/README.md` (crée-le s'il n'existe pas) : numéro, titre, statut, date ;
   - si la décision touche la spécification, applique la règle « la spécification fait foi ».
6. **Annonce en une ligne** ce qui a été écrit, puis passe au sujet suivant.

Si une décision remet en cause une ADR précédente, signale-le explicitement, et demande-moi si je veux revenir dessus avant de continuer. Une ADR remplacée n'est pas effacée : son statut devient « Remplacée par NNNN ».

## Format d'une ADR

```markdown
# NNNN · {titre court}

- **Statut** : Acceptée
- **Date** : {AAAA-MM-JJ}
- **Dépend de** : {ADR précédentes, ou « aucune »}

## Contexte

{Le problème en quelques phrases, et les exigences de la spécification qui le contraignent, avec leurs références.}

## Options considérées

1. **{option retenue}** : {résumé}. Avantages : … Limites : …
2. **{option}** : {résumé}. Écartée parce que : …

## Décision

{La règle ou le choix retenu, formulé de façon définitive et vérifiable.}

## Conséquences

- **Positives** : …
- **Négatives et dette acceptée** : …
- **À vérifier pendant l'implémentation** : {ce qu'un premier lot devra confirmer, ou « rien »}

## Sources

{Documentation externe consultée, avec la date de consultation ; constats tirés d'un export réel ; ou « aucune ».}
```

## Après le dernier sujet

1. **Relis toutes les ADR** et vérifie qu'elles sont cohérentes entre elles et avec la spécification :
   - aucune contradiction entre ADR ;
   - chaque exigence listée dans « Ce que la spécification impose déjà » est couverte par au moins une ADR ;
   - aucune entité ni aucun champ ne porte le vocabulaire interdit de `08-systeme-visuel.md` ;
   - les points « À vérifier sur données réelles » de `09` ont chacun un moyen de vérification prévu.

   Corrige ce qui doit l'être et liste les corrections.
2. **Propose un découpage de l'implémentation en lots**, dans `docs/implementation/lots.md`. Chaque lot est une tranche verticale utilisable de bout en bout. Exemple : importer une activité réelle et afficher ses minutes par intensité. Pour chaque lot, donne :
   - le but en une phrase ;
   - le périmètre (composants de `03`, métriques de `04`, signaux de `05`) ;
   - les ADR et décisions D-0xx qu'il met en œuvre ;
   - ses critères d'acceptation, repris de la spécification ;
   - les tests attendus ;
   - les points de `09` qu'il permet de vérifier.

   Le premier lot doit être assez détaillé pour commencer à coder dans la session suivante. Demande-moi de valider ce découpage avant de l'écrire.
3. **Termine par un résumé** : un tableau des ADR (numéro, titre, décision en une ligne), la liste des fichiers créés ou modifiés, les écarts de spécification signalés (et ceux que j'ai acceptés), et ce qui reste ouvert.

## Style

- Réponds en français, phrases courtes, sans jargon non expliqué.
- Sois concret : noms de composants, extraits de schéma, exemples de requêtes, ordres de grandeur, plutôt que des généralités.
- Ne pose jamais plus d'une question de décision à la fois. Ne passe pas au sujet suivant tant que l'ADR en cours n'est pas écrite.
