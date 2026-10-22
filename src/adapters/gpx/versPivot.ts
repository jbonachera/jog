// Adaptateur GPX : un fichier .gpx devient un ActivitePivot (ADR 0003).
// Latitude et longitude ne servent qu'à la distance cumulée, puis sont oubliées (ADR 0010).
import { dateLocale } from '../../core/dates';
import type { ActivitePivot, Flux } from '../../core/types';
import {
  coordonneesValides,
  decalageDeSecours,
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
import { chemin, enfant, enfants, lireXml, nomLocal, texteDe, type NoeudXml } from '../xml/lecteur';

export type { OptionsPivot } from '../commun';

// Rayon terrestre moyen, en mètres, pour la formule de haversine.
const RAYON_TERRESTRE_M = 6_371_008.8;
const TYPES_COURSE = new Set(['running', 'run', '9']);

export class ErreurGpx extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurGpx';
  }
}

export type ResultatGpx =
  | (ActivitePivot & { decalageInconnu: true; typeSuppose?: true })
  | { ignoree: 'pas-une-course' };

interface PointGpx {
  temps: number; // ms depuis epoch
  lat: number;
  lon: number;
  ele: number; // NaN si absente
  fc: number; // NaN si absente
  segment: number; // rang du segment (trkseg) dans le fichier, toutes pistes confondues
}

export function gpxVersPivot(texte: string, options: OptionsPivot): ResultatGpx {
  const racine = lireXml(texte);
  if (nomLocal(racine.nom) !== 'gpx') {
    throw new ErreurGpx(`élément racine <gpx> attendu, trouvé <${racine.nom}>`);
  }

  const traces = enfants(racine, 'trk');
  if (traces.length === 0) throw new ErreurGpx('aucune trace (trk) dans le fichier');
  // Le type est celui de la première piste qui en déclare un (décision de lot 1.2).
  const typeDeclare = traces
    .map((trace) => texteDe(enfant(trace, 'type')).toLowerCase())
    .find((type) => type !== '') ?? '';
  if (typeDeclare !== '' && !TYPES_COURSE.has(typeDeclare)) {
    return { ignoree: 'pas-une-course' };
  }

  const points = lirePoints(traces);
  if (points.length === 0) {
    throw new ErreurGpx('aucun point de trace horodaté et géolocalisé (trk/trkseg/trkpt)');
  }
  // Le début est l'instant le plus ancien. D2 : tri stable, fusion des instants égaux.
  const debutUtc = points.reduce((m, p) => Math.min(m, p.temps), Number.POSITIVE_INFINITY);
  const groupes = regrouperParInstant(
    points.map((p) => p.temps),
    debutUtc,
  );
  // Inatteignable par construction : le début est le plus ancien instant. La garde suit celle du TCX.
  if (groupes.length === 0) {
    throw new ErreurGpx('aucun point de trace après le début de l’activité');
  }
  const n = groupes.length;

  const tSec = new Float32Array(n);
  const dist = new Float32Array(n);
  const fc = new Float32Array(n);
  const alt = new Float32Array(n);
  let cumul = 0;
  let precedent: PointGpx | undefined;
  groupes.forEach((groupe: GroupeInstant, i) => {
    const p = fusionner(groupe, points);
    tSec[i] = (groupe.instant - debutUtc) / 1000;
    // Le saut entre deux segments n'est pas une distance parcourue : il compte 0.
    if (precedent !== undefined && precedent.segment === p.segment) {
      cumul += distanceHaversine(precedent, p);
    }
    dist[i] = cumul;
    fc[i] = p.fc;
    alt[i] = p.ele;
    precedent = p;
  });

  const flux: Flux = {
    t_s: tSec,
    dist_m: dist,
    fc_bpm: toutAbsent(fc) ? null : fc,
    alt_m: toutAbsent(alt) ? null : alt,
    vitesse_ms: null,
  };

  const decalageLocal_min = decalageDeSecours(options, debutUtc);
  const pivot: ActivitePivot & { decalageInconnu: true; typeSuppose?: true } = {
    cleSource: options.cleSource,
    source: options.source,
    versionAdaptateur: VERSION_ADAPTATEUR,
    empreinteBrute: options.empreinteBrute,
    debutUtc,
    decalageLocal_min,
    dateLocale: dateLocale(debutUtc, decalageLocal_min),
    duree_s: tSec[n - 1] ?? 0,
    distance_m: cumul,
    nom: options.nom,
    competition: options.competition,
    sousType: 'inconnu',
    pasFC_s: pasMedianFc(fc, tSec),
    flux,
    tours: [],
    decalageInconnu: true,
  };
  if (typeDeclare === '') pivot.typeSuppose = true;
  return pivot;
}

// Un instant : position du dernier point, altitude et FC de leur dernière valeur valide (D2).
function fusionner(groupe: GroupeInstant, points: readonly PointGpx[]): PointGpx {
  let fusion: PointGpx = { temps: groupe.instant, lat: 0, lon: 0, ele: Number.NaN, fc: Number.NaN, segment: 0 };
  for (const k of groupe.indices) {
    const p = points[k];
    if (p === undefined) continue;
    fusion = {
      temps: groupe.instant,
      lat: p.lat,
      lon: p.lon,
      ele: Number.isNaN(p.ele) ? fusion.ele : p.ele,
      fc: Number.isNaN(p.fc) ? fusion.fc : p.fc,
      segment: p.segment,
    };
  }
  return fusion;
}

// Toutes les pistes et tous les segments, dans l'ordre du fichier.
function lirePoints(traces: readonly NoeudXml[]): PointGpx[] {
  const points: PointGpx[] = [];
  let segment = 0;
  for (const trace of traces) {
    for (const trkseg of enfants(trace, 'trkseg')) {
      for (const pt of enfants(trkseg, 'trkpt')) {
        const point = lirePoint(pt, segment);
        if (point !== undefined) points.push(point);
      }
      segment++;
    }
  }
  return points;
}

// Un point sans horodatage avec fuseau, sans coordonnées ou hors des bornes ne peut ni être daté
// ni servir à la distance : il est ignoré.
function lirePoint(pt: NoeudXml, segment: number): PointGpx | undefined {
  const temps = instantAvecFuseau(texteDe(enfant(pt, 'time')));
  const lat = nombreOuNaN(pt.attributs.lat ?? '');
  const lon = nombreOuNaN(pt.attributs.lon ?? '');
  if (Number.isNaN(temps) || Number.isNaN(lat) || Number.isNaN(lon)) return undefined;
  if (!coordonneesValides(lat, lon)) return undefined;
  return {
    temps,
    lat,
    lon,
    ele: nombreOuNaN(texteDe(enfant(pt, 'ele'))),
    fc: fcPlausible(nombreOuNaN(texteDe(chemin(pt, ['extensions', 'TrackPointExtension', 'hr'])))),
    segment,
  };
}

function distanceHaversine(a: PointGpx, b: PointGpx): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dPhi = toRad(b.lat - a.lat);
  const dLambda = toRad(b.lon - a.lon);
  const h = Math.min(
    1,
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2,
  );
  return 2 * RAYON_TERRESTRE_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(degres: number): number {
  return (degres * Math.PI) / 180;
}
