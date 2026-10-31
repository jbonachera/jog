# Refonte de l'accueil : niveau, récupération, volume et séances (D-024 à D-028)

Statut : **proposé**, 2026-10-30. Spécification : [D-024](../design/decisions.md#d-024--accueil-unique-et-deux-onglets) à [D-028](../design/decisions.md#d-028--six-qualités-face-à-il-y-a-un-an), `02-navigation.md`, `03-composants.md` (N1, A5, A2, S1, S2, N2, S3, A1, A6), `04-metriques.md` (« VDOT et niveau », « Accueil »). Maquette validée : [`../design/maquette/accueil.html`](../design/maquette/accueil.html). C'est la source de vérité de l'UX, y compris pour les règles de son JS (`bul`/`bl` pour les lignes de jauge, `niveau` pour le radar et la bulle, `coursesHTML` pour Courses, `wk`/`sc` pour S1 et S2).

Aucune spec de `docs/design/` n'est modifiée par ce plan. Les trous relevés sont dans « Points de décision restants ».

## Méthode

On garde celle de [`recuperation.md`](recuperation.md), elle-même tirée de [`lots.md`](lots.md) et [`migration-ios.md`](migration-ios.md).

- **TDD de comportement** : les tests sont écrits d'abord, à une frontière publique (fonction publique de JogCore, modèle pur de l'app, `Navigation`), et nommés en français avec la règle citée (« laSemaineEnCoursSeCompareAuxSemainesHabituellesAuMemeJour », avec `// 04, Accueil › Volume` ou `// D-026`). Aucun test de détail interne. Les fixtures sont construites par code (`SeanceVue`, `Vue.vide`, `nuitsExemple`, `ConstruireSeanceBrute`), sans aucune donnée réelle ni extrait de l'export.
- **Rôles** :
  - un Haiku implémente un lot ;
  - un Sonnet relit **le code et les tests** : conformité à 04 et à D-024–D-028, comportement plutôt qu'implémentation, bornes, données insuffisantes, arrondi D-015, aucune logique métier dans une vue ;
  - un Haiku corrige.
- **Un lot = un commit**, message en français (« Ajoute … », « Retire … »), terminé par la ligne Co-Authored-By.
- **Orchestration** : une session lance un orchestrateur Sonnet qui enchaîne les lots dans l'ordre, met à jour « Avancement » et consigne les écarts dans « Écarts proposés » (section créée au premier écart).

**Commandes de vérification** (à lancer avec `dangerouslyDisableSandbox: true`)
- Moteur : `cd /Users/jbonachera/git/jog/ios/JogCore && swift test --disable-sandbox`. Pendant un lot, on peut cibler avec `--filter Accueil` (ou `Niveau`, `Qualites`, `Denivele`).
- App :
  ```
  cd /Users/jbonachera/git/jog/ios/Jog && xcodebuild test -project Jog.xcodeproj -scheme Jog \
    -destination 'platform=iOS Simulator,id=<UDID>' \
    -IDEPackageSupportDisableManifestSandbox=YES -skipPackagePluginValidation -skipMacroValidation \
    OTHER_SWIFT_FLAGS="-disable-sandbox" [-only-testing:JogTests/<Suite>]
  ```
  L'UDID se lit avec `xcrun simctl list devices available`.
- Performance : `JOG_PERF=1 swift test -c release --disable-sandbox --scratch-path /tmp/jogcore-A --filter mesure`.

**Projet Xcode**
- Le dossier `ios/Jog/Jog` est un groupe synchronisé : un fichier créé dans l'app (y compris un nouveau dossier `Accueil/`) y entre tout seul.
- La cible `JogTests` **ne l'est pas** : chaque nouveau fichier de test s'ajoute à la main dans `project.pbxproj` (PBXBuildFile, PBXFileReference, groupe, phase Sources), comme `RecuperationTests.swift`. Un fichier de test retiré s'en retire aussi.

**Définition de « terminé » pour un lot**
- `swift test` est vert, avec **les cas dorés de l'oracle inchangés** : aucun JSON de `Tests/Oracle/` n'est modifié. Le seul adaptateur admis est celui déjà en place (`auFormatDesGoldens`), étendu au lot 5 pour la clé `dPlus_m` (voir Architecture).
- À partir du lot 10, `xcodebuild test` est vert aussi.
- Chaque règle citée a au moins un test ; chaque seuil a un test de borne sur une valeur affichable (D-015).
- Les seuils et fenêtres de D-025 à D-028 sont lus dans l'espace de noms `ACCUEIL` de `constantes.swift`, jamais écrits en dur ailleurs.
- L'app compile et s'utilise à la fin de chaque lot : aucun lot ne laisse un onglet vide ni un bouton sans destination.
- Aucun fichier hors du périmètre du lot n'est touché sans raison écrite dans le compte rendu.

## Architecture

```
JogCore (pur, sur la Vue existante ; aucune sortie dorée ne change)
  ②a  calculerSeanceIntrinseque ─► Seance.dPlus_m (D+, lot 5)
  Vue ─┬─► niveauVDOT(vue)            ─► VueNiveau          (N1 en-tête, N2, jauge VDOT)     lot 1
       ├─► coursesEtTests(vue)        ─► [LigneCourse]      (N2)                              lot 1
       ├─► lignesVolume(vue)          ─► LignesVolume       (A2)                              lot 3
       ├─► lignesRecuperation(vue.recuperation, besoin) ─► LignesRecuperation (A5)            lot 4
       ├─► semainesAccueil(vue)       ─► [SemaineAccueil]   (S1, en-têtes)                    lot 4
       ├─► cartesSeances(vue, paramsAuJour) ─► [String: CarteSeance] (S2, S3)                lots 6–7
       └─► sixQualites(vue, recuperation) ─► SixQualites    (N1 radar)                        lots 8–9
  Vue.recuperation.milieuxNormeVFC (lot 9, seul changement de forme de la Vue : FORMAT_VUE 7)

App
  Modèles purs (enum, sans SwiftUI) : ModeleJauges, ModeleSeances, ModeleNiveau ─► textes, couleurs sémantiques, géométrie
  Navigation : Onglet { aujourdhui, progres } + Destination (piles par onglet)
  Vues : LigneJaugeView, CarteSeanceView, EnteteSemaineView, CarteNiveauView (radar), AccueilView,
         EcranDecision (A1), EcranRecuperation (A6 + R1–R7), EcranSeance (S3), EcranCourses (N2)
```

Les choix structurants, et pourquoi :
- **Sélecteurs sur la Vue, pas de nouveau bloc dans la Vue.** Tout ce qui est nouveau (niveau, jauges, cartes, semaines, qualités) se calcule par des fonctions publiques de JogCore qui prennent la `Vue`, comme `selectionDiscipline` ou `tendances`. La Vue a déjà tout ce qu'il faut : `seances` (toutes, avec `type`, `marquage`, `fcMoy`, `ef`, `decouplage`, `repetitions`, `charge`, `distanceRef_km`, `temps_s`), `jours` (km quotidiens), `semaines`, `decision`, `recuperation`. Ajouter un bloc `accueil` à la Vue ferait apparaître une clé dans les 34 goldens de la Vue. Les modèles de l'app mémorisent le résultat par Vue (`Memo<Vue, …>`, déjà utilisé par `ApercuView`).
- **Deux exceptions, isolées dans deux lots.**
  - **D+ (lot 5)** : il demande le flux d'altitude, que seule ②a voit. `Seance` et `SeanceVue` reçoivent `public var dPlus_m: Double?`, Optional simple (clé omise si nil). Les goldens de séance FIT ont de l'altitude : la clé apparaîtrait. Les tests d'oracle de séance et de Vue retirent donc `dPlus_m` de la sortie comparée (adaptateur à côté de `auFormatDesGoldens`, une seule clé, documentée), et `dPlus_m` est testé par ses propres tests. La clé de mémorisation de ②a gagne `VERSION_DENIVELE=1` : toutes les séances sont relues une fois au premier lancement (comme pour `VERSION_ESTIMATION`). `REGLES_VERSION` reste à 1.1.0.
  - **Résilience (lot 9)** : le milieu de la norme VFC à la fin de `Q₀` (≈ A − 370) demande des nuits datées jusqu'à ≈ A − 436, au-delà des 250 nuits lues aujourd'hui. `VueRecuperation` reçoit `milieuxNormeVFC: [PointNormeVFC]` (un point par dimanche) et `RECUPERATION.nuitsLues` passe à 450. `VueRecuperation` est nil dans tous les goldens : aucun JSON ne bouge. `FORMAT_VUE` passe à 7 (la Vue en cache est recalculée une fois).
- **Constantes `ACCUEIL`** dans `constantes.swift`, une par seuil ou fenêtre publiés, pour qu'un réglage après validation sur données réelles soit une ligne :
  ```swift
  public enum ACCUEIL {
      // D-026 · lignes de jauge et volume
      public static let kEcartType = 0.95                // bande de norme par défaut (= RECUPERATION.kEcartType)
      public static let semainesVolume = 8               // semaines terminées comparées au même jour
      public static let joursFenetre30 = 30, joursNorme30 = 365
      public static let minEchantillonVolume = 4         // point de décision 3
      // D-025 · carte de séance
      public static let joursEchantillonSeance = 56, seancesEchantillonSousSeuil = 6, minEchantillonSeance = 4
      public static let margeFootingUnPeuRapide_bpm = 5
      public static let horsSousSeuilUnPeuHautMax = 2    // 1 ou 2 : « Un peu haut » ; 3 ou plus : « Au-dessus du seuil »
      public static let decouplageTenu_pct = 5.0, decouplageDerive_pct = 8.0
      public static let bandeVdotCourse = 0.5, minCoursesMemeDistance = 2
      public static let lissageDenivele_s = 30.0
      // D-027 · niveau
      public static let joursNiveau = 365, joursIlYAUnAn = 365
      // D-028 · six qualités
      public static let semainesQualites = 12, joursDecalageQualites = 364, seancesSemaineReguliere = 4
      public static let emaxMin = (volume_pct: 5.0, seuil_skm: 3.0, efficacite_pct: 2.0,
                                   endurance_pt: 1.0, regularite_pt: 10.0, resilience_ms: 3.0)
  }
  public let VERSION_DENIVELE = 1
  ```
  Les seuils déjà publiés ailleurs (`easyCap` et ses paramètres datés, `horsSousSeuil`, 30 % du compteur) ne sont pas dupliqués : on appelle l'existant.
