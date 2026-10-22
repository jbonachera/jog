# Contrats de types partagés

Ces types sont la **frontière** entre les modules. Le lot 0 les recopie tels quels dans `src/core/types.ts`. Un lot peut ajouter des champs à la `Vue`. Il ne renomme ni ne retire rien sans mettre ce fichier à jour.

Références : ADR 0003 (pivot), 0005 (stockage), 0006 (pipeline), 0007 (dates), 0009 (Vue).

```ts
// ── Dates (ADR 0007) ─────────────────────────────────────────────
export type DateCivile = string;            // "AAAA-MM-JJ", jour local
export type NumeroJour = number;            // jours depuis 1970-01-01, entier

// ── Pivot (ADR 0003) ─────────────────────────────────────────────
export type Source = "strava-archive" | "fit" | "intervals-icu";
export type Marquage = "course" | "test" | "aucun" | "inconnu";
export type Declenchement = "manuel" | "distance" | "temps" | "position" | "fin" | "inconnu";
export type IntensiteTour = "actif" | "repos" | "echauffement" | "retour" | "recuperation";

export interface Tour {
  iDebut: number;                 // indice inclus dans les flux
  iFin: number;                   // indice inclus
  declenchement: Declenchement;
  intensite?: IntensiteTour;
}

export interface Flux {             // colonnes de même longueur, pas de 1 s (ou celui du fichier)
  t_s: Float32Array;               // secondes depuis le début
  dist_m: Float32Array;
  fc_bpm: Float32Array | null;     // NaN = pas de mesure à cet instant (avant rééchantillonnage D-013)
  alt_m: Float32Array | null;
  vitesse_ms: Float32Array | null;
}

export interface ActivitePivot {
  cleSource: string;               // "strava:123", "fit:<sha256>", "icu:i123"
  source: Source;
  versionAdaptateur: string;       // semver de l'adaptateur
  empreinteBrute: string;          // sha256 hex du fichier d'origine (+ nom + marquage source, ADR 0004)
  debutUtc: number;                // ms depuis epoch
  decalageLocal_min: number;
  dateLocale: DateCivile;          // calculée par core/dates (ADR 0007)
  duree_s: number;
  distance_m: number;
  nom: string | null;
  competition: boolean;            // case « Compétition » de la plateforme
  sousType: "route" | "tapis" | "piste" | "trail" | "inconnu";
  pasFC_s: number | null;          // pas médian des mesures de FC (D-013)
  flux: Flux;
  tours: Tour[];
}

export interface Ignoree { cleSource: string; raison: "doublon" | "pas-une-course" | "illisible"; detail?: string }

// ── Paramètres (06, D-006) ───────────────────────────────────────
export interface ParamsDates {
  hrMax: number; hrRest: number; z1: number; z2: number; z3: number; z4: number;   // z en % de FC max
  lt2Hr: number; lt2Pace: number;  // lt2Pace en s/km
  easyCap: number; subtHrLo: number; subtHrHi: number;
}
export interface ParamsGlobaux {
  refHr: number; paceHrK: number; ctlDays: number; atlDays: number; subtPctLo: number; subtPctHi: number;
}
export interface ModifDatee {
  id: string;
  cle: keyof ParamsDates;
  valeur: number;
  dateEffet: DateCivile;
  enregistreLe: string;            // ISO date-heure
}
export interface Parametres { globaux: ParamsGlobaux; modifs: ModifDatee[] }
// Défauts (06) : hrMax 188, hrRest 46, easyCap 140, lt2Hr 172, lt2Pace 238 (3:58), refHr 164, paceHrK 1.1,
// subtPctLo 20, subtPctHi 25, subtHrLo 160, subtHrHi 168, z1..z4 68/78/85/92, ctlDays 42, atlDays 7.

// ── Séance (07, 04) ──────────────────────────────────────────────
export type TypeSeance = "footing" | "footing-lignes-droites" | "sous-seuil" | "sortie-longue" | "course" | "test";
export interface Minutes { easy: number; mp: number; subt: number; hard: number }
export interface Repetition { n: number; debut_s: number; duree_s: number; allure_skm: number; fcFin: number }

export interface SeanceIntrinseque {            // étape ②a, mémorisée (ADR 0006)
  cleSource: string; date: DateCivile; debutUtc: number; nom: string | null;
  marquage: Marquage;
  duree_min: number; km: number; fcMoy: number | null; allureMoy_skm: number | null;
  minutes: Minutes; charge: number; mp_min: number;
  segmentsMp: { debut_s: number; fin_s: number }[];
  repetitions: Repetition[]; format: string | null; recup_s: number | null;
  ef: number | null;                              // m/min ÷ bpm, séance entière
  fcPic: number | null;                           // pic soutenu (D-019), bpm brut, null sans fenêtre valide
  decouplage: { valeur: number | null; retenu_min: number; total_min: number; avecMp: boolean } | null;
  lignesDroites: boolean;
  distanceRef_km: number | null; temps_s: number | null;   // course / test
}
export interface Seance extends SeanceIntrinseque { type: TypeSeance }   // étape ②b

// ── Signaux et verdict (05) ──────────────────────────────────────
export type EtatSignal = "ok" | "surveiller" | "alerte" | "insuffisant";
export type CleSignal = "progressivite" | "fraicheur" | "reponse" | "horsSousSeuil" | "footings" | "decouplage" | "palier";
export interface Signal { cle: CleSignal; nom: string; etat: EtatSignal; valeur: number | null; valeurTexte: string; explication: string }
export type Verdict = "augmenter" | "maintenir" | "alleger" | "aucun";

/** FC max observée (D-019, ADR 0013) : le pic soutenu le plus haut de l'année, à proposer comme hrMax. */
export interface SuggestionHrMax {
  /** Pic de la séance, arrondi au bpm (D-015). */
  bpm: number;
  date: DateCivile;
  cleSource: string;
  nom: string | null;
  /** Distance de la séance, arrondie au dixième de km comme à l'affichage. */
  km: number;
  /** Vrai quand le pic dépasse hrMax(J−1) de plus de ECART_SUSPECT_HRMAX_BPM. */
  ecartSuspect: boolean;
}

// ── Vue (ADR 0009) : ce que l'interface affiche ─────────────────
export interface Vue {
  formatVersion: 5;                              // FORMAT_VUE (constantes.ts)
  reglesVersion: string;
  J: DateCivile;
  derniereSynchro: string | null;               // ISO, dernier import réussi
  parametresEnVigueur: {
    globaux: ParamsGlobaux; datesAJm1: ParamsDates;
    modifs: ModifDatee[];                        // toutes les modifications datées, triées (06, historique)
    suggestionPaceHrK: number | null;            // D-004 ; null sans données suffisantes
    raisonAbsenceSuggestion: string | null;      // 06 ; null quand une valeur est suggérée
    suggestionHrMax: SuggestionHrMax | null;     // D-019, ADR 0013
  };
  seances: SeanceVue[];                          // ordre (date, debutUtc, cleSource) ; sans segmentsMp
  jours: JoursVue;                               // en colonnes alignées sur date (budget de taille, ADR 0009)
  premierJour: DateCivile | null;               // jour 1 de l'historique ; null sans séance
  serieCharge: { date: DateCivile; ctl: number; atl: number; tsb: number }[];
  ratio: SerieRatioVue;                          // en colonnes alignées sur date
  semaines: SemaineVue[];
  palier: { semaines: number; reference_km: number };
  compteurs: Compteurs;                          // A2 : année, 30 j, 7 j (series/types.ts)
  decision: {
    verdict: Verdict; phrase: string; signaux: Signal[];
    fourchette: { min: number; max: number; reference: number; sourceReference: "palier" | "moyenne30j" } | null;
    simulateur: { ctlJm1: number; atlJm1: number; chargeParKm: number; km23j: number; ctlDays: number; atlDays: number;
                  min: number; max: number; defaut: number } | null;
  };
  // Les lots 3 à 5 ajoutent : tendances, nuage, derniereSousSeuil, niveau, suggestionPaceHrK, journalImport…
}
/** Une séance dans la Vue : la séance ②b, sans `segmentsMp` (non affiché). */
export type SeanceVue = Omit<Seance, "segmentsMp">;
/** Les jours en colonnes : l'entrée i de chaque tableau décrit `date[i]`. */
export interface JoursVue {
  date: DateCivile[]; km: number[]; min: number[]; charge: number[];
  minutes: { easy: number[]; mp: number[]; subt: number[]; hard: number[] };
  types: TypeSeance[][];
}
/** Le ratio 7 j / 30 j en colonnes ; `r` est nul tant que l'historique a moins de 30 jours. */
export interface SerieRatioVue { date: DateCivile[]; s7: number[]; chronic: number[]; r: (number | null)[] }
export interface SemaineVue {
  lundi: DateCivile; statut: "terminee" | "en-cours";
  km: number; min: number; minutes: Minutes; partSS: number | null; nbSS: number;
  charge: number; monotonie: number | null; contrainte: number | null;
  conformiteFootings: number | null; nbFootings: number; nbFootingsConformes: number; ratioDimanche: number | null;
}
```

