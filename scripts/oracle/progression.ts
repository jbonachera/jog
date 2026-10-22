// Cas dorés de src/core/progression, src/core/selecteurs et src/core/suggestionHrMax.
// Les fonctions qui reçoivent un `ParamsAuJour` (une fonction) prennent ici `parametres` (type Parametres) à la place :
// la fonction est parametresAuJour(parametres, date). Les Vues viennent de calculerVue (scénarios de scenario.ts), dont
// les grandes colonnes inutiles au calcul sont vidées.
import {
  PRECISIONS, allureNormRepetition, allureNormSeance, allureNormSemaine, arrondiAffiche, comparer, derniereSeanceSousSeuil, ecartAffiche,
  horsSousSeuil, nuage, niveauEstime, prereglage, suggestionPaceHrK, tendances,
} from '../../src/core/progression';
import { moyenneDesFinies } from '../../src/core/progression/commun';
import { moyenneGlissante } from '../../src/core/progression/lissage';
import { borner, contient } from '../../src/core/progression/periodes';
import { ajouterJours } from '../../src/core/dates';
import { indexerParametres, parametresDefaut } from '../../src/core/parametres';
import { selectionDiscipline, selectionHistorique, selectionMinutesSS, selectionProgressivite } from '../../src/core/selecteurs';
import { enPourcent, estDansLaCible, etatFootings, etatRatio } from '../../src/core/selecteurs/etats';
import { picRetenu, seancesExaminees, suggestionHrMax } from '../../src/core/suggestionHrMax';
import type { DateCivile, ModifDatee, Parametres, Repetition, Seance, SeanceVue, Vue } from '../../src/core/types';
import { J_REFERENCE, seance as seanceVue, vue as vueMinimale } from '../../tests/fixtures/vues';
import { Recueil } from './recueil';
import { allegee, parametresMaquette, parametresS1, rogner, seancesDepuis, seulementTypes, vueMaquette, vueS1, vueS3 } from './scenario';

const PARAMS = parametresDefaut();
const G = { refHr: 164, paceHrK: 1.1 };
const aVue = (s: Seance): SeanceVue => Object.fromEntries(Object.entries(s).filter(([champ]) => champ !== 'segmentsMp')) as SeanceVue;
const sv = (o: Parameters<typeof seanceVue>[0]): SeanceVue => aVue(seanceVue(o));
const rep = (n: number, allure_skm: number, fcFin: number, duree_s = 360): Repetition => ({ n, debut_s: 0, duree_s, allure_skm, fcFin });
const ss = (date: DateCivile, reps: Repetition[], extra: Partial<Parameters<typeof seanceVue>[0]> = {}): SeanceVue => sv({ date, type: 'sous-seuil', repetitions: reps, ...extra });

/** Appel avec un ParamsAuJour tiré de `parametres`. */
const auJour = (parametres: Parametres) => {
  const index = indexerParametres(parametres);
  return (d: DateCivile) => index.auJour(d);
};

/** Une Vue minimale pour les fonctions qui ne lisent que les séances : J, premier jour et séances. */
function vueSeances(seances: SeanceVue[], J: DateCivile = J_REFERENCE, premierJour: DateCivile | null = null): Vue {
  return { ...vueMinimale([], { J }), seances, premierJour };
}

