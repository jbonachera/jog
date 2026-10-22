# 0007 · Temps et calendrier : heure du lieu, jours civils, J de l'appareil

- **Statut** : Acceptée
- **Date** : 2026-10-21
- **Dépend de** : 0003, 0006

## Contexte

Les fenêtres s'arrêtent à J−1 au soir, en jours locaux. La semaine va du lundi au dimanche (`03`, conventions ; `04`, Notations). Le compteur annuel part du 1er janvier (`04`, Volume). Un jour sans activité a une charge nulle (`07`). Le pivot porte `debutUtc` et `decalageLocal_min` (0003), et l'étape ③ du moteur agrège par jour local (0006). Le verdict doit être reproductible (`05`).

L'export réel compte 406 FIT, tous avec `activity.local_timestamp`, et des décalages de +1 h, +2 h et −3 h (voyage).

## Options considérées

1. **Heure du lieu pour l'activité, date civile de l'appareil pour J**. Avantages : l'athlète retrouve le jour qu'il a vécu ; le calcul est simple ; le changement d'heure n'a aucun effet. Limites : au retour d'un voyage, deux sorties peuvent tomber le même jour local.
2. **Un fuseau de référence fixe**. Écartée parce que : une sortie du soir à l'étranger changerait de jour, et il faudrait un réglage absent de `06`.
3. **Répartir au prorata une activité à cheval sur minuit**. Écartée parce que : complexe pour un cas rarissime, alors que la séance reste indivisible.

## Décision

```
decalageLocal_min(a) = local_timestamp − timestamp du message activity (FIT) ;
                       sans cette donnée : décalage du fuseau de l'appareil à l'instant debutUtc, au moment de l'import, noté dans le journal
dateLocale(a)        = date civile de (debutUtc + decalageLocal_min)      # AAAA-MM-JJ
J                    = date civile de l'appareil au moment du calcul (Intl, fuseau courant)
J−1                  = J moins un jour civil
numéroDeJour(AAAA-MM-JJ) = nombre de jours depuis 1970-01-01, calculé sur l'année, le mois et le jour, sans millisecondes ni fuseau
semaine(d)           = lundi ISO de d ; une semaine est « terminée » si son dimanche ≤ J−1
année                = du 1er janvier de l'année de J−1 jusqu'à J−1
```

- Une activité compte **entièrement pour sa `dateLocale` de départ**, même si elle se termine le lendemain.
- Toutes les fenêtres de `04` et `05` (J−7…J−1, J−30…J−1, 14 j, 21 j, 28 j, semaines) se calculent sur des numéros de jour. Aucun calcul de fenêtre n'utilise d'objet `Date` ni de durée en millisecondes.
- **J est une entrée du moteur** : le Worker reçoit J sous la forme `AAAA-MM-JJ`, et la Vue le restitue. Les tests fixent J. Le même jeu de données, avec les mêmes paramètres et le même J, donne le même verdict.
- Si J change pendant que l'application est ouverte (passage de minuit), elle relance le calcul des étapes ③ à ⑥ (0006).

## Conséquences

- **Positives** : le passage à l'heure d'été ou d'hiver est sans effet. Le déterminisme couvre la date. Un voyage ne déplace pas les séances.
- **Négatives et dette acceptée** :
  - en voyage, J suit le fuseau du téléphone : la journée « d'hier » peut finir quelques heures plus tôt ou plus tard que chez soi ;
  - une sortie qui commence avant minuit et finit après compte en entier pour la veille.
- **À vérifier pendant l'implémentation** : que `local_timestamp` donne le bon décalage pour les 406 FIT de l'export, en le comparant à l'heure de début affichée par Strava pour quelques activités ; le cas des 7 fichiers où les enregistrements sont à 2 s ; le comportement du GPX (sans décalage) de l'export.

## Sources

- Export réel `export_<id>.zip` (2026-10-21) : présence de `local_timestamp`, décalages observés, date du CSV en UTC.
- Aucune source externe.
