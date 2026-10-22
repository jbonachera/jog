// Cas dorés de src/core/seance : miseEnForme, calculerSeanceIntrinseque, classerSeances, marquage.
// Les séances brutes viennent des constructeurs de tests/fixtures/construire.ts (aucune donnée personnelle).
import { distanceStandardProche, marquer } from '../../src/core/seance/marquage';
import { calculerSeanceIntrinseque, classerSeances, miseEnForme } from '../../src/core/seance';
import { moyenneGlissante } from '../../src/core/seance/miseEnForme';
import { mediane } from '../../src/core/seance/repetitions';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { ActivitePivot, ParamsDates, SeanceIntrinseque } from '../../src/core/types';
import { construirePivot, footing, seanceIntrinseque, sortieLongue, sousSeuil, type Element } from '../../tests/fixtures/construire';
import { Recueil } from './recueil';

const PARAMS: ParamsDates = parametresAuJour(parametresDefaut(), '2026-10-10');

/** Un pivot construit à la main : les colonnes sont données telles quelles (NaN = pas de mesure). */
function pivotManuel(t: number[], dist: number[], fc: number[] | null, vitesse: number[] | null): ActivitePivot {
  const base = construirePivot([]);
  return {
    ...base,
    duree_s: t.at(-1) ?? 0,
    distance_m: dist.filter((d) => !Number.isNaN(d)).at(-1) ?? 0,
    pasFC_s: fc === null ? null : 1,
    flux: {
      t_s: Float32Array.from(t),
      dist_m: Float32Array.from(dist),
      fc_bpm: fc === null ? null : Float32Array.from(fc),
      alt_m: null,
      vitesse_ms: vitesse === null ? null : Float32Array.from(vitesse),
    },
  };
}

export function genererMiseEnForme(): Recueil {
  const r = new Recueil('seance-miseEnForme');
  const m = (nom: string, pivot: ActivitePivot): void => r.appel(nom, 'miseEnForme', miseEnForme, pivot);

  m('pivot vide : aucun échantillon', construirePivot([]));
  m('un seul échantillon', pivotManuel([0], [0], [140], [3]));
  m('footing de 3 minutes, mesures à chaque seconde', footing({ min: 3, fc: 140, allure: 300 }));
  m('distance mesurée toutes les 3 secondes : interpolation linéaire', footing({ min: 2, fc: 140, allure: 300, pasDistance: 3 }));
  m('FC mesurée toutes les 5 secondes : prolongée 10 secondes au plus', footing({ min: 2, fc: 140, allure: 300, pasFC: 5 }));
  m('trou de FC de 30 secondes : NaN au-delà de 10 secondes', footing({ min: 3, fc: 140, allure: 300, trous: [{ debut_s: 60, duree_s: 30 }] }));
  m('fichier sans vitesse : vitesse dérivée de la distance', footing({ min: 2, fc: 140, allure: 300, sansVitesse: true, pasDistance: 3 }));
  m('aucune distance mesurée : distance cumulée nulle', footing({ min: 1, fc: 140, allure: 300, sansDistance: true }));
  m('aucune FC dans le fichier', footing({ min: 1, fc: null, allure: 300 }));
  m('FC bruitée, pics de FC', footing({ min: 2, fc: 140, allure: 300, bruitFc: { graine: 7, amplitude: 3 }, pics: [{ debut_s: 30, duree_s: 10, fc: 190 }] }));
  const pause: Element[] = [
    { duree_s: 40, allure_skm: 300, fc: { debut: 130, fin: 140 } },
    { pause_s: 25 },
    { duree_s: 40, allure_skm: 300, fc: { debut: 140, fin: 150 } },
  ];
  m('pause de 25 secondes : le poids du dernier échantillon avant la pause est plafonné à 10 s', construirePivot(pause));
  m('horodatages irréguliers : doublon d’instant, trous de mesures', pivotManuel(
    [0, 1, 2, 2, 3, 5, 15, 16],
    [Number.NaN, 0, 5, 5, 8, Number.NaN, 30, 33],
    [Number.NaN, 120, Number.NaN, 125, Number.NaN, Number.NaN, Number.NaN, 130],
    null,
  ));
  m('distance et FC absentes au début, présentes ensuite', pivotManuel(
    [0, 2, 4, 6, 8, 10],
    [Number.NaN, Number.NaN, 10, 20, Number.NaN, 45],
    [Number.NaN, Number.NaN, Number.NaN, 150, 152, Number.NaN],
    [2, 2.5, 3, 3.5, 4, 4.5],
  ));

  const t = [0, 1, 2, 3, 4, 5, 20, 21, 22, 23];
  const dt = [1, 1, 1, 1, 1, 10, 1, 1, 1, 1];
  const v = [1, Number.NaN, 3, 4, 5, Number.NaN, 7, 8, Number.NaN, 10];
  const mg = (nom: string, avant: number, apres: number): void =>
    r.ajouter(nom, 'moyenneGlissante', [v, t, dt, avant, apres], () =>
      moyenneGlissante(Float64Array.from(v), Float64Array.from(t), Float64Array.from(dt), avant, apres));
  mg('moyenneGlissante : fenêtre qui précède, instant courant inclus', 3, 0);
  mg('moyenneGlissante : fenêtre centrée de ± 2 s', 2, 2);
  mg('moyenneGlissante : fenêtre nulle', 0, 0);
  mg('moyenneGlissante : fenêtre qui couvre toute la série', 100, 100);
  r.ajouter('moyenneGlissante : série vide', 'moyenneGlissante', [[], [], [], 5, 5], () =>
    moyenneGlissante(new Float64Array(0), new Float64Array(0), new Float64Array(0), 5, 5));
  return r;
}

