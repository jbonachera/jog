// Cas dorés de src/core/decision : decider (signaux, verdict, fourchette, simulateur), simuler, états, aides.
// Convention : `decider` reçoit en entrée un objet unique ; le champ `paramsAuJour` (une fonction) y est remplacé par
// `parametres` (type Parametres) : la fonction est parametresAuJour(parametres, date).
import { enumerer, dansFenetre, jours, joursHistorique, joursManquants, trierSeances } from '../../src/core/decision/commun';
import { decider, simuler } from '../../src/core/decision';
import { etatDecouplage, etatFootings, etatFraicheur, etatHorsSousSeuil, etatPalier, etatProgressivite, etatReponse } from '../../src/core/decision/etats';
import type { Decision, EntreesDecision } from '../../src/core/decision/types';
import { fourchetteDe, verdictDe } from '../../src/core/decision/verdict';
import { ajouterJours } from '../../src/core/dates';
import { indexerParametres, parametresDefaut } from '../../src/core/parametres';
import type { CleSignal, DateCivile, EtatSignal, ModifDatee, Parametres, Seance, Verdict } from '../../src/core/types';
import {
  entrees, footing, J as J_DECISION, seance, seancesDeBase, semainesDeBase, sortieLongue, sousSeuil, type Options,
} from '../../tests/fixtures/decision';
import { entreesMaquette } from '../../tests/fixtures/maquette';
import { FOURCHETTE_DE_TEST, signal, signaux, SIMULATEUR_DE_TEST } from '../../tests/fixtures/vues';
import { Recueil } from './recueil';
import { parametresMaquette } from './scenario';

const PARAMS: Parametres = parametresDefaut();
const J = J_DECISION;
/** Une seule semaine, en cours : le signal de palier est insuffisant (il faut 2 semaines terminées) et ne retient pas Augmenter. */
const SANS_SEMAINE_TERMINEE: EntreesDecision['semaines'] = [{ lundi: '2026-10-19', statut: 'en-cours', km: 0 }];

/** Les entrées de la décision, dont la fonction paramsAuJour est dérivée de `p`. */
function ent(o: Options & { serieCharge?: EntreesDecision['serieCharge'] } = {}, p: Parametres = PARAMS): EntreesDecision {
  const index = indexerParametres(p);
  const { serieCharge, ...options } = o;
  // L'historique par défaut compte 31 jours (le fixture en prend 90) : les séries restent courtes, et le calcul des signaux
  // ne lit que J−1, les fenêtres de 21 jours au plus et le nombre de jours d'historique.
  const premierJour = options.premierJour === undefined ? ajouterJours(options.J ?? J, -31) : options.premierJour;
  const e = entrees({ ...options, premierJour, globaux: { ...p.globaux, ...options.globaux }, paramsAuJour: (d: DateCivile) => index.auJour(d) });
  return serieCharge === undefined ? e : { ...e, serieCharge };
}

/** La forme JSON de l'entrée : `parametres` remplace `paramsAuJour`. */
function entreeJson(e: EntreesDecision, p: Parametres): Record<string, unknown> {
  return {
    J: e.J, premierJour: e.premierJour, serieCharge: e.serieCharge, ratio: e.ratio, joursKm: e.joursKm, semaines: e.semaines,
    palier: e.palier, seances: e.seances, globaux: e.globaux, parametres: p,
  };
}

function etatDe(d: Decision, cle: CleSignal): EtatSignal {
  const s = d.signaux.find((x) => x.cle === cle);
  if (s === undefined) throw new Error(`signal absent : ${cle}`);
  return s.etat;
}

