// Adaptateur de l’archive de compte Strava (ADR 0003, 0004, 0010). Il ne lit que activities.csv et les
// fichiers activities/ que ce CSV cite. Les autres entrées du ZIP (messages, contacts, connexions,
// médias) ne sont jamais décompressées : le filtre de fflate les écarte avant toute lecture.
// Chaque fichier d’activité est décompressé seul, dans son propre try : une entrée corrompue, trop
// grosse ou absente ne bloque pas les autres (lots.md, lot 1.3).
import { Gunzip, unzipSync } from 'fflate';
import type { OptionsPivot } from '../commun';
import type { ActivitePivot } from '../../core/types';
import { fitVersPivot } from '../fit/versPivot';
import { gpxVersPivot } from '../gpx/versPivot';
import { tcxVersPivot } from '../tcx/versPivot';
import { repererColonnes, type Colonnes } from './colonnes';
import { lireCsv } from './csv';
import { ErreurArchive } from './erreurs';

export { ErreurArchive } from './erreurs';

const FICHIER_INDEX = 'activities.csv';
const DOSSIER = 'activities/';
// Types de l’export (fr et en) qui sont des courses. Le lecteur confirme ensuite le sport (ADR 0003).
const TYPES_COURSE = new Set(['Course à pied', 'Run', 'Course sur tapis', 'Trail', 'Virtual Run']);
const VALEURS_COMPETITION = new Set(['1', '1.0', 'true', 'True']);
// Limites contre les archives piégées (ZIP ou gzip qui gonflent). Décompressé, un fichier d’activité
// dépasse rarement quelques Mo ; l’index CSV d’un export réel fait quelques centaines de Ko.
const LIMITE_FICHIER_OCTETS = 50 * 1024 * 1024;
const LIMITE_CSV_OCTETS = 20 * 1024 * 1024;

export type FormatBrut = 'fit' | 'gpx' | 'tcx';

export interface OptionsArchive {
  /** Décalage de secours, en minutes, pour un fichier sans décalage (ADR 0007). */
  decalageSecours?: (debutUtc_ms: number) => number;
  /** Appelée après chaque fichier cité pour une course : fichiers faits, total. */
  surProgression?: (fait: number, total: number) => void;
}

export interface ResultatArchive {
  pivots: ActivitePivot[];
  /** Octets d’origine des activités retenues, tels que stockés (un .gz reste compressé). */
  bruts: { cleSource: string; format: FormatBrut; compresse: boolean; octets: Uint8Array }[];
  ignorees: { cleSource: string; raison: 'pas-une-course'; type: string }[];
  /** Lignes ou fichiers qu’on n’a pas pu lire. Chaque entrée porte la clé de son activité. */
  illisibles: { cleSource: string; fichier: string; message: string }[];
  /** Fichiers cités par activities.csv et absents du ZIP, avec la clé de leur activité. */
  manquants: { cleSource: string; fichier: string }[];
}

interface Activite {
  cleSource: string;
  nom: string;
  type: string;
  fichier: string;
  competition: boolean;
}

interface Extraction {
  octets: Uint8Array | undefined;
  /** Vrai quand l’entrée dépasse la limite : elle n’a pas été décompressée. */
  tropGrande: boolean;
}

export async function lireArchiveStrava(
  zip: Uint8Array,
  options: OptionsArchive = {},
): Promise<ResultatArchive> {
  const index = extraire(zip, FICHIER_INDEX, LIMITE_CSV_OCTETS);
  if (index.tropGrande) {
    throw new ErreurArchive(`${FICHIER_INDEX} est trop volumineux (plus de 20 Mo)`);
  }
  if (index.octets === undefined) throw new ErreurArchive(`${FICHIER_INDEX} absent de l’archive`);

  const [entetes = [], ...lignes] = lireCsv(new TextDecoder().decode(index.octets));
  const colonnes = repererColonnes(entetes);

  const resultat: ResultatArchive = { pivots: [], bruts: [], ignorees: [], illisibles: [], manquants: [] };
  const aLire: Activite[] = [];
  const clesVues = new Set<string>();
  for (const ligne of lignes) {
    const valeur = (indice: number): string => (ligne[indice] ?? '').trim();
    const cleSource = `strava:${valeur(colonnes.id)}`;
    if (ligne.length <= Math.max(colonnes.id, colonnes.fichier)) {
      illisible(resultat, cleSource, '', 'ligne trop courte pour contenir ses colonnes obligatoires');
      continue;
    }
    if (valeur(colonnes.id) === '') {
      illisible(resultat, 'strava:', valeur(colonnes.fichier), 'ID manquant dans activities.csv');
      continue;
    }
    if (clesVues.has(cleSource)) {
      illisible(resultat, cleSource, valeur(colonnes.fichier), 'ID en double : la première ligne est gardée');
      continue;
    }
    clesVues.add(cleSource);

    const activite = versActivite(ligne, colonnes);
    // Pré-filtre sur le CSV : un fichier de non-course n’est pas décompressé.
    if (colonnes.type !== undefined && !TYPES_COURSE.has(activite.type)) {
      resultat.ignorees.push({ cleSource: activite.cleSource, raison: 'pas-une-course', type: activite.type });
    } else {
      aLire.push(activite);
    }
  }

  for (const [k, activite] of aLire.entries()) {
    await traiterFichier(activite, zip, options, resultat);
    options.surProgression?.(k + 1, aLire.length);
  }
  return resultat;
}

