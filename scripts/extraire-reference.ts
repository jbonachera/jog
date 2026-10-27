// Séances de référence pour régler le détecteur de répétitions estimées par la FC (Swift).
//
// Le script lit l'archive désignée par JOG_EXPORT avec le lecteur d'archive TS existant, calcule pour chaque
// activité la séance intrinsèque (calculerSeanceIntrinseque) puis le type (classerSeances) avec les paramètres de
// JOG_PARAMS (fichier JSON au format Parametres) ou, à défaut, parametresDefaut(). Il écrit une fiche JSON par
// activité retenue dans local-data/reference/<n>.json, plus local-data/reference/index.json. Le dossier est ignoré
// par git. Seules les activités de 20 min au moins, avec une FC sur au moins 80 % des échantillons rééchantillonnés,
// sont écrites. Aucune coordonnée, aucun nom d'activité, aucun identifiant d'archive : seul le numéro n est gardé.
//
// Les répétitions de référence sont celles que le moteur calcule à partir des tours (chemin par les tours). Chaque
// répétition porte son chemin : « tours » quand toutes ses plages coïncident avec les bornes d'un tour, « flux » sinon
// (repli du moteur quand aucun tour ne donne de série). Le champ `cheminRepetitions` de la fiche le dit.
//
// Lancement : `JOG_EXPORT=/chemin/export.zip npm run reference:extraire`. Facultatif : JOG_PARAMS.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireArchiveStrava } from '../src/adapters/strava-archive/lecteur';
import { calculerSeanceIntrinseque, classerSeances, miseEnForme } from '../src/core/seance';
import { detecterRepetitions } from '../src/core/seance/repetitions';
import { indexerParametres, parametresDefaut } from '../src/core/parametres';
import { validerParametres } from '../src/core/validationParametres';
import { dateCivileAppareil, fuseauAppareil } from '../src/worker/horloge';
import type { GrilleSeance } from '../src/core/seance/miseEnForme';
import type { Plage } from '../src/core/seance/repetitions';
import type { ActivitePivot, DateCivile, ParamsDates, Parametres, Repetition, SeanceIntrinseque, Tour, TypeSeance } from '../src/core/types';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_SORTIE = resolve(RACINE, 'local-data/reference');
const DUREE_MIN_S = 20 * 60;
const COUVERTURE_FC_MIN = 0.8;
const DECIMALES_FLUX = 3;

type CheminRepetitions = 'tours' | 'flux' | 'aucun';

interface RepetitionReference extends Repetition {
  iDebut: number;
  iFin: number;
}

interface FicheReference {
  index: number;
  dateLocale: DateCivile;
  source: ActivitePivot['source'];
  type: TypeSeance;
  avecToursManuels: boolean;
  nbTours: number;
  flux: {
    t_s: (number | null)[];
    dist_m: (number | null)[];
    fc_bpm: (number | null)[];
    alt_m: (number | null)[] | null;
    vitesse_ms: (number | null)[] | null;
  };
  tours: { iDebut: number; iFin: number; declenchement: Tour['declenchement']; intensite: string | null }[];
  repetitionsReference: RepetitionReference[];
  cheminRepetitions: CheminRepetitions;
  format: string | null;
  duree_min: number;
  km: number;
}

interface EntreeIndex {
  index: number;
  type: TypeSeance;
  avecToursManuels: boolean;
  nbRepetitions: number;
  duree_min: number;
  km: number;
  a_fc: boolean;
}