export function genererDecision(): Recueil {
  const r = new Recueil('decision');
  const echecs: string[] = [];

  /** Cas de decider ; `attendu` fixe le verdict ou l'état d'un signal pour que le nom du cas reste vrai. */
  const dec = (nom: string, o: Options & { serieCharge?: EntreesDecision['serieCharge'] }, attendu: { verdict?: Verdict; signaux?: Partial<Record<CleSignal, EtatSignal>> }, p: Parametres = PARAMS): void => {
    const e = ent(o, p);
    r.ajouter(nom, 'decider', entreeJson(e, p), () => decider(e), (res) => {
      const d = res as Decision;
      if (attendu.verdict !== undefined && d.verdict !== attendu.verdict) echecs.push(`${nom} : verdict ${d.verdict} au lieu de ${attendu.verdict}`);
      for (const [cle, etat] of Object.entries(attendu.signaux ?? {}) as [CleSignal, EtatSignal][]) {
        if (etatDe(d, cle) !== etat) echecs.push(`${nom} : signal ${cle} ${etatDe(d, cle)} au lieu de ${etat}`);
      }
    });
  };

  // ── Les trois verdicts, et pas de verdict ──
  dec('augmenter : tous les signaux sont au vert', {}, { verdict: 'augmenter' });
  dec('maintenir : footings à 80 %, un signal non décisif à surveiller', { seances: avecFootings(8, 2) }, { verdict: 'maintenir', signaux: { footings: 'surveiller' } });
  dec('maintenir : ratio à 1,4, signal décisif à surveiller', { r: 1.4 }, { verdict: 'maintenir', signaux: { progressivite: 'surveiller' } });
  dec('maintenir : plusieurs signaux à surveiller (phrase au pluriel)', { r: 1.4, tsb: 8 }, { verdict: 'maintenir' });
  dec('maintenir : footings en alerte (non décisif) ne déclenchent pas Alléger', { seances: avecFootings(3, 7) }, { verdict: 'maintenir', signaux: { footings: 'alerte' } });
  dec('alléger : ratio à 1,6', { r: 1.6 }, { verdict: 'alleger', signaux: { progressivite: 'alerte' } });
  dec('alléger : fraîcheur à −30', { tsb: -30 }, { verdict: 'alleger', signaux: { fraicheur: 'alerte' } });
  dec('alléger : deux signaux décisifs en alerte (phrase avec « et »)', { r: 1.6, tsb: -30 }, { verdict: 'alleger' });
  dec('alléger : trois signaux décisifs en alerte', { r: 1.6, tsb: -30, seances: [...reponse(5), ...base_sans_ss()] }, { verdict: 'alleger' });
  dec('pas de verdict : aucune séance ni historique', { premierJour: null, seances: [], semaines: [], palier: { semaines: 0, reference_km: 0 } }, { verdict: 'aucun' });

  // ── Données insuffisantes (D-007) ──
  for (const n of [1, 15, 27, 28, 29, 30, 31, 60]) {
    dec(`historique de ${n} jours (premier jour à J−${n})`, { premierJour: ajouterJours(J, -n) }, n < 30 ? { verdict: 'aucun' } : {});
  }
  dec('historique de 30 jours, ratio indéfini (aucun km sur 30 jours)', { premierJour: ajouterJours(J, -30), r: null, chronic: 0 }, { signaux: { progressivite: 'insuffisant' } });
  dec('sans signal décisif insuffisant mais un signal non décisif insuffisant : Augmenter avec « disponibles »', {
    seances: seancesDeBase().filter((s) => s.type !== 'footing'),
  }, { verdict: 'augmenter', signaux: { footings: 'insuffisant' } });
  dec('un signal décisif insuffisant (réponse à l’effort) : Maintenir', { seances: seancesDeBase().filter((s) => s.type !== 'sous-seuil') }, { verdict: 'maintenir', signaux: { reponse: 'insuffisant' } });
  dec('découplage insuffisant (aucune sortie longue) : Maintenir', { seances: seancesDeBase().filter((s) => s.type !== 'sortie-longue') }, { verdict: 'maintenir', signaux: { decouplage: 'insuffisant' } });
  dec('à surveiller et décisif insuffisant à la fois : phrase complète', { r: 1.4, seances: seancesDeBase().filter((s) => s.type !== 'sortie-longue') }, { verdict: 'maintenir' });
  dec('alerte décisive malgré un autre décisif insuffisant : Alléger', { tsb: -40, seances: seancesDeBase().filter((s) => s.type !== 'sortie-longue') }, { verdict: 'alleger' });

  // ── Progressivité (r arrondi à 0,01) ──
  const prog: [number, EtatSignal][] = [
    [0.79, 'surveiller'], [0.7949, 'surveiller'], [0.795, 'ok'], [0.8, 'ok'], [1, 'ok'], [1.3, 'ok'], [1.3049, 'ok'], [1.304999, 'ok'],
    [1.305, 'surveiller'], [1.31, 'surveiller'], [1.5, 'surveiller'], [1.504, 'surveiller'], [1.505, 'alerte'], [1.51, 'alerte'], [2.4, 'alerte'], [0, 'surveiller'],
  ];
  for (const [rr, etat] of prog) dec(`progressivité : r = ${rr}`, { r: rr }, { signaux: { progressivite: etat } });

  // ── Fraîcheur (TSB arrondi à l'entier) ──
  const fraicheur: [number, EtatSignal][] = [
    [-26, 'alerte'], [-25.5, 'alerte'], [-25.4, 'ok'], [-25, 'ok'], [0, 'ok'], [5, 'ok'], [5.4, 'ok'], [5.5, 'surveiller'], [6, 'surveiller'], [30, 'surveiller'],
  ];
  for (const [tsb, etat] of fraicheur) dec(`fraîcheur : TSB = ${tsb}`, { tsb }, { signaux: { fraicheur: etat } });

  // ── Réponse à l'effort (écart arrondi à la seconde) ──
  const reponses: [number, EtatSignal][] = [[-5, 'ok'], [0, 'ok'], [1, 'ok'], [1.4999, 'ok'], [1.5, 'surveiller'], [2, 'surveiller'], [3, 'surveiller'], [3.4999, 'surveiller'], [3.5, 'alerte'], [4, 'alerte'], [12, 'alerte']];
  for (const [delta, etat] of reponses) dec(`réponse à l’effort : écart de ${delta} s/km`, { seances: reponse(delta) }, { signaux: { reponse: etat } });
  dec('réponse à l’effort : huit séances sous-seuil seulement', { seances: reponse(0).slice(1) }, { signaux: { reponse: 'insuffisant' } });
  dec('réponse à l’effort : les trois dernières séances sont trop anciennes', { seances: reponse(0, true) }, { signaux: { reponse: 'insuffisant' } });
  dec('réponse à l’effort : plus de neuf séances, seules les neuf dernières comptent', { seances: [sousSeuil('2026-07-01', [300]), ...reponse(2)] }, { signaux: { reponse: 'surveiller' } });

  // ── Répétitions hors sous-seuil ──
  const hors: [string, number, EtatSignal][] = [
    ['aucune répétition hors sous-seuil', 0, 'ok'], ['une répétition hors sous-seuil', 1, 'surveiller'], ['deux répétitions hors sous-seuil', 2, 'surveiller'], ['trois répétitions hors sous-seuil', 3, 'alerte'], ['quatre répétitions hors sous-seuil', 4, 'alerte'],
  ];
  for (const [nom, nb, etat] of hors) dec(`hors sous-seuil : ${nom}`, { seances: avecHors(nb) }, { signaux: { horsSousSeuil: etat } });
  dec('hors sous-seuil : allure égale au seuil lt2Pace (238) : pas hors', { seances: avecSS([[238]]) }, { signaux: { horsSousSeuil: 'ok' } });
  dec('hors sous-seuil : allure juste plus rapide que le seuil (237,9) : hors', { seances: avecSS([[237.9]]) }, { signaux: { horsSousSeuil: 'surveiller' } });
  dec('hors sous-seuil : FC de fin égale à subtHrHi (168) : pas hors', { seances: avecSS([[245, 168]]) }, { signaux: { horsSousSeuil: 'ok' } });
  dec('hors sous-seuil : FC de fin juste au-dessus de subtHrHi (168,5) : hors', { seances: avecSS([[245, 168.5]]) }, { signaux: { horsSousSeuil: 'surveiller' } });
  dec('hors sous-seuil : seuils datés de la séance (subtHrHi relevé avant la séance)', { seances: avecSS([[245, 170]]) }, { signaux: { horsSousSeuil: 'ok' } },
    { globaux: PARAMS.globaux, modifs: [mod('h', 'subtHrHi', 172, '2026-01-01')] });
  dec('hors sous-seuil : moins de trois séances sous-seuil sur 21 jours', { seances: seancesDeBase().filter((s) => !(s.type === 'sous-seuil' && s.date >= '2026-10-08')) }, { signaux: { horsSousSeuil: 'insuffisant' } });

  // ── Footings sous le plafond (14 jours, arrondi au point) ──
  const footings: [string, number, number, EtatSignal][] = [
    ['10 sur 10', 10, 0, 'ok'], ['9 sur 10 : 90 %', 9, 1, 'ok'], ['17 sur 19 : 89,47 %', 17, 2, 'surveiller'], ['8 sur 10 : 80 %', 8, 2, 'surveiller'],
    ['3 sur 4 : 75 %', 3, 1, 'surveiller'], ['14 sur 19 : 73,7 %', 14, 5, 'alerte'], ['2 sur 3 : 67 %', 2, 1, 'alerte'], ['0 sur 4', 0, 4, 'alerte'], ['3 sur 3 : 100 %', 3, 0, 'ok'],
  ];
  for (const [nom, ok, ko, etat] of footings) dec(`footings : ${nom}`, { seances: avecFootings(ok, ko) }, { signaux: { footings: etat } });
  dec('footings : FC moyenne égale au plafond (140) : conforme', { seances: avecFootings(10, 0, 140) }, { signaux: { footings: 'ok' } });
  dec('footings : FC moyenne juste au-dessus du plafond (140,1) : non conforme', { seances: avecFootings(0, 10, 130, 140.1) }, { signaux: { footings: 'alerte' } });
  dec('footings : deux footings seulement', { seances: avecFootings(2, 0) }, { signaux: { footings: 'insuffisant' } });
  dec('footings : plafond daté, relevé à 150 avant les footings', { seances: avecFootings(0, 10, 145) }, { signaux: { footings: 'ok' } },
    { globaux: PARAMS.globaux, modifs: [mod('c', 'easyCap', 150, '2026-01-01')] });
  dec('footings : footings de la semaine hors fenêtre de 14 jours ignorés', { seances: [...base_sans_footings(), footing('2026-10-06'), footing('2026-10-07'), footing('2026-10-08')] }, { signaux: { footings: 'insuffisant' } });
  dec('footings : footing-lignes-droites compté comme un footing', { seances: [...base_sans_footings(), footing('2026-10-10', 130, 'footing-lignes-droites'), footing('2026-10-12', 130, 'footing-lignes-droites'), footing('2026-10-14', 130)] }, { signaux: { footings: 'ok' } });
  dec('footings : footing sans FC moyenne compté non conforme', { seances: [...base_sans_footings(), seance({ date: '2026-10-10', type: 'footing', fcMoy: null }), footing('2026-10-12'), footing('2026-10-14')] }, { signaux: { footings: 'alerte' } });

  // ── Découplage (arrondi à 0,1) ──
  const decoupl: [number, EtatSignal][] = [[-3, 'ok'], [0, 'ok'], [5, 'ok'], [5.04, 'ok'], [5.05, 'surveiller'], [6.5, 'surveiller'], [8, 'surveiller'], [8.04, 'surveiller'], [8.05, 'alerte'], [12, 'alerte']];
  for (const [valeur, etat] of decoupl) dec(`découplage : ${valeur} %`, { seances: [...base_sans_longue(), sortieLongue('2026-10-12', { valeur })] }, { signaux: { decouplage: etat } });
  dec('découplage : sortie longue avec portions faciles retenues', { seances: [...base_sans_longue(), sortieLongue('2026-10-12', { valeur: 3.4, avecMp: true, retenu: 55, total: 100, km: 21 })] }, { signaux: { decouplage: 'ok' } });
  dec('découplage : sortie sans valeur (non utilisable)', { seances: [...base_sans_longue(), sortieLongue('2026-10-12', { valeur: null })] }, { signaux: { decouplage: 'insuffisant' } });
  dec('découplage : sortie longue trop ancienne (15 jours)', { seances: [...base_sans_longue(), sortieLongue('2026-10-06', { valeur: 2 })] }, { signaux: { decouplage: 'insuffisant' } });
  dec('découplage : sortie longue au 14e jour de la fenêtre (J−14)', { seances: [...base_sans_longue(), sortieLongue('2026-10-07', { valeur: 2 })] }, { signaux: { decouplage: 'ok' } });
  dec('découplage : deux sorties longues, la dernière avec valeur est retenue', { seances: [...base_sans_longue(), sortieLongue('2026-10-08', { valeur: 9 }), sortieLongue('2026-10-15', { valeur: 2 })] }, { signaux: { decouplage: 'ok' } });
  dec('découplage : distance entière, sortie longue de 20 km', { seances: [...base_sans_longue(), sortieLongue('2026-10-12', { km: 20, valeur: 4 })] }, { signaux: { decouplage: 'ok' } });

  // ── Palier ──
  dec('palier : 3 semaines autour de 96 km', {}, { signaux: { palier: 'ok' } });
  dec('palier : 2 semaines, valeur exacte du seuil', { palier: { semaines: 2, reference_km: 90 } }, { signaux: { palier: 'ok' } });
  dec('palier : 1 semaine', { palier: { semaines: 1, reference_km: 90 } }, { signaux: { palier: 'surveiller' } });
  dec('palier : 0 semaine', { palier: { semaines: 0, reference_km: 0 } }, { signaux: { palier: 'surveiller' } });
  dec('palier : une seule semaine terminée', { semaines: [{ lundi: '2026-10-12', statut: 'terminee', km: 96 }, { lundi: '2026-10-19', statut: 'en-cours', km: 0 }] }, { signaux: { palier: 'insuffisant' } });

  // ── Fourchette et simulateur ──
  dec('fourchette : Augmenter avec palier, référence = dernière semaine terminée', {}, { verdict: 'augmenter' });
  dec('fourchette : palier d’une semaine, Maintenir, référence = moyenne sur 30 jours', { palier: { semaines: 1, reference_km: 96 }, chronic: 80 }, { verdict: 'maintenir' });
  dec('fourchette : Maintenir avec palier', { r: 1.4 }, { verdict: 'maintenir' });
  dec('fourchette : Alléger ignore le palier (moyenne sur 30 jours)', { r: 1.6, chronic: 70 }, { verdict: 'alleger' });
  dec('fourchette : bornes arrondies au km, mi-chemin vers le haut (référence 50)', { semaines: SANS_SEMAINE_TERMINEE, palier: { semaines: 0, reference_km: 0 }, chronic: 50 }, { verdict: 'augmenter' });
  dec('fourchette : référence 90, borne 94,5 arrondie à 95', { palier: { semaines: 0, reference_km: 0 }, chronic: 90, r: 1.4 }, { verdict: 'maintenir' });
  dec('fourchette : référence de dix km', { semaines: SANS_SEMAINE_TERMINEE, palier: { semaines: 0, reference_km: 0 }, chronic: 10 }, { verdict: 'augmenter' });
  dec('fourchette : palier atteint mais aucune semaine terminée dans la liste', { semaines: [{ lundi: '2026-10-19', statut: 'en-cours', km: 10 }] }, {});
  dec('fourchette : plusieurs semaines terminées, la plus récente fait référence même si la liste est en désordre', {
    semaines: [{ lundi: '2026-10-12', statut: 'terminee', km: 101 }, { lundi: '2026-09-28', statut: 'terminee', km: 90 }, { lundi: '2026-10-05', statut: 'terminee', km: 95 }, { lundi: '2026-10-19', statut: 'en-cours', km: 12 }],
  }, { verdict: 'augmenter' });
  dec('simulateur : jours avec charge, sur 30 jours', {
    joursKm: Array.from({ length: 90 }, (_, i) => ({ date: ajouterJours(J, i - 90), km: i % 7 === 0 ? 0 : 12 + (i % 4), charge: i % 7 === 0 ? 0 : 130 + (i % 5) * 7 })),
  }, { verdict: 'augmenter' });
  dec('simulateur : aucun km sur 30 jours (charge par km nulle)', { joursKm: Array.from({ length: 90 }, (_, i) => ({ date: ajouterJours(J, i - 90), km: 0, charge: 0 })), chronic: 40, r: null }, {});
  dec('simulateur : série de charge absente à J−1 (fraîcheur insuffisante, pas de simulateur)', { serieCharge: [] }, { verdict: 'maintenir', signaux: { fraicheur: 'insuffisant' } });

  // ── Paramètres datés et globaux ──
  dec('paramètres globaux : refHr 170 et paceHrK 1,5', { seances: reponse(2) }, { signaux: { reponse: 'surveiller' } }, { globaux: { ...PARAMS.globaux, refHr: 170, paceHrK: 1.5 }, modifs: [] });
  dec('paramètres : lt2Pace modifié après la séance sous-seuil', { seances: avecSS([[236]]) }, { signaux: { horsSousSeuil: 'ok' } },
    { globaux: PARAMS.globaux, modifs: [mod('l', 'lt2Pace', 230, '2026-01-01')] });
  dec('J un autre jour : le 1er janvier', { J: '2027-01-01', seances: [], semaines: [], premierJour: '2026-10-01', palier: { semaines: 0, reference_km: 0 } }, {});
  dec('J autour du 29 février', { J: '2028-03-01', seances: [], semaines: [], premierJour: '2028-01-01', palier: { semaines: 0, reference_km: 0 } }, {});

  // ── Athlète de la maquette ──
  {
    // Seules les séances lues par les signaux sont gardées : les 10 dernières séances sous-seuil et celles des 21 derniers jours.
    const complet = entreesMaquette();
    const recentes = ajouterJours(complet.J, -21);
    const dernieresSS = complet.seances.filter((s) => s.type === 'sous-seuil').slice(-10);
    const e: EntreesDecision = { ...complet, seances: complet.seances.filter((s) => s.date >= recentes || dernieresSS.includes(s)) };
    const p = parametresMaquette();
    r.ajouter('maquette : Augmenter, fourchette de 100 à 105 km (05, « Exemple »)', 'decider', entreeJson({ ...e }, p), () => decider(e), (res) => {
      const d = res as Decision;
      if (d.verdict !== 'augmenter' || d.fourchette?.min !== 100 || d.fourchette.max !== 105) throw new Error('la maquette ne donne plus 100–105 km');
    });
  }

  // ── simuler ──
  const sim = (nom: string, km: number, simulateur = SIMULATEUR_DE_TEST, fourchette = FOURCHETTE_DE_TEST): void =>
    r.appel(nom, 'simuler', simuler, km, simulateur, fourchette);
  for (const km of [0, 20, 48, 80, 99.9, 100, 103, 105, 105.1, 106, 120, 152, 200, 300]) sim(`simuler ${km} km (fourchette 100–105)`, km);
  sim('simuler 0 km sans km sur J−23 à J−1 : ratio indéfini', 0, { ...SIMULATEUR_DE_TEST, km23j: 0 });
  sim('simuler 50 km sans km sur J−23 à J−1 : ratio de 4,29', 50, { ...SIMULATEUR_DE_TEST, km23j: 0 });
  sim('simuler avec une charge par km nulle', 100, { ...SIMULATEUR_DE_TEST, chargeParKm: 0 });
  sim('simuler avec CTL de 80 et ATL de 130 : fraîcheur très basse', 100, { ...SIMULATEUR_DE_TEST, ctlJm1: 80, atlJm1: 130 });
  sim('simuler avec CTL de 120 et ATL de 40 : très frais', 60, { ...SIMULATEUR_DE_TEST, ctlJm1: 120, atlJm1: 40 });
  sim('simuler avec CTL sur 28 jours et ATL sur 5 jours', 103, { ...SIMULATEUR_DE_TEST, ctlDays: 28, atlDays: 5 });
  sim('simuler : écart arrondi au dixième, mi-chemin (0,05 km sous la fourchette)', 99.95);
  sim('simuler : écart de plus de mille km', 1234.5);
  sim('simuler : volume négatif', -5);
  sim('simuler avec une fourchette étroite d’un kilomètre', 50, SIMULATEUR_DE_TEST, { min: 50, max: 51, reference: 48, sourceReference: 'moyenne30j' });
  for (const km of [60, 70, 82, 96, 110]) sim(`simuler ${km} km, 150 km sur J−23 à J−1`, km, { ...SIMULATEUR_DE_TEST, km23j: 150 });

  // ── États et aides ──
  const e1 = (nom: string, fn: string, f: (x: number) => unknown, valeurs: number[]): void => {
    for (const v of valeurs) r.appel(`${nom} de ${v}`, fn, f, v);
  };
  e1('etatProgressivite', 'etatProgressivite', etatProgressivite, [0.79, 0.8, 1, 1.3, 1.31, 1.5, 1.51]);
  e1('etatFraicheur', 'etatFraicheur', etatFraicheur, [-26, -25, 0, 5, 6]);
  e1('etatReponse', 'etatReponse', etatReponse, [-3, 1, 2, 3, 4]);
  e1('etatHorsSousSeuil', 'etatHorsSousSeuil', etatHorsSousSeuil, [0, 1, 2, 3, 4]);
  e1('etatFootings', 'etatFootings', etatFootings, [100, 90, 89, 75, 74, 0]);
  e1('etatDecouplage', 'etatDecouplage', etatDecouplage, [0, 5, 5.1, 8, 8.1]);
  e1('etatPalier', 'etatPalier', etatPalier, [0, 1, 2, 3]);

  const tous = (etats: Partial<Record<CleSignal, EtatSignal>>) => signaux(etats);
  const v = (nom: string, s: ReturnType<typeof tous>, manque = 0): void => r.appel(nom, 'verdictDe', verdictDe, s, manque);
  v('verdictDe : tous les signaux au vert', tous({}));
  v('verdictDe : progressivité insuffisante, 12 jours manquants', tous({ progressivite: 'insuffisant' }), 12);
  v('verdictDe : progressivité insuffisante, 1 jour manquant', tous({ progressivite: 'insuffisant' }), 1);
  v('verdictDe : progressivité insuffisante, historique suffisant (ratio indéfini)', [signal('progressivite', 'insuffisant', { explication: 'Aucun km sur les 30 derniers jours.' }), ...tous({}).slice(1)], 0);
  v('verdictDe : un signal décisif en alerte', tous({ fraicheur: 'alerte' }));
  v('verdictDe : deux alertes décisives', tous({ fraicheur: 'alerte', reponse: 'alerte' }));
  v('verdictDe : trois alertes décisives', tous({ fraicheur: 'alerte', reponse: 'alerte', decouplage: 'alerte' }));
  v('verdictDe : alerte non décisive seule', tous({ horsSousSeuil: 'alerte' }));
  v('verdictDe : palier à surveiller seul', tous({ palier: 'surveiller' }));
  v('verdictDe : un signal à surveiller', tous({ reponse: 'surveiller' }));
  v('verdictDe : deux signaux à surveiller', tous({ reponse: 'surveiller', footings: 'surveiller' }));
  v('verdictDe : à surveiller et un décisif insuffisant', tous({ footings: 'surveiller', decouplage: 'insuffisant' }));
  v('verdictDe : à surveiller et deux décisifs insuffisants', tous({ footings: 'surveiller', decouplage: 'insuffisant', reponse: 'insuffisant' }));
  v('verdictDe : un décisif insuffisant seul', tous({ decouplage: 'insuffisant' }));
  v('verdictDe : un non décisif insuffisant seul', tous({ footings: 'insuffisant' }));
  v('verdictDe : alerte décisive et décisif insuffisant : l’alerte l’emporte', tous({ reponse: 'alerte', decouplage: 'insuffisant' }));
  v('verdictDe : liste de signaux vide', [], 0);

  const semaines = semainesDeBase();
  const f = (nom: string, verdict: Verdict, palier: { semaines: number; reference_km: number }, chronic: number | undefined, sem = semaines): void =>
    r.appel(nom, 'fourchetteDe', fourchetteDe, verdict, { semaines: sem, palier }, chronic);
  f('fourchetteDe : Augmenter avec palier atteint', 'augmenter', { semaines: 3, reference_km: 96 }, 90);
  f('fourchetteDe : Augmenter avec palier de 2 semaines (seuil)', 'augmenter', { semaines: 2, reference_km: 96 }, 90);
  f('fourchetteDe : Augmenter avec palier de 1 semaine', 'augmenter', { semaines: 1, reference_km: 96 }, 90);
  f('fourchetteDe : Maintenir avec palier', 'maintenir', { semaines: 3, reference_km: 96 }, 90);
  f('fourchetteDe : Maintenir sans palier', 'maintenir', { semaines: 0, reference_km: 0 }, 90);
  f('fourchetteDe : Alléger avec palier : moyenne sur 30 jours', 'alleger', { semaines: 3, reference_km: 96 }, 90);
  f('fourchetteDe : Alléger, 50 km', 'alleger', { semaines: 0, reference_km: 0 }, 50);
  f('fourchetteDe : sans verdict', 'aucun', { semaines: 3, reference_km: 96 }, 90);
  f('fourchetteDe : chronic absent', 'augmenter', { semaines: 3, reference_km: 96 }, undefined);
  f('fourchetteDe : palier atteint sans semaine terminée', 'augmenter', { semaines: 3, reference_km: 96 }, 90, [{ lundi: '2026-10-19', statut: 'en-cours', km: 5 }]);
  f('fourchetteDe : référence de 50 km, bornes à mi-chemin', 'augmenter', { semaines: 0, reference_km: 0 }, 50);
  f('fourchetteDe : référence de 90 km en Maintenir : 85,5 et 94,5', 'maintenir', { semaines: 0, reference_km: 0 }, 90);
  f('fourchetteDe : référence nulle', 'augmenter', { semaines: 0, reference_km: 0 }, 0);

  for (const n of [0, 1, 2, 5, 30]) r.appel(`jours(${n})`, 'jours', jours, n);
  const listes: string[][] = [[], ['a'], ['a', 'b'], ['a', 'b', 'c'], ['Progressivité', 'Fraîcheur', 'Réponse à l’effort', 'Découplage']];
  for (const l of listes) r.appel(`enumerer de ${l.length} noms`, 'enumerer', enumerer, l);
  const hist: [string | null, string][] = [[null, '2026-10-20'], ['2026-10-20', '2026-10-20'], ['2026-09-21', '2026-10-20'], ['2026-10-21', '2026-10-20'], ['2026-12-20', '2027-01-10']];
  for (const [premier, veille] of hist) {
    r.appel(`joursHistorique du ${String(premier)} à la veille ${veille}`, 'joursHistorique', joursHistorique, premier, veille);
    r.appel(`joursManquants (30) du ${String(premier)} à la veille ${veille}`, 'joursManquants', joursManquants, 30, premier, veille);
  }
  for (const d of ['2026-09-30', '2026-10-01', '2026-10-20', '2026-10-21', '2026-10-22']) {
    r.appel(`dansFenetre de ${d} dans les 21 jours avant J = 2026-10-21`, 'dansFenetre', dansFenetre, d, '2026-10-21', 21, '2026-10-20');
  }
  const desordre: Seance[] = [
    seance({ date: '2026-10-12', type: 'footing', debutUtc: 5, cleSource: 'b' }), seance({ date: '2026-10-12', type: 'footing', debutUtc: 5, cleSource: 'a' }),
    seance({ date: '2026-10-12', type: 'footing', debutUtc: 1, cleSource: 'z' }), seance({ date: '2026-10-10', type: 'footing', debutUtc: 9, cleSource: 'y' }),
  ];
  r.appel('trierSeances : date, début UTC puis clé source', 'trierSeances', trierSeances, desordre);
  if (echecs.length > 0) throw new Error(`décision : ${echecs.length} attente(s) non tenue(s) :\n${echecs.join('\n')}`);
  return r;
}

