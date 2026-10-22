// Adaptateur TCX : un fichier .tcx de course devient un ActivitePivot (ADR 0003).
// Les tours TCX (Lap) donnent des indices dans les trackpoints. Latitude et longitude ne sont pas lues.
import { dateLocale } from '../../core/dates';
import type { ActivitePivot, Declenchement, Flux, IntensiteTour, Tour } from '../../core/types';
import {
  decalageDeSecours,
  derniereMesure,
  fcPlausible,
  instantAvecFuseau,
  nombreOuNaN,
  pasMedianFc,
  regrouperParInstant,
  toutAbsent,
  VERSION_ADAPTATEUR,
  type GroupeInstant,
  type OptionsPivot,
} from '../commun';
import {
  attribut,
  chemin,
  descendants,
  enfant,
  lireXml,
  nomLocal,
  texteDe,
  type NoeudXml,
} from '../xml/lecteur';

export type { OptionsPivot } from '../commun';

export class ErreurTcx extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurTcx';
  }
}

interface BorneTour {
  rang: number;
  noeud: NoeudXml;
  iDebut: number;
  iFin: number;
}

export type ResultatTcx =
  | (ActivitePivot & { decalageInconnu: true; typeSuppose?: true })
  | { ignoree: 'pas-une-course' };

const DECLENCHEMENTS = new Map<string, Declenchement>([
  ['Manual', 'manuel'],
  ['Distance', 'distance'],
  ['Time', 'temps'],
  ['Location', 'position'],
]);

const INTENSITES = new Map<string, IntensiteTour>([
  ['Active', 'actif'],
  ['Resting', 'repos'],
]);

interface PointTcx {
  temps: number; // ms depuis epoch
  dist: number; // NaN si absente
  alt: number;
  fc: number;
  vitesse: number;
  tour: number; // rang du Lap qui contient le trackpoint
}

export function tcxVersPivot(texte: string, options: OptionsPivot): ResultatTcx {
  const racine = lireXml(texte);
  if (nomLocal(racine.nom) !== 'TrainingCenterDatabase') {
    throw new ErreurTcx(`élément racine <TrainingCenterDatabase> attendu, trouvé <${racine.nom}>`);
  }

  const activites = descendants(racine, 'Activity');
  if (activites.length === 0) throw new ErreurTcx('aucune activité (Activity) dans le fichier');
  // Décision de lot 1.2 : la première activité Running ; à défaut, la première sans Sport, supposée
  // course ; sinon le fichier n'a pas de course.
  const courue = activites.find((a) => (attribut(a, 'Sport') ?? '').toLowerCase() === 'running');
  const sansSport = activites.find((a) => attribut(a, 'Sport') === undefined);
  const activite = courue ?? sansSport;
  if (activite === undefined) return { ignoree: 'pas-une-course' };
  const typeSuppose = courue === undefined;

  const tours = descendants(activite, 'Lap');
  const points: PointTcx[] = [];
  tours.forEach((tour, rang) => {
    for (const tp of descendants(tour, 'Trackpoint')) {
      const point = lirePoint(tp);
      if (point !== undefined) points.push({ ...point, tour: rang });
    }
  });
  if (points.length === 0) throw new ErreurTcx('aucun trackpoint horodaté (Lap/Track/Trackpoint)');

  // Début : StartTime du premier tour, sinon l'instant le plus ancien. Les points antérieurs sont
  // écartés (D2), comme pour le FIT.
  const debutLu = instantAvecFuseau(attribut(tours[0] ?? activite, 'StartTime') ?? '');
  const debut = Number.isNaN(debutLu)
    ? points.reduce((m, p) => Math.min(m, p.temps), Number.POSITIVE_INFINITY)
    : debutLu;

  // D2 : tri stable par instant, fusion des instants égaux.
  const groupes = regrouperParInstant(
    points.map((p) => p.temps),
    debut,
  );
  const n = groupes.length;
  if (n === 0) throw new ErreurTcx('aucun trackpoint après le début de l’activité (StartTime)');
  const tSec = new Float32Array(n);
  const dist = new Float32Array(n);
  const fc = new Float32Array(n);
  const alt = new Float32Array(n);
  const vitesse = new Float32Array(n);
  const groupeDuPoint = new Int32Array(points.length).fill(-1);

  groupes.forEach((groupe: GroupeInstant, g) => {
    const fusion = fusionner(groupe, points);
    tSec[g] = (groupe.instant - debut) / 1000;
    dist[g] = fusion.dist;
    fc[g] = fusion.fc;
    alt[g] = fusion.alt;
    vitesse[g] = fusion.vitesse;
    for (const k of groupe.indices) groupeDuPoint[k] = g;
  });

  const flux: Flux = {
    t_s: tSec,
    dist_m: dist,
    fc_bpm: toutAbsent(fc) ? null : fc,
    alt_m: toutAbsent(alt) ? null : alt,
    vitesse_ms: toutAbsent(vitesse) ? null : vitesse,
  };

  // Tours : chaque Lap couvre les groupes issus de ses trackpoints (indices après tri, D2).
  const bornes = new Map<number, BorneTour>();
  points.forEach((p, k) => {
    const g = groupeDuPoint[k] ?? -1;
    const noeud = tours[p.tour];
    if (g < 0 || noeud === undefined) return;
    const borne = bornes.get(p.tour);
    if (borne === undefined) bornes.set(p.tour, { rang: p.tour, noeud, iDebut: g, iFin: g });
    else {
      borne.iDebut = Math.min(borne.iDebut, g);
      borne.iFin = Math.max(borne.iFin, g);
    }
  });

  const decalageLocal_min = decalageDeSecours(options, debut);
  const resultat: ActivitePivot & { decalageInconnu: true; typeSuppose?: true } = {
    cleSource: options.cleSource,
    source: options.source,
    versionAdaptateur: VERSION_ADAPTATEUR,
    empreinteBrute: options.empreinteBrute,
    debutUtc: debut,
    decalageLocal_min,
    dateLocale: dateLocale(debut, decalageLocal_min),
    duree_s: tSec[n - 1] ?? 0,
    distance_m: derniereMesure(dist),
    nom: options.nom,
    competition: options.competition,
    sousType: 'inconnu',
    pasFC_s: pasMedianFc(fc, tSec),
    flux,
    tours: [...bornes.values()]
      .sort((a, b) => a.rang - b.rang)
      .map(versTour),
    decalageInconnu: true,
  };
  if (typeSuppose) resultat.typeSuppose = true;
  return resultat;
}

