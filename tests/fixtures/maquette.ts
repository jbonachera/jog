// Entrées de la décision au J de la maquette (docs/design/maquette/data.js), pour l'acceptation de 0011.
// Le fichier est chargé dans un contexte vm isolé. On ne lit que les jours, les séances (détail des
// répétitions et des sorties longues), les CTL et ATL, et les semaines. Le reste (plans, courses,
// lactate) n'entre pas dans le calcul.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { serieRatio } from '../../src/core/series/ratio';
import { palier } from '../../src/core/series/palier';
import type { EntreesDecision } from '../../src/core/decision/types';
import type { JourAgrege } from '../../src/core/jours';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { DateCivile, Minutes, ParamsDates, Repetition, Seance, SemaineVue, TypeSeance } from '../../src/core/types';

const FICHIER = fileURLToPath(new URL('../../docs/design/maquette/data.js', import.meta.url));

interface RepetitionMaquette { pace: number; hr: number }
interface DetailSousSeuil { fmt: string; reps: RepetitionMaquette[]; dur: number }
interface DetailLongue { decoupling: number; mp: number }

interface JourMaquette {
  date: DateCivile;
  done: boolean;
  type: 'easy' | 'subt' | 'long' | 'race' | 'rest' | 'missed';
  label: string;
  km: number;
  min: number;
  load: number;
  hr: number | null;
  z: Minutes;
  detail: DetailSousSeuil | DetailLongue | null;
}

interface FormeMaquette { date: DateCivile; ctl: number; atl: number; tsb: number }

interface SemaineMaquette {
  start: DateCivile;
  status: 'done' | 'current' | 'planned';
  km: number;
  min: number;
  z: Minutes;
  load: number;
  subtPct: number;
  subtSessions: number;
  easyCompliance: number;
  monotony: number;
  strain: number;
}

interface AthleteMaquette {
  hrMax: number;
  hrRest: number;
  hrEasyCap: number;
  lt2Hr: number;
  subtHrBand: [number, number];
}

interface JogMaquette {
  today: DateCivile;
  athlete: AthleteMaquette;
  days: JourMaquette[];
  fitness: FormeMaquette[];
  weeks: SemaineMaquette[];
}

/** Charge `window.JOG` de data.js dans un contexte vm isolé, et le renvoie. */
export function chargerJog(): JogMaquette {
  const contexte: { window: { JOG?: JogMaquette } } = { window: {} };
  runInNewContext(readFileSync(FICHIER, 'utf8'), contexte);
  if (contexte.window.JOG === undefined) throw new Error('window.JOG absent de data.js');
  return contexte.window.JOG;
}

/**
 * Paramètres de l'athlète de la maquette : JOG.athlete pour ce qu'elle porte (FC max et de repos, plafond
 * de footing, lt2Hr, bande de sous-seuil), et les défauts de 06 pour le reste (lt2Pace, zones, globaux).
 */
function paramsAuJourMaquette(athlete: AthleteMaquette): (date: DateCivile) => ParamsDates {
  const surcharge: Partial<ParamsDates> = {
    hrMax: athlete.hrMax,
    hrRest: athlete.hrRest,
    lt2Hr: athlete.lt2Hr,
    easyCap: athlete.hrEasyCap,
    subtHrLo: athlete.subtHrBand[0],
    subtHrHi: athlete.subtHrBand[1],
  };
  return (date) => ({ ...parametresAuJour(parametresDefaut(), date), ...surcharge });
}

function typeSeance(j: JourMaquette): TypeSeance | null {
  if (!j.done) return null;
  if (j.type === 'subt') return 'sous-seuil';
  if (j.type === 'long') return 'sortie-longue';
  if (j.type === 'race') return 'course';
  if (j.type === 'easy') return j.label.includes('lignes droites') ? 'footing-lignes-droites' : 'footing';
  return null;
}