const NOM_COURT = { min: 4, fc: 140, allure: 330 } as const;

export function genererIntrinseque(): Recueil {
  const r = new Recueil('seance-intrinseque');
  const c = (nom: string, pivot: ActivitePivot, p: ParamsDates = PARAMS): void =>
    r.appel(nom, 'calculerSeanceIntrinseque', calculerSeanceIntrinseque, pivot, p);

  c('footing de 15 minutes à 135 bpm', footing({ min: 15, fc: 135, allure: 330 }));
  c('footing sans FC', footing({ min: 12, fc: null, allure: 330 }));
  c('footing avec tours automatiques au kilomètre', footing({ min: 20, fc: 138, allure: 300, toursAuKm: true }));
  c('footing sans distance mesurée : pas de km, d’allure ni d’EF', footing({ min: 10, fc: 140, allure: 330, sansDistance: true }));
  c('footing avec mesures de distance toutes les 3 s, FC toutes les 5 s et FC bruitée', footing({ min: 20, fc: 138, allure: 320, pasDistance: 3, pasFC: 5, bruitFc: { graine: 42, amplitude: 3 } }));
  c('footing avec un trou de FC d’une minute', footing({ min: 20, fc: 138, allure: 320, trous: [{ debut_s: 300, duree_s: 60 }] }));
  c('footing avec un pic de FC soutenu de 20 secondes', footing({ min: 15, fc: 140, allure: 320, pics: [{ debut_s: 600, duree_s: 20, fc: 195 }] }));
  c('footing sans vitesse dans le fichier', footing({ min: 12, fc: 140, allure: 330, sansVitesse: true, pasDistance: 3 }));

  const pauses: Element[] = [
    { duree_s: 400, allure_skm: 330, fc: { debut: 135, fin: 140 } },
    { pause_s: 45 },
    { duree_s: 400, allure_skm: 330, fc: { debut: 140, fin: 142 } },
    { pause_s: 8 },
    { duree_s: 400, allure_skm: 330, fc: { debut: 142, fin: 145 } },
  ];
  c('séance à pauses : 45 s puis 8 s sans échantillon', construirePivot(pauses));

  const reps5 = { reps: [180, 180, 180], recup: 60, fcFin: 165, echauffement_min: 3, retour_min: 2 };
  c('sous-seuil 3×3′ avec tours manuels', sousSeuil({ ...reps5, avecTours: true }));
  c('sous-seuil 3×3′ sans tours : détection dans le flux', sousSeuil({ ...reps5, avecTours: false }));
  c('sous-seuil 3×3′ dont les tours sont automatiques : repli sur le flux', sousSeuil({ ...reps5, avecTours: true, declenchement: 'distance' }));

  const courtes = { echauffement_min: 3, retour_min: 2, fcFin: 165 };
  c('répétitions de durées inégales : format 5′-4′-3′-3′', sousSeuil({ ...courtes, reps: [300, 240, 180, 150], recup: 60, avecTours: true }));
  c('répétitions de 3 min sans FC mesurée', sousSeuil({ ...courtes, reps: [180, 180, 180, 180], recup: 60, avecTours: true, sansFc: true }));
  c('récupération de 150 s : les répétitions ne forment pas une série', sousSeuil({ ...courtes, reps: [150, 150, 150], recup: 150, avecTours: true }));
  c('deux répétitions seulement : pas de série', sousSeuil({ ...courtes, reps: [240, 240], recup: 60, avecTours: true }));
  c('FC de fin trop basse pour un sous-seuil', sousSeuil({ ...courtes, fcFin: 150, reps: [180, 180, 180], recup: 60, avecTours: true }));
  c('répétitions dont les tours sont d’intensité « repos » : repli sur le flux', sousSeuil({ ...courtes, reps: [180, 180, 180], recup: 60, avecTours: true, intensite: 'repos' }));
  c('répétitions d’intensité « actif » avec tour de fin', sousSeuil({ ...courtes, reps: [180, 180, 180], recup: 60, avecTours: true, intensite: 'actif', tourFin_s: 20 }));
  c('répétitions rapides dont la FC de fin dépasse lt2Hr : classées au-dessus du seuil', sousSeuil({ ...courtes, fcFin: 178, reps: [180, 180, 180], recup: 60, avecTours: true }));
  c('FC en retard au début de chaque répétition (montée, descente)', sousSeuil({ ...courtes, reps: [240, 240, 240], recup: 90, avecTours: true, montee_s: 40, descente_s: 40 }));

  c('sortie longue de 80 min avec 12 min à allure marathon', sortieLongue({ min: 80, fc: 140, segmentsMp: [{ debut_min: 30, duree_min: 12, fc: 165 }] }));
  const derive: Element[] = [{ duree_s: 3840, allure_skm: 330, fc: { debut: 130, fin: 142 } }];
  c('sortie de 64 min avec dérive de la FC : découplage non nul', construirePivot(derive));

  const course = construirePivot([{ duree_s: 600, allure_skm: 238, fc: { debut: 165, fin: 180 } }]);
  c('course marquée par la plateforme (case compétition)', { ...course, competition: true, nom: 'Course du village' });
  c('course reconnue au nom : 10k', { ...course, nom: '10k de Lyon' });
  c('test chronométré reconnu au nom', { ...course, nom: 'Test chrono 5000 m' });
  c('course sans nom', { ...course, competition: true, nom: null });

  const vitesse = (rapide: number, nb: number): Element[] => {
    const elements: Element[] = [{ duree_s: 300, allure_skm: 330, fc: { debut: 138, fin: 138 } }];
    for (let i = 0; i < nb; i++) {
      elements.push({ duree_s: 120, allure_skm: 330, fc: { debut: 138, fin: 138 } });
      elements.push({ duree_s: rapide, allure_skm: 210, fc: { debut: 150, fin: 150 } });
    }
    elements.push({ duree_s: 120, allure_skm: 330, fc: { debut: 138, fin: 138 } });
    return elements;
  };
  c('footing avec quatre lignes droites de 15 s', construirePivot(vitesse(15, 4)));
  c('footing avec deux lignes droites seulement', construirePivot(vitesse(15, 2)));
  c('footing avec quatre accélérations de 40 s : trop longues', construirePivot(vitesse(40, 4)));

  const reglage = footing({ min: 12, fc: 150, allure: 330 });
  c('FC de 150 bpm tenue 12 min : segment à allure marathon (paramètres par défaut)', reglage);
  c('même séance avec lt2Hr à 148 : classée au-dessus du seuil', reglage, { ...PARAMS, lt2Hr: 148 });
  c('même séance avec hrMax à 200 : bande basse à 156 bpm, donc facile', reglage, { ...PARAMS, hrMax: 200 });
  c('même séance avec z2 à 70 % : bande plus large', reglage, { ...PARAMS, z2: 70 });
  const flux = sousSeuil({ ...reps5, avecTours: false });
  c('sous-seuil détecté dans le flux avec lt2Pace à 200 s/km (seuil de plage rapide : 240 s/km)', flux, { ...PARAMS, lt2Pace: 200 });
  c('sous-seuil non détecté dans le flux avec lt2Pace à 180 s/km (seuil de plage rapide : 220 s/km)', flux, { ...PARAMS, lt2Pace: 180 });

  const decale = footing({ min: 8, fc: 140, allure: 330 });
  c('séance du soir de passage à l’heure d’été : date locale et début UTC repris du pivot', {
    ...decale, dateLocale: '2026-03-29', debutUtc: Date.UTC(2026, 2, 28, 23, 30), decalageLocal_min: 60, cleSource: 'fit:ete',
  });
  c('séance sans nom, source Strava', { ...decale, nom: null, cleSource: 'strava:99', source: 'strava-archive' });

  const noms: [string, string | null, boolean][] = [
    ['nom par défaut de Strava (matin)', 'Course à pied le matin', false],
    ['nom par défaut de Strava (nuit)', 'Course à pied de nuit', false],
    ['nom par défaut de Strava en caractères décomposés (NFC)', 'Course a\u0300 pied dans l\'après-midi', false],
    ['apostrophe typographique : le nom par défaut n’est pas reconnu, le mot « course » en fait une course', 'Course à pied dans l’après-midi', false],
    ['nom par défaut de Strava avec une apostrophe droite', 'Course à pied dans l\'après-midi', false],
    ['semi-marathon', 'Semi-marathon de Paris', false],
    ['10 km collé', '10k du quartier', false],
    ['test avec majuscules', 'TT 5000', false],
    ['nom ordinaire', 'Footing tranquille', false],
    ['compétition avec nom par défaut', 'Course à pied le midi', true],
  ];
  for (const [nom, valeur, competition] of noms) {
    c(`marquage d’une séance courte : ${nom}`, { ...footing(NOM_COURT), nom: valeur, competition });
  }
  c('séance vide : aucun échantillon', construirePivot([]));
  c('séance d’un seul échantillon', pivotManuel([0], [0], [140], [3]));
  return r;
}