export function genererProgression(): Recueil {
  const r = new Recueil('progression');
  const s1 = vueS1();
  const maq = vueMaquette();

  // ── allure normalisée ──
  const alluresNorm: [string, Repetition][] = [
    ['à la FC de référence', rep(1, 250, 164)], ['FC de fin de 174 bpm', rep(1, 250, 174)], ['FC de fin de 154 bpm', rep(1, 250, 154)],
    ['FC de fin non entière', rep(1, 249.5, 166.5)], ['allure absente (NaN)', rep(1, Number.NaN, 165)],
  ];
  for (const [nom, rr] of alluresNorm) r.appel(`allureNormRepetition : ${nom}`, 'allureNormRepetition', allureNormRepetition, rr, G);
  r.appel('allureNormRepetition avec un coefficient nul', 'allureNormRepetition', allureNormRepetition, rep(1, 250, 174), { refHr: 164, paceHrK: 0 });
  r.appel('allureNormRepetition avec refHr 170 et paceHrK 1,5', 'allureNormRepetition', allureNormRepetition, rep(1, 250, 165), { refHr: 170, paceHrK: 1.5 });

  r.appel('allureNormSeance : trois répétitions', 'allureNormSeance', allureNormSeance, ss('2026-10-01', [rep(1, 250, 160), rep(2, 252, 164), rep(3, 254, 168)]), G);
  r.appel('allureNormSeance : une répétition sans allure est ignorée', 'allureNormSeance', allureNormSeance, ss('2026-10-01', [rep(1, Number.NaN, 160), rep(2, 252, 164)]), G);
  r.appel('allureNormSeance : toutes les répétitions sans allure', 'allureNormSeance', allureNormSeance, ss('2026-10-01', [rep(1, Number.NaN, 160)]), G);
  r.appel('allureNormSeance : séance sans répétition', 'allureNormSeance', allureNormSeance, sv({ date: '2026-10-01', type: 'footing' }), G);

  const semaine = [ss('2026-10-06', [rep(1, 250, 164)]), sv({ date: '2026-10-07', type: 'footing' }), ss('2026-10-09', [rep(1, 254, 164)])];
  r.appel('allureNormSemaine : moyenne des séances sous-seuil, footing ignoré', 'allureNormSemaine', allureNormSemaine, semaine, G);
  r.appel('allureNormSemaine : sans séance sous-seuil', 'allureNormSemaine', allureNormSemaine, [semaine[1]!], G);
  r.appel('allureNormSemaine : semaine vide', 'allureNormSemaine', allureNormSemaine, [], G);

  const base = { hrMax: 188, hrRest: 46, z1: 68, z2: 78, z3: 85, z4: 92, lt2Hr: 172, lt2Pace: 238, easyCap: 140, subtHrLo: 160, subtHrHi: 168 };
  const hs: [string, Repetition][] = [
    ['allure égale à lt2Pace', rep(1, 238, 165)], ['allure juste plus rapide', rep(1, 237.99, 165)], ['FC de fin égale à subtHrHi', rep(1, 245, 168)],
    ['FC de fin juste au-dessus', rep(1, 245, 168.01)], ['allure et FC hors sous-seuil', rep(1, 230, 175)], ['dans le sous-seuil', rep(1, 250, 160)],
  ];
  for (const [nom, rr] of hs) r.appel(`horsSousSeuil : ${nom}`, 'horsSousSeuil', horsSousSeuil, rr, base);
  r.appel('horsSousSeuil avec des seuils datés différents', 'horsSousSeuil', horsSousSeuil, rep(1, 236, 170), { ...base, lt2Pace: 230, subtHrHi: 172 });

  // ── tendances ──
  r.appel('tendances de l’historique S1', 'tendances', tendances, seancesDepuis(allegee(s1, 'seances'), '2026-07-01'));
  r.appel('tendances de la maquette', 'tendances', tendances, seancesDepuis(allegee(maq, 'seances'), '2026-06-01'));
  r.appel('tendances sans séance', 'tendances', tendances, vueSeances([]));
  {
    const un = vueSeances([sv({ date: '2026-10-05', type: 'footing', fcMoy: 135 })]);
    r.appel('tendances d’une seule séance (aucun écart)', 'tendances', tendances, un);
    const egal = vueSeances([
      { ...sv({ date: '2026-09-07', type: 'footing' }), ef: 1.2 }, { ...sv({ date: '2026-09-14', type: 'footing' }), ef: 1.2 },
      { ...sv({ date: '2026-09-21', type: 'footing' }), ef: 1.2 },
    ]);
    r.appel('tendances : EF constante, sens indéterminé', 'tendances', tendances, egal);
    const sorties = vueSeances([
      { ...sv({ date: '2026-09-06', type: 'sortie-longue' }), decouplage: { valeur: 6, retenu_min: 90, total_min: 90, avecMp: false } },
      { ...sv({ date: '2026-09-13', type: 'sortie-longue' }), decouplage: { valeur: 4, retenu_min: 70, total_min: 100, avecMp: true } },
      { ...sv({ date: '2026-09-20', type: 'sortie-longue' }), decouplage: { valeur: null, retenu_min: 40, total_min: 100, avecMp: true } },
      { ...sv({ date: '2026-09-27', type: 'sortie-longue' }), decouplage: null },
      { ...sv({ date: '2026-10-04', type: 'sortie-longue' }), decouplage: { valeur: 3.2, retenu_min: 95, total_min: 95, avecMp: false } },
      { ...sv({ date: '2026-10-11', type: 'sortie-longue' }), decouplage: { valeur: 2.9, retenu_min: 95, total_min: 95, avecMp: false } },
    ]);
    r.appel('tendances : sorties longues, découplages nul, absent, avec allure marathon', 'tendances', tendances, sorties);
    const semaines = vueSeances([
      ss('2026-09-01', [rep(1, 255, 164)]), ss('2026-09-08', [rep(1, 252, 164)]), ss('2026-09-15', [rep(1, 250, 164)]), ss('2026-09-22', [rep(1, 249, 164)]),
      ss('2026-09-29', [rep(1, 247, 164)]), ss('2026-10-06', [rep(1, 246, 164)]),
    ]);
    r.appel('tendances : six semaines sous-seuil, lissage sur quatre semaines', 'tendances', tendances, semaines);
  }

  // ── nuage ──
  // Seules les séances sous-seuil des deux périodes comparées sont gardées (le nuage ne lit rien d'autre).
  const periodesNuage = (vue: Vue, periode: 'annee' | 'precedentes'): Vue => {
    const [du, au] = periode === 'annee' ? [-448, -365] : [-168, -85];
    const gardees = (d: DateCivile): boolean => (d >= ajouterJours(vue.J, du) && d <= ajouterJours(vue.J, au)) || (d >= ajouterJours(vue.J, -84) && d <= ajouterJours(vue.J, -1));
    return { ...seulementTypes(vue, 'sous-seuil'), seances: seulementTypes(vue, 'sous-seuil').seances.filter((s) => gardees(s.date)) };
  };
  for (const periode of ['annee', 'precedentes'] as const) {
    r.appel(`nuage de S1 (${periode})`, 'nuage', nuage, periodesNuage(allegee(s1, 'seances'), periode), periode);
    r.appel(`nuage de la maquette (${periode})`, 'nuage', nuage, periodesNuage(allegee(maq, 'seances'), periode), periode);
  }
  r.appel('nuage d’une Vue sans historique', 'nuage', nuage, vueSeances([]), 'precedentes');
  {
    const J = '2026-10-21';
    const v = vueSeances([
      ss('2026-05-10', [rep(1, 260, 166), rep(2, 258, 167)]), ss('2026-07-20', [rep(1, 255, 165), rep(2, 253, 165)]), ss('2026-09-20', [rep(1, 250, 164), rep(2, 249, 166), rep(3, Number.NaN, 160)]),
      ss('2026-10-01', [rep(1, 248, 165)]),
    ], J, '2026-03-01');
    r.appel('nuage : références en bornes de période (J−168 à J−85)', 'nuage', nuage, v, 'precedentes');
    const vBord = vueSeances([ss(ajouterJours(J, -84), [rep(1, 250, 164)]), ss(ajouterJours(J, -85), [rep(1, 252, 164)]), ss(ajouterJours(J, -1), [rep(1, 249, 164)]), ss(ajouterJours(J, -168), [rep(1, 260, 164)]), ss(ajouterJours(J, -169), [rep(1, 262, 164)])], J, ajouterJours(J, -400));
    r.appel('nuage : séances aux bornes J−84, J−85, J−1, J−168, J−169', 'nuage', nuage, vBord, 'precedentes');
  }

  // ── dernière séance sous-seuil ──
  const dernieresSS = (vue: Vue): Vue => ({ ...vue, seances: seulementTypes(vue, 'sous-seuil').seances.slice(-2) });
  const dS1 = dernieresSS(allegee(s1, 'seances'));
  const dMaq = dernieresSS(allegee(maq, 'seances'));
  r.ajouter('derniereSeanceSousSeuil de S1 avec les paramètres datés de S1', 'derniereSeanceSousSeuil', [dS1, parametresS1()], () => derniereSeanceSousSeuil(dS1, auJour(parametresS1())));
  r.ajouter('derniereSeanceSousSeuil de la maquette', 'derniereSeanceSousSeuil', [dMaq, parametresMaquette()], () => derniereSeanceSousSeuil(dMaq, auJour(parametresMaquette())));
  r.ajouter('derniereSeanceSousSeuil sans séance sous-seuil', 'derniereSeanceSousSeuil', [vueSeances([]), PARAMS], () => derniereSeanceSousSeuil(vueSeances([]), auJour(PARAMS)));
  {
    const v = vueSeances([ss('2026-10-01', [rep(1, 250, 160), rep(2, 236, 165), rep(3, 252, 170)], { format: '3×6′' })]);
    r.ajouter('derniereSeanceSousSeuil : répétitions hors sous-seuil et écarts à la moyenne', 'derniereSeanceSousSeuil', [v, PARAMS], () => derniereSeanceSousSeuil(v, auJour(PARAMS)));
    const modifs: ModifDatee[] = [{ id: 'a', cle: 'lt2Pace', valeur: 230, dateEffet: '2026-10-01', enregistreLe: '2026-10-01T06:00:00Z' }, { id: 'b', cle: 'subtHrHi', valeur: 172, dateEffet: '2026-09-30', enregistreLe: '2026-09-30T06:00:00Z' }];
    const p: Parametres = { globaux: PARAMS.globaux, modifs };
    r.ajouter('derniereSeanceSousSeuil : paramètres datés le jour de la séance', 'derniereSeanceSousSeuil', [v, p], () => derniereSeanceSousSeuil(v, auJour(p)));
    const nan = vueSeances([ss('2026-10-01', [rep(1, Number.NaN, 160), rep(2, 250, 160)])]);
    r.ajouter('derniereSeanceSousSeuil : une répétition sans allure', 'derniereSeanceSousSeuil', [nan, PARAMS], () => derniereSeanceSousSeuil(nan, auJour(PARAMS)));
    const sansRep = vueSeances([ss('2026-10-01', [])]);
    r.ajouter('derniereSeanceSousSeuil : séance sous-seuil sans répétition', 'derniereSeanceSousSeuil', [sansRep, PARAMS], () => derniereSeanceSousSeuil(sansRep, auJour(PARAMS)));
  }

  // ── niveau estimé ──
  const chrono = (type: 'course' | 'test', date: DateCivile, d: number, t: number): SeanceVue => ({ ...sv({ type, date, distanceRef_km: d, temps_s: t, duree_min: t / 60 }) });
  r.appel('niveauEstime de S1', 'niveauEstime', niveauEstime, seulementTypes(allegee(s1, 'seances'), 'course', 'test'));
  r.appel('niveauEstime de la maquette', 'niveauEstime', niveauEstime, seulementTypes(allegee(maq, 'seances'), 'course', 'test'));
  r.appel('niveauEstime sans séance', 'niveauEstime', niveauEstime, vueSeances([]));
  r.appel('niveauEstime : course de 10 km seulement, pas de source', 'niveauEstime', niveauEstime, vueSeances([chrono('course', '2026-06-27', 10, 2500)]));
  r.appel('niveauEstime : un test de 5 km, aucun record', 'niveauEstime', niveauEstime, vueSeances([chrono('test', '2026-09-12', 5, 1200)]));
  r.appel('niveauEstime : records battus et non battus', 'niveauEstime', niveauEstime, vueSeances([
    chrono('course', '2026-03-01', 5, 1250), chrono('course', '2026-04-01', 10, 2300), chrono('course', '2026-05-01', 21.0975, 6000), chrono('course', '2026-06-01', 42.195, 14_000), chrono('test', '2026-09-12', 5, 1200),
  ]));
  r.appel('niveauEstime : égalité de records, le plus ancien est conservé', 'niveauEstime', niveauEstime, vueSeances([
    chrono('course', '2026-03-01', 5, 1200), chrono('test', '2026-04-01', 5, 1200), chrono('test', '2026-09-12', 5, 1200.4),
  ]));
  r.appel('niveauEstime : équivalence arrondie égale au record', 'niveauEstime', niveauEstime, vueSeances([chrono('course', '2026-04-01', 10, 2499), chrono('test', '2026-09-12', 5, 1200)]));
  r.appel('niveauEstime : séance de course sans temps', 'niveauEstime', niveauEstime, vueSeances([{ ...sv({ type: 'course', date: '2026-09-12', distanceRef_km: 5 }), temps_s: null }]));

  // ── comparateur ──
  const jeuComp = (nom: string, vue: Vue, a: [DateCivile, DateCivile], b: [DateCivile, DateCivile], p: Parametres): void =>
    r.ajouter(nom, 'comparer', [vue, a, b, p], () => comparer(vue, a, b, auJour(p)));
  // Les séries sont rognées aux périodes comparées : le calcul ne lit que les jours des deux périodes.
  const lite = rogner(s1, ['2026-05-01', '2026-10-20']);
  const liteCourt = rogner(s1, ['2026-09-01', '2026-10-20']);
  const lm = rogner(maq, ['2025-09-01', '2025-10-20'], ['2026-07-28', '2026-10-19']);
  const prs = prereglage(s1, 'douze-semaines-precedentes');
  jeuComp('comparer S1 : douze semaines contre les douze précédentes', lite, prs.a, prs.b, parametresS1());
  const pra = prereglage(lm, 'douze-semaines-annee-precedente');
  jeuComp('comparer la maquette : douze semaines contre la même période un an avant (historique partiel)', lm, pra.a, pra.b, parametresMaquette());
  jeuComp('comparer S1 : deux périodes identiques', liteCourt, ['2026-09-01', '2026-09-30'], ['2026-09-01', '2026-09-30'], parametresS1());
  jeuComp('comparer S1 : une période avant le début de l’historique', liteCourt, ['2026-01-01', '2026-02-28'], ['2026-09-01', '2026-09-30'], parametresS1());
  jeuComp('comparer S1 : période B au-delà de J−1', liteCourt, ['2026-09-01', '2026-09-30'], ['2026-10-01', '2026-12-31'], parametresS1());
  jeuComp('comparer S1 : une seule journée', liteCourt, ['2026-09-27', '2026-09-27'], ['2026-10-04', '2026-10-04'], parametresS1());
  jeuComp('comparer S1 : A courte (7 jours) contre B de 14 jours : historique partiel', liteCourt, ['2026-09-01', '2026-09-07'], ['2026-09-14', '2026-09-27'], parametresS1());
  jeuComp('comparer S1 : A plus courte de 6 jours exactement', liteCourt, ['2026-09-01', '2026-09-07'], ['2026-09-14', '2026-09-26'], parametresS1());
  jeuComp('comparer S1 : plafond de footing abaissé pour la période B', liteCourt, ['2026-09-01', '2026-09-20'], ['2026-09-21', '2026-10-12'], { globaux: PARAMS.globaux, modifs: [{ id: 'z', cle: 'easyCap', valeur: 130, dateEffet: '2026-09-21', enregistreLe: '2026-09-21T08:00:00Z' }] });
  jeuComp('comparer sans séance : toutes les mesures vides', rogner(vueS3(), ['2026-05-10', '2026-07-05']), ['2026-05-20', '2026-06-20'], ['2026-06-01', '2026-06-25'], PARAMS);
  jeuComp('comparer : test de 5 km dans les deux périodes', rogner(s1, ['2026-05-15', '2026-06-15'], ['2026-08-20', '2026-09-20']), ['2026-05-15', '2026-06-15'], ['2026-08-20', '2026-09-20'], parametresS1());
  for (const [nom, a, b] of [
    ['période A à l’envers', ['2026-09-30', '2026-09-01'], ['2026-09-01', '2026-09-20']],
    ['période B à l’envers', ['2026-08-01', '2026-08-31'], ['2026-09-30', '2026-09-01']],
    ['date de A inexistante', ['2026-02-30', '2026-03-10'], ['2026-08-01', '2026-08-31']],
    ['date de B mal formée', ['2026-08-01', '2026-08-31'], ['2026-9-1', '2026-09-30']],
  ] as [string, [string, string], [string, string]][]) {
    r.ajouterErreur(`comparer refuse : ${nom}`, 'comparer', [liteCourt, a, b, PARAMS], () => comparer(liteCourt, a, b, auJour(PARAMS)));
  }
  for (const nom of ['douze-semaines-precedentes', 'douze-semaines-annee-precedente'] as const) {
    r.appel(`prereglage ${nom} au 2026-10-21`, 'prereglage', prereglage, allegee(s1), nom);
    r.appel(`prereglage ${nom} au 29 février 2028`, 'prereglage', prereglage, { ...allegee(s1), J: '2028-03-01' }, nom);
  }

  // ── suggestion de paceHrK ──
  const J = '2026-10-21';
  const footings = (n: number, fc = 130, debut = '2026-09-01'): SeanceVue[] =>
    Array.from({ length: n }, (_, i) => ({ ...sv({ type: 'footing', date: ajouterJours(debut, i * 2), fcMoy: fc, km: 10, duree_min: 60 }), allureMoy_skm: 360 }));
  const sousSeuils = (n: number, allure = 250, fcFin = 165, debut = '2026-09-02'): SeanceVue[] =>
    Array.from({ length: n }, (_, i) => sv({ type: 'sous-seuil', date: ajouterJours(debut, i * 3), repetitions: [rep(1, allure, fcFin, 360), rep(2, allure, fcFin, 360)] }));
  const pace = (nom: string, seances: SeanceVue[], jour: DateCivile = J): void => r.appel(nom, 'suggestionPaceHrK', suggestionPaceHrK, vueSeances(seances, jour));
  pace('suggestionPaceHrK : cinq footings et trois séances sous-seuil', [...footings(5), ...sousSeuils(3)]);
  pace('suggestionPaceHrK : quatre footings seulement', [...footings(4), ...sousSeuils(3)]);
  pace('suggestionPaceHrK : deux séances sous-seuil seulement', [...footings(5), ...sousSeuils(2)]);
  pace('suggestionPaceHrK : écart de FC de 9 bpm : pas de suggestion', [...footings(5, 130), ...sousSeuils(3, 250, 139)]);
  pace('suggestionPaceHrK : écart de FC de 10 bpm exactement', [...footings(5, 130), ...sousSeuils(3, 250, 140)]);
  pace('suggestionPaceHrK : coefficient ramené à la borne basse (0,6)', [...footings(5, 130), ...sousSeuils(3, 345, 165)]);
  pace('suggestionPaceHrK : coefficient ramené à la borne haute (3)', [...footings(5, 130), ...sousSeuils(3, 200, 141)]);
  pace('suggestionPaceHrK : footings à J−84 inclus', [...footings(4, 130, ajouterJours(J, -84)).slice(0, 1), ...footings(4, 130, ajouterJours(J, -60)), ...sousSeuils(3)]);
  pace('suggestionPaceHrK : footing à J−85 exclu', [...footings(4, 130, ajouterJours(J, -60)), { ...footings(1)[0]!, date: ajouterJours(J, -85) }, ...sousSeuils(3)]);
  pace('suggestionPaceHrK : footing daté de J exclu', [...footings(4, 130, ajouterJours(J, -60)), { ...footings(1)[0]!, date: J }, ...sousSeuils(3)]);
  pace('suggestionPaceHrK : footings en lignes droites comptés', [...footings(3).map((s) => ({ ...s, type: 'footing-lignes-droites' as const })), ...footings(2, 130, '2026-09-20'), ...sousSeuils(3)]);
  pace('suggestionPaceHrK : footing sans FC ou sans allure inutilisable', [...footings(4), { ...footings(1)[0]!, fcMoy: null, date: '2026-09-30' }, ...sousSeuils(3)]);
  pace('suggestionPaceHrK : footing de durée nulle inutilisable', [...footings(4), { ...footings(1)[0]!, duree_min: 0, date: '2026-09-30' }, ...sousSeuils(3)]);
  pace('suggestionPaceHrK : séance sous-seuil sans répétition non comptée', [...footings(5), ...sousSeuils(2), sv({ type: 'sous-seuil', date: '2026-10-10' })]);
  r.appel('suggestionPaceHrK de S1', 'suggestionPaceHrK', suggestionPaceHrK, seancesDepuis(seulementTypes(allegee(s1, 'seances'), 'footing', 'footing-lignes-droites', 'sous-seuil'), '2026-07-20'));
  r.appel('suggestionPaceHrK de la maquette', 'suggestionPaceHrK', suggestionPaceHrK, seancesDepuis(seulementTypes(allegee(maq, 'seances'), 'footing', 'footing-lignes-droites', 'sous-seuil'), '2026-07-20'));

  // ── précisions et lissage ──
  r.appel('PRECISIONS : table des précisions d’affichage', 'PRECISIONS', () => PRECISIONS);
  const aff: [number, keyof typeof PRECISIONS][] = [[12.345, 'km'], [12.35, 'km'], [12.25, 'km'], [3.5, 'heures'], [3.504, 'heures'], [0.0083, 'heures'], [2.45, 'seances'], [2.5, 'allure'], [0.125, 'ef'], [1.115, 'ef'], [4.05, 'decouplage'], [-4.05, 'decouplage'], [-2.5, 'formeMoy'], [1.005, 'picRatio']];
  for (const [v, cle] of aff) r.appel(`arrondiAffiche de ${v} (${cle})`, 'arrondiAffiche', arrondiAffiche, v, PRECISIONS[cle]);
  const ecarts: [number | null, number | null, keyof typeof PRECISIONS][] = [[10.04, 10.06, 'km'], [10.04, 10.05, 'km'], [10.0, 10.0, 'km'], [null, 3, 'km'], [3, null, 'km'], [null, null, 'allure'], [2.5, 3.5, 'allure'], [1.24, 1.26, 'ef'], [1, 1.5, 'heures'], [0.5, 0.5083, 'heures'], [5, 4.04, 'decouplage']];
  for (const [a, b, cle] of ecarts) r.appel(`ecartAffiche de ${String(a)} à ${String(b)} (${cle})`, 'ecartAffiche', ecartAffiche, a, b, PRECISIONS[cle]);

  const serie = [10, 12, 11, 15, 14, 18, 20];
  for (const fenetre of [1, 3, 4, 10]) r.appel(`moyenneGlissante de 7 valeurs sur ${fenetre}`, 'moyenneGlissante', moyenneGlissante, serie, fenetre);
  r.appel('moyenneGlissante d’une série vide', 'moyenneGlissante', moyenneGlissante, [], 4);
  r.appel('moyenneDesFinies de valeurs, de null et d’infini', 'moyenneDesFinies', moyenneDesFinies, [1, null, 2.5, undefined, Number.POSITIVE_INFINITY, 4]);
  r.appel('moyenneDesFinies d’aucune valeur finie', 'moyenneDesFinies', moyenneDesFinies, [null, undefined, Number.NEGATIVE_INFINITY]);
  r.appel('moyenneDesFinies d’une liste vide', 'moyenneDesFinies', moyenneDesFinies, []);

  // ── périodes bornées ──
  const bv = vueSeances([], '2026-10-21', '2026-03-01');
  const periodes: [DateCivile, DateCivile][] = [['2026-01-01', '2026-02-28'], ['2026-02-01', '2026-03-01'], ['2026-03-01', '2026-03-01'], ['2026-09-01', '2026-12-31'], ['2026-10-20', '2026-10-21'], ['2026-10-21', '2026-10-30'], ['2026-04-01', '2026-03-01']];
  for (const [du, au] of periodes) r.appel(`borner ${du} à ${au} (premier jour 2026-03-01, J 2026-10-21)`, 'borner', borner, bv, du, au);
  r.appel('borner sans historique', 'borner', borner, vueSeances([]), '2026-01-01', '2026-12-31');
  for (const d of ['2026-03-01', '2026-06-01', '2026-10-20', '2026-10-21', '2026-02-28']) {
    r.ajouter(`contient la date ${d} dans la période 2026-03-01 à 2026-10-20`, 'contient', [borner(bv, '2026-03-01', '2026-10-20'), d], () => contient(borner(bv, '2026-03-01', '2026-10-20'), d));
  }
  r.ajouter('contient dans une période vide', 'contient', [borner(vueSeances([]), '2026-01-01', '2026-12-31'), '2026-06-01'], () => contient(borner(vueSeances([]), '2026-01-01', '2026-12-31'), '2026-06-01'));
  return r;
}

