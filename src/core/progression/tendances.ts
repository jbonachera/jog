// P2 · Tendances (03, P2 ; 04) : allure normalisée et EF par semaine, découplage des sorties longues,
// moyennes glissantes, dernière valeur, écart depuis le début de l'historique et sens de la progression.
import { lundiISO } from '../dates';
import type { DateCivile, SeanceVue, Vue } from '../types';
import { allureNormSemaine } from './allure';
import { moyenneDesFinies } from './commun';
import { moyenneGlissante } from './lissage';
import { ecartAffiche, PRECISIONS, type Precision } from './precision';

const FENETRE_SEMAINES = 4;
const FENETRE_SORTIES = 3;

export interface PointSemaine {
  lundi: DateCivile;
  brut: number;
  lisse: number;
}

export interface PointSortie {
  date: DateCivile;
  brut: number;
  lisse: number;
  /** Losange si la sortie a une allure marathon (D-005), rond sinon. */
  forme: 'losange' | 'rond';
}

export interface Tendance<P> {
  points: P[];
  /** Dernière valeur lissée, ou null sans point. */
  derniere: number | null;
  /** Dernière valeur lissée moins la première, ou null sans point. */
  ecart: number | null;
  /** Vrai si l'écart va dans le sens de la progression. Null sans point. */
  bonSens: boolean | null;
}

export interface Tendances {
  allure: Tendance<PointSemaine>;
  ef: Tendance<PointSemaine>;
  decouplage: Tendance<PointSortie>;
}

/** Les trois tendances de P2, à partir de la Vue. */
export function tendances(vue: Vue): Tendances {
  const g = vue.parametresEnVigueur.globaux;
  const semaines = groupesParSemaine(vue.seances);

  const allure = tendanceSemaines(semaines, (seances) => allureNormSemaine(seances, g));
  const ef = tendanceSemaines(semaines, (seances) =>
    moyenneDesFinies(seances.filter(estFooting).map((s) => s.ef)),
  );

  // Seules les sorties longues utilisables (découplage calculé et fini) entrent dans la série (D-005).
  const sorties: Omit<PointSortie, 'lisse'>[] = [];
  for (const s of vue.seances) {
    const valeur = s.decouplage?.valeur ?? null;
    if (s.type !== 'sortie-longue' || s.decouplage === null || valeur === null || !Number.isFinite(valeur)) continue;
    sorties.push({ date: s.date, brut: valeur, forme: s.decouplage.avecMp ? 'losange' : 'rond' });
  }
  const lissesSorties = moyenneGlissante(sorties.map((p) => p.brut), FENETRE_SORTIES);
  const decouplage = sorties.map((p, i) => ({ ...p, lisse: lissesSorties[i] ?? Number.NaN }));

  return {
    allure: resumer(allure, false, PRECISIONS.allure),
    ef: resumer(ef, true, PRECISIONS.ef),
    decouplage: resumer(decouplage, false, PRECISIONS.decouplage),
  };
}

function estFooting(s: SeanceVue): boolean {
  return s.type === 'footing' || s.type === 'footing-lignes-droites';
}

/** Les séances groupées par lundi de semaine, dans l'ordre chronologique. */
function groupesParSemaine(seances: readonly SeanceVue[]): [DateCivile, SeanceVue[]][] {
  const parLundi = new Map<DateCivile, SeanceVue[]>();
  for (const s of seances) {
    const lundi = lundiISO(s.date);
    const groupe = parLundi.get(lundi);
    if (groupe === undefined) parLundi.set(lundi, [s]);
    else groupe.push(s);
  }
  return [...parLundi.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Une valeur par semaine, sans les semaines où elle est absente, lissée sur 4 semaines. */
function tendanceSemaines(
  semaines: [DateCivile, SeanceVue[]][],
  valeur: (seancesDeLaSemaine: SeanceVue[]) => number | null,
): PointSemaine[] {
  const bruts: { lundi: DateCivile; brut: number }[] = [];
  for (const [lundi, seances] of semaines) {
    const v = valeur(seances);
    if (v !== null) bruts.push({ lundi, brut: v });
  }
  const lisses = moyenneGlissante(bruts.map((p) => p.brut), FENETRE_SEMAINES);
  return bruts.map((p, i) => ({ lundi: p.lundi, brut: p.brut, lisse: lisses[i] ?? Number.NaN }));
}

// `meilleurSiHaut` : vrai pour l'EF (plus haut est mieux), faux pour l'allure et le découplage (plus bas est mieux).
// Le sens se juge sur l'écart affiché : un écart qui s'affiche nul n'a pas de sens (bonSens null).
function resumer<P extends { lisse: number }>(points: P[], meilleurSiHaut: boolean, precision: Precision): Tendance<P> {
  const premier = points[0];
  const dernier = points.at(-1);
  if (premier === undefined || dernier === undefined) {
    return { points, derniere: null, ecart: null, bonSens: null };
  }
  const ecart = dernier.lisse - premier.lisse;
  const affiche = ecartAffiche(premier.lisse, dernier.lisse, precision);
  return {
    points,
    derniere: dernier.lisse,
    ecart,
    bonSens: affiche === null || affiche === 0 ? null : meilleurSiHaut ? affiche > 0 : affiche < 0,
  };
}
