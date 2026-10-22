# 02 · Navigation et structure

## Barre supérieure

Barre **fixe** en haut de page, avec un fond semi-opaque flouté et une bordure basse. De gauche à droite :

1. **Marque** : « Jog », suivi du nom de l'athlète et de la méthode (« Athlète exemple · NSA »).
2. **Onglets** : Aperçu · Charge · Progression · Historique · Paramètres.
3. **Mention d'état** à droite (dans la maquette : « Données d'exemple »). En production, on y affiche la date de la dernière synchronisation.

## Onglets

Navigation **par onglets**, pas par ancres ni par défilement piloté.

- Sémantique ARIA : `role="tablist"` sur le conteneur, `role="tab"` et `aria-selected` sur chaque bouton, `role="tabpanel"` et `aria-labelledby` sur chaque panneau.
- **Un seul panneau visible à la fois.** Les autres sont masqués avec l'attribut `hidden`, et une règle `[hidden]{display:none!important}` garantit que le CSS ne les réaffiche pas.
- **Clavier** : flèches gauche et droite pour passer d'un onglet à l'autre, de façon circulaire. Seul l'onglet actif est dans l'ordre de tabulation (`tabindex` 0, les autres −1).
- **Persistance** : le dernier onglet ouvert est mémorisé localement et rouvert au chargement. On n'utilise pas l'URL.
- Changer d'onglet ferme l'infobulle ouverte.

## Contenu par onglet

| Onglet | Question | Composants, dans l'ordre |
|---|---|---|
| **Aperçu** (par défaut) | « Où j'en suis, et qu'est-ce que je fais cette semaine ? » | 1. Décision volume (verdict, fourchette, simulateur, signaux) · 2. Volume réalisé (année, 30 jours, 7 jours) · 3. En deux colonnes : 7 derniers jours, Forme et fatigue |
| **Charge** | « Est-ce que je charge bien et progressivement ? » | 1. Charge, en deux colonnes : Progressivité 7 j / 30 j, Minutes de sous-seuil par semaine · 2. Discipline NSA, en deux colonnes : part de sous-seuil par semaine, note |
| **Progression** | « Est-ce que je progresse ? » | 1. Comparer deux périodes · 2. Tendances (3 petits graphiques) · 3. En deux colonnes : Allure × FC par répétition, Dernière séance sous-seuil · 4. Niveau estimé |
| **Historique** | « Qu'est-ce que j'ai fait au fil des saisons ? » | 1. Saisons et volume hebdomadaire · 2. Journal hebdomadaire |
| **Paramètres** | « Mes repères sont-ils justes ? » | Formulaire en 5 groupes, enregistrement, réinitialisation |

Les fiches détaillées sont dans [03-composants.md](03-composants.md).

## Sélecteurs locaux

Chaque sélecteur agit sur son propre composant, pas sur toute la page.

| Sélecteur | Valeurs | Agit sur | Mémorisé |
|---|---|---|---|
| Fenêtre de la progressivité | 16 semaines (défaut) · 12 mois | Progressivité 7 j / 30 j | Non |
| Période de l'historique | 12 semaines · 26 semaines · Toutes les saisons (défaut) | Saisons et Journal | Oui |
| Comparaison allure × FC | vs il y a un an (défaut) · vs 12 semaines précédentes | Allure × FC | Oui |
| Vue d'un graphique | Graphique (défaut) · Tableau | Ce graphique | Non |
| Comparateur de périodes | 12 dernières sem. / 12 précédentes (défaut) · 12 dernières sem. / même période il y a un an · Dates personnalisées | Comparer deux périodes | Oui, avec les dates |

## Persistance locale (navigateur)

| Clé | Contenu |
|---|---|
| `fjord-view` | Onglet actif |
| `fjord-range` | Période de l'historique |
| `fjord-cmp` | Comparaison allure × FC |
| `fjord-cmp-p` | Préréglage et dates du comparateur |

Toute lecture et écriture est protégée : un stockage indisponible ne doit jamais casser l'affichage. Ces clés ne portent que les préférences d'affichage. En production, les **paramètres**, l'historique de leurs modifications et les activités importées sont stockés dans IndexedDB, sur l'appareil, rattachés à l'athlète, avec export et import d'une sauvegarde ([D-012](decisions.md#d-012--stockage-local-dans-le-navigateur)). La maquette, elle, garde les paramètres sous la clé `fjord-cfg`.

## Responsive

- **Au-dessus de 980 px** : grilles à deux et trois colonnes, comme dans la maquette.
- **Jusqu'à 980 px** : toutes les grilles passent en une colonne (décision, sous-grilles, compteurs) et les compteurs s'empilent avec un séparateur horizontal.
- **Jusqu'à 640 px** : les signaux de décision passent en une colonne. Les onglets passent à la ligne si nécessaire.
- La page ne défile jamais horizontalement. Seuls les tableaux larges (journal, comparateur, niveau) défilent dans leur propre conteneur.