## Vue : assemblage, mémorisation et démarrage (lot 2.3, ADR 0006, 0009, 0012)

**Assemblage** (`calculerVue`) : une Vue sans séance a toutes ses séries vides, `premierJour` nul, `palier` à zéro et `decision` au verdict `aucun` (sans signaux). Sinon, `serieCharge`, `ratio`, `semaines`, `palier`, `compteurs` et `decision` sont calculés sur `jours` (du premier jour à J−1) avec `ctlDays` et `atlDays` globaux, et `decision` vient de `decider`. Aucune donnée n'est lue hors des séances passées.

**Clé de mémorisation de ②a** : SHA-256 (WebCrypto) de `[empreinteBrute, versionAdaptateur, REGLES_VERSION, { hrMax, z2, lt2Hr, lt2Pace, subtHrLo }, FORMAT_SEANCE]`, les paramètres étant ceux du jour de la séance (ADR 0006). **`lt2Pace` figure dans la clé** : la détection des répétitions par le flux (`repetitions.ts`) s'en sert. **`subtHrHi` n'y figure pas** : il n'est lu qu'à l'étape ④. `refHr` et `paceHrK` n'y figurent pas non plus (étape ⑤). `FORMAT_SEANCE` (constantes.ts, valeur 2 depuis `fcPic`, D-019) change quand le format d'une entrée change. La clé ne couvre ni `cleSource` ni la date : une séance mémorisée est rattachée à l'activité qui la demande. Les constantes de ②a lues par `src/core/seance/` sont gelées dans `tests/core/constantes.test.ts` ; changer l'une d'elles impose d'augmenter `REGLES_VERSION`.

