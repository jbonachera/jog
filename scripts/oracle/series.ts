// Cas dorés de src/core/series : serieCharge, serieRatio, semaines, palier, compteurs.
import { ajouterJours } from '../../src/core/dates';
import { agregerJours, type JourAgrege } from '../../src/core/jours';
import { parametresDefaut } from '../../src/core/parametres';
import { compteurs, palier, semaines, serieCharge, serieRatio } from '../../src/core/series';
import type { Parametres, Seance } from '../../src/core/types';
import { seance } from '../../tests/fixtures/decision';
import { semaineVue } from '../../tests/fixtures/vues';
import { Recueil } from './recueil';
import { historique, preparer } from './scenario';

const params = (...modifs: Parametres['modifs']): Parametres => ({ globaux: parametresDefaut().globaux, modifs });

/** Des jours à charge et km donnés, sans séance : pour des cas où seul le nombre compte. */
function joursUniformes(debut: string, charges: number[], km: (i: number) => number = () => 8): JourAgrege[] {
  const seances = charges.map((charge, i) => ({ charge, i }));
  const fin = seances.length - 1;
  const tout: Seance[] = seances
    .filter(({ charge }) => charge > 0)
    .map(({ charge, i }) => seance({ date: dateApres(debut, i), type: 'footing', charge, km: km(i) }));
  return agregerJours(tout, debut, dateApres(debut, fin));
}

const dateApres = ajouterJours;