function repetitionsDe(j: JourMaquette): Repetition[] {
  if (j.type !== 'subt' || j.detail === null || !('reps' in j.detail)) return [];
  const duree = j.detail.dur * 60;
  return j.detail.reps.map((r, i) => ({ n: i + 1, debut_s: i * duree, duree_s: duree, allure_skm: r.pace, fcFin: r.hr }));
}

function decouplageDe(j: JourMaquette): Seance['decouplage'] {
  if (j.type !== 'long' || j.detail === null || !('decoupling' in j.detail)) return null;
  const { decoupling, mp } = j.detail;
  return { valeur: decoupling, retenu_min: j.min - mp, total_min: j.min, avecMp: mp > 0 };
}

function seanceDe(j: JourMaquette, type: TypeSeance, rang: number): Seance {
  return {
    cleSource: `maquette:${rang}`,
    date: j.date,
    debutUtc: Date.parse(`${j.date}T00:00:00Z`),
    type,
    nom: j.label,
    marquage: 'aucun',
    duree_min: j.min,
    km: j.km,
    fcMoy: j.hr,
    allureMoy_skm: null,
    minutes: j.z,
    charge: j.load,
    mp_min: type === 'sortie-longue' && j.detail !== null && 'mp' in j.detail ? j.detail.mp : 0,
    segmentsMp: [],
    repetitions: repetitionsDe(j),
    format: type === 'sous-seuil' && j.detail !== null && 'fmt' in j.detail ? j.detail.fmt : null,
    recup_s: null,
    ef: null,
    decouplage: decouplageDe(j),
    lignesDroites: type === 'footing-lignes-droites',
    distanceRef_km: null,
    temps_s: null,
  };
}

function semaineVue(s: SemaineMaquette, statut: SemaineVue['statut']): SemaineVue {
  return {
    lundi: s.start,
    statut,
    km: s.km,
    min: s.min,
    minutes: s.z,
    partSS: s.subtPct,
    nbSS: s.subtSessions,
    charge: s.load,
    monotonie: s.monotony,
    contrainte: s.strain,
    conformiteFootings: s.easyCompliance,
    // La maquette ne donne que la part conforme, pas les effectifs : ils restent à zéro.
    nbFootings: 0,
    nbFootingsConformes: 0,
    ratioDimanche: null,
  };
}

/** Les entrées de la décision au J de la maquette (JOG.today, soit 2026-10-20). */
export function entreesMaquette(): EntreesDecision {
  const jog = chargerJog();
  const faits = jog.days.filter((j) => j.done);
  const jours: JourAgrege[] = faits.map((j) => {
    const type = typeSeance(j);
    return { date: j.date, km: j.km, min: j.min, charge: j.load, minutes: j.z, types: type === null ? [] : [type] };
  });
  const seances: Seance[] = [];
  faits.forEach((j, rang) => {
    const type = typeSeance(j);
    if (type !== null) seances.push(seanceDe(j, type, rang));
  });

  const semaines = jog.weeks.filter((s) => s.status !== 'planned');
  const semainesVue = semaines.map((s) => semaineVue(s, s.status === 'done' ? 'terminee' : 'en-cours'));
  const p = palier(semainesVue);

  return {
    J: jog.today,
    premierJour: jog.days[0]?.date ?? null,
    serieCharge: jog.fitness.map((f) => ({ date: f.date, ctl: f.ctl, atl: f.atl, tsb: f.tsb })),
    ratio: serieRatio(jours),
    joursKm: faits.map((j) => ({ date: j.date, km: j.km, charge: j.load })),
    semaines: semaines.map((s) => ({
      lundi: s.start,
      statut: s.status === 'done' ? 'terminee' : 'en-cours',
      km: s.km,
    })),
    palier: { semaines: p.semaines, reference_km: p.reference_km },
    seances,
    globaux: parametresDefaut().globaux,
    paramsAuJour: paramsAuJourMaquette(jog.athlete),
  };
}