**Stockage** (`derive`) : une entrée `seance:<clé>` par séance ; une entrée `vue` contenant `{ empreinteEntrees, J, vue }`. Après un recalcul réussi, les entrées `seance:*` dont la clé n'appartient plus à une activité active sont supprimées, en `derive` comme en mémoire vive. Une écriture échouée ne retient ni la Vue ni le journal.

**Lecture de `derive`** : une entrée `seance:*` n'est reprise que si elle a la forme minimale (`minutes`, `repetitions`, `charge`, `duree_min`, `km`, `mp_min`). Une entrée plus ancienne ou abîmée est ignorée et recalculée à partir de son flux. Si un calcul échoue alors qu'il utilisait des entrées venues de `derive`, les entrées `seance:*` sont vidées et le calcul est refait **une seule fois**, à froid. Une lecture de `derive` qui échoue ne fait pas échouer le calcul : il part de zéro.

**Démarrage rapide** : `empreinteEntrees` = SHA-256 de `[ (cleSource, empreinteBrute, versionAdaptateur) triés, globaux (JSON), modifs triées, derniereSynchro, REGLES_VERSION ]`. Une modification de `derniereSynchro` (un import, ou une synchro sans changement d'activité) recalcule donc la Vue. Au `demarrer`, la Vue en cache est émise avant toute lecture de flux, si sa forme (`formatVersion`, `reglesVersion`) est actuelle. Si elle a le même J et la même empreinte, le calcul s'arrête là et ne journalise rien. Sinon, la Vue est recalculée, émise, puis mise en cache.

**Journal de recalcul** : `seancesRecalculees` = nombre de flux réellement lus (et non de séances).

**Taille** (ADR 0009, budget de 2 Mo à 10 ans) : `calculerVue` arrondit à 4 décimales les nombres des séances, des jours, de `serieCharge`, du ratio, des semaines, du palier et des compteurs. La décision est calculée avant l'arrondi, sur les valeurs brutes (`calculerVueBrute` en est la version non arrondie), et n'est pas arrondie une seconde fois. `segmentsMp` ne part pas dans la Vue. `jours` et `ratio` sont en colonnes ; `serieCharge` reste en objets, parce que `src/ui/composants/a4.ts` le lit ainsi. Mesure sur un historique synthétique de 10 ans (1 752 séances, `itPerf` dans `tests/core/vue-taille.test.ts`) : **2 485 044 octets avant, 1 648 665 après**. Convertir `serieCharge` en colonnes économise environ 100 Ko de plus, à faire avec l'adaptation de a4.

**Transferts** : aucun objet n'est transféré (`transferables = []`). Les séries restent des tableaux JS, et la Vue pèse environ 1,6 Mo à 10 ans : son clonage par `postMessage` est à mesurer au lot 6.2. L'ADR 0009 visait les `Float64Array` transférées ; ce choix est reporté.

**Persistance** : `navigator.storage.persist()` est lancée sans être attendue, une fois par Worker, et son résultat est écrit dans `meta.persistance` dès qu'il arrive.

**Corrélation des messages** (ADR 0009) : chaque requête porte un `id` (compteur du client) que le Worker répète dans toutes ses réponses. Une Vue émise sans `id` est une notification (Vue recalculée après une Vue en cache) : elle va aux abonnés de `surVue`, sans résoudre de requête. Une Vue en cache dont les entrées ou J ne correspondent plus est émise avec `perimee: true`, puis suivie de la Vue recalculée.

**Paramètres** (06, D-010) : les paramètres, les séances mémorisées et la Vue en cache sont écrits dans une seule transaction (`param_global`, `param_date`, `derive`). Le stockage bloqué (ouverture, lecture ou écriture) donne le message exact de 06, règle 5. Une modification nouvelle reçoit `enregistreLe` au moment de l'enregistrement ; une modification existante garde le sien. Une suppression dont l'ensemble restant est invalide est refusée (`erreurValidation`). Une suppression d'identifiant inconnu est sans effet.

**Sauvegarde** (D-012) : au plus 5 Mo de texte, 10 000 modifications datées, 10 000 entrées de journal ; au-delà, « Sauvegarde trop volumineuse. ». Un import de sauvegarde remplace les paramètres et le journal ; le journal de recalcul n'y figure pas (ADR 0012). **Le formulaire de l'onglet Paramètres doit être rechargé après un import de sauvegarde** : un autre onglet peut avoir écrit des paramètres entre-temps. Le jeton de version n'est pas nécessaire pour l'instant.

## Garanties des lecteurs de fichiers (FIT, GPX, TCX)

Ces garanties valent pour tout `ActivitePivot` produit par `fitVersPivot`, `gpxVersPivot` et `tcxVersPivot` (`src/adapters/`). Elles sont couvertes par `tests/adapters/`.

**Options communes** (`OptionsPivot`, `src/adapters/commun.ts`) : `decalageSecours?: (debutUtc_ms) => number`, en minutes. Elle sert quand le fichier ne donne pas de décalage (ADR 0007). Sans elle, le décalage vaut 0. Le Worker la fournira plus tard, fondée sur `Intl`.

**Ordre et doublons (D2)**
- Tri stable par horodatage, puis fusion des enregistrements d'un même instant : chaque champ prend sa **dernière valeur valide** dans l'ordre du fichier.
- Les enregistrements antérieurs au début (`start_time` pour le FIT et le TCX, instant le plus ancien pour le GPX) sont écartés.
- Garanties : `t_s` est **strictement croissant** et `t_s[0] ≥ 0`.
- Un fichier sans enregistrement horodaté (ou sans enregistrement après le début) lève `ErreurFit('aucun enregistrement horodaté')`.
- TCX : si tous les trackpoints précèdent le `StartTime`, ou s'il n'en a aucun, le lecteur lève `ErreurTcx`. GPX : la même garde existe (`ErreurGpx`), mais elle est inatteignable, car le début est l'instant le plus ancien.

**Tours**
- FIT (D1) : un tour couvre les enregistrements avec `début ≤ t < timestamp`, fin exclue. Le dernier tour de la liste inclut `t = timestamp`. Le début d'un tour est en général la fin du précédent. Un tour qui ne couvre aucun enregistrement n'est pas produit.
- TCX : un tour couvre les indices de ses trackpoints, après tri et fusion (D2). Les tours sortent dans l'ordre du document.
- GPX : aucun tour.

**Décalage horaire (ADR 0007, D3, D4)**
- FIT : `decalageLocal_min = local_timestamp − timestamp`, arrondi à la minute (à mi-chemin loin de zéro, D-015). Si l'écart dépasse 14 h en valeur absolue, ou si `local_timestamp` manque, le décalage est **inconnu**.
- GPX et TCX : le décalage est toujours inconnu.
- Quand il est inconnu, le pivot porte `decalageInconnu: true` (absent du pivot sinon, pour le FIT). Le décalage vient de `decalageSecours(debutUtc)` si l'appelant la fournit, sinon vaut 0. La date locale suit ce décalage.

**Durée et distance**
- `duree_s` : `total_timer_time` (champ 8) s'il est présent, sinon `total_elapsed_time` (champ 7), sinon `t_s` du dernier enregistrement (FIT).
- `distance_m` (FIT) : `total_distance` de la session ; à défaut, la **dernière distance finie** des enregistrements. Le GPX calcule la distance cumulée par haversine. Le TCX prend la dernière distance finie.
- **TCX sans distance** : `dist_m` peut contenir des NaN, comme le FIT, et le cœur interpole. `distance_m` vaut la dernière distance finie, ou 0 s'il n'y en a aucune.
- **GPX à plusieurs segments ou pistes** : toutes les pistes et tous les segments sont lus, dans l'ordre des instants. La distance **ne cumule pas** le saut entre la fin d'un segment et le début du suivant : cet écart compte 0.

**Pistes, activités et type**
- GPX : le type est celui de la **première piste qui en déclare un** (casse indifférente). Si cette piste n'est pas une course, l'activité est ignorée (`pas-une-course`). Sans type déclaré, c'est une course supposée (`typeSuppose: true`).
- TCX à plusieurs `Activity` : on prend la **première dont `Sport` vaut `Running`** (casse indifférente). Sans un tel `Sport`, on prend la première activité **sans attribut `Sport`**, supposée course (`typeSuppose: true`). Sinon, l'activité est ignorée. Les autres activités du fichier ne sont pas lues.

**Plausibilité (D5)** : une FC inférieure à 30 ou supérieure à 250 bpm devient NaN, dans les trois formats.

**Horodatages et nombres (GPX et TCX)**
- Un horodatage doit être ISO 8601 avec secondes et **fuseau explicite** (`Z` ou `±hh:mm`). Sinon, le point est ignoré. Un horodatage sans fuseau n'est jamais interprété dans le fuseau local. Un `StartTime` sans fuseau est traité comme absent : le début est alors l'instant le plus ancien.
- Un point GPX dont la latitude est hors de [−90 ; 90] ou la longitude hors de [−180 ; 180] est ignoré. Un point sans coordonnées l'est aussi.
- Un nombre est une notation décimale simple, avec signe facultatif, finie : `Infinity`, `0x10` et `1e3` ne sont pas acceptés. Une altitude ou une FC invalide devient NaN, et un point GPX ou TCX dont l'instant est invalide est ignoré.

**FIT : champs lus (ADR 0010)**
- Liste blanche par numéro de message, décidée une fois par définition : seuls les champs de `reference-fit.md` sont décodés, plus `file_id.type` (champ 0) et le timestamp (253) de **tout** message, pour l'en-tête compressé.
- La latitude et la longitude (champs 0 et 1 des records) ne sont jamais décodées.
- Un champ dont la taille n'est pas un multiple de la taille de son type est sauté. Un champ dont la taille est un multiple lit son premier élément.
- Les valeurs invalides du type (maximum ou minimum sentinelle, NaN) ne donnent pas de clé.
- Un message de type inconnu est sauté, sans décaler la lecture. Son timestamp compte pour l'en-tête compressé.
- Une redéfinition d'un type local en cours de fichier s'applique au message suivant.

**FIT : fichiers incomplets**
- Un fichier dont les données sont coupées (taille d'en-tête supérieure à la longueur) ou dont le dernier message est incomplet lève `ErreurFit` (« tronqué »).
- Le CRC final n'est **pas vérifié**. Son **absence est tolérée** : seules les données doivent être complètes.

**FIT : activités non courses**
- `file_id.type` différent de 4 (activité) donne `{ ignoree: 'pas-une-course' }`.
- `session.sport` différent de 1 (course) donne le même résultat. Une session sans `sport` est donc ignorée.
- Sans message `session`, ou sans `start_time`, le lecteur lève `ErreurFit`.

**Archive Strava (`strava-archive`, lot 1.3, ADR 0010)**
- Décompression **entrée par entrée** : une entrée corrompue ne bloque pas les autres. Une entrée de plus de 50 Mo (fichier d'activité, taille déclarée ou réelle) ou un `.gz` qui dépasse 50 Mo une fois décompressé est refusé. Un fichier d'activité refusé va dans `illisibles`. Un `activities.csv` de plus de 20 Mo fait échouer l'archive (`ErreurArchive`). Les limites sont les constantes `LIMITE_FICHIER_OCTETS` et `LIMITE_CSV_OCTETS` de `src/adapters/strava-archive/lecteur.ts`.
- **Résultat** : `manquants` est une liste de `{ cleSource, fichier }`, et chaque entrée de `illisibles` porte `cleSource`, `fichier` et `message`. Une activité citée par le CSV reste identifiée même si son fichier manque ou est illisible : le stockage ne doit pas la supprimer.
- Lignes du CSV : une ligne trop courte pour contenir l'ID ou le nom du fichier va dans `illisibles`. Un ID vide donne une entrée `strava:` (« ID manquant »). Pour un ID en double, la **première** ligne est gardée, et chaque suivante va dans `illisibles` (« ID en double »). Les lignes vides sont ignorées.
- Syntaxe : un guillemet n'ouvre un champ cité qu'en début de champ, et ailleurs c'est un caractère ordinaire. Les fins de ligne LF, CRLF et CR seul sont admises. Un guillemet non fermé lève `ErreurArchive`.
- Types de course : « Course à pied », « Run », « Course sur tapis », « Trail », « Virtual Run ». Les en-têtes acceptent l'apostrophe typographique, et le nom français prime sur l'anglais. Un nom vide donne `nom: null`.
- Un fichier hors de `activities/`, ou dont le nom est vide, va dans `illisibles` et n'est jamais lu.
- `decalageSecours` est transmis aux lecteurs (ADR 0007).
- **Empreinte** (ADR 0004) : SHA-256 des octets d'origine (`.gz` compris), suivis de `\0`, du nom, de `\0`, puis de `true` ou `false` pour la compétition.

## Séance (étapes ① et ②a, 07 règle 2, D-001, D-013)

**Répétitions par les tours (chemin principal)**
- Candidat : un tour de travail dont la durée est d'au moins 120 s, et dont la FC de fin est au moins `subtHrLo − 5`.
- Tour de travail : `declenchement` ∈ {`manuel`, `inconnu`} **et** intensité absente ou `actif`. Un tour `repos`, `recuperation`, `echauffement` ou `retour` n'est jamais un tour de travail, et `temps`, `position`, `fin`, `distance` ne le sont jamais non plus.
- Ordre : on **filtre d'abord** les candidats, puis on les enchaîne en séries. Deux candidats consécutifs restent dans la même série si l'écart entre eux est ≤ 120 s. Une série compte au moins 3 répétitions. Une répétition qui échoue au filtre de FC coupe donc la série.
- **Échauffement et retour au calme (précision de 07 règle 2, à confirmer par l'athlète)** :
  - le tour qui contient le premier échantillon (`iDebut === 0`) n'est jamais un tour de travail ;
  - le **dernier tour qui n'est pas `fin`** n'est jamais un tour de travail s'il contient le dernier échantillon de l'activité, ou s'il est suivi d'un tour `fin`.
  - Motif : sur l'export réel, 74 des 114 séances sous-seuil comptaient l'échauffement manuel comme première répétition, et le retour au calme comme dernière (formats du type « 30′-5′-5′-5′-5′-10′ »).
  - Conséquence assumée : une séance commencée directement par une répétition, sans échauffement, perd cette répétition ; une séance qui finit par une répétition, sans retour, perd cette dernière.

**Repli sur le flux**
- On ne bascule sur la détection dans le flux que si le chemin par tours ne donne **aucune** série.
- Les deux chemins ne se mélangent jamais : une série trouvée par les tours n'est jamais complétée par des répétitions du flux.
- Détection dans le flux : vitesse lissée sur 10 s ; une allure rapide est ≤ lt2Pace + 40 s/km ; un trou non rapide de moins de 10 s est fusionné dans la répétition. Les mêmes règles (durée, FC de fin, enchaînement à 120 s, 3 répétitions) s'appliquent. Les bords d'une répétition du flux sont fixés à 1 s près par le lissage.

**Arrondis**
- Aucun arrondi pour le classement : la FC lissée est comparée telle quelle à `lt2Hr` et à `z2 × hrMax`, et l'allure rapide est comparée telle quelle à `lt2Pace + 40`.
- Format « 6×6′ » : le test d'uniformité porte sur les durées brutes (±15 % de la médiane brute). Seul l'affichage arrondit à la minute, mi-chemin vers le haut : 150 s donne 3′, 330 s donne 6′.
- `recup_s` est la médiane des récupérations, en secondes entières (pair : moyenne des deux centrales, arrondie).

**FC de fin (D-013)**
- Lecture littérale : la FC de fin d'une répétition est la dernière FC mesurée à un échantillon ≤ sa fin, **sans borne d'ancienneté**.

**Séance sans distance**
- Le chemin par tours n'exige que la durée et la FC de fin.
- Le chemin dans le flux exige la vitesse, pas la distance.
- Une répétition sans distance a `allure_skm = NaN`. Sans distance, `km` vaut 0, `allureMoy_skm` et `ef` valent `null`.

## Séries (étape ④, 04, D-002, D-003)

Fonctions pures de `src/core/series/`. Les valeurs suivantes sont figées par `tests/core/series-*.test.ts`.

**Unités des parts**
- `SemaineVue.partSS` et `SemaineVue.conformiteFootings` sont des **fractions de 0 à 1**. Les seuils de `05` sont en pourcentage : la conversion se fait à l'étape ⑤, pas ici.
- `partSS` = minutes de sous-seuil ÷ **somme des minutes par intensité** (easy + mp + subt + hard), et non ÷ `duree_min`. Une semaine sans minute vaut `null`.
- `conformiteFootings` = footings à FC moyenne ≤ plafond en vigueur à la date du footing (D-006) ÷ tous les footings. Un footing sans FC moyenne n'est pas conforme et reste au dénominateur. Sans footing, `null`.
- `nbFootings` et `nbFootingsConformes` sont les effectifs de la même fraction (footings de la semaine, et ceux à FC moyenne ≤ plafond). Ils permettent d'agréger sur plusieurs semaines sans reconstituer les effectifs. Sans footing, `0`.

**Ratio (D-003)**
- `r(d)` est défini à partir du **30ᵉ jour d'historique inclus**. Avant, `r` vaut `null`.
- `SemaineVue.ratioDimanche` reprend `r` du dimanche de la semaine, ou `r(J−1)` pour la semaine en cours.

**Statut et monotonie (décision de l'orchestrateur, 04 « sur 7 j »)**
- Une semaine est `terminee` si son dimanche est ≤ J−1, sinon `en-cours`.
- La monotonie porte sur **7 jours** : une semaine terminée utilise ses 7 jours ; la semaine en cours utilise les 7 jours glissants de J−7 à J−1.
- Si ces 7 jours ne sont pas tous dans l'historique (première semaine partielle, historique de moins de 7 jours), `monotonie` et `contrainte` valent `null`.
- Un écart-type nul (charges toutes égales) donne aussi `null`.
- `contrainte` = charge de la semaine × monotonie, où la charge est la somme des jours écoulés de la semaine.

**Palier**
- Une première semaine partielle, si elle est `terminee`, compte dans le palier.
- La comparaison à ±10 % tolère le bruit flottant (marge relative de 1e-9) : le bord exact compte, 10,01 % ne compte pas.

**Compteurs (A2)**
- `annee.moyenneHebdo_km` = km du 1ᵉʳ janvier à J−1 ÷ nombre de jours de cette période × 7. Lecture littérale de `04`, même si l'historique commence plus tard.
- `ecart` = (A − B) ÷ B, avec `null` sans historique précédent ou si B vaut 0. Le seuil de signalement est `ECART_VOLUME_SIGNALE` (`constantes.ts`, 0,30 en fraction, comparaison stricte).
- `historiquePrecedent` (30 et 7 jours) : le premier jour de la série est au plus tôt le début de la période B (J−60 pour 30 jours, J−14 pour 7 jours). Pour l'année, c'est le 1ᵉʳ janvier de l'année précédant l'année comptée.
- Type dominant d'une barre : sous-seuil s'il y en a une ; sinon le type de la séance la plus longue (à égalité, la première).

**Séries de charge (D-002)**
- `CTL₀ = ATL₀` = moyenne des charges des 28 premiers jours, ou de tous les jours s'il y en a moins. Les jours de repos comptent, et le jour 28 compte.
- `ctlDays` et `atlDays` sont strictement positifs : cette validation est faite en amont (`06`).
