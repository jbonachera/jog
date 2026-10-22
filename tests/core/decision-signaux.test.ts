// Signaux 1 à 7 (05) : réponse à l’effort et D-004, valeurs non finies, découplage, paramètres datés (D-006),
// et tri des séances en entrée.
import { describe, expect, it } from 'vitest';
import { decider } from '../../src/core/decision';
import type { Decision } from '../../src/core/decision/types';
import type { CleSignal, ParamsDates, Seance, Signal } from '../../src/core/types';
import { DEFAUT_PARAMS, entrees, seance, seancesDeBase, sortieLongue, sousSeuil, type Options } from '../fixtures/decision';

function decision(options: Options = {}): Decision {
  return decider(entrees(options));
}

function signal(d: Decision, cle: CleSignal): Signal {
  const trouve = d.signaux.find((s) => s.cle === cle);
  if (trouve === undefined) throw new Error(`signal absent : ${cle}`);
  return trouve;
}

const ANCIENNES = ['2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'];
const RECENTES = ['2026-10-01', '2026-10-08', '2026-10-15'];

/** Les séances de base, sans leurs séances sous-seuil, puis ces séances sous-seuil. */
function avecSeances(sousSeuilSeances: Seance[]): Seance[] {
  return [...seancesDeBase().filter((s) => s.type !== 'sous-seuil'), ...sousSeuilSeances];
}
/** Une séance sous-seuil par date, chacune avec les allures données (une par répétition). */
function sessions(dates: string[], allures: number[], fcFin?: number): Seance[] {
  return dates.map((d) => sousSeuil(d, allures, fcFin));
}
/** Les 6 séances anciennes et les 3 récentes, à allure donnée. */
function sixEtTrois(anciennes: number, recentes: number, fcFinRecentes?: number, fcFinAnciennes?: number): Seance[] {
  return [...sessions(ANCIENNES, [anciennes], fcFinAnciennes), ...sessions(RECENTES, [recentes], fcFinRecentes)];
}

describe("réponse à l’effort : allure normalisée (D-004, 04)", () => {
  it('une répétition se normalise à refHr : 240 s/km avec une FC de fin de 170, refHr 164 et paceHrK 1,1, donne 246,6 (écart de 7 s/km)', () => {
    // Anciennes : 240 s/km à FC de fin 164, donc 240. Récentes : 240 s/km à FC de fin 170, donc 246,6.
    const d = decision({ seances: avecSeances(sixEtTrois(240, 240, 170)) });
    expect(signal(d, 'reponse').valeur).toBe(7);
    expect(signal(d, 'reponse').etat).toBe('alerte');
  });

  it.each([
    [2, 20], // refHr 160, paceHrK 2 : 240 + (170 − 160) × 2 = 260, écart 20
    [1.5, 15], // refHr 160, paceHrK 1,5 : 240 + (170 − 160) × 1,5 = 255, écart 15
  ])('avec refHr 160 et paceHrK %s, les répétitions se normalisent à ces valeurs (écart %s s/km)', (paceHrK, attendu) => {
    const d = decision({
      globaux: { refHr: 160, paceHrK },
      seances: avecSeances(sixEtTrois(240, 240, 170, 160)),
    });
    expect(signal(d, 'reponse').valeur).toBe(attendu);
  });

  it('le terme de FC est signé : une FC de fin sous refHr rend la séance plus rapide à FC égale', () => {
    // 240 + (158 − 164) × 1,1 = 233,4 : écart de −7 s/km.
    const d = decision({ seances: avecSeances(sixEtTrois(240, 240, 158)) });
    expect(signal(d, 'reponse').valeur).toBe(-7);
    expect(signal(d, 'reponse').valeurTexte).toBe('7 s/km plus rapide à FC égale');
  });

  it('une séance à plusieurs répétitions compte pour la moyenne de ses répétitions', () => {
    // Récentes : 230 et 250 (moyenne 240), anciennes à 240 : aucun écart. Une première répétition
    // (230), une dernière (250) ou une somme donneraient un autre résultat.
    const recentes = sessions(RECENTES, [230, 250]);
    const d = decision({ seances: avecSeances([...sessions(ANCIENNES, [240]), ...recentes]) });
    expect(signal(d, 'reponse').valeur).toBe(0);
    expect(signal(d, 'reponse').valeurTexte).toBe('0 s/km, sans écart à FC égale');
  });

  it('au-delà de 9 séances, la plus ancienne est ignorée', () => {
    // Une 10ᵉ séance très rapide, la plus ancienne, ne doit pas entrer dans le calcul.
    const extra = sousSeuil('2026-08-13', [100]);
    const d = decision({ seances: avecSeances([extra, ...sixEtTrois(240, 243)]) });
    expect(signal(d, 'reponse').valeur).toBe(3);
    expect(signal(d, 'reponse').valeurTexte).toBe('3 s/km plus lent à FC égale');
  });

  it('les 6 séances qui précèdent les 3 dernières sont comptées exactement : ni 5, ni 7', () => {
    // 11 séances, de la plus ancienne à la plus récente. Les 6 précédentes sont 200 puis cinq fois 240 :
    // moyenne 233,3, écart 9,7, soit 10. Avec 5 (240) l'écart serait 3, avec 7 il serait 9.
    const dates = ['2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', ...RECENTES];
    const allures = [100, 240, 200, 240, 240, 240, 240, 240, 243, 243, 243];
    const d = decision({ seances: avecSeances(dates.map((date, i) => sousSeuil(date, [allures[i] ?? 0]))) });
    expect(signal(d, 'reponse').valeur).toBe(10);
    expect(signal(d, 'reponse').valeurTexte).toBe('10 s/km plus lent à FC égale');
  });

  it('une répétition NaN est filtrée de la moyenne, sans rendre la séance inutilisable', () => {
    // Récentes : [240, NaN], soit 240 après filtrage. Sans filtrage, la moyenne serait NaN.
    const d = decision({ seances: avecSeances([...sessions(ANCIENNES, [240]), ...sessions(RECENTES, [240, Number.NaN])]) });
    expect(signal(d, 'reponse').etat).toBe('ok');
    expect(signal(d, 'reponse').valeur).toBe(0);
  });

  it("une séance dont toutes les répétitions sont NaN ne compte pas pour le signal 3", () => {
    // 9 séances dont une est entièrement NaN : 8 utilisables, donc insuffisant.
    const dates = ['2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', ...RECENTES];
    const d = decision({ seances: avecSeances(dates.map((date, i) => sousSeuil(date, [i === 0 ? Number.NaN : 240]))) });
    expect(signal(d, 'reponse').etat).toBe('insuffisant');
    expect(signal(d, 'reponse').explication).toBe("Il faut 9 séances sous-seuil (8 pour l’instant).");
  });

  it("une séance dont toutes les répétitions sont NaN ne compte pas pour les 3 dernières du signal 4", () => {
    // Dans la fenêtre de 21 jours : 10-01 est entièrement NaN, donc il reste 2 séances utilisables.
    const d = decision({
      seances: avecSeances([
        sousSeuil('2026-09-24', [240]),
        sousSeuil('2026-10-01', [Number.NaN]),
        sousSeuil('2026-10-08', [240]),
        sousSeuil('2026-10-15', [240]),
      ]),
    });
    expect(signal(d, 'horsSousSeuil').etat).toBe('insuffisant');
    expect(signal(d, 'horsSousSeuil').explication).toBe('Moins de 3 séances sous-seuil sur les 21 derniers jours.');
  });

  it('la phrase cite refHr à J−1 : « Allure normalisée à 160 bpm » quand refHr vaut 160', () => {
    const d = decision({ globaux: { refHr: 160 } });
    expect(signal(d, 'reponse').explication).toBe(
      'Allure normalisée à 160 bpm, 3 dernières séances sous-seuil comparées aux 6 précédentes.',
    );
  });
});