export function genererSelecteurs(): Recueil {
  const r = new Recueil('selecteurs');
  const s1 = vueS1();
  const maq = vueMaquette();
  const s3 = vueS3();

  for (const f of ['16sem', '12mois'] as const) {
    r.appel(`selectionProgressivite de S1 (${f})`, 'selectionProgressivite', selectionProgressivite, allegee(s1, 'ratio'), f);
    r.appel(`selectionProgressivite de la maquette (${f})`, 'selectionProgressivite', selectionProgressivite, allegee(maq, 'ratio'), f);
    r.appel(`selectionProgressivite d’un historique interrompu par une pause de 40 jours (${f})`, 'selectionProgressivite', selectionProgressivite, allegee(s3, 'ratio'), f);
    r.appel(`selectionProgressivite sans historique (${f})`, 'selectionProgressivite', selectionProgressivite, allegee(vueMinimale([], { J: '2026-10-21' })), f);
  }
  {
    const serie = (r_: (number | null)[]): Vue => {
      const n = r_.length;
      const J = '2026-10-21';
      const date = r_.map((_, i) => ajouterJours(J, i - n));
      return { ...vueMinimale([], { J }), ratio: { date, s7: r_.map(() => 50), chronic: r_.map(() => 45), r: r_ } };
    };
    r.appel('selectionProgressivite : ratios aux seuils (0,8 ; 1,3 ; 1,5 et leurs arrondis)', 'selectionProgressivite', selectionProgressivite, serie([0.795, 0.7949, 1.3, 1.3049, 1.305, 1.5, 1.504, 1.505, 1.2]), '16sem');
    r.appel('selectionProgressivite : le dernier jour sans ratio, pic en cas d’égalité', 'selectionProgressivite', selectionProgressivite, serie([1.2, 1.4, 1.4, 1.1, null]), '16sem');
    r.appel('selectionProgressivite : trou au milieu, deux segments', 'selectionProgressivite', selectionProgressivite, serie([1, 1.1, null, null, 0.9, 0.95]), '16sem');
  }

  r.appel('selectionMinutesSS de S1', 'selectionMinutesSS', selectionMinutesSS, allegee(s1, 'semaines'));
  r.appel('selectionMinutesSS de la maquette (plus de 26 semaines)', 'selectionMinutesSS', selectionMinutesSS, allegee(maq, 'semaines'));
  r.appel('selectionMinutesSS sans semaine', 'selectionMinutesSS', selectionMinutesSS, allegee(vueMinimale([], { J: '2026-10-21' })));
  r.appel('selectionMinutesSS : moins de quatre semaines terminées', 'selectionMinutesSS', selectionMinutesSS, { ...allegee(s1), semaines: s1.semaines.slice(0, 3) });
  r.appel('selectionMinutesSS : exactement quatre semaines terminées', 'selectionMinutesSS', selectionMinutesSS, { ...allegee(s1), semaines: s1.semaines.slice(0, 4) });
  r.appel('selectionMinutesSS : onze semaines terminées', 'selectionMinutesSS', selectionMinutesSS, { ...allegee(s1), semaines: s1.semaines.slice(0, 11) });

  r.appel('selectionDiscipline de S1', 'selectionDiscipline', selectionDiscipline, allegee(s1, 'semaines'));
  r.appel('selectionDiscipline de la maquette', 'selectionDiscipline', selectionDiscipline, allegee(maq, 'semaines'));
  r.appel('selectionDiscipline sans semaine', 'selectionDiscipline', selectionDiscipline, allegee(vueMinimale([], { J: '2026-10-21' })));
  r.appel('selectionDiscipline d’un historique interrompu', 'selectionDiscipline', selectionDiscipline, allegee(s3, 'semaines'));

  for (const p of ['12', '26', 'toutes'] as const) {
    r.appel(`selectionHistorique de S1 (${p})`, 'selectionHistorique', selectionHistorique, seulementTypes(allegee(s1, 'semaines', 'seances'), 'course', 'test'), p);
  }
  r.appel('selectionHistorique de la maquette (toutes)', 'selectionHistorique', selectionHistorique, seulementTypes(allegee(maq, 'semaines', 'seances'), 'course', 'test'), 'toutes');
  r.appel('selectionHistorique de la maquette (12)', 'selectionHistorique', selectionHistorique, seulementTypes(allegee(maq, 'semaines', 'seances'), 'course', 'test'), '12');
  r.appel('selectionHistorique d’un historique interrompu (toutes)', 'selectionHistorique', selectionHistorique, seulementTypes(allegee(s3, 'semaines', 'seances'), 'course', 'test'), 'toutes');
  r.appel('selectionHistorique sans semaine', 'selectionHistorique', selectionHistorique, allegee(vueMinimale([], { J: '2026-10-21' })), 'toutes');

  for (const v of [0.79, 0.795, 0.8, 1, 1.3, 1.3049, 1.305, 1.5, 1.504, 1.505, 2]) r.appel(`etatRatio de ${v}`, 'etatRatio', etatRatio, v);
  for (const v of [100, 90, 89.5, 89.4, 75, 74.5, 74.4, 0]) r.appel(`etatFootings de ${v} %`, 'etatFootings', etatFootings, v);
  for (const v of [0.19, 0.2, 0.225, 0.07, 0.1, 1, 0.285]) r.appel(`enPourcent de ${v}`, 'enPourcent', enPourcent, v);
  const cibles: [number | null, number, number][] = [[null, 20, 25], [19, 20, 25], [18.6, 20, 25], [18.4, 20, 25], [26, 20, 25], [26.4, 20, 25], [26.5, 20, 25], [27, 20, 25], [22.5, 20, 25]];
  for (const [part, lo, hi] of cibles) r.appel(`estDansLaCible de ${String(part)} % dans [${lo} ; ${hi}]`, 'estDansLaCible', estDansLaCible, part, lo, hi);
  return r;
}