export function genererMarquage(): Recueil {
  const r = new Recueil('seance-marquage');
  const noms: (string | null)[] = [
    null, '', 'Course à pied le matin', 'Course à pied le midi', 'Course à pied dans l’après-midi', 'Course à pied dans l\'après-midi', 'Course à pied en soirée',
    'Course à pied de nuit', 'Course à pied de nuit.', 'Course a\u0300 pied de nuit', 'Semi de Boulogne', 'Marathon de Paris', '10k', '10 k', '10000 m',
    '5 km', '5km', 'Corrida de Noël', 'Cross du coin', 'Trail des crêtes', 'Course à la montagne', 'Test 5 km', 'test', 'TT', 'chrono', 'Chronométrage',
    'Footing', 'Attestation', 'Sortie matinale', 'Mon Test Du Jour', 'Course et test', 'ATTENTION',
  ];
  for (const nom of noms) {
    r.appel(`marquer sans compétition le nom ${JSON.stringify(nom)}`, 'marquer', marquer, false, nom);
  }
  r.appel('marquer avec la case compétition et un nom de test', 'marquer', marquer, true, 'Test 5 km');
  r.appel('marquer avec la case compétition et sans nom', 'marquer', marquer, true, null);
  for (const km of [0, 1, 4.9, 5, 7.5, 7.51, 7.499, 10.2, 15.5, 15.54875, 15.548, 21.0975, 25, 31.6, 31.65, 42.195, 50, 100, -3]) {
    r.appel(`distanceStandardProche de ${km} km`, 'distanceStandardProche', distanceStandardProche, km);
  }
  const listes: number[][] = [[], [5], [3, 1, 2], [4, 1, 3, 2], [1.5, 1.5], [10, -10, 0], [0.1, 0.2, 0.3]];
  for (const l of listes) r.appel(`mediane de [${l.join(', ')}]`, 'mediane', mediane, l);
  return r;
}

