# Cas dorés de l’oracle TypeScript
Fichiers produits par le moteur TypeScript (src/core, supprimé au lot 6) : figés, ils ne se régénèrent plus et ne se modifient pas à la main. Ils servent de tests de non-régression du moteur Swift.
Format : {"module": "...", "cas": [{"nom", "fn", "entree", "sortie" | "erreur"}]}, un cas par ligne. `entree` : arguments (tableau) ou objet unique ; `erreur` : message d’une erreur attendue.
Sérialisation : Float32Array en tableau de doubles (float32 converties) ; NaN en null ; ±Infinity en "Infinity" / "-Infinity" ; undefined = clé absente ; Map en objet ; aucune Date.
Un null à la place d’un nombre non optionnel est un NaN. Les champs `T | null` sont toujours présents (null), jamais absents ; seuls les champs optionnels (Tour.intensite) sont absents.
Comparaison : tolérance de 1e-9 sur les nombres, égalité exacte du reste (textes, booléens, ordre des tableaux). Les textes de format utilisent l’espace insécable U+00A0 et le moins U+2212.
Entrées adaptées : decider, comparer et derniereSeanceSousSeuil reçoivent `parametres` (type Parametres) à la place de la fonction `paramsAuJour`.
Le moteur Swift doit reproduire 100 % des cas ; la mémorisation (clés SHA-256) est hors oracle.
Fichiers (nombre de cas) : dates (150), arrondi (116), format (122), parametres (38), validationParametres (65), riegel (14), jours (13), seance-miseEnForme (18), seance-intrinseque (50), seance-marquage (60), seance-classement (25), series (62), decision (251), progression (134), selecteurs (63), suggestionHrMax (55), vue (34).