describe('valeurs non finies : insuffisant, « – » (décision du lot)', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'un ratio de %s donne progressivité insuffisante et aucun verdict',
    (r) => {
      const d = decision({ r });
      const s = signal(d, 'progressivite');
      expect(s.etat).toBe('insuffisant');
      expect(s.valeur).toBeNull();
      expect(s.valeurTexte).toBe('–');
      expect(d.verdict).toBe('aucun');
      expect(d.fourchette).toBeNull();
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'un TSB de %s donne fraîcheur insuffisante ; comme signal décisif, elle empêche AUGMENTER',
    (tsb) => {
      const d = decision({ tsb });
      const s = signal(d, 'fraicheur');
      expect(s.etat).toBe('insuffisant');
      expect(s.valeur).toBeNull();
      expect(s.valeurTexte).toBe('–');
      expect(d.verdict).toBe('maintenir');
      expect(d.phrase).toBe(
        'Aucun signal défavorable, mais pas assez de données pour conseiller une hausse : Fraîcheur.',
      );
    },
  );

  it('un découplage NaN sur la dernière sortie longue donne découplage insuffisant, « – »', () => {
    const d = decision({
      seances: [...seancesDeBase().filter((s) => s.type !== 'sortie-longue'), sortieLongue('2026-10-12', { valeur: Number.NaN })],
    });
    const s = signal(d, 'decouplage');
    expect(s.etat).toBe('insuffisant');
    expect(s.valeur).toBeNull();
    expect(s.valeurTexte).toBe('–');
    expect(d.verdict).toBe('maintenir');
  });
});