export function genererClassement(): Recueil {
  const r = new Recueil('seance-classement');
  const s = (partiel: Partial<SeanceIntrinseque> = {}): SeanceIntrinseque => seanceIntrinseque(partiel);
  let n = 0;
  const cle = (): string => `strava:c${++n}`;
  const k = (date: string, duree: number, extra: Partial<SeanceIntrinseque> = {}): SeanceIntrinseque =>
    s({ cleSource: cle(), date, duree_min: duree, debutUtc: Date.parse(`${date}T07:00:00Z`) + n, ...extra });
  const cl = (nom: string, liste: SeanceIntrinseque[]): void => r.appel(nom, 'classerSeances', classerSeances, liste);

  cl('aucune séance', []);
  cl('un footing de 60 min', [k('2026-10-20', 60)]);
  cl('une séance marquée course est une course, même longue', [k('2026-10-20', 120, { marquage: 'course', distanceRef_km: 21.0975, temps_s: 7200 })]);
  cl('une séance marquée test est un test', [k('2026-10-20', 25, { marquage: 'test', distanceRef_km: 5, temps_s: 1200 })]);
  cl('une course avec répétitions reste une course', [k('2026-10-20', 40, { marquage: 'course', repetitions: [{ n: 1, debut_s: 0, duree_s: 180, allure_skm: 240, fcFin: 165 }] })]);
  const rep = [{ n: 1, debut_s: 0, duree_s: 180, allure_skm: 250, fcFin: 165 }];
  cl('des répétitions font un sous-seuil, même de plus de 90 min', [k('2026-10-20', 100, { repetitions: rep, format: '1×3′' })]);
  cl('90 minutes exactement : sortie longue', [k('2026-10-20', 90)]);
  cl('89,99 minutes : footing', [k('2026-10-20', 89.99)]);
  cl('lignes droites : footing-lignes-droites', [k('2026-10-20', 50, { lignesDroites: true })]);
  cl('lignes droites sur une séance de 95 min : sortie longue', [k('2026-10-20', 95, { lignesDroites: true })]);
  cl('semaine : 61 min contre trois footings de 40 min : sortie longue', [k('2026-10-19', 40), k('2026-10-20', 40), k('2026-10-21', 40), k('2026-10-24', 61)]);
  cl('semaine : exactement 1,5 fois la médiane : footing', [k('2026-10-19', 40), k('2026-10-20', 40), k('2026-10-21', 40), k('2026-10-24', 60)]);
  cl('semaine : juste au-dessus de 1,5 fois la médiane : sortie longue', [k('2026-10-19', 40), k('2026-10-20', 40), k('2026-10-21', 40), k('2026-10-24', 60.0001)]);
  cl('semaine : médiane de quatre durées (moyenne des deux du milieu : 45), 70 min dépasse 67,5', [k('2026-10-19', 30), k('2026-10-20', 50), k('2026-10-21', 40), k('2026-10-24', 70)]);
  cl('semaine : égalité entre deux plus longues séances, la première reçoit le type', [k('2026-10-19', 30), k('2026-10-20', 30), k('2026-10-21', 30), k('2026-10-22', 50), k('2026-10-24', 50)]);
  cl('semaine : la plus longue séance est un sous-seuil, aucune sortie longue', [k('2026-10-19', 30), k('2026-10-20', 30), k('2026-10-22', 80, { repetitions: rep }), k('2026-10-24', 60)]);
  cl('semaine : la plus longue séance est une course, aucune sortie longue', [k('2026-10-19', 30), k('2026-10-20', 30), k('2026-10-22', 80, { marquage: 'course' }), k('2026-10-24', 60)]);
  cl('semaine sans footing : médiane absente', [k('2026-10-19', 80, { repetitions: rep }), k('2026-10-21', 70, { marquage: 'test' })]);
  cl('une séance de plus de 90 min ne compte pas dans la médiane des footings', [k('2026-10-19', 40), k('2026-10-20', 100), k('2026-10-21', 40), k('2026-10-24', 62)]);
  cl('semaines différentes : chaque semaine a son contexte', [k('2026-10-12', 40), k('2026-10-13', 40), k('2026-10-14', 61), k('2026-10-19', 40), k('2026-10-20', 40), k('2026-10-21', 40), k('2026-10-24', 61)]);
  cl('semaine à cheval sur deux années', [k('2026-12-30', 40), k('2027-01-01', 40), k('2027-01-02', 40), k('2027-01-03', 61), k('2027-01-04', 61)]);
  cl('semaine du 29 février', [k('2028-02-28', 40), k('2028-02-29', 40), k('2028-03-01', 40), k('2028-03-03', 61)]);
  cl('lundi et dimanche : deux semaines distinctes', [k('2026-10-18', 40), k('2026-10-19', 61), k('2026-10-20', 40), k('2026-10-21', 40)]);
  cl('entrée en désordre : sortie triée par date, début UTC, clé source', [
    k('2026-10-21', 50), k('2026-10-19', 50), s({ cleSource: 'strava:b', date: '2026-10-20', debutUtc: 5, duree_min: 50 }),
    s({ cleSource: 'strava:a', date: '2026-10-20', debutUtc: 5, duree_min: 50 }), s({ cleSource: 'strava:z', date: '2026-10-20', debutUtc: 1, duree_min: 50 }),
  ]);
  cl('deux séances le même jour', [k('2026-10-20', 45), k('2026-10-20', 20, { lignesDroites: true })]);
  return r;
}