export function genererSuggestionHrMax(): Recueil {
  const r = new Recueil('suggestionHrMax');
  const J = '2026-10-21';
  const vueHr = (seances: SeanceVue[], opts: { hrMax?: number; modifs?: ModifDatee[] } = {}): Vue => {
    const base = vueMinimale([], { J });
    return {
      ...base,
      seances,
      parametresEnVigueur: {
        ...base.parametresEnVigueur,
        datesAJm1: { ...base.parametresEnVigueur.datesAJm1, hrMax: opts.hrMax ?? 188 },
        modifs: opts.modifs ?? [],
      },
    };
  };
  const pic = (date: DateCivile, fcPic: number | null, extra: { nom?: string | null; km?: number } = {}): SeanceVue =>
    sv({ date, type: 'footing', fcPic, nom: extra.nom ?? null, km: extra.km ?? 8 });
  const cas = (nom: string, v: Vue, examinees = false): void => {
    r.appel(`suggestionHrMax : ${nom}`, 'suggestionHrMax', suggestionHrMax, v);
    r.appel(`picRetenu : ${nom}`, 'picRetenu', picRetenu, v);
    if (examinees) r.appel(`seancesExaminees : ${nom}`, 'seancesExaminees', seancesExaminees, v);
  };

  cas('aucune séance', vueHr([]));
  cas('séances sans pic', vueHr([pic('2026-10-01', null)]));
  cas('pic de 190, sous le seuil de 191', vueHr([pic('2026-10-01', 190)]));
  cas('pic de 190,49 : arrondi à 190, sous le seuil', vueHr([pic('2026-10-01', 190.49)]));
  cas('pic de 190,5 : arrondi à 191, proposé', vueHr([pic('2026-10-01', 190.5)]));
  cas('pic de 191 exactement', vueHr([pic('2026-10-01', 191, { nom: 'Fractionné', km: 12.34 })]));
  cas('pic de 203 : écart de 15, pas suspect', vueHr([pic('2026-10-01', 203)]));
  cas('pic de 203,5 : arrondi à 204, suspect', vueHr([pic('2026-10-01', 203.5)]));
  cas('deux pics égaux : la séance la plus récente', vueHr([pic('2026-08-01', 195, { nom: 'Ancienne' }), pic('2026-09-01', 195, { nom: 'Récente' })]));
  cas('deux pics différents : le plus haut', vueHr([pic('2026-08-01', 197, { nom: 'Haute' }), pic('2026-09-01', 195, { nom: 'Basse' })]));
  cas('pics proches arrondis au même bpm : le plus récent', vueHr([pic('2026-08-01', 195.4, { nom: 'A' }), pic('2026-09-01', 194.6, { nom: 'B' })]));
  cas('séance à J−365 incluse', vueHr([pic('2025-10-21', 196)]), true);
  cas('séance à J−366 exclue', vueHr([pic('2025-10-20', 196)]), true);
  cas('séance à J−1 incluse', vueHr([pic('2026-10-20', 196)]), true);
  cas('séance du jour J exclue', vueHr([pic('2026-10-21', 196)]), true);
  cas('hrMax à 195 en vigueur : le pic de 197 est sous le seuil de 198', vueHr([pic('2026-10-01', 197)], { hrMax: 195 }));
  cas('hrMax à 195 en vigueur : le pic de 198 est proposé', vueHr([pic('2026-10-01', 198)], { hrMax: 195 }));
  const modif = (date: DateCivile, valeur = 190): ModifDatee => ({ id: `h${date}`, cle: 'hrMax', valeur, dateEffet: date, enregistreLe: `${date}T08:00:00Z` });
  cas('modification de hrMax au 2026-09-01 : les séances antérieures ne comptent plus', vueHr([pic('2026-08-15', 200, { nom: 'Avant' }), pic('2026-09-15', 196, { nom: 'Après' })], { hrMax: 190, modifs: [modif('2026-09-01')] }), true);
  cas('modification de hrMax le jour de la séance : la séance compte', vueHr([pic('2026-09-01', 196)], { hrMax: 190, modifs: [modif('2026-09-01')] }), true);
  cas('plusieurs modifications de hrMax : la plus récente borne', vueHr([pic('2026-07-15', 199), pic('2026-09-15', 196)], { hrMax: 190, modifs: [modif('2026-07-01', 188), modif('2026-09-01', 190)] }), true);
  cas('modification d’un autre paramètre ignorée', vueHr([pic('2026-08-15', 197)], { modifs: [{ id: 'e', cle: 'easyCap', valeur: 142, dateEffet: '2026-09-01', enregistreLe: '2026-09-01T08:00:00Z' }] }));
  cas('distance arrondie au dixième : 12,34 km devient 12,3', vueHr([pic('2026-10-01', 195, { km: 12.34 })]));
  cas('distance arrondie au dixième : 12,35 km devient 12,4', vueHr([pic('2026-10-01', 195, { km: 12.35 })]));
  const maq = vueMaquette();
  const hauts = (vue: Vue): Vue => ({ ...vue, seances: [...vue.seances].filter((s) => s.fcPic !== null).sort((a, b) => (b.fcPic ?? 0) - (a.fcPic ?? 0)).slice(0, 4).sort((a, b) => (a.date < b.date ? -1 : 1)) });
  r.appel('suggestionHrMax de la maquette (quatre pics les plus hauts)', 'suggestionHrMax', suggestionHrMax, hauts(allegee(maq, 'seances')));
  r.appel('suggestionHrMax de S1 (quatre pics les plus hauts)', 'suggestionHrMax', suggestionHrMax, hauts(allegee(vueS1(), 'seances')));
  return r;
}