function mod(id: string, cle: ModifDatee['cle'], valeur: number, dateEffet: string): ModifDatee {
  return { id, cle, valeur, dateEffet, enregistreLe: `${dateEffet}T10:00:00Z` };
}

function base_sans_footings(): Seance[] {
  return seancesDeBase().filter((s) => s.type !== 'footing');
}
function base_sans_longue(): Seance[] {
  return seancesDeBase().filter((s) => s.type !== 'sortie-longue');
}
function base_sans_ss(): Seance[] {
  return seancesDeBase().filter((s) => s.type !== 'sous-seuil');
}

/** `ok` footings sous le plafond et `ko` au-dessus, dans les 14 derniers jours, avec les autres séances de base. */
function avecFootings(ok: number, ko: number, fcOk = 130, fcKo = 145): Seance[] {
  const dates = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-09', '2026-10-11', '2026-10-13', '2026-10-15', '2026-10-17'];
  const liste: Seance[] = [];
  for (let i = 0; i < ok; i++) liste.push(footing(dates[i % dates.length] ?? '2026-10-10', fcOk));
  for (let i = 0; i < ko; i++) liste.push(footing(dates[(ok + i) % dates.length] ?? '2026-10-10', fcKo));
  return [...base_sans_footings(), ...liste];
}