/** Point d'entrée appelé par scripts/lancer-ts.mjs. Affiche seulement des agrégats, jamais de données d'activité. */
export async function principal(): Promise<number> {
  const env = process.env;
  const exportChemin = env['JOG_EXPORT']?.trim();
  if (exportChemin === undefined || exportChemin === '') {
    throw new Error(
      "JOG_EXPORT doit désigner l'archive Strava (export_*.zip). Exemple : JOG_EXPORT=/chemin/export.zip npm run reference:extraire",
    );
  }
  const parametres = await lireParametresEntree(env['JOG_PARAMS']?.trim());
  const index = indexerParametres(parametres);

  const archive = await lireArchiveStrava(new Uint8Array(await readFile(exportChemin)));
  const pivots = [...archive.pivots].sort((a, b) => a.debutUtc - b.debutUtc || (a.cleSource < b.cleSource ? -1 : 1));

  // Le classement a besoin de toute la semaine (sorties longues, médiane des footings) : on classe tout, puis on filtre.
  const intrinseques: SeanceIntrinseque[] = pivots.map((p) => calculerSeanceIntrinseque(p, index.auJour(p.dateLocale)));
  const seances = classerSeances(intrinseques);
  const pivotParCle = new Map(pivots.map((p) => [p.cleSource, p] as const));

  const fiches: FicheReference[] = [];
  let ecartesDuree = 0;
  let ecartesFc = 0;
  for (const seance of seances) {
    const pivot = pivotParCle.get(seance.cleSource);
    if (pivot === undefined) continue;
    if (pivot.duree_s < DUREE_MIN_S) {
      ecartesDuree += 1;
      continue;
    }
    const grille = miseEnForme(pivot);
    if (couvertureFc(grille) < COUVERTURE_FC_MIN) {
      ecartesFc += 1;
      continue;
    }
    fiches.push(construireFiche(pivot, seance.type, seance, index.auJour(pivot.dateLocale), grille));
  }

  await mkdir(DOSSIER_SORTIE, { recursive: true });
  await supprimerAnciennesFiches(DOSSIER_SORTIE);

  const entrees: EntreeIndex[] = [];
  let octets = 0;
  for (const [k, fiche] of fiches.entries()) {
    const numero = k + 1;
    const fichier = { ...fiche, index: numero };
    const contenu = JSON.stringify(fichier);
    const chemin = resolve(DOSSIER_SORTIE, `${numero}.json`);
    await writeFile(chemin, contenu, 'utf8');
    octets += Buffer.byteLength(contenu, 'utf8');
    entrees.push({
      index: numero,
      type: fiche.type,
      avecToursManuels: fiche.avecToursManuels,
      nbRepetitions: fiche.repetitionsReference.length,
      duree_min: fiche.duree_min,
      km: fiche.km,
      a_fc: true,
    });
  }
  const contenuIndex = JSON.stringify(entrees);
  await writeFile(resolve(DOSSIER_SORTIE, 'index.json'), contenuIndex, 'utf8');
  octets += Buffer.byteLength(contenuIndex, 'utf8');

  afficherBilan(archive.pivots.length, archive.ignorees.length, archive.illisibles.length, ecartesDuree, ecartesFc, entrees, octets);
  return 0;
}

// ── Entrées ──────────────────────────────────────────────────────────────────

async function lireParametresEntree(chemin: string | undefined): Promise<Parametres> {
  if (chemin === undefined || chemin === '') return parametresDefaut();
  let objet: unknown;
  try {
    objet = JSON.parse(await readFile(chemin, 'utf8'));
  } catch {
    throw new Error('JOG_PARAMS : le fichier n’est pas du JSON valide.');
  }
  const parametres = objet as Parametres;
  const J: DateCivile = dateCivileAppareil(Date.now(), fuseauAppareil());
  const verdict = validerParametres(parametres, J);
  if (!verdict.ok) throw new Error(`JOG_PARAMS invalide (${verdict.champ}) : ${verdict.message}`);
  return parametres;
}

// ── Fiches ───────────────────────────────────────────────────────────────────

/** Part des échantillons rééchantillonnés (1 s, D-013) qui ont une FC. */
function couvertureFc(grille: GrilleSeance): number {
  if (grille.n === 0) return 0;
  let avec = 0;
  for (let i = 0; i < grille.n; i++) {
    if (!Number.isNaN(grille.fc_bpm[i] ?? Number.NaN)) avec += 1;
  }
  return avec / grille.n;
}