// Valeurs d'un instant : dernière valeur valide de chaque colonne, dans l'ordre du fichier (D2).
function fusionner(groupe: GroupeInstant, points: readonly PointTcx[]) {
  const fusion = { dist: Number.NaN, fc: Number.NaN, alt: Number.NaN, vitesse: Number.NaN };
  for (const k of groupe.indices) {
    const p = points[k];
    if (p === undefined) continue;
    if (!Number.isNaN(p.dist)) fusion.dist = p.dist;
    if (!Number.isNaN(p.fc)) fusion.fc = p.fc;
    if (!Number.isNaN(p.alt)) fusion.alt = p.alt;
    if (!Number.isNaN(p.vitesse)) fusion.vitesse = p.vitesse;
  }
  return fusion;
}

// Un trackpoint sans horodatage avec fuseau ne peut pas être placé dans le temps : il est ignoré.
function lirePoint(tp: NoeudXml): Omit<PointTcx, 'tour'> | undefined {
  const temps = instantAvecFuseau(texteDe(enfant(tp, 'Time')));
  if (Number.isNaN(temps)) return undefined;
  return {
    temps,
    dist: nombreOuNaN(texteDe(enfant(tp, 'DistanceMeters'))),
    alt: nombreOuNaN(texteDe(enfant(tp, 'AltitudeMeters'))),
    fc: fcPlausible(nombreOuNaN(texteDe(chemin(tp, ['HeartRateBpm', 'Value'])))),
    vitesse: nombreOuNaN(texteDe(chemin(tp, ['Extensions', 'TPX', 'Speed']))),
  };
}

function versTour(borne: BorneTour): Tour {
  const declenchement = DECLENCHEMENTS.get(texteDe(enfant(borne.noeud, 'TriggerMethod'))) ?? 'inconnu';
  const intensite = INTENSITES.get(texteDe(enfant(borne.noeud, 'Intensity')));
  const tour: Tour = { iDebut: borne.iDebut, iFin: borne.iFin, declenchement };
  if (intensite !== undefined) tour.intensite = intensite;
  return tour;
}
