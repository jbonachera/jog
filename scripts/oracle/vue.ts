// Cas dorés de src/core/vue : calculerVue (la Vue arrondie que l'interface reçoit) et calculerVueBrute (avant arrondi).
// Entrée : un objet unique { intrinseques, parametres, J, derniereSynchro }, comme EntreeVue.
import { ajouterJours } from '../../src/core/dates';
import { parametresDefaut } from '../../src/core/parametres';
import type { ModifDatee, Parametres, SeanceIntrinseque, Verdict, Vue } from '../../src/core/types';
import { calculerVue, calculerVueBrute, type EntreeVue } from '../../src/core/vue';
import { seanceIntrinseque } from '../../tests/fixtures/construire';
import { Recueil } from './recueil';
import { historique, intrinsequesMaquette, intrinsequesS1, parametresMaquette, parametresS1 } from './scenario';

const J = '2026-10-21';
const PARAMS = parametresDefaut();

export function genererVue(): Recueil {
  const r = new Recueil('vue');
  const calculer = (nom: string, entree: EntreeVue, controle?: (vue: Vue) => void): void =>
    r.ajouter(nom, 'calculerVue', entree, () => calculerVue(entree), controle === undefined ? undefined : (v) => controle(v as Vue));
  const verdict = (attendu: Verdict) => (v: Vue): void => {
    if (v.decision.verdict !== attendu) throw new Error(`verdict ${v.decision.verdict} au lieu de ${attendu}`);
  };
  const entree = (intrinseques: SeanceIntrinseque[], extra: Partial<EntreeVue> = {}): EntreeVue => ({
    intrinseques, parametres: PARAMS, J, derniereSynchro: '2026-10-21T05:12:00Z', ...extra,
  });

  // ── L'athlète de la maquette sur 14 mois ──
  calculer('maquette 14 mois', {
    intrinseques: intrinsequesMaquette(), parametres: parametresMaquette(), J: '2026-10-20', derniereSynchro: '2026-10-20T06:30:00Z',
  }, (v) => {
    if (v.parametresEnVigueur.suggestionHrMax === null) throw new Error('la maquette devrait proposer une FC max');
  });

  // ── Cas simples ──
  calculer('Vue vide : aucune séance', entree([], { derniereSynchro: null }), (v) => {
    verdict('aucun')(v);
    if (v.premierJour !== null) throw new Error('premierJour devrait être nul');
  });
  const une = [seanceIntrinseque({ cleSource: 'gen:une', date: '2026-10-20', debutUtc: Date.parse('2026-10-20T07:00:00Z') })];
  calculer('Vue d’une seule séance, la veille de J', entree(une), verdict('aucun'));
  calculer('Vue d’une seule séance, 29 jours avant J', entree([{ ...une[0]!, date: ajouterJours(J, -29) }]), verdict('aucun'));
  calculer('séance du jour J et séance future ignorées', entree([
    ...une, seanceIntrinseque({ cleSource: 'gen:j', date: J, debutUtc: Date.parse(`${J}T07:00:00Z`) }), seanceIntrinseque({ cleSource: 'gen:f', date: '2026-10-25', debutUtc: Date.parse('2026-10-25T07:00:00Z') }),
  ]));
  calculer('seules des séances du jour J et futures : Vue vide', entree([seanceIntrinseque({ cleSource: 'gen:j', date: J, debutUtc: 1 })]), verdict('aucun'));

  // ── Quantité d'historique : 29, 30 et 31 jours (D-007) ──
  for (const n of [29, 30, 31]) {
    calculer(`${n} jours d’historique`, entree(historique({ debut: ajouterJours(J, -n), fin: ajouterJours(J, -1), graine: n })), n < 30 ? verdict('aucun') : undefined);
  }
  calculer('60 jours d’historique', entree(historique({ debut: ajouterJours(J, -60), fin: ajouterJours(J, -1), graine: 5 })));

  // ── Les trois verdicts, à partir de l'historique ──
  const stable = historique({ debut: '2026-08-24', fin: '2026-10-20', graine: 11 });
  const vers = (nom: string, intr: SeanceIntrinseque[], attendu: Verdict, p: Parametres = PARAMS): void =>
    calculer(nom, entree(intr, { parametres: p }), verdict(attendu));
  vers('Alléger : volume des 7 derniers jours triplé après un mois calme', historique({
    debut: '2026-09-03', fin: '2026-10-20', graine: 2, echelle: (d) => (d >= '2026-10-14' ? 3 : 1),
  }), 'alleger');
  vers('Maintenir : volume récent en hausse modérée', historique({
    debut: '2026-09-03', fin: '2026-10-20', graine: 2, echelle: (d) => (d >= '2026-10-14' ? 1.5 : 1),
  }), 'maintenir');
  calculer('historique stable de huit semaines', entree(stable));
  calculer('historique stable sans FC', entree(historique({ debut: '2026-08-31', fin: '2026-10-20', graine: 11, sansFc: true })));

  // ── Historique complet avec tests, courses, paramètres datés ──
  calculer('historique avec tests, courses et paramètres datés', entree(intrinsequesS1().filter((s) => s.date >= '2026-08-17'), { parametres: parametresS1() }));
    const modifs: ModifDatee[] = [
    { id: 'a', cle: 'easyCap', valeur: 135, dateEffet: '2026-09-01', enregistreLe: '2026-09-01T07:00:00Z' },
    { id: 'b', cle: 'easyCap', valeur: 145, dateEffet: '2026-09-01', enregistreLe: '2026-09-02T07:00:00Z' },
    { id: 'c', cle: 'hrMax', valeur: 186, dateEffet: '2026-10-10', enregistreLe: '2026-10-10T07:00:00Z' },
    { id: 'd', cle: 'lt2Pace', valeur: 240, dateEffet: '2026-10-20', enregistreLe: '2026-10-20T07:00:00Z' },
  ];
  calculer('paramètres datés : modification le jour de la séance et à même date', entree(historique({ debut: '2026-08-25', fin: '2026-10-20', graine: 4 }), { parametres: { globaux: PARAMS.globaux, modifs } }));
  calculer('paramètres globaux modifiés (CTL sur 28 jours, ATL sur 5 jours, refHr 170)', entree(historique({ debut: '2026-08-25', fin: '2026-10-20', graine: 4 }), {
    parametres: { globaux: { ...PARAMS.globaux, ctlDays: 28, atlDays: 5, refHr: 170, paceHrK: 1.4, subtPctLo: 18, subtPctHi: 28 }, modifs: [] },
  }));

  // ── Calendrier ──
  calculer('semaines à cheval sur deux années (J = 2027-01-06)', entree(historique({ debut: '2026-11-20', fin: '2027-01-05', graine: 6 }), { J: '2027-01-06', derniereSynchro: '2027-01-06T08:00:00Z' }));
  calculer('J le 1er janvier (l’année de J−1 est complète)', entree(historique({ debut: '2026-11-15', fin: '2026-12-31', graine: 6 }), { J: '2027-01-01' }));
  calculer('autour du 29 février (J = 2028-03-01)', entree(historique({ debut: '2028-01-25', fin: '2028-02-29', graine: 8 }), { J: '2028-03-01' }));
  calculer('J un lundi', entree(historique({ debut: '2026-09-20', fin: '2026-10-18', graine: 9 }), { J: '2026-10-19' }));
    calculer('séances du soir de passage à l’heure d’été (29 mars 2026)', entree(historique({ debut: '2026-03-10', fin: '2026-04-05', graine: 12 }), { J: '2026-04-06' }));

  // ── Entrées particulières ──
  const desordre = historique({ debut: '2026-09-25', fin: '2026-10-20', graine: 13 });
  calculer('séances reçues en ordre inverse', entree([...desordre].reverse()));
  const doubles = historique({ debut: '2026-09-25', fin: '2026-10-20', graine: 13 });
  calculer('deux séances le même jour avec même instant de début', entree([...doubles, { ...doubles[3]!, cleSource: 'gen:copie' }]));
  calculer('séance sans distance ni FC', entree([...historique({ debut: '2026-09-25', fin: '2026-10-20', graine: 14 }),
    seanceIntrinseque({ cleSource: 'gen:vide', date: '2026-10-10', debutUtc: Date.parse('2026-10-10T18:00:00Z'), duree_min: 0, km: 0, fcMoy: null, allureMoy_skm: null, ef: null, minutes: { easy: 0, mp: 0, subt: 0, hard: 0 }, charge: 0 }),
  ]));
    const pic = (n: number, fcPic: number): SeanceIntrinseque[] => historique({ debut: '2026-09-01', fin: '2026-10-20', graine: 16, chronos: [{ date: '2026-09-20', marquage: 'course', distance_km: 10, temps_s: 2500, fcPic: n + fcPic }] });
  calculer('FC max observée proposée (pic de 193)', entree(pic(0, 193)));
  calculer('FC max observée proposée et suspecte (pic de 206)', entree(pic(0, 206)));
  calculer('pic de 190,49996 : pas de suggestion (double arrondi évité)', entree(pic(0, 190.49996)));
  calculer('pic de 190,5 : suggestion de 191', entree(pic(0, 190.5)));
  calculer('niveau : course de 5 km', entree(historique({ debut: '2026-09-10', fin: '2026-10-20', graine: 17, chronos: [{ date: '2026-10-04', marquage: 'course', distance_km: 5, temps_s: 1190 }] })));

  // ── calculerVueBrute : valeurs avant l'arrondi à 4 décimales ──
  const brute = (nom: string, e: EntreeVue): void => r.ajouter(nom, 'calculerVueBrute', e, () => calculerVueBrute(e));
  brute('calculerVueBrute : une seule séance', entree(une));
  brute('calculerVueBrute : 31 jours d’historique', entree(historique({ debut: ajouterJours(J, -31), fin: ajouterJours(J, -1), graine: 31 })));
  brute('calculerVueBrute : 45 jours d’historique', entree(historique({ debut: ajouterJours(J, -45), fin: ajouterJours(J, -1), graine: 60 })));
  brute('calculerVueBrute : Vue vide', entree([]));
  return r;
}