export function genererSeries(): Recueil {
  const r = new Recueil('series');
  const sansTrou = (debut: string, nb: number, charge: (i: number) => number, km: (i: number) => number = () => 8): JourAgrege[] =>
    joursUniformes(debut, Array.from({ length: nb }, (_, i) => charge(i)), km);

  // ── serieCharge ──
  const opt = { ctlDays: 42, atlDays: 7 };
  r.appel('serieCharge d’une liste vide', 'serieCharge', serieCharge, [], opt);
  r.appel('serieCharge d’un seul jour : CTL₀ = ATL₀ = charge du jour', 'serieCharge', serieCharge, sansTrou('2026-10-01', 1, () => 100), opt);
  r.appel('serieCharge de 10 jours à charge variable', 'serieCharge', serieCharge, sansTrou('2026-10-01', 10, (i) => (i % 3 === 0 ? 0 : 50 + i * 4)), opt);
  r.appel('serieCharge de 28 jours : l’initialisation porte sur les 28 jours', 'serieCharge', serieCharge, sansTrou('2026-09-01', 28, (i) => 40 + (i % 7) * 10), opt);
  r.appel('serieCharge de 29 jours : l’initialisation ignore le 29e', 'serieCharge', serieCharge, sansTrou('2026-09-01', 29, (i) => 40 + (i % 7) * 10 + (i === 28 ? 200 : 0)), opt);
  r.appel('serieCharge de 60 jours avec un pic de charge', 'serieCharge', serieCharge, sansTrou('2026-08-20', 60, (i) => (i === 45 ? 400 : 60 + (i % 7) * 8)), opt);
  r.appel('serieCharge avec CTL sur 28 jours et ATL sur 5 jours', 'serieCharge', serieCharge, sansTrou('2026-09-10', 20, (i) => 30 + i * 3), { ctlDays: 28, atlDays: 5 });
  r.appel('serieCharge de jours tous au repos', 'serieCharge', serieCharge, sansTrou('2026-09-10', 5, () => 0), opt);
  r.appel('serieCharge à cheval sur 29 février', 'serieCharge', serieCharge, sansTrou('2028-02-25', 8, (i) => 50 + i), opt);
  const trou = sansTrou('2026-10-01', 5, () => 50);
  r.appelErreur('serieCharge refuse des jours non consécutifs', 'serieCharge', serieCharge, [trou[0]!, trou[2]!], opt);

  // ── serieRatio ──
  const km = (i: number): number => (i % 7 === 0 ? 0 : 6 + (i % 5) * 2);
  r.appel('serieRatio d’une liste vide', 'serieRatio', serieRatio, []);
  r.appel('serieRatio d’un jour', 'serieRatio', serieRatio, sansTrou('2026-10-01', 1, () => 50, () => 10));
  r.appel('serieRatio de 29 jours : r toujours nul', 'serieRatio', serieRatio, sansTrou('2026-09-01', 29, () => 50, km));
  r.appel('serieRatio de 30 jours : r défini au 30e jour', 'serieRatio', serieRatio, sansTrou('2026-09-01', 30, () => 50, km));
  r.appel('serieRatio de 45 jours', 'serieRatio', serieRatio, sansTrou('2026-08-15', 45, () => 50, km));
  r.appel('serieRatio de 31 jours sans aucun km : chronic nul, r nul', 'serieRatio', serieRatio, sansTrou('2026-09-01', 31, () => 0, () => 0));
  r.appel('serieRatio avec 30 jours de repos puis une sortie', 'serieRatio', serieRatio, sansTrou('2026-09-01', 31, (i) => (i === 30 ? 50 : 0), (i) => (i === 30 ? 12 : 0)));
  r.appelErreur('serieRatio refuse des jours non consécutifs', 'serieRatio', serieRatio, [trou[0]!, trou[3]!]);

  // ── semaines ──
  const cas = (nom: string, debut: string, J: string, p: Parametres = params(), opts: { sansFc?: boolean; echelle?: number } = {}): void => {
    const { seances, jours } = preparer(historique({ debut, fin: ajouterJours(J, -1), ...opts }), J);
    r.appel(nom, 'semaines', semaines, jours, seances, J, p);
  };
  cas('semaines : sept semaines d’historique, J un mercredi', '2026-09-02', '2026-10-21');
  cas('semaines : J un lundi, la semaine précédente est terminée', '2026-09-02', '2026-10-19');
  cas('semaines : J un dimanche', '2026-09-02', '2026-10-25');
  cas('semaines : trois jours d’historique', '2026-10-18', '2026-10-21');
  cas('semaines : un seul jour d’historique', '2026-10-20', '2026-10-21');
  cas('semaines : historique commençant un dimanche', '2026-10-11', '2026-10-21');
  cas('semaines : plafond de footing abaissé en cours de route (paramètres datés)', '2026-09-02', '2026-10-21',
    params({ id: 'a', cle: 'easyCap', valeur: 133, dateEffet: '2026-09-14', enregistreLe: '2026-09-14T10:00:00Z' }));
  cas('semaines : plafond de footing relevé le jour même d’un footing', '2026-09-02', '2026-10-21',
    params({ id: 'a', cle: 'easyCap', valeur: 150, dateEffet: '2026-10-07', enregistreLe: '2026-10-07T10:00:00Z' }));
  cas('semaines : à cheval sur deux années', '2026-12-14', '2027-01-06');
  cas('semaines : autour du 29 février', '2028-02-14', '2028-03-05');
  cas('semaines : séances sans FC (footings non conformes)', '2026-09-20', '2026-10-21', params(), { sansFc: true });
  cas('semaines : volume doublé', '2026-09-20', '2026-10-21', params(), { echelle: 2 });
  {
    const J = '2026-10-21';
    const { seances, jours } = preparer(historique({ debut: '2026-10-05', fin: '2026-10-20' }), J);
    r.appelErreur('semaines refuse une série qui ne finit pas à J−1', 'semaines', semaines, jours, seances, '2026-10-23', params());
    r.appelErreur('semaines refuse des jours non consécutifs', 'semaines', semaines, [jours[0]!, jours[2]!], seances, J, params());
    r.appel('semaines d’une liste de jours vide', 'semaines', semaines, [], [], J, params());
  }
  {
    const J = '2026-10-21';
    const identiques = Array.from({ length: 14 }, (_, i) => seance({ date: ajouterJours('2026-10-07', i), type: 'footing', charge: 50, km: 10, fcMoy: 130 }));
    const jours = agregerJours(identiques, '2026-10-07', '2026-10-20');
    r.appel('semaines : charges toutes égales, monotonie nulle', 'semaines', semaines, jours, identiques, J, params());
  }

  // ── palier ──
  const sem = (kms: number[], statuts: ('terminee' | 'en-cours')[] = kms.map(() => 'terminee')) =>
    kms.map((km, i) => semaineVue(ajouterJours('2026-08-03', 7 * i), { km, statut: statuts[i] ?? 'terminee' }));
  r.appel('palier d’aucune semaine', 'palier', palier, []);
  r.appel('palier d’une seule semaine terminée', 'palier', palier, sem([80]));
  r.appel('palier : dernière semaine terminée à zéro km', 'palier', palier, sem([80, 80, 0]));
  r.appel('palier : trois semaines à 96 km', 'palier', palier, sem([96, 96, 96]));
  r.appel('palier : la semaine en cours est ignorée', 'palier', palier, sem([96, 96, 96, 20], ['terminee', 'terminee', 'terminee', 'en-cours']));
  r.appel('palier : une semaine hors tolérance coupe la chaîne', 'palier', palier, sem([60, 100, 100, 100]));
  r.appel('palier : écart de 10,0 % (100 contre 110) compte', 'palier', palier, sem([110, 100]));
  r.appel('palier : écart de 10,04 % compte', 'palier', palier, sem([110.04, 100]));
  r.appel('palier : écart de 10,05 % ne compte pas', 'palier', palier, sem([110.05, 100]));
  r.appel('palier : écart de −10,04 % compte', 'palier', palier, sem([89.96, 100]));
  r.appel('palier : écart de −10,05 % ne compte pas', 'palier', palier, sem([89.95, 100]));
  r.appel('palier : écart de −10 % pile compte', 'palier', palier, sem([90, 100]));
  r.appel('palier : semaines à 0 km avant la référence', 'palier', palier, sem([0, 0, 50]));
  r.appel('palier : une seule semaine en cours', 'palier', palier, sem([40], ['en-cours']));

  // ── compteurs ──
  const cpt = (nom: string, debut: string, J: string, opts: { sansFc?: boolean } = {}): void => {
    const { seances, jours } = preparer(historique({ debut, fin: ajouterJours(J, -1), ...opts }), J);
    r.appel(nom, 'compteurs', compteurs, jours, seances, J);
  };
  cpt('compteurs : cinquante jours d’historique, J un mercredi', '2026-09-01', '2026-10-21');
  {
    // Un historique qui remonte avant le 1er janvier de l'an passé (historiquePrecedent vrai pour l'année) : une séance
    // isolée au début, puis des séances seulement sur les trois derniers mois.
    const J = '2026-10-21';
    const intr = [...historique({ debut: '2024-12-30', fin: '2024-12-30' }), ...historique({ debut: '2026-07-20', fin: '2026-10-20', graine: 21 })];
    const { seances, jours } = preparer(intr, J);
    r.appel('compteurs : historique qui remonte avant le 1er janvier de l’année précédente', 'compteurs', compteurs, jours, seances, J);
  }
  cpt('compteurs : J le 1er janvier (l’année de J−1 est complète)', '2026-11-01', '2027-01-01');
  cpt('compteurs : J le 2 janvier (une journée dans la nouvelle année)', '2026-11-01', '2027-01-02');
  cpt('compteurs : vingt jours d’historique', '2026-10-01', '2026-10-21');
  cpt('compteurs : quarante-cinq jours d’historique', '2026-09-06', '2026-10-21');
  cpt('compteurs : soixante et un jours d’historique, période B complète', '2026-08-21', '2026-10-21');
  cpt('compteurs : autour du 29 février', '2028-01-20', '2028-03-01');
  cpt('compteurs : J un lundi', '2026-09-10', '2026-10-19');
  cpt('compteurs : séances sans FC', '2026-09-20', '2026-10-21', { sansFc: true });
  r.appel('compteurs : aucun jour et aucune séance', 'compteurs', compteurs, [], [], '2026-10-21');
  cpt('compteurs : un seul jour d’historique', '2026-10-20', '2026-10-21');
  {
    const J = '2026-10-21';
    const { seances, jours } = preparer(historique({ debut: '2026-10-01', fin: '2026-10-20' }), J);
    r.appelErreur('compteurs refuse une série qui ne finit pas à J−1', 'compteurs', compteurs, jours, seances, '2026-10-25');
    r.appelErreur('compteurs refuse des jours non consécutifs', 'compteurs', compteurs, [jours[0]!, jours[2]!], seances, J);
  }
  return r;
}