- **Paramètres datés (D-006).** Une carte de séance juge avec les paramètres en vigueur **à la date de la séance**, via `ParamsAuJour`, comme `derniereSeanceSousSeuil`.
- **Arrondi (D-015).** Chaque fonction rend la valeur brute **et** son arrondi d'affichage ; les comparaisons (bande, verdict, signe de l'écart) se font sur les valeurs arrondies, au plus proche, mi-chemin loin de zéro (`arrondi.swift`). Précisions : VDOT 0,1 ; km 0,1 (semaine), 1 (30 jours, année) ; % 1 ; bpm 1 ; EF 0,01 ; s/km 1 ; découplage 0,1 ; D+ 1 m ; ms 1 ; minutes 1 ; points de % 1 (régularité) ou 0,1 (endurance).
- **Aucune logique métier dans les vues.** Les modèles purs de l'app ne font que mettre en forme (texte, signe « − », virgule, espace fine, couleur sémantique, géométrie du radar). Les vues lisent ces modèles.
- **Performance.** Les sélecteurs indexent les séances par type et par date une seule fois (recherche dichotomique dans des tableaux triés) : `cartesSeances` en O(n log n), `sixQualites` en O(semaines × 12) avec des sommes préfixées. Budget : < 5 ms en release pour 2 000 séances et 4 ans, mesuré au lot 20. La liste S1 est une `LazyVStack` à en-têtes épinglés : aucune carte hors écran n'est construite.

### Types publics de JogCore (résumé, détaillés par lot)

```swift
public enum Sens: Sendable { case deuxCotes, basSeulement, hautSeulement }        // côté où « hors bande » colore
public enum NormeOuEnCours: Sendable, Equatable { case norme(Norme), enCours(n: Int, sur: Int) }
public struct Norme: Sendable, Equatable { public var moyenne, ecartType, bas, haut: Double; public var n: Int }
public struct LigneJauge: Sendable, Equatable {
    public var valeur: Double?; public var valeurAffichee: Double?
    public var trait: Double?; public var bande: ClosedRange<Double>?
    public var ecart: Double?             // valeur − trait, arrondi à la précision ; en % pour le volume
    public var horsBande: Bool            // jamais vrai sans bande
    public var enCours: (n: Int, sur: Int)?   // « Norme en cours (n sur 4) » (struct dédiée si Equatable l'exige)
}
public struct VueNiveau { public var valeur: Double?; public var ilYAUnAn: Double?; public var ecart: Double?; public var fixePar: String? }
public struct LigneCourse { public var cleSource: String; public var date: DateCivile; public var distance: DistanceCourse
                            public var estTest: Bool; public var temps_s: Double; public var allure_skm: Double; public var vdot: Double }
public enum DistanceCourse { case cinqKm, dixKm, semi, marathon, autre(km: Double) }
public struct LignesVolume { public var semaine, trenteJours, annee: LigneJauge; public var references: ReferencesVolume }
public struct LignesRecuperation { public var vfc, fcRepos, sommeil: LigneJauge }
public struct SemaineAccueil { public var lundi: DateCivile; public var enCours: Bool; public var km, min: Double
                               public var minutes: Minutes; public var nbSeances, nbSousSeuil: Int; public var minSS: Double
                               public var partSS: Double?; public var seances: [String]; public var courses: [String] }
public enum VerdictSeance { case ok(String), surveiller(String), alerte(String), neutre(String) }
public struct CarteSeance { public var cleSource: String; public var type: TypeSeance; public var verdict: VerdictSeance
                            public var jauges: [JaugeSeance] }      // 2 ou 3, dans l'ordre de 04
public struct JaugeSeance { public var cle: CleJauge; public var ligne: LigneJauge }
public enum CleJauge { case fcMoy, ef, fcFinRepetitions, allureNorm, decouplage, dPlus, vdot, charge }
public enum Qualite: CaseIterable { case volume, seuil, efficacite, endurance, regularite, resilience }
public struct AxeQualite { public var qualite: Qualite; public var maintenant, reference: Double?
                           public var ecartOriente: Double?; public var ecartAffiche: Double?; public var rayon: Double }
public struct SixQualites { public var axes: [AxeQualite]; public var referencePremieresSemaines: Bool; public var Q, Q0: (DateCivile, DateCivile)? }
```

---

## Lot 1 · VDOT, niveau et liste des courses (JogCore, pur)

**Périmètre** : la formule de Daniels, le niveau sur 365 jours, l'écart à un an, la liste de N2.
**Fichiers** :
- créer `ios/JogCore/Sources/JogCore/niveau-vdot.swift` ;
- dans `constantes.swift`, créer l'espace de noms `ACCUEIL` (toutes les constantes ci-dessus, même celles des lots suivants, pour un seul point de réglage) ;
- tests : `ios/JogCore/Tests/JogCoreTests/NiveauVdotTests.swift`.

```swift
public func vdot(distance_m: Double, temps_min: Double) -> Double?      // nil si distance ou temps ≤ 0
public func niveauAu(_ vue: Vue, _ d: DateCivile) throws -> (vdot: Double, cleSource: String)?
public func niveauVDOT(_ vue: Vue) throws -> VueNiveau                   // A = vue.J − 1 (D-022 : J est la coupure, le lendemain d'aujourd'hui)
public func coursesEtTests(_ vue: Vue) throws -> [LigneCourse]           // du plus récent au plus ancien
public func distanceCourse(_ km: Double) -> DistanceCourse
```

**Règles couvertes** : 04 « VDOT et niveau » ; D-027 ; D-014 (seules les séances marquées course ou test comptent, distance `distanceRef_km`, temps `temps_s`) ; D-015 (VDOT à 0,1).
**Tests attendus**
1. Formule : 10 km en 37:40 → VDOT arrondi **54,2** (maquette) ; 5 km en 18:05 → 53,9 ; marathon 3:05:40 → 51,6 ; semi 1:24:30 → 53,1. Tolérance : égalité après arrondi à 0,1.
2. Niveau = meilleur VDOT de `d − 364` à `d` inclus : une course à `d − 364` compte, à `d − 365` non.
3. Sans course ni test sur la fenêtre → `niveauAu == nil`, `VueNiveau.valeur == nil`.
4. Écart à un an = niveau(A) − niveau(A − 365), sur les valeurs arrondies : 54,2 et 52,1 → +2,1 ; sans niveau il y a un an → `ecart == nil`.
5. Égalité de VDOT : la course la plus récente fixe le niveau (`fixePar`).
6. Une séance non marquée de 10 km rapide n'entre ni dans le niveau ni dans la liste.
7. Séance du jour marquée course → comptée aussitôt (D-022).
8. `distanceCourse` : 5,0 → `.cinqKm`, 21,1 → `.semi`, 42,2 → `.marathon`, 15 → `.autre(15)`. Bornes de tolérance des distances : celles de D-014 si elles existent, sinon point de décision 9.
9. `coursesEtTests` : ordre décroissant, `estTest` vrai pour un test, allure = temps ÷ distance.

**Critère de fin** : tests verts, oracle intact.

## Lot 2 · Ligne de jauge et norme (JogCore, pur)

**Périmètre** : la grammaire commune de D-026, sans aucune source de données.
**Fichiers** : créer `accueil-jauge.swift` ; tests `AccueilJaugeTests.swift`.

```swift
public func norme(_ echantillon: [Double], minimum: Int, k: Double = ACCUEIL.kEcartType) -> NormeOuEnCours
public func ligneJauge(valeur: Double?, trait: Double?, bande: ClosedRange<Double>?, precision: Double,
                       ecartEnPourcent: Bool = false, sens: Sens = .deuxCotes) -> LigneJauge
```