function illisible(resultat: ResultatArchive, cleSource: string, fichier: string, message: string): void {
  resultat.illisibles.push({ cleSource, fichier, message });
}

function versActivite(ligne: readonly string[], colonnes: Colonnes): Activite {
  const valeur = (indice: number | undefined): string =>
    indice === undefined ? '' : (ligne[indice] ?? '');
  return {
    cleSource: `strava:${valeur(colonnes.id).trim()}`,
    nom: valeur(colonnes.nom),
    type: valeur(colonnes.type).trim(),
    fichier: valeur(colonnes.fichier).trim(),
    competition: VALEURS_COMPETITION.has(valeur(colonnes.competition).trim()),
  };
}

/**
 * Décompresse une seule entrée du ZIP. Le filtre refuse une entrée dont la taille déclarée dépasse
 * la limite, sans la décompresser ; une entrée corrompue lève une erreur, traitée par l’appelant.
 */
function extraire(zip: Uint8Array, nom: string, limite: number): Extraction {
  let tropGrande = false;
  const sortie = unzipSync(zip, {
    filter: (f) => {
      if (f.name !== nom) return false;
      if (f.originalSize > limite) {
        tropGrande = true;
        return false;
      }
      return true;
    },
  });
  const octets = Object.hasOwn(sortie, nom) ? sortie[nom] : undefined;
  // Contrôle sur la longueur réelle, en plus de la taille déclarée.
  if (octets !== undefined && octets.length > limite) return { octets: undefined, tropGrande: true };
  return { octets, tropGrande };
}

async function traiterFichier(
  activite: Activite,
  zip: Uint8Array,
  options: OptionsArchive,
  resultat: ResultatArchive,
): Promise<void> {
  const { cleSource, fichier } = activite;
  const echec = (message: string): void => {
    illisible(resultat, cleSource, fichier, message);
  };

  if (fichier === '') return echec('nom de fichier vide dans activities.csv');
  if (!fichier.startsWith(DOSSIER)) return echec(`fichier hors du dossier ${DOSSIER}`);

  try {
    const format = formatDe(fichier);
    const compresse = fichier.endsWith('.gz');
    const { octets, tropGrande } = extraire(zip, fichier, LIMITE_FICHIER_OCTETS);
    if (tropGrande) return echec('fichier trop volumineux (plus de 50 Mo)');
    if (octets === undefined) {
      resultat.manquants.push({ cleSource, fichier });
      return;
    }

    const donnees = compresse ? decompresserBornee(octets) : octets;
    const lu = lireFormat(format, donnees, {
      cleSource,
      source: 'strava-archive',
      nom: activite.nom === '' ? null : activite.nom,
      competition: activite.competition,
      empreinteBrute: await empreinteBrute(octets, activite.nom, activite.competition),
      decalageSecours: options.decalageSecours,
    });
    if ('ignoree' in lu) {
      resultat.ignorees.push({ cleSource, raison: 'pas-une-course', type: activite.type });
      return;
    }
    resultat.pivots.push(lu);
    resultat.bruts.push({ cleSource, format, compresse, octets });
  } catch (erreur) {
    echec(erreur instanceof Error ? erreur.message : String(erreur));
  }
}

/**
 * Décompresse un .gz en flux et s’arrête dès que la sortie dépasse la limite : une archive piégée
 * ne remplit donc pas la mémoire.
 */
function decompresserBornee(octets: Uint8Array): Uint8Array {
  const morceaux: Uint8Array[] = [];
  let total = 0;
  const gunzip = new Gunzip({}, (morceau) => {
    total += morceau.length;
    if (total > LIMITE_FICHIER_OCTETS) {
      throw new ErreurArchive('fichier trop volumineux une fois décompressé (plus de 50 Mo)');
    }
    morceaux.push(morceau);
  });
  gunzip.push(octets, true);

  const sortie = new Uint8Array(total);
  let position = 0;
  for (const morceau of morceaux) {
    sortie.set(morceau, position);
    position += morceau.length;
  }
  return sortie;
}

function formatDe(fichier: string): FormatBrut {
  const base = fichier.endsWith('.gz') ? fichier.slice(0, -'.gz'.length) : fichier;
  const extension = base.slice(base.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'fit' || extension === 'gpx' || extension === 'tcx') return extension;
  throw new ErreurArchive(`format non pris en charge : ${fichier}`);
}

function lireFormat(format: FormatBrut, donnees: Uint8Array, options: OptionsPivot) {
  switch (format) {
    case 'fit':
      return fitVersPivot(donnees, options);
    case 'gpx':
      return gpxVersPivot(new TextDecoder().decode(donnees), options);
    case 'tcx':
      return tcxVersPivot(new TextDecoder().decode(donnees), options);
  }
}

// ADR 0004 : SHA-256 des octets d’origine (.gz compris), suivis de « \0 », du nom, « \0 » et du marquage.
async function empreinteBrute(octets: Uint8Array, nom: string, competition: boolean): Promise<string> {
  const suffixe = new TextEncoder().encode(`\u0000${nom}\u0000${competition}`);
  const concatene = new Uint8Array(octets.length + suffixe.length);
  concatene.set(octets, 0);
  concatene.set(suffixe, octets.length);
  const condense = await crypto.subtle.digest('SHA-256', concatene);
  return [...new Uint8Array(condense)].map((o) => o.toString(16).padStart(2, '0')).join('');
}