describe('découplage de la dernière sortie longue (05, signal 6 ; D-005)', () => {
  const sansSortie = () => seancesDeBase().filter((s) => s.type !== 'sortie-longue');

  it('un découplage de 9 % donne ALLÉGER, avec le signal cité', () => {
    const d = decision({ seances: [...sansSortie(), sortieLongue('2026-10-12', { valeur: 9 })] });
    expect(signal(d, 'decouplage').etat).toBe('alerte');
    expect(d.verdict).toBe('alleger');
    expect(d.phrase).toBe('À surveiller en priorité : Découplage de la dernière sortie longue.');
  });

  it('un découplage insuffisant seul donne MAINTENIR, et la phrase cite le signal', () => {
    const d = decision({ seances: sansSortie() });
    expect(d.verdict).toBe('maintenir');
    expect(d.phrase).toBe(
      "Aucun signal défavorable, mais pas assez de données pour conseiller une hausse : Découplage de la dernière sortie longue.",
    );
  });

  it('avec deux sorties longues dans la fenêtre, c’est la plus récente qui compte (9 % puis 2 %)', () => {
    const d = decision({ seances: [...sansSortie(), sortieLongue('2026-10-07', { valeur: 9 }), sortieLongue('2026-10-12', { valeur: 2 })] });
    expect(signal(d, 'decouplage').valeur).toBe(2);
    expect(d.verdict).toBe('augmenter');
  });

  it('avec deux sorties longues dans la fenêtre, la plus récente compte aussi quand elle est en alerte (2 % puis 9 %)', () => {
    const d = decision({ seances: [...sansSortie(), sortieLongue('2026-10-07', { valeur: 2 }), sortieLongue('2026-10-12', { valeur: 9 })] });
    expect(signal(d, 'decouplage').valeur).toBe(9);
    expect(d.verdict).toBe('alleger');
  });

  it('une séance qui n’est pas une sortie longue est ignorée, même si elle a un découplage', () => {
    const footingAvecDecouplage = seance({
      date: '2026-10-18',
      type: 'footing',
      decouplage: { valeur: 9, retenu_min: 60, total_min: 60, avecMp: false },
    });
    const d = decision({ seances: [...seancesDeBase(), footingAvecDecouplage] });
    expect(signal(d, 'decouplage').valeur).toBe(2);
    expect(d.verdict).toBe('augmenter');
  });
});

describe('paramètres datés appliqués séance par séance (D-006)', () => {
  it('lt2Pace daté : une séance antérieure à la modification est jugée avec l’ancien seuil', () => {
    // lt2Pace 238 avant le 8 octobre, 246 à partir du 8. Les 245 s/km du 1er ne sont pas hors sous-seuil,
    // ceux du 8 et du 15 le sont (plus rapides que 246).
    const paramsAuJour = (date: string): ParamsDates => ({ ...DEFAUT_PARAMS(date), lt2Pace: date >= '2026-10-08' ? 246 : 238 });
    const d = decision({ paramsAuJour, seances: avecSeances(sessions(RECENTES, [245])) });
    expect(signal(d, 'horsSousSeuil').valeurTexte).toBe('2 sur 3');
    expect(signal(d, 'horsSousSeuil').valeur).toBe(2);
  });

  it('subtHrHi daté : une FC de fin de 169 n’est hors sous-seuil qu’avant la modification (168, puis 170)', () => {
    const paramsAuJour = (date: string): ParamsDates => ({ ...DEFAUT_PARAMS(date), subtHrHi: date >= '2026-10-08' ? 170 : 168 });
    const d = decision({
      paramsAuJour,
      seances: avecSeances([sousSeuil('2026-10-01', [245], 169), sousSeuil('2026-10-08', [245], 169), sousSeuil('2026-10-15', [245], 169)]),
    });
    expect(signal(d, 'horsSousSeuil').valeurTexte).toBe('1 sur 3');
  });

  it('la phrase cite lt2Pace à J−1 : une modification effective le jour J ne change pas la phrase', () => {
    const paramsAuJour = (date: string): ParamsDates => ({ ...DEFAUT_PARAMS(date), lt2Pace: date >= '2026-10-21' ? 250 : 238 });
    const d = decision({ paramsAuJour });
    expect(signal(d, 'horsSousSeuil').explication).toBe(
      "Plus rapides que l’allure seuil (3:58/km) ou FC de fin au-dessus de 168 bpm, 3 dernières séances.",
    );
  });

  it('la phrase cite lt2Pace à J−1 : une modification effective à J−1 est lue', () => {
    const paramsAuJour = (date: string): ParamsDates => ({ ...DEFAUT_PARAMS(date), lt2Pace: date >= '2026-10-20' ? 246 : 238 });
    const d = decision({ paramsAuJour });
    expect(signal(d, 'horsSousSeuil').explication).toBe(
      "Plus rapides que l’allure seuil (4:06/km) ou FC de fin au-dessus de 168 bpm, 3 dernières séances.",
    );
  });
});

describe('tri des séances en entrée (D-004 ; 05, « Réponse à l’effort »)', () => {
  it('une liste de séances dans le désordre donne la même décision que la liste triée', () => {
    const inverse = [...seancesDeBase()].reverse();
    const attendu = decision();
    const d = decider(entrees({ seances: inverse }));
    expect(d.signaux).toEqual(attendu.signaux);
    expect(d.verdict).toBe(attendu.verdict);
    expect(d.phrase).toBe(attendu.phrase);
  });

  it('les 3 dernières séances sont choisies par date, et non par l’ordre de la liste', () => {
    // Les 3 séances du 1er, 8 et 15 octobre à 243 s/km sont plus récentes que les 6 à 240 (ordre inversé).
    const melange = [...avecSeances(sixEtTrois(240, 243))].reverse();
    const d = decision({ seances: melange });
    expect(signal(d, 'reponse').valeur).toBe(3);
  });
});
