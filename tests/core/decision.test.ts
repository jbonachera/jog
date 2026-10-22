import { describe, expect, it } from 'vitest';
import { decider } from '../../src/core/decision';
import type { CleSignal, DateCivile, ParamsDates, Seance, Signal } from '../../src/core/types';
import type { Decision } from '../../src/core/decision/types';
import {
  DEFAUT_PARAMS,
  VEILLE,
  entrees,
  footing,
  seancesDeBase,
  sortieLongue,
  sousSeuil,
  type Options,
} from '../fixtures/decision';

function signal(d: Decision, cle: CleSignal): Signal {
  const trouve = d.signaux.find((s) => s.cle === cle);
  if (trouve === undefined) throw new Error(`signal absent : ${cle}`);
  return trouve;
}

function decision(options: Options = {}): Decision {
  return decider(entrees(options));
}

/** Les séances de base, sans les séances sous-seuil récentes, puis avec celles qu'on donne. */
const ANCIENNES_SOUS_SEUIL = ['2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'];
function sousSeuilAnciennes(allure = 245): Seance[] {
  return ANCIENNES_SOUS_SEUIL.map((d) => sousSeuil(d, [allure]));
}
/** Les séances de base avec ces séances sous-seuil récentes (dans l'ordre des dates). */
function avecRecentes(recentes: Seance[], anciennes: Seance[] = sousSeuilAnciennes()): Seance[] {
  const reste = seancesDeBase().filter((s) => s.type !== 'sous-seuil');
  return [...anciennes, ...recentes, ...reste];
}
function recentesA(allures: number[][], dates = ['2026-10-01', '2026-10-08', '2026-10-15']): Seance[] {
  return dates.map((d, i) => sousSeuil(d, allures[i] ?? [245]));
}

/** Footings à FC moyenne donnée, le même jour : seul leur nombre et leur FC comptent. */
function lotFootings(total: number, conformes: number, date = '2026-10-10'): Seance[] {
  return Array.from({ length: total }, (_, i) => footing(date, i < conformes ? 130 : 150));
}

