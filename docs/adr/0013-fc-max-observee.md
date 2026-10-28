# 0013 · FC max observée : pic soutenu par séance, suggestion dans Paramètres

> **Note (2026-10-28)** : le fond de cette décision reste valable (ADR 0014). Les chemins `src/`, `tests/` et les commandes `npm` cités ont disparu avec le web TypeScript ; l'équivalent Swift est dans `ios/JogCore`.

- **Statut** : Acceptée
- **Date** : 2026-10-22
- **Dépend de** : 0004, 0006, 0009 ; règle fonctionnelle D-019

## Contexte

`hrMax` est souvent sous-estimée : valeur par défaut (188) ou formule. Elle pilote le classement des minutes (D-001 : borne basse `z2 × hrMax` de l'allure marathon), donc la charge, CTL / ATL / TSB, la répartition et tout ce qui en dépend (06, « Recalculs déclenchés »). Une séance où la FC a dépassé le réglage prouve que la vraie FC max est au moins égale à ce pic, **si le pic est réel**.

Or un pic brut ne prouve rien. `fcPlausible` (`src/adapters/commun.ts`) n'écarte que ce qui sort de [30 ; 250] bpm. Les artefacts courants passent :
- pointes de ceinture sèche en début de séance (200 bpm et plus pendant quelques secondes) ;
- interférences ponctuelles ;
- capteur optique calé sur la cadence (plusieurs minutes vers 165 à 185 « bpm »).

`hrMax` est un paramètre daté (D-006) : une modification rétroactive relit tous les flux (ADR 0006). Le précédent est la suggestion de `paceHrK` (D-004), calculée dans la Vue et affichée dans Paramètres.

## Options considérées

1. **Pic soutenu mémorisé par séance, suggestion calculée dans la Vue, application confirmée par l'athlète.** Avantages : aucun coût à l'affichage, le pic est calculé une fois par séance à l'étape ②a, même chemin que `paceHrK`. Limites : un format de séance de plus (relecture des flux à la première ouverture).
2. **Maximum brut de la FC à l'import.** Écartée parce que : les pointes de ceinture sèche donnent des faux positifs fréquents, et un faux positif décale en silence toutes les métriques de charge.
3. **Mise à jour automatique de `hrMax`.** Écartée parce que : contraire au principe 5 de `01` (« des repères, pas des injonctions ») ; l'athlète doit pouvoir écarter un artefact.
4. **Calcul pendant l'import seulement (journal d'import).** Écartée parce que : la suggestion disparaîtrait au rechargement et ne suivrait pas les modifications de paramètres ; la Vue la recalcule pour rien.

## Décision

### Pic soutenu d'une séance (étape ②a)

- `SeanceIntrinseque.fcPic: number | null` : la plus haute FC **tenue au moins `DUREE_PIC_FC_S = 15` s d'affilée**, c'est-à-dire le maximum, sur toutes les fenêtres de 15 s du flux, du minimum de `fc_bpm` (FC rééchantillonnée, D-013) dans la fenêtre.
- Une fenêtre ne compte que si elle ne contient aucun NaN et qu'elle commence à `t_s ≥ DEBUT_PIC_FC_S = 300` (les 5 premières minutes sont ignorées : ceinture sèche).
- `null` sans FC ou sans fenêtre valide. Valeur brute, non arrondie (l'arrondi est fait à l'affichage et à la comparaison, ci-dessous).
- Ne dépend d'aucun paramètre. Coût en O(n) (minimum glissant par file monotone), une seule passe.
- `FORMAT_SEANCE` passe à 2, `REGLES_VERSION` à `1.1.0`. Les deux constantes sont gelées dans `tests/core/constantes.test.ts`.

### Suggestion (Vue)

- `Vue.parametresEnVigueur.suggestionHrMax: { bpm: number; date: DateCivile; cleSource: string; nom: string | null; km: number; ecartSuspect: boolean } | null`. `FORMAT_VUE` passe à 5.
- **Séances retenues** : celles de la Vue (les doublons ignorés n'y sont pas), avec `fcPic` non nul, datées de **J−365 à J−1**, et datées **au plus tôt du jour d'effet de la dernière modification de `hrMax`** s'il y en a une. Une séance antérieure à un réglage explicite a déjà été jugée par l'athlète.
- **Pic retenu** : le plus haut `fcPic`, arrondi à l'entier (D-015, mi-chemin loin de zéro). À égalité, la séance la plus récente (`date`, puis `debutUtc`).
- **Seuil** : suggestion seulement si `bpm ≥ hrMax(J−1) + MARGE_HRMAX_BPM` avec `MARGE_HRMAX_BPM = 3`. En dessous, aucun recalcul complet pour un ou deux battements.
- `ecartSuspect` vaut vrai si `bpm > hrMax(J−1) + ECART_SUSPECT_HRMAX_BPM` avec `ECART_SUSPECT_HRMAX_BPM = 15`.
- Le calcul parcourt les séances une fois : négligeable devant le reste de `calculerVue`.

### Interface (onglet Paramètres, groupe « Données »)

- Sous l'import d'archive, un encart quand `suggestionHrMax` est non nulle et n'a pas été écartée sur cet appareil. Textes exacts dans D-019.
- **« Utiliser … »** : envoie `enregistrerParams` avec les paramètres enregistrés (ceux de la Vue, pas la saisie en cours du formulaire) et **une** modification `{ cle: 'hrMax', valeur: bpm, dateEffet: date }`. Même chemin que le formulaire : validation, recalcul dans le Worker, écriture seulement en cas de succès, annonce « Enregistré. Tableau de bord recalculé. » (D-010).
- **« Ignorer »** : mémorise `cleSource:bpm` dans `localStorage` (`jog-hrmax-ignoree`), lu et écrit dans `try/catch`. Un autre pic (autre séance ou autre valeur) fait réapparaître l'encart. C'est une commodité d'affichage, propre à l'appareil : elle n'entre ni dans la Vue, ni dans le cache, ni dans la sauvegarde.

## Conséquences

- **Positives** : la FC max suit les mesures sans jamais changer en silence ; aucun coût d'affichage ; le pic soutenu par fenêtre de 15 s et l'exclusion des 5 premières minutes écartent les pointes courtes.
- **Négatives et dette acceptée** :
  - à la première ouverture après la mise à jour, toutes les séances sont relues (nouveau `FORMAT_SEANCE`), comme après un changement rétroactif de `hrMax` ;
  - le calage du capteur optique sur la cadence n'est pas filtré : il dure plusieurs minutes. L'athlète utilise une ceinture ; l'encart cite la séance pour qu'il la vérifie, et `ecartSuspect` signale un écart trop grand ;
  - « Ignorer » ne suit pas d'un appareil à l'autre ;
  - au premier import depuis l'Aperçu vide, l'encart n'apparaît que dans Paramètres.
- **À vérifier pendant l'implémentation** : sur l'export réel (`npm run verif:reel`), le pic retenu, sa séance et la part de séances dont le pic se situe dans les 5 premières minutes.

## Sources

- Aucune source externe. Ordres de grandeur des artefacts : constat courant sur ceintures et capteurs optiques.
