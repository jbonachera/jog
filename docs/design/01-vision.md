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
| Quel est mon niveau, et ai-je progressé en un an ? | Aujourd'hui, Niveau (VDOT et six qualités) |
| Mon corps absorbe-t-il la charge ? | Aujourd'hui, Récupération ; écran Récupération |
| Combien ai-je couru cette semaine, ce mois-ci, cette année ? | Aujourd'hui, Volume |
| Est-ce que j'augmente, je maintiens ou j'allège mon volume ? De combien ? | Aujourd'hui, pastille du Volume ; écran Décision |
| Que se passe-t-il si je cours X km la semaine prochaine ? | Décision, simulateur |
| Comment s'est passée ma séance, face à mes séances du même type ? | Aujourd'hui, carte de séance ; écran Séance |
| Qu'ai-je fait semaine par semaine ? | Aujourd'hui, séances par semaine |
| Où en sont ma forme de fond et ma fatigue ? Mon volume monte-t-il progressivement ? Est-ce que je respecte la méthode ? | Décision, graphique de chaque signal |
| Quelles courses ai-je faites, à quel niveau ? | Courses, depuis le Niveau |
| Ai-je progressé par rapport à il y a 12 semaines ou un an ? | Progrès, comparer deux périodes |
| Est-ce que je cours plus vite à FC égale ? | Progrès, tendances et allure × FC |
| Quel est mon niveau actuel sur chaque distance ? | Progrès, niveau estimé |
| Qu'ai-je fait saison après saison ? | Progrès, saisons |

## Principes

1. **Le réalisé, rien que le réalisé.** Aucune séance prévue, aucun plan, aucun cycle, aucun objectif ni compte à rebours de course. Les courses passées n'apparaissent que comme des résultats.
2. **Seulement ce qui se mesure** avec une montre GPS et une ceinture cardio : distance, allure, durée, FC échantillonnée par la ceinture (1 à 5 s selon l'appareil), altitude, cadence. **La nuit**, avec l'Apple Watch : VFC, FC et fréquence respiratoire pendant le sommeil, et phases du sommeil ([D-023](decisions.md#d-023--récupération-nocturne)). Pas de lactate, de ressenti, de score de récupération ni de saisie manuelle.
3. **Un verdict, puis le détail.** Le résumé vient d'abord (Aujourd'hui), le détail ensuite (onglets).
4. **Toujours expliquer.** Chaque signal affiche sa valeur, son état et une phrase d'explication. Chaque modèle abstrait (forme, fatigue, fraîcheur) est expliqué en clair à côté de son graphique.
5. **Des repères, pas des injonctions.** Les repères de l'athlète (FC max, seuil, plafond des footings, cible de sous-seuil) sont réglables. Les seuils du verdict sont fixes et publiés : ce sont des repères de lecture, pas des vérités scientifiques, et ils ne changent que par une décision tracée après retour d'usage. La fourchette de volume est une borne calculée sur le réalisé, pas un plan.
6. **La tendance prime sur la valeur absolue.** Les courbes sont lissées, et on compare des périodes plutôt que des points.
7. **Lisibilité avant densité.** L'essentiel tient au-dessus du pli. Le défilement ne sert qu'à remonter dans le passé ; le détail s'ouvre depuis le bloc qui le résume ([D-024](decisions.md#d-024--accueil-unique-et-deux-onglets)).

## Non-objectifs

- Construire ou générer un plan d'entraînement, proposer des séances.
- Préparer une course précise (compte à rebours, objectif chrono, prédiction « jour J »).
- Afficher la notion de cycle, de bloc ou de semaine allégée : il n'y en a pas en NSA.
- Gérer le lactate, la puissance, le ressenti ou la nutrition.
- Noter la récupération par un score ou un pourcentage, ou juger une nuit isolée.
- Offrir une dimension sociale ou des classements.