**Règles couvertes** : 04 « Ligne de jauge » ; D-026 ; D-015.
**Tests attendus**
1. Norme = moyenne ± 0,95 × écart-type **de population** : [10, 20] → moyenne 15, σ 5, bande [10,25 ; 19,75].
2. Échantillon de taille `minimum − 1` → `.enCours(n: 3, sur: 4)` ; taille `minimum` → `.norme`.
3. Écart = valeur − trait **après arrondi des deux** à la précision : 41,4 et 46,6 à 1 ms → −6 (et non −5,2 arrondi à −5).
4. Écart en % : 37,4 face à 36 → +4 (arrondi à l'unité) ; trait nul ou absent → `ecart == nil`.
5. Hors bande comparé sur valeurs arrondies : bande [44 ; 58], valeur 43,6 → affichée 44 → dans la bande.
6. Borne inclusive : valeur affichée égale au bas ou au haut → dans la bande.
7. Sans bande → `horsBande == false` quelle que soit la valeur.
8. `sens: .basSeulement` : une valeur au-dessus de la bande n'est pas hors bande ; `.hautSeulement` symétrique.
9. Valeur absente → `valeurAffichee == nil`, `ecart == nil`, `horsBande == false`.

**Critère de fin** : tests verts.

## Lot 3 · Lignes du volume (JogCore, pur)

**Périmètre** : les trois lignes d'A2 et les données de leurs phrases de référence.
**Fichiers** : créer `accueil-volume.swift` ; tests `AccueilVolumeTests.swift`.

```swift
public struct ReferencesVolume: Sendable, Equatable {
    public var jourDeSemaine: Int                    // 1 = lundi … 7 = dimanche (« à jeudi soir »)
    public var bandeSemaine: ClosedRange<Double>?    // « d'habitude 32–40 km »
    public var km30Precedents: Double?; public var bande30: ClosedRange<Double>?
    public var anneeDerniere: Int; public var kmAnDernierADate: Double?
    public var kmParSemaineAnnee: Double; public var seancesAnnee: Int   // « 42 km/sem · 117 séances »
}
public func lignesVolume(_ vue: Vue) throws -> LignesVolume
```

**Règles couvertes** : 04 « Accueil › Volume » ; D-026 (semaine au même jour) ; D-022 (aujourd'hui inclus) ; 03 A2.
**Tests attendus**
1. **Semaine au même jour** : A = jeudi ; valeur = km du lundi au jeudi ; trait = moyenne, sur les 8 semaines terminées précédentes, des km de leur lundi à leur jeudi ; bande = norme de ces 8 valeurs. Une séance du vendredi d'une semaine passée n'entre pas dans le trait.
2. A = lundi matin sans séance → valeur 0, trait = moyenne des lundis.
3. Moins de 4 semaines terminées → `enCours(n, sur: 4)`, ni trait ni bande (point de décision 3) ; entre 4 et 7, la norme se calcule sur celles qui existent.
4. **30 jours** : valeur = km de A − 29 à A ; trait = km de A − 59 à A − 30 ; bande = norme des sommes glissantes de 30 jours terminées chaque jour de A − 365 à A − 1, chacune comptée seulement si 30 jours d'historique la précèdent.
5. **Année** : valeur = km du 1er janvier à A ; trait = km de l'an dernier du 1er janvier au même jour ; aucune bande. A = 29 février → trait jusqu'au 28 février de l'an dernier.
6. Écart en % arrondi à l'unité ; mi-chemin loin de zéro (+4,5 → +5, −4,5 → −5).
7. Pas d'historique l'an dernier → trait nil, écart nil.
8. Références : `jourDeSemaine`, `kmParSemaineAnnee = km ÷ jours écoulés × 7` (04 « Compteurs »), nombre de séances de l'année.

**Critère de fin** : tests verts. `Vue.compteurs` n'est pas modifié (oracle).

## Lot 4 · Lignes de récupération et semaines de S1 (JogCore, pur)

**Périmètre** : les trois lignes d'A5, et le regroupement par semaine de S1.
**Fichiers** : créer `accueil-recuperation.swift` et `accueil-semaines.swift` ; tests `AccueilRecuperationTests.swift`, `AccueilSemainesTests.swift`.

```swift
public func lignesRecuperation(_ r: VueRecuperation?, besoinSommeil_min: Double) -> LignesRecuperation?   // nil sans recuperation
public func semainesAccueil(_ vue: Vue) throws -> [SemaineAccueil]   // de la semaine en cours à celle de premierJour
```

**Règles couvertes** : 04 « Récupération (lignes) » et « Récupération » ; D-023 (nuit non mesurée jamais comptée) ; D-026 ; 03 S1 ; conventions de 03 (semaine lundi → dimanche).
**Tests attendus (récupération)**
1. VFC : valeur `vfc7(A)`, trait = milieu de la norme, bande = norme VFC, écart en ms (« −6 » pour 41 face à 47).
2. FC de repos : valeur `fc7(A)`, trait = milieu de la norme FC, écart en bpm.
3. Sommeil : valeur = moyenne des durées endormies de F7(A) ; trait = besoin ; bande = [besoin − 45 ; besoin] ; écart en minutes (6 h 52 face à 7 h 30 → −38).
4. Moins de 4 nuits dans F7 → valeurs nil ; norme absente → VFC et FC sans trait ni bande.
5. Le côté coloré suit le point de décision 4 (`sens` par ligne).
**Tests attendus (semaines)**
6. Une semaine par lundi, de la semaine qui contient A à celle de `premierJour`, sans trou ; une semaine sans séance a `nbSeances == 0`.
7. Séances de la semaine du plus récent au plus ancien (date puis `debutUtc`).
8. km, minutes, répartition par intensité, minutes et part de sous-seuil : égales à celles de `vue.semaines` pour la même semaine (aucun recalcul divergent).
9. `nbSousSeuil` = séances de type sous-seuil ; `courses` = séances marquées course de la semaine.
10. Semaine en cours (contient A) : `enCours == true`, même si elle n'a aucune séance.

**Critère de fin** : tests verts.

## Lot 5 · D+ des séances (JogCore, ②a)

**Périmètre** : la nouvelle mesure de D-025, de bout en bout jusqu'à `SeanceVue`.
**Fichiers** :
- créer `seance-denivele.swift` ;
- modifier `seance-types.swift` / `types.swift` (`Seance`, `SeanceVue.init(seance:)`), `seance-intrinseque.swift` (appel), `vue.swift` (`cleDeSeance` gagne `VERSION_DENIVELE`), `constantes.swift` ;
- tests : `SeanceDeniveleTests.swift` ; adapter `VueOracleTests.swift` et les tests d'oracle de séance concernés (retrait de la clé `dPlus_m` de la sortie comparée, à côté de `auFormatDesGoldens`).

```swift
public func denivelePositif(_ g: GrilleSeance) -> Double?   // nil sans altitude exploitable
```

**Règles couvertes** : 04 « Carte de séance » (D+ : somme des hausses entre points successifs, après lissage sur 30 s, points de précision verticale invalide ignorés — déjà filtrés par `healthkit-adaptateur.swift`, ligne 111) ; D-025.
**Tests attendus**
1. Montée régulière de 100 m sur 10 min → 100 m (±1 après arrondi).
2. Bruit de ±2 m à 1 Hz sur du plat (motif déterministe) → D+ < 5 m après lissage 30 s.
3. Aller-retour d'une côte de 50 m → 50 m (les descentes ne retranchent rien).
4. `alt_m == nil` ou toutes valeurs NaN → nil ; trous de NaN au milieu : les points manquants sont sautés, pas comptés à zéro.
5. Arrondi au mètre, mi-chemin loin de zéro.
6. `cleDeSeance` change quand `VERSION_DENIVELE` change (test au niveau de la fonction publique, avec le paramètre injecté comme `versionEstimation`).
7. Parité : `oracleVue`, `oracleDecision` et l'oracle de ②a restent verts, aucun JSON modifié ; l'adaptateur ne retire que `dPlus_m`.
8. Une `SeanceVue` encodée sans altitude n'a pas de clé `dPlus_m`.

**Critère de fin** : tests verts, oracle intact, compte rendu qui dit combien de cas d'oracle passent par l'adaptateur.

## Lot 6 · Carte de séance : normes par type et verdict, hors course (JogCore, pur)

**Périmètre** : S2 pour footing, sous-seuil et sortie longue (04 « Carte de séance ») ; types restants selon le point de décision 1.
**Fichiers** : créer `accueil-seance.swift` ; tests `AccueilSeanceTests.swift`.

```swift
public func cartesSeances(_ vue: Vue, _ paramsAuJour: ParamsAuJour) throws -> [String: CarteSeance]   // par cleSource
public func carteSeance(_ vue: Vue, cleSource: String, _ paramsAuJour: ParamsAuJour) throws -> CarteSeance?
```

**Règles couvertes** : 04 « Carte de séance » ; D-025 ; D-006 (paramètres à la date de la séance) ; D-015 ; `horsSousSeuil` existant (04 « Répétition hors sous-seuil »).
**Tests attendus**
1. **Échantillon** : séances du même type de `s − 56` à `s − 1` ; une séance à `s − 57` ou le même jour `s` n'y entre pas ; une séance d'un autre type non plus.
2. **Sous-seuil** : les 6 séances sous-seuil précédentes, quelle que soit leur ancienneté ; la 7ᵉ n'entre pas.
3. 3 séances dans l'échantillon → chaque jauge `enCours(3, sur: 4)`, sans trait ni bande ; le verdict reste calculé (il ne dépend pas de la norme).
4. **Footing**, jauges FC moyenne (bpm) puis EF (0,01) ; verdict, `easyCap` = 145 : FC 145 → « Bien facile » (OK), 145,4 → 145 → OK ; 146 → « Un peu rapide » ; 150 → « Un peu rapide » ; 151 → « Trop rapide » (alerte).
5. `easyCap` modifié à une date : une séance antérieure garde l'ancien plafond (D-006).
6. Footing sans FC → verdict neutre (point de décision 2), jauge FC à « – ».
7. **Sous-seuil**, jauges FC de fin (moyenne des répétitions, bpm) puis `allureNormSeance` (écart en s/km) ; verdict : 0 répétition hors sous-seuil → « Maîtrisée » ; 1 et 2 → « Un peu haut » ; 3 → « Au-dessus du seuil ».
8. **Sortie longue**, jauges découplage (0,1 %) puis D+ (m) ; verdict sur découplage arrondi : 5,0 → « A tenu » ; 5,1 → « Dérive en fin » ; 8,0 → « Dérive en fin » ; 8,1 → « Forte dérive » ; découplage non utilisable → neutre « Découplage non mesurable ». D+ absent → jauge « – ».
9. Footing avec lignes droites : même famille que le footing (point de décision 1).
10. `cartesSeances` donne une carte pour chaque séance de la Vue et le même résultat que `carteSeance` séance par séance.
11. Mesure de performance (`JOG_PERF`) : 2 000 séances sur 4 ans, < 5 ms en release.

**Critère de fin** : tests verts.

## Lot 7 · Carte de course et de test (JogCore, pur)

**Périmètre** : la ligne « Course, test » de 04 « Carte de séance ».
**Fichiers** : modifier `accueil-seance.swift` ; tests `AccueilCourseTests.swift`.
**Règles couvertes** : 04 « Carte de séance » (course) ; 04 « VDOT et niveau » (niveau la veille) ; D-025 ; D-027.
**Tests attendus**
1. Jauge VDOT : trait = niveau **la veille** (fenêtre `s − 365` à `s − 1`), bande ±0,5 ; une course qui bat le niveau ne se compare pas à elle-même.
2. Verdict sur valeurs arrondies : VDOT − niveau = +0,6 → « Au-dessus du niveau » (OK) ; +0,5 → « Conforme » ; −0,5 → « Conforme » ; −0,6 → « En dessous du niveau » (neutre).
3. Première course (aucun niveau la veille) → jauge VDOT sans trait, verdict neutre (point de décision 2).
4. Jauge FC moyenne : trait et bande sur les courses et tests **de même distance** (`distanceCourse`), sur tout l'historique antérieur ; une seule → `enCours(1, sur: 2)` ; deux → norme.
5. Jauge charge : valeur et trait selon le point de décision 5 ; sans séance sous-seuil sur 56 jours → `enCours`.
6. Un test se traite comme une course (mêmes jauges, même verdict).

**Critère de fin** : tests verts.

## Lot 8 · Six qualités (JogCore, pur)

**Périmètre** : le radar de N1, sur les cinq qualités qui ne dépendent que des séances ; la Résilience lit une série optionnelle livrée au lot 9.
**Fichiers** : créer `niveau-qualites.swift` ; tests `NiveauQualitesTests.swift`.

```swift
public func sixQualites(_ vue: Vue, milieuxNormeVFC: [PointNormeVFC]? = nil) throws -> SixQualites
```

**Règles couvertes** : 04 « Six qualités » ; D-028 ; 03 N1 (ordre des axes : Volume, Seuil, Efficacité, Endurance, Régularité, Résilience).
**Tests attendus**
1. `Q` = les 12 semaines terminées les plus récentes : A = jeudi → `Q` finit le dimanche précédent ; A = dimanche → la semaine en cours n'est pas terminée, elle n'entre pas.
2. `Q₀` = mêmes semaines décalées de 364 jours (même jour de la semaine).
3. Volume = km ÷ 12 ; écart affiché en % ; Seuil = moyenne des `allureNormSeance` sous-seuil, meilleur si plus bas, écart en s/km ; Efficacité = moyenne des EF des footings, en % ; Endurance = moyenne des découplages utilisables, meilleur si plus bas, en points ; Régularité = part des 12 semaines avec ≥ 4 séances, en points.
4. Écart orienté : une allure normalisée passée de 240 à 231 s/km → `E = +9` (progrès), écart affiché « −9 s/km ».
5. Rayon = 0,5 + 0,5 × borne(E ÷ Emax, −1, 1) : E = 0 → 0,5 ; E = Emax → 1 ; E = −2 × Emax → 0.
6. `Emax` = plus grand |écart orienté à un an| observé, calculé à chaque dimanche de l'historique où `Q` et `Q₀` existent, jamais sous les minimums (5 %, 3 s/km, 2 %, 1 point, 10 points, 3 ms).
7. Sans valeur sur `Q` ou `Q₀` (aucune sortie longue, par exemple) → `ecartOriente == nil`, rayon 0,5.
8. Moins d'un an d'historique : `Q₀` = les 12 premières semaines terminées, `referencePremieresSemaines == true` ; moins de 24 semaines terminées : point de décision 6.
9. Sans série VFC → Résilience à « – », rayon 0,5.
10. Arrondi D-015 de l'écart affiché avant le choix de la couleur (nul → neutre).

**Critère de fin** : tests verts.

## Lot 9 · Résilience : norme VFC hebdomadaire et profondeur des nuits (JogCore)

**Périmètre** : fournir le milieu de la norme VFC à chaque dimanche, assez loin pour `Q₀`.
**Fichiers** :
- modifier `recuperation-types.swift` (`PointNormeVFC { date; milieu_ms }`, champ `milieuxNormeVFC` de `VueRecuperation`, Optional simple), `recuperation-vue.swift`, `constantes.swift` (`RECUPERATION.nuitsLues = 450`, `FORMAT_VUE = 7` avec commentaire d'historique), `recuperation-synchro.swift` (rattrapage des nuits anciennes) ;
- tests : `RecuperationVueTests.swift`, `RecuperationSynchroTests.swift`, `NiveauQualitesTests.swift` (cas Résilience).

**Règles couvertes** : 04 « Récupération » (norme `N60(d)`, ≥ 21 nuits) ; 04 « Six qualités » (Résilience = milieu de la norme au dernier jour de la fenêtre) ; D-023.
**Tests attendus**
1. `milieuxNormeVFC` : un point par dimanche couvert par les nuits, égal au `milieu` de la norme calculée par `serieRecuperation` ce jour-là ; un dimanche sans norme (moins de 21 nuits) n'a pas de point.
2. Avec `nuitsExemple(.normal, nombre: 450)` → le dimanche de fin de `Q₀` a un point ; Résilience a un écart.
3. Rattrapage : une installation qui a 250 nuits en stock lit **une fois** les nuits plus anciennes jusqu'à 450 ; ensuite seules 3 nuits sont relues.
4. Parité : goldens intacts (`recuperation` nil dans tous) ; une Vue au format 6 en cache est rejetée puis recalculée sans erreur.
5. Performance : `serieRecuperation` sur 450 nuits reste < 1 ms en release.

**Critère de fin** : tests verts, oracle intact.

## Lot 10 · Navigation : destinations et piles par onglet (app)

**Périmètre** : la structure de navigation de 02, sans encore retirer d'onglet. Les écrans existants deviennent atteignables par empilement.
**Fichiers** : modifier `Etat/Navigation.swift`, `ContentView.swift` ; tests `NavigationTests.swift` (réécrits).

```swift
enum Destination: Hashable {
    case courses, seance(cleSource: String), recuperation, decision, signal(CleSignal), semaine(lundi: DateCivile)
}
@MainActor @Observable final class Navigation {
    var onglet: Onglet                         // relu et écrit dans UserDefaults « jog-onglet » (02 : dernier onglet rouvert)
    var pileAujourdhui: [Destination] = []; var pileProgres: [Destination] = []
    func ouvrir(_ d: Destination)              // empile dans l'onglet courant
    func ouvrirSaisons()                       // onglet = .progres, défile jusqu'à H1 (ancre)
    static func destination(du signal: CleSignal) -> DestinationSignal   // C1, A4, C2+C3, P2
}
```

**Règles couvertes** : 02 « Barre d'onglets », « Écrans de détail », « Persistance locale ».
**Tests attendus**
1. `ouvrir(.decision)` puis `ouvrir(.signal(.progressivite))` → la pile d'Aujourd'hui a deux éléments, l'onglet ne change pas.
2. L'onglet choisi est relu depuis des `UserDefaults(suiteName:)` dédiés ; valeur inconnue → Aujourd'hui.
3. Chaque `CleSignal` a une destination : progressivité → C1, fraîcheur → A4, sous-seuil et footings → C2 + C3, tendances → P2, récupération → écran Récupération (table complète, un test paramétré).
4. `ouvrirSaisons()` → onglet Progrès, ancre Saisons.

Dans ce lot, `Onglet` garde ses quatre cas et `PartieCharge` reste (le lot 19 les retire). La carte Récupération et le verdict de l'Aperçu actuel empilent `.recuperation` et `.decision` au lieu de changer d'onglet ; `ouvrirTendancesRecuperation` est retiré.
**Critère de fin** : `xcodebuild test` vert ; l'app s'ouvre, les quatre onglets marchent.

## Lot 11 · Écrans Décision et Récupération (app, vues)

**Périmètre** : assembler A1 et l'écran Récupération à partir des vues existantes.
**Fichiers** :
- créer `Apercu/EcranDecision.swift` (verdict, fourchette, phrase, simulateur, 8 signaux ; reprend `DecisionVolumeView`, `FeuilleSignaux`, `FeuilleSimulateur`) ;
- créer `Recuperation/EcranRecuperation.swift` (A6 en tête depuis `FeuilleNuitView`, puis R1 à R7 depuis `RecuperationChargeView`) ;
- `ContentView.swift` : `navigationDestination(for: Destination.self)` ;
- tests : `ApercuTests.swift` (cas ajoutés) si un modèle pur bouge.

**Règles couvertes** : 03 A1, A6, R1–R7 ; 02 « Écrans de détail » ; D-024 (une métrique en résumé une fois, en détail une fois).
**Tests attendus** : chaque signal de la liste de la Décision porte la destination du lot 10 (test sur le modèle des cartes de signaux) ; la feuille « Cette nuit » n'est plus une feuille mais l'en-tête de l'écran (modèle inchangé, `RecuperationTests` verts).
**Critère de fin** : `xcodebuild test` vert ; captures de la Décision et de l'écran Récupération, clair et sombre.

## Lot 12 · ModeleJauges : textes des lignes de volume et de récupération (app, pur)

**Fichiers** : créer `ios/Jog/Jog/Accueil/ModeleJauges.swift` ; tests `AccueilJaugesTests.swift`, à ajouter au pbxproj.

```swift
enum ModeleJauges {
    struct Ligne: Identifiable { let id: String; let libelle: String; let valeur: String; let ecart: String
                                 let horsBande: Bool; let echelle: ClosedRange<Double>; let point: Double
                                 let trait: Double?; let bande: ClosedRange<Double>?; let phrase: String?
                                 let accessibilite: String }
    static func volume(_ l: LignesVolume, annee: Int) -> [Ligne]
    static func recuperation(_ l: LignesRecuperation?) -> [Ligne]       // [] et message d'A5 sans nuit
    static func pastilleVerdict(_ d: Decision) -> (texte: String, ton: Ton)  // « Maintenir · 62–66 km / 7 j »
    static func pastilleRecuperation(_ r: VueRecuperation?) -> (texte: String, ton: Ton)
}
```

**Règles couvertes** : 03 A2, A5 ; D-026 ; maquette (`bl`, `vol`, `rec`) ; 08 (signe « − », virgule décimale, espace fine des milliers).
**Tests attendus**
1. Valeurs : « 37,4 km », « 248 km », « 1 842 km », « 41 ms », « 47 bpm », « 6 h 52 » ; absente → « – ».
2. Écarts : « +4 % », « −6 », « +1 », « −38′ » ; nul → « 0 » sans signe ; absent → chaîne vide.
3. Libellé de la ligne Année = l'année de A (« 2026 »).
4. Phrases : « à jeudi soir, d'habitude 32–40 km » ; « 30 j précédents 234 km, habituel 210–255 » ; « 2025 à date 1 660 km · 42 km/sem · 117 séances » ; en cours : « Norme en cours (3 sur 4) ».
5. Échelle de la barre : contient la valeur, le trait et la bande, avec la marge de la maquette ; jamais d'échelle nulle.
6. Pastille du verdict : « Pas encore de verdict » avant 30 jours (05, « Données insuffisantes »).
7. Pastille de récupération : les cinq états de 03 A5 ; sans aucune nuit → message « Aucune nuit mesurée dans Santé… », aucune ligne.
8. Accessibilité : « VFC, 41 millisecondes, 6 de moins que ta norme ».

**Critère de fin** : `xcodebuild test` vert.

## Lot 13 · ModeleSeances : cartes et en-têtes de semaine (app, pur)

**Fichiers** : créer `Accueil/ModeleSeances.swift` ; déplacer depuis `ModeleApercu.swift` les fonctions du menu de marquage (D-020) ; tests `AccueilSeancesTests.swift` (pbxproj) et `ApercuTests.swift` (les tests de marquage suivent les fonctions, sans changer d'assertion).

```swift
enum ModeleSeances {
    struct Carte: Identifiable { let id: String; let couleurType: Zone; let titre: String; let quand: String
                                 let meta: String; let verdict: String; let ton: Ton; let jauges: [ModeleJauges.Ligne]
                                 let estDuJour: Bool }
    struct EnTete: Identifiable { let id: DateCivile; let titre: String; let kmDuree: String
                                  let repartition: [Double]; let resume: String }
    static func carte(_ s: SeanceVue, _ c: CarteSeance, J: DateCivile, fuseau: TimeZone) -> Carte
    static func enTete(_ s: SemaineAccueil, J: DateCivile) -> EnTete
}
```

**Règles couvertes** : 03 S1, S2 ; 04 « Carte de séance » ; maquette (`sc`, `wk`).
**Tests attendus**
1. Titres : « Footing », « Sous-seuil 5×8′ » (depuis `format`), « Sortie longue », « Course · 10 km », « Test 5 km ».
2. Quand : « auj. 12:15 » pour une séance du jour, « mer. 29 · 18:05 » sinon ; plus d'un an → avec l'année.
3. Méta : « 10,2 km · 58 min · 5:41/km » ; sous-seuil : « rép. 3:52/km » (allure moyenne des répétitions) ; course : « 37:40 · 3:46/km ».
4. Jauges : 2 ou 3 lignes, dans l'ordre de 04, mêmes règles d'affichage que le lot 12 (« 167 bpm » « +1 », « 3:54 » « −2 s », « 6,1 % » « +1,9 », « 212 m » « +40 m »).
5. En-tête : « Cette semaine » si `enCours`, sinon « Sem. du 20 oct. » ; « 37,4 km · 3 h 07 » ; « 3 séances · 1 seuil · 40′ sous-seuil (21 %) » ; aucune séance → « aucune séance ».
6. Répartition : 4 parts dans l'ordre Facile, Allure marathon, Sous-seuil, Au-dessus, somme 1 (ou toutes nulles).
7. `estDuJour` vrai seulement pour la date A.

**Critère de fin** : `xcodebuild test` vert.

## Lot 14 · Composants : ligne de jauge, carte de séance, en-tête de semaine (app, vues)

**Fichiers** : créer `Accueil/LigneJaugeView.swift`, `Accueil/CarteSeanceView.swift`, `Accueil/EnteteSemaineView.swift` ; couleurs dans `Design/Fjord.swift` si `Bande` manque ; tests `AccueilLayoutTests.swift` (pbxproj), sur le modèle de `RecuperationLayoutTests`.
**Règles couvertes** : 03 « Ligne de jauge » (grille libellé · barre · valeur · écart, couleurs `Bande`, `ink-2`, accent, `Attention`) ; 02 « Tailles d'écran » ; 08.
**Tests attendus**
1. À 320 pt et en Dynamic Type XXL, la valeur et l'écart d'une ligne ne débordent pas ; le libellé se coupe avant la valeur.
2. Carte de séance à 3 jauges à 320 pt : hauteur finie, aucune valeur coupée.
3. VoiceOver : une ligne est un seul élément qui lit `accessibilite` ; une carte est un bouton.
**Critère de fin** : `xcodebuild test` vert ; captures des composants dans les `#Preview` (clair, sombre, XXL).

## Lot 15 · ModeleNiveau : en-tête, radar, bulle et Courses (app, pur)

**Fichiers** : créer `Accueil/ModeleNiveau.swift` ; tests `AccueilNiveauTests.swift` (pbxproj).

```swift
enum ModeleNiveau {
    struct EnTete { let titre: String; let valeur: String?; let ilYAUnAn: String?; let ecart: String?; let ecartPositif: Bool; let sousTitre: String? }
    struct Axe: Identifiable { let id: Qualite; let nom: String; let ecart: String; let ton: Ton; let rayon: Double
                               let mesure: String; let accessibilite: String }
    struct LigneCourse: Identifiable { … }      // date, « Test 5 km », « 37:40 · 3:46/km », « 54,2 »
    static func enTete(_ n: VueNiveau, _ q: SixQualites) -> EnTete
    static func axes(_ q: SixQualites) -> [Axe]
    static func sommets(_ axes: [Axe], centre: CGPoint, rayon: Double) -> [CGPoint]   // −90° puis pas de 60°
    static func courses(_ l: [LigneCourse], filtre: FiltreCourses) -> [(annee: Int, lignes: [LigneCourse])]
    static func courbe(_ l: [LigneCourse], ilYAUnAn: Double?) -> (points: [(DateCivile, Double)], reference: Double?)
}
```

**Règles couvertes** : 03 N1, N2 ; D-027 ; D-028 ; maquette (`niveau`, `QUAL`, `coursesHTML`).
**Tests attendus**
1. En-tête : « 54,2 », « 52,1 », « +2,1 » vert ; sans niveau → « Niveau en cours : cours un test 5 km », sans valeur ; moins d'un an → sous-titre « face à tes 12 premières semaines ».
2. Axes dans l'ordre horaire depuis le haut ; écarts « +14 % », « −9 s/km », « +0,8 pt », « −1 ms » ; ton vert dans le bon sens, orange sinon, neutre si nul.
3. Mesure de la bulle : textes de la maquette (`QUAL[].m`), suivis de « face à il y a un an ».
4. Accessibilité : « Seuil, −9 s/km face à il y a un an ».
5. Géométrie : rayon 0,5 sur les six axes → hexagone régulier sur l'anneau du milieu ; premier sommet en haut.
6. Courses : groupées par année, la plus récente en haut ; filtre « 10 km » ne garde que `.dixKm` ; « {n} courses et tests ».
7. Courbe : un point par course, référence = niveau il y a un an.

**Critère de fin** : `xcodebuild test` vert.

## Lot 16 · Écrans Séance (S3) et Courses (N2) (app, vues)

**Fichiers** :
- créer `Accueil/EcranSeance.swift` : carte S2 en tête, puis pour une séance sous-seuil le graphique en sucettes de P4 (extraire de `Progression/DerniereSeanceView.swift` une vue qui prend une séance au lieu de « la dernière ») ; pour les autres types, le contenu du point de décision 7 ; menu de marquage (D-020) dans la barre ;
- créer `Accueil/EcranCourses.swift` : carte d'en-tête et courbe, filtres, liste par année ; une ligne empile `.seance` ;
- `ContentView.swift` : destinations `.seance` et `.courses` ;
- tests : `ProgressionGraduationsTests` et les tests de P4 restent verts ; cas ajoutés au lot 15 si un texte manque.

**Règles couvertes** : 03 S3, N2, P4 ; 02 (« Filtre des courses », non mémorisé) ; D-020.
**Tests attendus** : le modèle des sucettes d'une séance donnée est celui de P4 pour la dernière séance (même sortie) ; le marquage depuis S3 relaie `surMarquage`.
**Critère de fin** : `xcodebuild test` vert ; captures S3 (sous-seuil, footing, course) et Courses, clair et sombre.

## Lot 17 · Carte Niveau : radar et bulle (app, vue)

**Fichiers** : créer `Accueil/CarteNiveauView.swift` (Canvas ou `Path`, anneaux 25/50/75/100 %, anneau 50 % en `ink-2`, polygone accent à aire teintée, légende) ; tests `AccueilLayoutTests.swift` (cas ajoutés).
**Règles couvertes** : 03 N1 (interactions, critères) ; maquette (`niveau`, `tip`).
**Tests attendus**
1. À 320 pt, aucun nom ni écart d'axe n'est coupé (mesure de chaque étiquette dans son cadre).
2. Toucher une qualité ouvre la bulle et met son nom en accent, sans navigation ; toucher la bulle ne la ferme pas ; le bouton ✕ la ferme (état piloté par une valeur testable, `qualiteOuverte: Qualite?`).
3. Toucher ailleurs sur la carte appelle `ouvrir(.courses)`.
4. VoiceOver : chaque axe est un bouton qui lit l'accessibilité du lot 15.
**Critère de fin** : `xcodebuild test` vert ; captures 320 et 440 pt, XXL.

## Lot 18 · Nouvel accueil (app, vues)

**Périmètre** : Aujourd'hui devient N1, A5, A2, puis S1, dans un ordre fixe.
**Fichiers** :
- créer `Accueil/AccueilView.swift` (remplace le contenu d'`ApercuView`, qui délègue ou disparaît selon le point de décision 10) ; `Accueil/CarteVolumeView.swift` ; `Accueil/CarteRecuperationAccueilView.swift` (ou adaptation de `Recuperation/CarteRecuperationView.swift`) ;
- `ScrollView` + `LazyVStack(pinnedViews: .sectionHeaders)` : une `Section` par semaine, en-tête épinglé ; sélecteur de mois (point de décision 8) avec `ScrollViewReader` ;
- en-tête de semaine → `.semaine(lundi:)`, qui ouvre `Historique/FeuilleSemaine.swift` sans monotonie ni contrainte ;
- retirer d'Aujourd'hui `DecisionVolumeView`, `VolumeRealiseView`, `SeptDerniersJoursView` (fichiers supprimés au lot 19) ;
- tests : `AccueilLayoutTests.swift` (cas ajoutés).

**Règles couvertes** : 02 « Contenu par onglet », règles d'Aujourd'hui ; 03 N1, A5, A2, S1 ; D-024 ; D-026.
**Tests attendus**
1. À 393 pt (iPhone 15), taille de texte standard, N1 + A5 tiennent dans 540 pt : la récupération est au-dessus du pli.
2. Ordre des blocs constant, avec ou sans séance du jour, avec ou sans nuit.
3. Sans aucune séance : N1 en « Niveau en cours », A2 « Pas encore de verdict », S1 avec la seule semaine en cours « aucune séance » (`SansDonneesView` reste en tête si la Vue est vide).
4. La pastille du verdict empile `.decision` ; la carte Récupération `.recuperation` ; une carte de séance `.seance` ; la ligne Année, après sa phrase, appelle `ouvrirSaisons()` (point de décision 11).
5. Les séances du jour ont le contour accent.
**Critère de fin** : `xcodebuild test` vert ; captures matin (sans séance du jour), soir (avec), et défilement loin (semaines passées, course), clair et sombre, 320 et 440 pt.

## Lot 19 · Deux onglets et retraits (app)

**Périmètre** : le seul lot qui supprime. Tout ce qu'il retire a déjà son remplaçant.
**Fichiers** :
- `Etat/Navigation.swift` : `Onglet { aujourdhui, progres }` ; `PartieCharge` et la lecture de `jog-charge-partie` retirées ; la clé est effacée au premier lancement (`defaults.removeObject`) ; `jog-onglet` valant « charge » ou « historique » → Aujourd'hui ;
- `ContentView.swift` : deux `Tab`, bouton Paramètres dans la barre d'Aujourd'hui seulement (02) ;
- `Progression/ProgressionView.swift` : P4 retirée (vit dans S3), H1 (`Historique/SaisonsView.swift`, déplacée par `git mv` dans `Progression/`) ajoutée en dernier, avec l'ancre de `ouvrirSaisons()` ;
- supprimer : `Charge/ChargeView.swift`, `Historique/HistoriqueView.swift`, `Historique/JournalView.swift`, `Apercu/SeptDerniersJoursView.swift`, `Apercu/VolumeRealiseView.swift`, `Apercu/DecisionVolumeView.swift` si absorbé par `EcranDecision` ; la partie journal de `ModeleHistorique.swift` et les compteurs de `ModeleApercu.swift` ;
- monotonie et contrainte retirées de l'affichage : `Charge/DisciplineView.swift` (note de discipline), `Charge/ModeleCharge.swift`, `Historique/FeuilleSemaine.swift`, `ModeleHistorique.swift`. **JogCore n'est pas touché** : `SemaineVue.monotonie`, `selectionDiscipline.monotonieMoyenne` et `selectionHistorique` restent, couverts par l'oracle ;
- tests : `NavigationTests` (deux onglets, migration des clés), `EcranTests` (retirer les cas des sept derniers jours et du journal ; garder fraîcheur, répétitions, dates), `DisciplineGrapheTests` et `ProgressionLayoutTests` adaptés, pbxproj nettoyé.

**Règles couvertes** : D-024 (retraits) ; 02 (barre d'onglets, sélecteur « Partie de Charge » supprimé, persistance) ; 03 « Ex-onglet Historique », P4.
**Tests attendus**
1. Deux onglets exactement ; `jog-charge-partie` absente après lancement ; ancien onglet « charge » → Aujourd'hui.
2. Progrès : P1, P2, P3, P5, H1 dans cet ordre.
3. La note de discipline ne contient plus la monotonie.
4. `grep -rn "PartieCharge\|monotonie\|contrainte" ios/Jog/Jog` ne trouve plus rien d'affiché (le compte rendu liste les occurrences restantes et leur raison).
**Critère de fin** : `xcodebuild test` et `swift test` verts, oracle intact ; captures des deux onglets.

## Lot 20 · Maquette DEBUG, performance et vérification finale

**Fichiers** : `Apercu/vue-maquette.json` ou son générateur (séances avec D+, courses marquées sur deux ans pour le niveau et le radar), scénario DEBUG de Paramètres › Développement ; `VuePerfTests.swift` (mesures `cartesSeances`, `sixQualites`, `lignesVolume`) ; `docs/implementation/refonte-accueil.md` (Avancement, Écarts).
**Tests attendus**
1. La maquette DEBUG donne un accueil complet : niveau, six axes renseignés, trois lignes de volume avec bande, cartes de chaque type.
2. Release : `cartesSeances` + `sixQualites` + `lignesVolume` + `semainesAccueil` < 10 ms au total sur 2 000 séances.
3. Le premier lancement après mise à jour relit les séances une fois (lot 5) : durée mesurée et notée.
**Critère de fin** : suites vertes ; captures finales ; vérifications sur iPhone listées pour l'utilisateur (première relecture des séances, rattrapage des nuits, défilement de S1 sur tout l'historique, VoiceOver sur le radar).

---

## Impacts sur l'existant

| Élément | Changement | Lot |
|---|---|---|
| `constantes.swift` | espace de noms `ACCUEIL`, `VERSION_DENIVELE`, `RECUPERATION.nuitsLues` 450, `FORMAT_VUE` 7 ; `REGLES_VERSION` inchangée | 1, 5, 9 |
| `Seance`, `SeanceVue`, `calculerSeanceIntrinseque`, `cleDeSeance` | champ `dPlus_m` optionnel ; clé de mémorisation qui relit toutes les séances une fois | 5 |
| `VueRecuperation`, `SynchroniseurNuits` | `milieuxNormeVFC` ; rattrapage unique des nuits jusqu'à 450 | 9 |
| Oracle (`VueOracleTests`, oracle de ②a) | adaptateur qui retire `dPlus_m` de la sortie comparée ; **aucun JSON modifié** | 5 |
| `selectionHistorique`, `selectionDiscipline`, `SemaineVue.monotonie`/`contrainte`, `Vue.compteurs` | conservés dans JogCore (oracle), plus affichés | 19 |
| `riegel.swift`, `progression-niveau.swift` (P5) | inchangés ; P5 reste dans Progrès (D-027) | — |
| `Navigation`, `Onglet`, `PartieCharge` | destinations et piles (10) ; deux onglets, `PartieCharge` retirée, clés migrées (19) | 10, 19 |
| `ContentView` | `navigationDestination`, puis deux `Tab` | 10, 16, 19 |
| `ApercuView` | remplacée par `AccueilView` (ou réduite à elle) | 18 |
| `DecisionVolumeView`, `FeuilleSignaux`, `FeuilleSimulateur` | réutilisés dans **EcranDecision** (A1) | 11 |
| `FeuilleNuitView`, `RecuperationChargeView`, `TendanceNocturneView`, `SommeilNuitsView`, `CommentCestCalculeView` | réutilisés dans **EcranRecuperation** (A6 + R1–R7) | 11 |
| `CarteRecuperationView` | lignes de jauge au lieu des tuiles | 18 |
| `FormeFatigueView`, `ProgressiviteView`, `MinutesSousSeuilView`, `DisciplineView` | écrans de détail des signaux (A4, C1, C2 + C3) ; monotonie retirée de la discipline | 11, 19 |
| `DerniereSeanceView` (P4) | devient le détail sous-seuil de **S3** ; retirée de Progrès | 16, 19 |
| `SaisonsView` (H1) | déplacée dans Progrès, en dernier | 19 |
| `FeuilleSemaine` | détail de la semaine de S1 (ratio au dimanche, footings), sans monotonie | 18, 19 |
| `ChargeView`, `HistoriqueView`, `JournalView`, `SeptDerniersJoursView`, `VolumeRealiseView` | supprimés | 19 |
| Menu de marquage (D-020) | déplacé de la liste « 7 derniers jours » et du journal vers **S3** | 13, 16 |
| Tests d'app | `NavigationTests` réécrits (10, 19) ; `EcranTests` : cas sept jours et journal retirés (19) ; `ApercuTests` : marquage déplacé sans changer d'assertion (13) ; `DisciplineGrapheTests`, `ProgressionLayoutTests` adaptés (19) ; `ProgressionGraduationsTests`, `RecuperationTests`, `RecuperationGrapheTests` inchangés | 10–19 |
| `vue-maquette.json` | enrichie (D+, courses) | 20 |

## Risques

- **Relecture complète des séances (lot 5).** `VERSION_DENIVELE` dans la clé de ②a relit tous les flux au premier lancement. Sur iPhone, plusieurs secondes à une minute selon l'historique. Mitigations : la Vue en cache s'affiche pendant la relecture ; mesure au lot 20 ; alternative au point de décision 12.
- **Parité de l'oracle.** L'adaptateur `dPlus_m` doit rester minimal : il retire une clé, rien d'autre. Toute autre différence fait échouer le lot. Ne jamais toucher `REGLES_VERSION`.
- **Nuits anciennes (lot 9).** Lire 450 nuits double la première synchronisation des nuits (budget < 3 s). HealthKit peut ne pas avoir de VFC si loin : Résilience reste alors « – », sans erreur.
- **Normes maigres.** Les échantillons par type sont petits (4 à 8 séances sur 56 jours) : bandes larges ou instables. Les constantes `ACCUEIL` permettent de régler sans toucher au code (D-025, « À valider sur données réelles »).
- **`Emax` dépendant de l'historique.** Le rayon d'un axe change quand un nouvel écart record apparaît, même si la qualité ne bouge pas. C'est la règle de 04 ; à observer (D-028).
- **Défilement de S1.** Des centaines de semaines : `LazyVStack` obligatoire, cartes précalculées par `cartesSeances` une fois par Vue (pas dans `body`), saut de mois par identifiant de section.
- **Pli.** N1 (radar de 190 pt) + A5 doivent tenir dans 540 pt : à vérifier dès le lot 17, avec un radar plus bas si besoin (taille, pas contenu).
- **Retraits.** Le lot 19 est le seul qui supprime ; tout lot antérieur qui casse un onglet est rejeté.
- **Marquage.** Le marquage (D-020) n'est atteignable que depuis la liste et le journal aujourd'hui : il doit exister dans S3 (lot 16) avant les retraits (lot 19).

## Points de décision restants (avec recommandation, non bloquants)

1. **Types sans ligne dans 04 « Carte de séance »** : `footing-lignes-droites`, `seance-qualite` (D-021), `test`. Recommandé : lignes droites = famille footing (même échantillon, mêmes jauges, même verdict) ; séance qualité estimée = jauges FC moyenne et charge face aux séances qualité, verdict neutre « Répétitions estimées » ; test = course (04 les groupe).
2. **Verdict sans donnée** (footing sans FC, première course sans niveau la veille). Recommandé : pastille neutre, texte « FC absente » ou « Premier repère », jamais un verdict OK par défaut.
3. **Minimum de l'échantillon du volume** (semaine au même jour, 30 jours), non écrit dans 04. Recommandé : 4, comme les séances (`ACCUEIL.minEchantillonVolume`), avec « Norme en cours (n sur 4) ».
4. **Côté de la bande qui colore.** 04 colore toute sortie de bande, mais la bande du sommeil s'arrête au besoin : dormir 8 h pour 7 h 30 serait orange ; de même une VFC haute ou une FC de repos basse, une FC de footing plus basse que d'habitude. Recommandé : `sens` par ligne — volume, D+, VDOT et charge des deux côtés ; VFC, sommeil, EF des footings `.basSeulement` ; FC de repos, FC de footing, FC de fin, découplage `.hautSeulement` ; allure normalisée `.hautSeulement` (plus lent). Le type le prévoit (lot 2), le choix tient en une table.
5. **Jauge « charge » d'une course.** 04 dit « trait : moyenne des séances sous-seuil de l'échantillon » ; la maquette affiche « 2,1× » sans écart, bande 0,8–1,2, orange. Recommandé : la maquette — valeur = charge ÷ moyenne des charges sous-seuil des 56 jours, affichée « 2,1× », trait 1,0, bande = norme de ces charges divisée par leur moyenne, pas d'écart.
6. **Six qualités avec moins de 24 semaines terminées** : `Q` et `Q₀` (12 premières) se recouvrent. Recommandé : axes à « – » et rayon 0,5 tant que `Q` et `Q₀` se recouvrent, sous-titre « face à tes 12 premières semaines » dès qu'ils sont disjoints.
7. **S3 pour les types autres que sous-seuil**, seulement esquissé (« courbes d'allure et de FC, segments »). La Vue ne contient pas les flux. Recommandé : en v1, carte S2, tableau des tours ou répétitions, segments allure marathon et lignes droites déjà dans `SeanceVue` ; les courbes dans un lot ultérieur, qui relit le flux de la séance à la demande (une séance, pas l'historique).
8. **En-tête de semaine : détail ou sélecteur de mois ?** 02 « Règles d'Aujourd'hui » dit que toucher un en-tête ouvre un sélecteur de mois ; 02 « Écrans de détail » et 03 S1 disent qu'il ouvre le détail de la semaine. Recommandé : toucher = détail de la semaine ; sélecteur de mois par un bouton calendrier dans la barre de titre, visible dès que S1 est à l'écran.
9. **Distances de course** (5 km, 10 km, semi, marathon) pour le filtre de N2 et la jauge FC de même distance. Recommandé : la catégorie de D-014 si elle existe ; sinon ±3 % de la distance officielle, « autre » au-delà (hors filtres sauf « Toutes »).
10. **Identifiants de code** : garder `ApercuView` et le dossier `Apercu/` ou créer `Accueil/`. Recommandé : nouveaux fichiers dans `Accueil/`, `ApercuView` supprimée au lot 18 (elle ne garderait rien), `ModeleApercu` réduit à ce qui sert encore.
11. **Toucher une ligne dans une carte qui navigue** (A5, S2) : conflit entre « la ligne affiche sa phrase » et « la carte ouvre l'écran ». Et la ligne Année « ouvre ensuite » Saisons. Recommandé : dans A2 (seule la pastille navigue), toucher une ligne déplie sa phrase, et la phrase de la ligne Année porte un lien « Saisons › » ; dans A5 et S2, toucher navigue, la phrase est lue par VoiceOver et visible dans l'écran de détail. Phrases d'A5 et de S2, non écrites : « norme 44–58 ms » et « {n} footings des 8 dernières semaines, habituel 132–140 bpm ».
12. **Portée de la relecture pour le D+.** Recommandé : clé de ②a (`VERSION_DENIVELE`), une relecture complète, comme D-021. Alternative : ne calculer le D+ que pour les séances nouvelles et laisser « – » ailleurs, sans relecture — moins coûteux, mais une sortie longue ancienne n'aurait jamais de D+ ni de norme.
13. **Profondeur des nuits pour la Résilience.** Recommandé : 450 nuits (fin de `Q₀` + 67 nuits de norme + marge) ; `Emax` de la Résilience se calcule sur ce qui existe, borné par son minimum de 3 ms.
14. **Mention « record » dans Courses.** La maquette l'affiche sur une ligne par distance ; 03 N2 ne la cite pas. Recommandé : la garder (records de 04 « Records », déjà calculés pour P5), sur la course qui détient le record de sa distance.
15. **Semaine qui contient une course** : la maquette remplace la ligne de résumé par « dont course 10 km · 37:40 ». Recommandé : ajouter cette mention après le résumé, sans le remplacer.
16. **« Sem. du … » d'une autre année.** Recommandé : année ajoutée hors année en cours (« Sem. du 29 déc. 2025 »).
17. **Bouton Paramètres dans Progrès.** 02 le place dans la barre d'Aujourd'hui. Recommandé : Aujourd'hui seulement, comme écrit.

## Avancement

| Lot | État | Vérification |
|---|---|---|
| 1 | fait | 403 tests verts (13 nouveaux) ; relu ; 2 corrections (tolérance de distance dans `ACCUEIL`, borne de 3 % testée sur valeur arrondie) |
| 2 | fait | 415 tests verts (12 nouveaux) ; relu ; aucune correction |
| 3 | fait | 433 tests verts (18 nouveaux) ; relu ; 3 corrections (jour A = `vue.J − 1` dans `niveauVDOT` du lot 1, borne A − 364/A − 365, écart % mi-chemin testé au lot 2) |
| 4 | fait | 449 tests verts (16 nouveaux) ; relu ; 1 correction (FC de repos sans norme testée) |
| 5 | fait | 460 tests verts (11 nouveaux) ; oracle intact (0 cas avec altitude : l'adaptateur ne retire rien aujourd'hui) ; relu ; 1 correction (décodage d'un cache sans D+ testé) |
| 6 | fait | 478 tests verts (18 nouveaux) ; relu ; 3 corrections (valeurs précalculées par séance : 3,1 → 2,3 ms en release pour 2 000 séances ; budget testé ; demi-pas du plafond de footing) |
| 7 | fait | 493 tests verts (16 nouveaux, 1 retiré) ; perf 2,2 ms ; relu ; 2 corrections (carte neutre « Sans VDOT » au lieu d'aucune carte, bornes des 56 jours et échantillons vides) |
| 8 | fait | 523 tests verts (30 nouveaux) ; perf 0,12 ms ; relu ; 6 corrections (précisions lues dans `PRECISION`, bornes 23/24 semaines, plafonnement du rayon, semaine partielle, mi-chemins D-015, références vides ; écart d'Efficacité arrondi à 1 %) |
| 9 | fait | 528 tests verts (5 nouveaux) ; relu ; 1 correction (mesure sur 450 nuits, < 1 ms : 0,66 → 0,48 ms par un tableau indexé par jour) |
| 10 | fait | swift test 528 ; xcodebuild test 130 verts (NavigationTests 3 → 10) ; relu ; 2 corrections (verdict de l'Aperçu ouvre `.decision`, test paramétré signal → destination) |
| 11 | fait | swift test 528 ; xcodebuild test 130 verts ; relu ; 1 correction (les 8 signaux en ligne sur l'écran Décision, `ListeSignaux` partagée avec la feuille) |
| 12 | fait | swift test 530 ; xcodebuild test 161 verts (31 nouveaux) ; relu ; 5 corrections (plus de double arrondi de l'écart en %, `point` optionnel, marge d'échelle dans `ACCUEIL`, absence en récupération testée, diff du pbxproj réduit à l'ajout) |
| 13 | fait | swift test 531 ; xcodebuild test 189 verts (35 nouveaux) ; relu ; 4 corrections (`LigneJauge.n` pour « {n} footings des 8 dernières semaines », formats de toutes les jauges testés, borne 365/366 jours, résumé sans sous-seuil testé) |
| 14 | fait | swift test 531 ; xcodebuild test 194 verts (5 fonctions nouvelles) ; relu ; 4 corrections (toucher de la ligne seulement si dépliable, trait bouton explicite, tolérance retirée du test, colonne du libellé compressible : débordement de 0,33 pt corrigé) |
| 15 | fait | swift test 534 ; xcodebuild test 215 verts (21 nouveaux) ; relu ; 3 corrections (records par distance calculés dans JogCore par `recordsParDistance`, sans dépendre d'un 5 km ; bornes D-015 du ton d'un axe ; rayon 0,5 sans écart testé) |
| 16 | fait | swift test 534 ; xcodebuild test 225 verts (10 nouveaux) ; relu ; 3 corrections (cartes mémorisées une fois par Vue dans `ModeleApp.cartes` au lieu d'un index complet par séance ouverte, menu de marquage pur et testé, bornes du tableau et des segments) |
| 17 | fait | swift test 534 ; xcodebuild test 232 verts (14 cas nouveaux) ; relu ; 4 corrections (la bulle ne capte plus les touchers du radar, mesures en `@ScaledMetric`, cadres des étiquettes testés sans recouvrement, trait « sélectionné ») |
| 18 | fait | swift test 534 ; xcodebuild test 243 verts (11 nouveaux) ; relu ; 4 corrections (détail d'une semaine vide, semaines mémorisées par Vue, ordre des blocs lu dans `ModeleAccueil`, `lienSaisons` décidé par le modèle, Vue vide testée) ; 2 essais d'implémentation (le premier n'a rien écrit) |
| 19 | | |
| 20 | | |

## Écarts proposés

- Lot 1 : les VDOT du test 1 du plan (54,2 ; 53,9 ; 53,1) ne suivent pas la formule de Daniels de 04 : elle donne 55,7 (10 km en 37:40), 56,0 (5 km en 18:05), 54,8 (semi en 1:24:30) ; seul le marathon (51,6) concorde. Les tests suivent 04 ; les chiffres de la maquette sont illustratifs.
- Lot 1 : la tolérance des distances (point 9, ±3 %) est `ACCUEIL.toleranceDistanceCourse` et se compare sur l'écart arrondi à 0,01 km (5,15 km est un 5 km, 5,16 km non).
- Lot 1 : `.gitignore` contient `tests/`, qui ignore `Tests/` sur un disque insensible à la casse ; les nouveaux fichiers de test sont ajoutés avec `git add -f`, comme les existants.
- Lot 2 : l'énumération du côté coloré s'appelle `SensHorsBande` (`Sens` existe déjà dans `progression-types.swift`) ; `LigneJauge.enCours` est reporté au lot 3, premier à s'en servir.
- Lot 3 : `Vue.J` est la coupure (le lendemain d'aujourd'hui) ; le jour A vaut `vue.J − 1`. Le plan écrivait « A = vue.J » au lot 1, corrigé ; `niveauVDOT` est corrigé dans ce commit.
- Lot 3 : `LigneJauge.enCours` est une struct `MentionEnCours { n, sur }` (un tuple n'est pas `Equatable`) ; l'écart en % se calcule `(v − t) ÷ t × 100` pour que 209 face à 200 donne bien +5 (D-015).
- Lot 4 : « Norme en cours (n sur 4) » ne s'affiche que sur la VFC ; `PointRecuperation` ne compte pas les nuits de la norme FC (l'ajouter changerait la forme de la Vue). La semaine de A est « en cours » même quand A est un dimanche.
- Lot 5 : lissage de 30 s = moyenne sur fenêtre pleine, régression linéaire aux bords du tracé (une moyenne y perdrait la moitié de la pente). Le test « bruit ±2 m à 1 Hz » utilise un motif alterné déterministe : un bruit aléatoire laisse ≈ 13 m sur 10 min après tout lissage de 30 s.
- Lot 5 : aucun cas d'oracle n'a d'altitude (`alt_m` nul partout) : l'adaptateur `sansDPlusDesGoldens` est en place mais ne retire rien. `dPlus_m` est aussi sur `SeanceIntrinseque` (ce que ②a mémorise), et `VERSION_DENIVELE` entre aussi dans l'empreinte de la Vue (sinon une Vue en cache sans D+ serait servie).
- Lot 6 : l'allure normalisée lit `refHr` et `paceHrK` dans `parametresEnVigueur.globaux` (globaux selon D-006, absents de `ParamsDates`) ; le plafond et les seuils sous-seuil sont datés. Un sous-seuil sans répétition a un verdict neutre « Répétitions absentes » (point 2). Le minimum de 4 s'applique par jauge (l'EF peut rester « en cours » quand la FC a sa norme).
- Lot 7 : la FC d'une course se compare aux courses et tests de même distance antérieurs, sans limite de 56 jours, minimum `ACCUEIL.minCoursesMemeDistance`, des deux côtés (non listé au point 4). La charge « × » sans norme n'a pas de valeur (« Norme en cours »). Une course sans VDOT calculable a une carte neutre « Sans VDOT ».
- Lot 8 : la première semaine partielle de l'historique n'entre ni dans Q ni dans Q₀ ; Emax inclut la fenêtre courante (le rayon reste dans [0, 1]). `PointNormeVFC` est défini provisoirement dans `niveau-qualites.swift`, à déplacer au lot 9.
- Lot 9 : `VERSION_RECUPERATION` passe à 2 pour qu'un relevé de 250 nuits soit relu une fois à 450 (sinon il ne se rattraperait jamais). `charger()` rejette une Vue d'un autre `formatVersion` (recalcul une fois). `milieuxNormeVFC` est un tableau non optionnel (vide sans norme).
- Lot 10 : `.courses`, `.seance` et `.semaine` affichent « Bientôt disponible » jusqu'à leur lot (aucun bouton n'y mène). Depuis Charge ou Historique (sans pile avant le lot 19), `ouvrir` bascule sur Aujourd'hui. La feuille des signaux gagne un bouton « Voir le détail » par signal. `ancre` est écrite mais pas encore consommée.
- Lot 10 : `xcodebuild` réécrit parfois `project.pbxproj` (ordre, ligne `TEST_HOST`) ; il est restauré après chaque build.
- Lot 11 : `RecuperationChargeView` citée au plan n'existe pas ; `EcranRecuperation` réutilise `RecuperationView` (R1–R7) sous l'en-tête de la nuit (A6). La feuille « Cette nuit » (`FeuilleNuitView`) est retirée : son contenu est l'en-tête de l'écran. Aucun test nouveau : la destination de chaque signal est testée au lot 10.
- À faire par l'utilisateur (lot 11) : captures des écrans Décision et Récupération, clair et sombre.
- Lot 12 : `LigneJaugeModele.point` est `Double?` (nil sans valeur, la vue n'a rien à tester) au lieu de `Double`. Les milliers gardent l'espace insécable U+00A0 des formateurs existants (`ModeleApercu`), pas l'espace fine. Phrases non écrites au plan : « norme 44–58 ms », « besoin 7 h 30 », « Norme en cours (n sur 21) » pour la VFC (minimum de 21 nuits). Le lien « Saisons › » (point 11) est porté par la vue.
- Lot 13 : le marquage (D-020, `OptionMarquage`) passe de `ModeleApercu` à `ModeleSeances` ; les appels de l'Aperçu et de l'Historique sont renommés, leurs tests déplacés sans changer d'assertion. `enTete` reçoit les séances pour nommer la course (point 15). `LigneJauge` gagne `n` (taille de l'échantillon), pour la phrase de S2 (point 11).
- Lot 13 : le résumé de semaine omet « · N seuils · X′ sous-seuil (P %) » sans séance sous-seuil (sinon « 0 seuil · 0′ (0 %) »). Une séance de plus de 365 jours porte l'année. La séance qualité prend la couleur « au-dessus du seuil », comme courses et tests.
- Lot 14 : VoiceOver vérifié par la lecture composée (`lecture`), pas par l'arbre d'accessibilité (non observable depuis l'hôte de test) ; le trait bouton est posé explicitement.
- À faire par l'utilisateur (lot 14) : relire les composants dans les `#Preview` (clair, sombre, XXL) et à VoiceOver.
- Lot 15 : le record de Courses (point 14) vient de `recordsParDistance` (JogCore, meilleur temps par distance, la plus ancienne à égalité), et non du `NiveauEstime` de P5, qui n'existe qu'avec un 5 km. L'en-tête porte un `ton` (écart nul neutre) au lieu de `ecartPositif` ; chaque axe porte `comparaison` et `accessibilite`.
- Lot 16 : S3 v1 (point 7) montre la carte S2, le tableau des répétitions (même calcul que P4, par `seanceSousSeuil` extraite de `derniereSeanceSousSeuil` sans changer son comportement) et les segments en texte, sans sucettes ni courbes. Le marquage (D-020) est un menu dans la barre de S3. Un `mp_min` entre 0 et 0,5 s'afficherait « 0 min à allure marathon » (non corrigé, cas rare).
- À faire par l'utilisateur (lot 16) : captures de S3 et de N2, clair, sombre et XXL.
- Lot 17 : le radar tient jusqu'à XXL (limite de Dynamic Type de 02) ; aux tailles d'accessibilité, les étiquettes se recoupent (non testé au-delà de XXL). Le toucher de la bulle n'est pas testé (geste SwiftUI non observable en test unitaire).
- À faire par l'utilisateur (lot 17) : captures de la carte Niveau à 320 et 440 pt, en XXL, clair et sombre ; vérifier au doigt bulle, étiquettes et ouverture de Courses.
- Lot 18 : l'ancien `AccueilView` (écran de première ouverture) devient `PremiereOuvertureView` pour libérer le nom. `ApercuView` et `CarteRecuperationView` sont retirées (point 10) ; `TuilesRecuperation` en est extraite (encore utilisée par les tests de récupération). Le bouton « Tendances » de l'ancienne carte de récupération n'est pas repris (absent de 03 A5).
- Lot 18 : sans séance, la semaine en cours apparaît quand même (« aucune séance ») ; le détail d'une semaine vide est une ligne vide. Le sélecteur de mois (point 8) est un menu derrière un bouton calendrier dans la barre de titre.
- À faire par l'utilisateur (lot 18) : captures d'Aujourd'hui à 320, 393 et 440 pt, clair et sombre ; vérifier le pli (N1 + A5 visibles) sur iPhone, le défilement de S1 et VoiceOver.