function construireFiche(
  pivot: ActivitePivot,
  type: TypeSeance,
  seance: SeanceIntrinseque,
  parametres: ParamsDates,
  grille: GrilleSeance,
): FicheReference {
  const reps = detecterRepetitions(grille, pivot.tours, parametres);
  const repetitionsReference = reps.repetitions.map((r, k): RepetitionReference => {
    const plage: Plage | undefined = reps.plages[k];
    return { ...r, iDebut: plage?.a ?? 0, iFin: plage?.b ?? 0 };
  });
  return {
    index: 0,
    dateLocale: pivot.dateLocale,
    source: pivot.source,
    type,
    avecToursManuels: pivot.tours.filter((t) => t.declenchement === 'manuel').length >= 2,
    nbTours: pivot.tours.length,
    flux: {
      t_s: colonne(pivot.flux.t_s),
      dist_m: colonne(pivot.flux.dist_m),
      fc_bpm: colonne(pivot.flux.fc_bpm ?? new Float32Array(pivot.flux.t_s.length).fill(Number.NaN)),
      alt_m: pivot.flux.alt_m === null ? null : colonne(pivot.flux.alt_m),
      vitesse_ms: pivot.flux.vitesse_ms === null ? null : colonne(pivot.flux.vitesse_ms),
    },
    tours: pivot.tours.map((t) => ({
      iDebut: t.iDebut,
      iFin: t.iFin,
      declenchement: t.declenchement,
      intensite: t.intensite ?? null,
    })),
    repetitionsReference,
    cheminRepetitions: cheminDe(pivot.tours, reps.plages, grille.n),
    format: seance.format,
    duree_min: arrondir(pivot.duree_s / 60, 2),
    km: arrondir(seance.km, 2),
  };
}

/** Les plages du chemin par les tours sont exactement les bornes des tours (non fusionnées). */
function cheminDe(tours: readonly Tour[], plages: readonly Plage[], n: number): CheminRepetitions {
  if (plages.length === 0) return 'aucun';
  const bornes = new Set(tours.map((t) => `${Math.max(0, t.iDebut)}-${Math.min(n - 1, t.iFin)}`));
  return plages.every((p) => bornes.has(`${p.a}-${p.b}`)) ? 'tours' : 'flux';
}

function colonne(valeurs: Float32Array): (number | null)[] {
  return Array.from(valeurs, (v) => (Number.isFinite(v) ? Number(v.toFixed(DECIMALES_FLUX)) : null));
}

function arrondir(valeur: number, decimales: number): number {
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
}

/** Retire les fiches d'une extraction précédente (n.json et index.json), sans toucher aux autres fichiers. */
async function supprimerAnciennesFiches(dossier: string): Promise<void> {
  for (const nom of await readdir(dossier)) {
    if (/^\d+\.json$/.test(nom) || nom === 'index.json') await rm(resolve(dossier, nom));
  }
}

// ── Bilan (agrégats seulement) ───────────────────────────────────────────────

function afficherBilan(
  lisibles: number,
  ignorees: number,
  illisibles: number,
  ecartesDuree: number,
  ecartesFc: number,
  entrees: EntreeIndex[],
  octets: number,
): void {
  const parType = new Map<TypeSeance, number>();
  for (const e of entrees) parType.set(e.type, (parType.get(e.type) ?? 0) + 1);
  const manuels = entrees.filter((e) => e.avecToursManuels).length;
  const repetitions = entrees.reduce((s, e) => s + e.nbRepetitions, 0);
  console.log(`Activités de course lues : ${lisibles} ; ignorées (non-course) : ${ignorees} ; illisibles : ${illisibles}.`);
  console.log(`Écartées : ${ecartesDuree} sous 20 min, ${ecartesFc} sans FC suffisante (80 %).`);
  console.log(`Activités retenues : ${entrees.length}.`);
  for (const [type, nombre] of [...parType].sort((a, b) => b[1] - a[1])) console.log(`  ${type} : ${nombre}`);
  console.log(`Avec au moins 2 tours manuels : ${manuels}.`);
  console.log(`Répétitions de référence au total : ${repetitions}.`);
  console.log(`Taille totale écrite : ${(octets / 1024 / 1024).toFixed(1)} Mo dans local-data/reference/.`);
}
