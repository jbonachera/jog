# 01 · Vision

## Ambitions

1. **Aider à décider.** Chaque semaine, répondre clairement à « est-ce que je peux augmenter mon volume ? » par un verdict argumenté et une fourchette chiffrée. L'utilisateur ne doit pas avoir à croiser lui-même des courbes réparties sur plusieurs écrans.
2. **Mesurer la progression.** Rendre visible, sur des mois et des saisons, ce qui a progressé et ce qui a stagné : allure à FC constante, efficacité, endurance, volume. On compare des périodes entre elles plutôt que de regarder des valeurs isolées.
3. **Valoriser l'accompli.** Montrer le volume réalisé (année, 30 jours, 7 jours) et l'historique des saisons. C'est un tableau de bord qu'on garde au fil des années.
4. **Respecter la méthode NSA.** Les métriques suivent la logique de la méthode : minutes et part de sous-seuil, discipline des footings, régularité des répétitions, semaines répétitives sans semaine allégée.

## Utilisateur

- Coureur amateur régulier, 5 à 9 h par semaine, qui suit la **Norwegian Singles Approach**. Typiquement 2 à 3 séances sous-seuil par semaine, une sortie longue et le reste en footing facile.
- Il court en 5 km, 10 km, semi et marathon. Il n'est **pas** préparé pour une course en particulier : le suivi est continu.
- Il s'équipe d'une **montre GPS** et d'une **ceinture cardio**. Il n'a ni lecteur de lactate, ni capteur de puissance, ni saisie subjective.
- Il est à l'aise avec les chiffres, mais veut une lecture rapide le matin, et une analyse plus fine de temps en temps.

## Questions auxquelles le produit répond

| Question | Où |
|---|---|
| Est-ce que j'augmente, je maintiens ou j'allège mon volume cette semaine ? De combien ? | Aperçu, carte Décision volume |
| Que se passe-t-il si je cours X km la semaine prochaine ? | Aperçu, simulateur |
| Combien ai-je couru cette année, ce mois-ci, cette semaine ? | Aperçu, volume réalisé |
| Où en sont ma forme de fond et ma fatigue ? | Aperçu, forme et fatigue |
| Mon volume augmente-t-il progressivement ? | Charge, progressivité |
| Est-ce que je respecte la méthode (part de sous-seuil, footings faciles) ? | Charge, minutes de sous-seuil et discipline NSA |
| Ai-je progressé par rapport à il y a 12 semaines ou un an ? | Progression, comparer deux périodes |
| Est-ce que je cours plus vite à FC égale ? | Progression, tendances et allure × FC |
| Ma dernière séance sous-seuil était-elle bien maîtrisée ? | Progression, dernière séance |
| Quel est mon niveau actuel sur chaque distance ? | Progression, niveau estimé |
| Qu'ai-je fait semaine par semaine, saison après saison ? | Historique |

## Principes

1. **Le réalisé, rien que le réalisé.** Aucune séance prévue, aucun plan, aucun cycle, aucun objectif ni compte à rebours de course. Les courses passées n'apparaissent que comme des résultats.
2. **Seulement ce qui se mesure** avec une montre GPS et une ceinture cardio : distance, allure, durée, FC échantillonnée par la ceinture (1 à 5 s selon l'appareil), altitude, cadence. Pas de lactate, de ressenti, de sommeil ni de saisie manuelle.
3. **Un verdict, puis le détail.** Le résumé vient d'abord (Aperçu), le détail ensuite (onglets).
4. **Toujours expliquer.** Chaque signal affiche sa valeur, son état et une phrase d'explication. Chaque modèle abstrait (forme, fatigue, fraîcheur) est expliqué en clair à côté de son graphique.
5. **Des repères, pas des injonctions.** Les repères de l'athlète (FC max, seuil, plafond des footings, cible de sous-seuil) sont réglables. Les seuils du verdict sont fixes et publiés : ce sont des repères de lecture, pas des vérités scientifiques, et ils ne changent que par une décision tracée après retour d'usage. La fourchette de volume est une borne calculée sur le réalisé, pas un plan.
6. **La tendance prime sur la valeur absolue.** Les courbes sont lissées, et on compare des périodes plutôt que des points.
7. **Lisibilité avant densité.** Chaque onglet tient en un à deux écrans. On navigue par onglets, pas par un long défilement.

## Non-objectifs

- Construire ou générer un plan d'entraînement, proposer des séances.
- Préparer une course précise (compte à rebours, objectif chrono, prédiction « jour J »).
- Afficher la notion de cycle, de bloc ou de semaine allégée : il n'y en a pas en NSA.
- Gérer le lactate, la puissance, le ressenti, le sommeil ou la nutrition.
- Offrir une dimension sociale ou des classements.