/** Neuf séances sous-seuil : six anciennes à 245 s/km, trois récentes à 245 + delta (FC de fin = refHr). `anciennes` : les trois dernières hors fenêtre. */
function reponse(delta: number, anciennes = false): Seance[] {
  const vieilles = ['2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'];
  const recentes = anciennes ? ['2026-09-25', '2026-09-26', '2026-09-27'] : ['2026-10-06', '2026-10-13', '2026-10-20'];
  return [
    ...vieilles.map((d) => sousSeuil(d, [245])),
    ...recentes.map((d) => sousSeuil(d, [245 + delta])),
    ...base_sans_ss().filter((s) => s.type !== 'sous-seuil'),
  ];
}

/** Les trois dernières séances sous-seuil portent des répétitions données ([allure, fcFin?]) ; les autres séances de base restent. */
function avecSS(reps: [number, number?][]): Seance[] {
  const recentes = ['2026-10-01', '2026-10-08', '2026-10-15'];
  const nouvelles = recentes.map((d, i) => (i === 2 ? sousSeuilReps(d, reps) : sousSeuil(d, [245])));
  return [...seancesDeBase().filter((s) => s.type !== 'sous-seuil' || s.date < '2026-10-01'), ...nouvelles];
}

function sousSeuilReps(date: string, reps: [number, number?][]): Seance {
  return seance({
    date, type: 'sous-seuil',
    repetitions: reps.map(([allure, fcFin], i) => ({ n: i + 1, debut_s: 0, duree_s: 180, allure_skm: allure, fcFin: fcFin ?? 164 })),
  });
}

/** `nb` répétitions hors sous-seuil réparties sur les trois dernières séances sous-seuil. */
function avecHors(nb: number): Seance[] {
  const reps: [number, number?][] = Array.from({ length: 3 }, (_, i) => (i < nb ? [237] : [245]));
  const plus: [number, number?][] = nb > 3 ? [[237]] : [];
  return avecSS([...reps, ...plus]);
}
