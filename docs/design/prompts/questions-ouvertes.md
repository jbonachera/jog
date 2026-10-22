# Prompt : traiter les questions ouvertes du design Fjord

À coller tel quel dans une nouvelle session Claude (Opus), ouverte à la racine du dépôt `jog`.

---

Tu vas m'aider à trancher, une par une et de façon interactive, les questions ouvertes de la spécification du tableau de bord « Fjord » de Jog. **Tu ne codes rien.** Le livrable est une spécification mise à jour et un journal de décisions.

## Contexte à lire avant de commencer

Lis intégralement, dans cet ordre :
1. `docs/design/README.md`
2. `docs/design/01-vision.md`
3. `docs/design/04-metriques.md`
4. `docs/design/05-decision-volume.md`
5. `docs/design/06-parametres.md`
6. `docs/design/07-donnees.md`
7. `docs/design/09-questions-ouvertes.md`. **C'est la liste à traiter.**

Consulte les autres fichiers de `docs/design/` et la maquette `docs/design/maquette/index.html` (avec `data.js`) dès qu'une question les touche. Pour une question de méthode d'entraînement, `recherche.md` à la racine donne le contexte NSA.

## Contraintes du produit, non négociables

Toute option que tu proposes doit les respecter :
- **Le réalisé uniquement** : pas de plan, de séance prévue, de cycle, de bloc, de semaine allégée, d'objectif ni de compte à rebours de course.
- **Seulement ce que mesurent une montre GPS et une ceinture cardio** : distance, allure, durée, FC battement par battement, altitude, cadence, tours. Pas de lactate, de puissance, de ressenti, de sommeil ni de saisie manuelle.
- **Méthode NSA** : semaines répétitives, 2 à 3 séances sous-seuil, footings faciles sous un plafond de FC, une sortie longue, pas de semaine allégée.
- **Le verdict de décision volume doit rester déterministe et explicable** : chaque signal a une valeur, un état et une phrase.

Si une option viole une contrainte, écarte-la et dis pourquoi en une ligne.

## Ordre de traitement

Traite les questions dans cet ordre, car les premières conditionnent les suivantes :
1. Classement des minutes par intensité
2. Initialisation du modèle de charge
3. Ratio en km ou en charge
4. Coefficient allure ↔ FC
5. Découplage et sorties longues avec allure marathon
6. Paramètres datés
7. Données insuffisantes
8. Calibrage des seuils

## Déroulé pour chaque question

1. **Situe** la question en 3 à 5 lignes :
   - ce que dit la spécification aujourd'hui ;
   - ce que fait la maquette ;
   - ce que la décision va impacter (métriques, composants, signaux, fichiers à modifier).
2. **Propose 2 à 4 options concrètes.** Pour chacune, donne :
   - la règle exacte (formule ou pseudo-code si c'est un calcul) ;
   - ses avantages et ses limites ;
   - son effet sur ce que voit l'utilisateur.

   Quand c'est possible, chiffre l'effet sur les données d'exemple. Tu peux exécuter `docs/design/maquette/data.js` avec Node (il expose `window.JOG`) pour mesurer sur l'athlète fictif. Dis-le quand un chiffre vient de cette simulation.
3. **Recommande** une option, avec la raison principale en une phrase. Place-la en premier, suivie de « (recommandé) ».
4. **Pose la question avec l'outil AskUserQuestion**, une seule question à la fois. Mets les options en choix, et un aperçu (`preview`) quand une formule ou un exemple chiffré aide à comparer. Je peux toujours répondre « Autre » avec une réponse libre. Intègre-la, et repose une question si elle reste ambiguë.
5. **Écris la décision** dès qu'elle est prise, avant de passer à la question suivante :
   - ajoute une entrée dans `docs/design/decisions.md` (crée le fichier s'il n'existe pas), au format ci-dessous ;
   - mets à jour les fichiers de spécification concernés (`03`, `04`, `05`, `06`, `07`, `08`), pour que la règle retenue y soit écrite de façon définitive, sans mention « à trancher » ;
   - retire la question de `09-questions-ouvertes.md` et remplace-la par un renvoi d'une ligne vers la décision ;
   - si la décision crée un écart avec la maquette, ajoute-le au tableau « Écarts connus de la maquette » de `09`. Ne modifie pas la maquette.
6. **Annonce en une ligne** ce qui a été modifié, puis passe à la question suivante.

Si une décision remet en cause une décision précédente, signale-le explicitement. Demande-moi si je veux revenir dessus avant de continuer.

## Format d'une entrée dans `docs/design/decisions.md`

```markdown
## D-00X · {titre court}

- **Date** : {AAAA-MM-JJ}
- **Question** : {la question en une phrase}
- **Décision** : {la règle retenue, formule exacte si c'est un calcul}
- **Options écartées** : {option : raison en une ligne}, …
- **Raison** : {pourquoi cette option}
- **Impacts** : {métriques, composants, signaux, paramètres concernés}
- **Fichiers modifiés** : {liste}
- **À valider sur données réelles** : {ce qu'il faudra vérifier une fois des vraies activités importées, ou « rien »}
```

## Après les 8 questions

1. Propose de traiter aussi les **écarts connus de la maquette** de `09`, ceux qui demandent une décision : bornes des axes, recalcul sans rechargement… Même déroulé, mais en lot si les décisions sont évidentes.
2. Relis toute la spécification et vérifie qu'elle est **cohérente** :
   - mêmes seuils et mêmes noms partout ;
   - aucune mention résiduelle de « à trancher » ;
   - aucun terme du vocabulaire interdit de `08-systeme-visuel.md`.

   Corrige ce qui doit l'être et liste les corrections.
3. Termine par un résumé : un tableau des décisions (identifiant, titre, règle retenue en une ligne), la liste des fichiers modifiés, et ce qui reste ouvert.

## Style

- Réponds en français, phrases courtes, sans jargon non expliqué.
- Sois concret : formules, valeurs, exemples chiffrés plutôt que des généralités.
- Ne pose jamais plus d'une question de décision à la fois. Ne passe pas à la suivante tant que la décision en cours n'est pas écrite dans les fichiers.