describe('verdict (05, « Règle du verdict »)', () => {
  it('AUGMENTER quand tous les signaux sont OK (cas de base)', () => {
    const d = decision();
    expect(d.verdict).toBe('augmenter');
    expect(d.phrase).toBe('Tous les signaux sont au vert : la charge actuelle est absorbée.');
    expect(d.signaux.map((s) => s.etat)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it('MAINTENIR quand un signal décisif est à surveiller, et cite ce signal (05, « Maintenir »)', () => {
    const d = decision({ tsb: 6 });
    expect(d.verdict).toBe('maintenir');
    expect(d.phrase).toBe(
      "Rien d’alarmant, mais mieux vaut consolider avant de monter. Point à surveiller : Fraîcheur.",
    );
  });

  it('ALLÉGER quand un signal décisif est en alerte, et le cite (05, « Alléger »)', () => {
    const d = decision({ tsb: -26 });
    expect(d.verdict).toBe('alleger');
    expect(d.phrase).toBe('À surveiller en priorité : Fraîcheur.');
  });

  it("AUCUN verdict avant 30 jours d’historique, avec sa phrase (05, « Pas de verdict »)", () => {
    const d = decision({ premierJour: '2026-09-22' }); // 29 jours : 09-22 … 10-20
    expect(d.verdict).toBe('aucun');
    expect(d.phrase).toBe("Il faut 30 jours d’historique pour comparer la semaine au mois (encore 1 jour).");
    expect(d.fourchette).toBeNull();
    expect(d.simulateur).toBeNull();
  });

  it("un verdict existe dès 30 jours d’historique (borne)", () => {
    const d = decision({ premierJour: '2026-09-21' }); // 30 jours
    expect(d.verdict).not.toBe('aucun');
  });

  it('MAINTENIR quand seul un signal décisif est insuffisant (05, « Maintenir »)', () => {
    // Une seule séance sous-seuil récente : la réponse à l’effort n'a pas ses 9 séances.
    const d = decision({ seances: avecRecentes([], sousSeuilAnciennes().slice(0, 4)) });
    expect(signal(d, 'reponse').etat).toBe('insuffisant');
    expect(d.verdict).toBe('maintenir');
    expect(d.phrase).toBe(
      "Aucun signal défavorable, mais pas assez de données pour conseiller une hausse : Réponse à l’effort.",
    );
  });

  it('un signal non décisif insuffisant est sans effet, et la phrase le dit (05, « Phrase d\'explication »)', () => {
    // Deux footings seulement : les footings sont insuffisants, mais ce ne sont pas des signaux décisifs.
    const d = decision({
      seances: [...seancesDeBase().filter((s) => s.type !== 'footing'), ...lotFootings(2, 2)],
    });
    expect(signal(d, 'footings').etat).toBe('insuffisant');
    expect(d.verdict).toBe('augmenter');
    expect(d.phrase).toBe(
      'Tous les signaux disponibles sont au vert : la charge actuelle est absorbée.',
    );
  });

  it("un non décisif insuffisant ne compte pas comme « À surveiller » (palier avec une seule semaine)", () => {
    const d = decision({
      semaines: [
        { lundi: '2026-10-12', statut: 'terminee', km: 96 },
        { lundi: '2026-10-19', statut: 'en-cours', km: 0 },
      ],
    });
    expect(signal(d, 'palier').etat).toBe('insuffisant');
    expect(d.verdict).toBe('augmenter');
  });

  it("« Hors sous-seuil », « Footings » et « Palier » ne déclenchent jamais « Alléger »", () => {
    // Hors sous-seuil en alerte : 3 répétitions sur les 6 de la fenêtre sont plus rapides que lt2Pace.
    const hors = decision({ seances: avecRecentes(recentesA([[230, 230], [245, 230], [245, 230]])) });
    expect(signal(hors, 'horsSousSeuil').etat).toBe('alerte');
    expect(hors.verdict).toBe('maintenir');

    // Footings en alerte : 40 % sous le plafond.
    const footings = decision({
      seances: [...seancesDeBase().filter((s) => s.type !== 'footing'), ...lotFootings(5, 2)],
    });
    expect(signal(footings, 'footings').etat).toBe('alerte');
    expect(footings.verdict).toBe('maintenir');
  });

  it('chaque signal cité dans la phrase figure dans la liste des signaux', () => {
    const d = decision({
      tsb: 6,
      seances: [...seancesDeBase().filter((s) => s.type !== 'footing'), ...lotFootings(5, 2)],
    });
    expect(d.verdict).toBe('maintenir');
    const citesDansLaListe = d.signaux.filter((s) => s.etat === 'surveiller' || s.etat === 'alerte');
    expect(citesDansLaListe.map((s) => s.nom)).toEqual(['Fraîcheur', 'Footings sous le plafond']);
    for (const s of citesDansLaListe) {
      expect(d.phrase).toContain(s.nom);
    }
  });

  it('ALLÉGER cite la progressivité en alerte, sans fourchette ni simulateur ailleurs', () => {
    const d = decision({ tsb: 6, r: 1.6, premierJour: '2026-08-01' });
    expect(d.verdict).toBe('alleger');
    expect(d.phrase).toBe('À surveiller en priorité : Progressivité.');
  });
});

describe('bornes de chaque seuil (05, « Seuils du verdict », D-015 : arrondi avant comparaison)', () => {
  describe('progressivité : OK de 0,8 à 1,3, alerte au-delà de 1,5', () => {
    it.each([
      [0.8, 'ok'],
      [0.795, 'ok'], // arrondi à 0,80
      [0.794, 'surveiller'], // arrondi à 0,79
      [1.3, 'ok'],
      [1.304, 'ok'], // arrondi à 1,30
      [1.305, 'surveiller'], // arrondi à 1,31
      [1.5, 'surveiller'],
      [1.504, 'surveiller'], // arrondi à 1,50
      [1.505, 'alerte'], // arrondi à 1,51
    ] as const)('r = %s donne %s', (r, etat) => {
      expect(signal(decision({ r }), 'progressivite').etat).toBe(etat);
    });
  });

  describe('fraîcheur : OK de −25 à +5, à surveiller au-dessus de +5, alerte sous −25', () => {
    it.each([
      [-25, 'ok'],
      [-25.4, 'ok'], // arrondi à −25
      [-25.5, 'alerte'], // arrondi à −26
      [5, 'ok'],
      [5.4, 'ok'], // arrondi à +5
      [5.5, 'surveiller'], // arrondi à +6
    ] as const)('TSB = %s donne %s', (tsb, etat) => {
      expect(signal(decision({ tsb }), 'fraicheur').etat).toBe(etat);
    });
  });

  describe("réponse à l’effort : OK jusqu'à +1, à surveiller jusqu'à +3, alerte au-delà (s/km)", () => {
    // 6 séances à 240 s/km, puis 3 séances à 240 + écart : l'écart vaut l'écart donné.
    it.each([
      [1, 'ok'],
      [1.4, 'ok'], // arrondi à 1
      [1.5, 'surveiller'], // arrondi à 2
      [3, 'surveiller'],
      [3.4, 'surveiller'], // arrondi à 3
      [3.5, 'alerte'], // arrondi à 4
    ] as const)('écart de %s s/km donne %s', (ecart, etat) => {
      const d = decision({ seances: avecRecentes(recentesA([[240 + ecart], [240 + ecart], [240 + ecart]]), sousSeuilAnciennes(240)) });
      expect(signal(d, 'reponse').etat).toBe(etat);
    });

    it('un écart négatif se lit « plus rapide à FC égale »', () => {
      const d = decision({ seances: avecRecentes(recentesA([[238], [238], [238]]), sousSeuilAnciennes(240)) });
      const s = signal(d, 'reponse');
      expect(s.valeur).toBe(-2);
      expect(s.valeurTexte).toBe('2 s/km plus rapide à FC égale');
    });

    it('un écart positif se lit « plus lent à FC égale »', () => {
      const d = decision({ seances: avecRecentes(recentesA([[243], [243], [243]]), sousSeuilAnciennes(240)) });
      expect(signal(d, 'reponse').valeurTexte).toBe('3 s/km plus lent à FC égale');
    });
  });

  describe('répétitions hors sous-seuil : 0 OK, 1 ou 2 à surveiller, 3 ou plus en alerte', () => {
    // Les 3 dernières séances ont 6 répétitions au total ; `n` d'entre elles sont plus rapides que lt2Pace (238).
    it.each([
      [0, 'ok'],
      [1, 'surveiller'],
      [2, 'surveiller'],
      [3, 'alerte'],
    ] as const)('%s répétition(s) hors sous-seuil donne %s', (n, etat) => {
      const allures = [0, 1, 2].map((i) => [i < n ? 230 : 245, 245]);
      const d = decision({ seances: avecRecentes(recentesA(allures)) });
      expect(signal(d, 'horsSousSeuil').etat).toBe(etat);
      expect(signal(d, 'horsSousSeuil').valeurTexte).toBe(`${n} sur 6`);
    });

    it('une répétition à lt2Pace exactement n\'est pas hors sous-seuil (strict)', () => {
      const d = decision({ seances: avecRecentes(recentesA([[238, 245], [245, 245], [245, 245]])) });
      expect(signal(d, 'horsSousSeuil').valeur).toBe(0);
    });

    it('une répétition dont la FC de fin dépasse subtHrHi est hors sous-seuil', () => {
      const d = decision({
        seances: avecRecentes([sousSeuil('2026-10-01', [245], 169), sousSeuil('2026-10-08', [245]), sousSeuil('2026-10-15', [245])]),
      });
      expect(signal(d, 'horsSousSeuil').valeur).toBe(1);
    });
  });

  describe('footings sous le plafond : 90 % OK, 75 à 90 % à surveiller, sous 75 % alerte', () => {
    // 500 footings tous dans la fenêtre : `conformes` d'entre eux sont sous le plafond de 140 bpm.
    it.each([
      [450, 'ok', 90], // 90,0 %
      [448, 'ok', 90], // 89,6 % arrondi à 90
      [447, 'surveiller', 89], // 89,4 % arrondi à 89
      [375, 'surveiller', 75], // 75,0 %
      [373, 'surveiller', 75], // 74,6 % arrondi à 75
      [372, 'alerte', 74], // 74,4 % arrondi à 74
    ] as const)('%s footings conformes sur 500 donnent %s (%s %%)', (conformes, etat, pourcent) => {
      const d = decision({ seances: [...seancesDeBase().filter((s) => s.type !== 'footing'), ...lotFootings(500, conformes)] });
      const s = signal(d, 'footings');
      expect(s.etat).toBe(etat);
      expect(s.valeur).toBe(pourcent);
    });
  });

  describe('découplage de la dernière sortie longue : OK jusqu’à 5 %, à surveiller jusqu’à 8 %, alerte au-delà', () => {
    it.each([
      [5, 'ok'],
      [5.04, 'ok'], // arrondi à 5,0
      [5.05, 'surveiller'], // arrondi à 5,1
      [8, 'surveiller'],
      [8.04, 'surveiller'], // arrondi à 8,0
      [8.05, 'alerte'], // arrondi à 8,1
    ] as const)('découplage de %s %% donne %s', (valeur, etat) => {
      const d = decision({ seances: [...seancesDeBase().filter((s) => s.type !== 'sortie-longue'), sortieLongue('2026-10-12', { valeur })] });
      expect(signal(d, 'decouplage').etat).toBe(etat);
    });
  });

  describe('palier : OK à partir de 2 semaines, à surveiller sous 2, jamais en alerte', () => {
    it.each([
      [2, 'ok'],
      [1, 'surveiller'],
      [0, 'surveiller'],
    ] as const)('%s semaine(s) de palier donne %s', (semaines, etat) => {
      const d = decision({ palier: { semaines, reference_km: 96 } });
      expect(signal(d, 'palier').etat).toBe(etat);
    });
  });
});

describe('minimums de données (D-007), juste sous et juste au minimum', () => {
  it("progressivité : 29 jours d’historique est insuffisant, 30 suffisent", () => {
    const sous = signal(decision({ premierJour: '2026-09-22' }), 'progressivite');
    expect(sous.etat).toBe('insuffisant');
    expect(sous.valeur).toBeNull();
    expect(sous.valeurTexte).toBe('–');
    expect(sous.explication).toBe("Il faut 30 jours d’historique (encore 1 jour).");
    expect(signal(decision({ premierJour: '2026-09-21' }), 'progressivite').etat).toBe('ok');
  });

  it('fraîcheur : 27 jours sont insuffisants, 28 suffisent', () => {
    const sous = signal(decision({ premierJour: '2026-09-24' }), 'fraicheur');
    expect(sous.etat).toBe('insuffisant');
    expect(sous.explication).toBe("Il faut 28 jours d’historique pour estimer la fatigue (encore 1 jour).");
    expect(signal(decision({ premierJour: '2026-09-23' }), 'fraicheur').etat).toBe('ok');
  });

  it('réponse : 8 séances sous-seuil sont insuffisantes, 9 suffisent', () => {
    const huit = signal(decision({ seances: avecRecentes(recentesA([[245], [245], [245]]), sousSeuilAnciennes().slice(1)) }), 'reponse');
    expect(huit.etat).toBe('insuffisant');
    expect(huit.explication).toBe("Il faut 9 séances sous-seuil (8 pour l’instant).");
    expect(signal(decision(), 'reponse').etat).toBe('ok');
  });

  it('réponse : les 3 dernières séances doivent être entre J−21 et J−1 (J−21 compte, J−22 non)', () => {
    const limite = (date: string) => {
      const recentes = recentesA([[245], [245], [245]], [date, '2026-10-08', '2026-10-15']);
      return signal(decision({ seances: avecRecentes(recentes) }), 'reponse');
    };
    expect(limite('2026-09-30').etat).toBe('ok'); // J−21
    const trop_ancienne = limite('2026-09-29'); // J−22
    expect(trop_ancienne.etat).toBe('insuffisant');
    expect(trop_ancienne.explication).toBe('Moins de 3 séances sous-seuil sur les 21 derniers jours.');
  });

  it('hors sous-seuil : 2 séances sous-seuil dans les 21 jours sont insuffisantes, 3 suffisent', () => {
    const deux = signal(decision({ seances: avecRecentes(recentesA([[245], [245]], ['2026-10-01', '2026-10-08'])) }), 'horsSousSeuil');
    expect(deux.etat).toBe('insuffisant');
    expect(deux.explication).toBe('Moins de 3 séances sous-seuil sur les 21 derniers jours.');
    expect(signal(decision(), 'horsSousSeuil').etat).toBe('ok');
  });

  it('footings : 2 footings sont insuffisants, 3 suffisent ; J−14 compte, J−15 non', () => {
    const deux = signal(decision({ seances: [...seancesDeBase().filter((s) => s.type !== 'footing'), footing('2026-10-07'), footing('2026-10-10')] }), 'footings');
    expect(deux.etat).toBe('insuffisant');
    expect(deux.explication).toBe("Il faut 3 footings sur 14 jours (2 pour l’instant).");

    const avecLimite = [...seancesDeBase().filter((s) => s.type !== 'footing'), footing('2026-10-07'), footing('2026-10-10'), footing('2026-10-13')];
    expect(signal(decision({ seances: avecLimite }), 'footings').valeur).toBe(100);

    const trop_ancien = [...seancesDeBase().filter((s) => s.type !== 'footing'), footing('2026-10-06'), footing('2026-10-10'), footing('2026-10-13')];
    expect(signal(decision({ seances: trop_ancien }), 'footings').explication).toBe("Il faut 3 footings sur 14 jours (2 pour l’instant).");
  });

  it('découplage : aucune sortie utilisable est insuffisant ; une sortie sans valeur ne compte pas', () => {
    const aucune = signal(decision({ seances: seancesDeBase().filter((s) => s.type !== 'sortie-longue') }), 'decouplage');
    expect(aucune.etat).toBe('insuffisant');
    expect(aucune.explication).toBe('Aucune sortie longue utilisable sur les 14 derniers jours.');

    const sansValeur = sortieLongue('2026-10-12', { valeur: null });
    const sansValeurSeule = signal(decision({ seances: [...seancesDeBase().filter((s) => s.type !== 'sortie-longue'), sansValeur] }), 'decouplage');
    expect(sansValeurSeule.etat).toBe('insuffisant');
  });

  it('découplage : une sortie à J−14 compte, une sortie à J−15 non', () => {
    const hors = signal(decision({ seances: [...seancesDeBase().filter((s) => s.type !== 'sortie-longue'), sortieLongue('2026-10-06')] }), 'decouplage');
    expect(hors.etat).toBe('insuffisant');
    expect(signal(decision({ seances: [...seancesDeBase().filter((s) => s.type !== 'sortie-longue'), sortieLongue('2026-10-07')] }), 'decouplage').etat).toBe('ok');
  });

  it('palier : une semaine terminée est insuffisante, deux suffisent', () => {
    const une = signal(decision({ semaines: [{ lundi: '2026-10-12', statut: 'terminee', km: 96 }, { lundi: '2026-10-19', statut: 'en-cours', km: 0 }] }), 'palier');
    expect(une.etat).toBe('insuffisant');
    expect(une.explication).toBe('Il faut 2 semaines terminées.');
    expect(signal(decision(), 'palier').etat).toBe('ok');
  });
});

describe('phrases et valeurs des signaux (05, « Phrase d\'explication »)', () => {
  it('fraîcheur en alerte : texte et valeur', () => {
    const s = signal(decision({ tsb: -26 }), 'fraicheur');
    expect(s.explication).toBe('Fatigue nettement au-dessus de ce que la forme absorbe.');
    expect(s.valeurTexte).toBe('−26');
  });

  it('progressivité en surveillance haute : « Les 7 derniers jours dépassent nettement la moyenne du mois. »', () => {
    const s = signal(decision({ r: 1.4 }), 'progressivite');
    expect(s.explication).toBe('Les 7 derniers jours dépassent nettement la moyenne du mois.');
    expect(s.valeurTexte).toBe('1,40');
  });

  it('progressivité sous 0,8 : semaine plus légère', () => {
    expect(signal(decision({ r: 0.7 }), 'progressivite').explication).toBe(
      'Semaine nettement plus légère que la moyenne du mois.',
    );
  });

  it('hors sous-seuil cite lt2Pace et subtHrHi à J−1, et le compte « n sur N »', () => {
    const d = decision({ seances: avecRecentes(recentesA([[230, 245], [245, 245], [245, 245]])) });
    const s = signal(d, 'horsSousSeuil');
    expect(s.explication).toBe("Plus rapides que l’allure seuil (3:58/km) ou FC de fin au-dessus de 168 bpm, 3 dernières séances.");
    expect(s.valeurTexte).toBe('1 sur 6');
  });

  it('footings : part en pourcentage et plafond à J−1', () => {
    const s = signal(decision({ seances: [...seancesDeBase().filter((s) => s.type !== 'footing'), ...lotFootings(4, 3)] }), 'footings');
    expect(s.valeur).toBe(75);
    expect(s.valeurTexte).toBe('75 %');
    expect(s.explication).toBe('FC moyenne ≤ 140 bpm. Des footings trop rapides empiètent sur la récupération.');
  });

  it('découplage : date et distance de la sortie, puis la règle de 5 %', () => {
    const s = signal(decision(), 'decouplage');
    expect(s.explication).toBe('Sortie longue du 12 oct. (18 km). Sous 5 %, la base aérobie tient la durée.');
    expect(s.valeurTexte).toBe('2,0 %');
  });

  it('découplage avec des segments à allure marathon : on ajoute les portions faciles retenues', () => {
    const d = decision({ seances: [...seancesDeBase().filter((s) => s.type !== 'sortie-longue'), sortieLongue('2026-10-12', { avecMp: true, retenu: 55, total: 90 })] });
    expect(signal(d, 'decouplage').explication).toBe(
      'Sortie longue du 12 oct. (18 km). Sous 5 %, la base aérobie tient la durée. Portions faciles : 55 min sur 90.',
    );
  });

  it('palier : « n sem. autour de X km »', () => {
    const s = signal(decision({ palier: { semaines: 3, reference_km: 95.6 } }), 'palier');
    expect(s.valeurTexte).toBe('3 sem. autour de 96 km');
    expect(s.explication).toBe('Volume tenu assez longtemps pour envisager une hausse.');
  });

  it('les paramètres datés cités sont ceux de J−1 (D-006)', () => {
    const d = decision({ paramsAuJour: (date) => ({ ...DEFAUT_PARAMS(date), easyCap: date >= VEILLE ? 150 : 140 }) });
    expect(signal(d, 'footings').explication).toBe('FC moyenne ≤ 150 bpm. Des footings trop rapides empiètent sur la récupération.');
  });
});

describe('paramètres datés (D-006) : easyCap appliqué séance par séance', () => {
  // Plafond de 140 bpm jusqu'au 10 octobre, de 145 bpm à partir de ce jour.
  const datesParPlafond = (date: DateCivile): ParamsDates => ({ ...DEFAUT_PARAMS(date), easyCap: date >= '2026-10-10' ? 145 : 140 });

  it('un footing est jugé avec le plafond en vigueur à sa date', () => {
    const avant = footing('2026-10-08', 142); // plafond 140 : hors plafond
    const apres = footing('2026-10-12', 142); // plafond 145 : conforme
    const d = decision({
      paramsAuJour: datesParPlafond,
      seances: [...seancesDeBase().filter((s) => s.type !== 'footing'), avant, apres, footing('2026-10-15', 130)],
    });
    const s = signal(d, 'footings');
    expect(s.valeur).toBe(67); // 2 sur 3
    expect(s.etat).toBe('alerte');
  });

  it('la phrase cite la valeur à J−1 (145), pas celle de la séance', () => {
    const d = decision({ paramsAuJour: datesParPlafond, seances: [...seancesDeBase().filter((s) => s.type !== 'footing'), footing('2026-10-08', 142), footing('2026-10-12', 142), footing('2026-10-15', 130)] });
    expect(signal(d, 'footings').explication).toContain('FC moyenne ≤ 145 bpm.');
  });
});

describe('déterminisme (ADR 0006)', () => {
  it('mêmes entrées, même décision, en égalité profonde', () => {
    expect(decision({ tsb: 6 })).toEqual(decision({ tsb: 6 }));
    expect(decision()).toEqual(decision());
  });

  it("ne modifie pas les entrées", () => {
    const e = entrees({ tsb: 6 });
    const avant = JSON.stringify(e.seances);
    decider(e);
    expect(JSON.stringify(e.seances)).toBe(avant);
  });
});
