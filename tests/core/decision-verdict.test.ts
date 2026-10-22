// Verdict et phrases (05, « Règle du verdict », « Phrase d'explication », « Données insuffisantes »).
import { describe, expect, it } from 'vitest';
import { decider } from '../../src/core/decision';
import type { Decision } from '../../src/core/decision/types';
import type { Seance } from '../../src/core/types';
import { entrees, footing, seancesDeBase, sortieLongue, sousSeuil, type Options } from '../fixtures/decision';

function decision(options: Options = {}): Decision {
  return decider(entrees(options));
}

/** Les séances de base sans leurs footings, puis ces footings : 5 footings, 2 conformes à 130 bpm. */
function footings(total: number, conformes: number): Seance[] {
  return Array.from({ length: total }, (_, i) => footing('2026-10-10', i < conformes ? 130 : 150));
}
const SANS_FOOTINGS = () => seancesDeBase().filter((s) => s.type !== 'footing');
const SANS_SORTIE = () => seancesDeBase().filter((s) => s.type !== 'sortie-longue');
const SANS_SOUS_SEUIL = () => seancesDeBase().filter((s) => s.type !== 'sous-seuil');
const ANCIENNES = ['2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'];
const RECENTES = ['2026-10-01', '2026-10-08', '2026-10-15'];

describe('phrases du verdict', () => {
  it('MAINTENIR : « Points à surveiller » au pluriel quand plusieurs signaux sont en cause', () => {
    const d = decision({ tsb: 6, seances: [...SANS_FOOTINGS(), ...footings(5, 2)] });
    expect(d.verdict).toBe('maintenir');
    expect(d.phrase).toBe(
      "Rien d’alarmant, mais mieux vaut consolider avant de monter. Points à surveiller : Fraîcheur et Footings sous le plafond.",
    );
  });

  it('MAINTENIR : « Point à surveiller » suivi de « Pas assez de données sur : … » pour un décisif insuffisant', () => {
    // 4 séances sous-seuil, toutes avant la fenêtre de 21 jours : la réponse à l’effort est insuffisante.
    const d = decision({
      tsb: 6,
      seances: [...SANS_SOUS_SEUIL(), ...ANCIENNES.slice(0, 4).map((date) => sousSeuil(date, [245]))],
    });
    expect(d.verdict).toBe('maintenir');
    expect(d.phrase).toBe(
      "Rien d’alarmant, mais mieux vaut consolider avant de monter. Point à surveiller : Fraîcheur. Pas assez de données sur : Réponse à l’effort.",
    );
  });

  it('ALLÉGER : deux noms séparés par « et »', () => {
    const d = decision({
      tsb: -26,
      seances: [...SANS_SOUS_SEUIL(), ...ANCIENNES.map((date) => sousSeuil(date, [240])), ...RECENTES.map((date) => sousSeuil(date, [244]))],
    });
    expect(d.verdict).toBe('alleger');
    expect(d.phrase).toBe("À surveiller en priorité : Fraîcheur et Réponse à l’effort.");
  });

  it('ALLÉGER : trois noms séparés par des virgules, et « et » avant le dernier', () => {
    const d = decision({
      tsb: -26,
      seances: [
        ...SANS_SOUS_SEUIL(),
        ...ANCIENNES.map((date) => sousSeuil(date, [240])),
        ...RECENTES.map((date) => sousSeuil(date, [244])),
        sortieLongue('2026-10-12', { valeur: 9 }),
      ],
    });
    expect(d.verdict).toBe('alleger');
    expect(d.phrase).toBe(
      "À surveiller en priorité : Fraîcheur, Réponse à l’effort et Découplage de la dernière sortie longue.",
    );
  });

  it("AUCUN verdict : la règle de progressivité passe avant celle d'ALLÉGER (TSB à −30 avec 29 jours)", () => {
    const d = decision({ premierJour: '2026-09-22', tsb: -30 });
    expect(d.verdict).toBe('aucun');
    expect(d.phrase).toBe("Il faut 30 jours d’historique pour comparer la semaine au mois (encore 1 jour).");
  });

  it.each([
    ['2026-09-22', 1, "(encore 1 jour)"],
    ['2026-09-23', 2, '(encore 2 jours)'],
    ['2026-10-20', 29, '(encore 29 jours)'],
  ])('« encore N jours » : premier jour %s donne %s jour(s) manquant(s)', (premierJour, _n, fin) => {
    const d = decision({ premierJour });
    expect(d.phrase).toBe(`Il faut 30 jours d’historique pour comparer la semaine au mois ${fin}.`);
    expect(d.signaux.find((s) => s.cle === 'progressivite')?.explication).toBe(`Il faut 30 jours d’historique ${fin}.`);
  });
});

describe('ratio indéfini et ratio nul (décision du lot : pas de verdict)', () => {
  it('chronic nul malgré 30 jours : progressivité insuffisante, phrase « Aucun km … », pas de verdict', () => {
    const d = decision({ r: null, chronic: 0 });
    const s = d.signaux.find((x) => x.cle === 'progressivite');
    expect(s?.etat).toBe('insuffisant');
    expect(s?.valeurTexte).toBe('–');
    expect(s?.explication).toBe('Aucun km sur les 30 derniers jours.');
    expect(d.verdict).toBe('aucun');
    expect(d.phrase).toBe('Aucun km sur les 30 derniers jours.');
    expect(d.fourchette).toBeNull();
    expect(d.simulateur).toBeNull();
  });

  it('un ratio de 0 (aucun km sur 7 jours, mais du volume sur 30) est mesuré : « surveiller »', () => {
    const d = decision({ r: 0 });
    const s = d.signaux.find((x) => x.cle === 'progressivite');
    expect(s?.etat).toBe('surveiller');
    expect(s?.valeurTexte).toBe('0,00');
    expect(d.verdict).toBe('maintenir');
    expect(d.phrase).toBe("Rien d’alarmant, mais mieux vaut consolider avant de monter. Point à surveiller : Progressivité.");
  });
});

describe('ordre et nom des signaux', () => {
  it('les 7 signaux portent les noms de 05, dans l’ordre de la liste', () => {
    const d = decision();
    expect(d.signaux.map((s) => s.nom)).toEqual([
      'Progressivité',
      'Fraîcheur',
      "Réponse à l’effort",
      'Répétitions hors sous-seuil',
      'Footings sous le plafond',
      'Découplage de la dernière sortie longue',
      'Palier de volume',
    ]);
    expect(d.signaux.map((s) => s.cle)).toEqual([
      'progressivite',
      'fraicheur',
      'reponse',
      'horsSousSeuil',
      'footings',
      'decouplage',
      'palier',
    ]);
  });

  it('une fraîcheur positive s’écrit avec son signe : « +6 », à surveiller', () => {
    const s = decision({ tsb: 6 }).signaux.find((x) => x.cle === 'fraicheur');
    expect(s?.valeurTexte).toBe('+6');
    expect(s?.etat).toBe('surveiller');
  });
});

describe('chaque signal cité dans la phrase est visible dans la liste (05, critères)', () => {
  // Pour chaque scénario : les noms que la phrase cite, et l'état attendu de chacun.
  const scenarios: { nom: string; d: Decision; cites: { nom: string; etat: string }[]; verdict: string }[] = [
    { nom: 'AUGMENTER', d: decision(), cites: [], verdict: 'augmenter' },
    {
      nom: 'MAINTENIR, à surveiller',
      d: decision({ tsb: 6 }),
      cites: [{ nom: 'Fraîcheur', etat: 'surveiller' }],
      verdict: 'maintenir',
    },
    {
      nom: 'ALLÉGER',
      d: decision({ tsb: -26 }),
      cites: [{ nom: 'Fraîcheur', etat: 'alerte' }],
      verdict: 'alleger',
    },
    {
      nom: 'MAINTENIR, décisif insuffisant',
      d: decision({ seances: [...SANS_SOUS_SEUIL(), ...ANCIENNES.slice(0, 4).map((date) => sousSeuil(date, [245]))] }),
      cites: [{ nom: "Réponse à l’effort", etat: 'insuffisant' }],
      verdict: 'maintenir',
    },
    {
      nom: 'ALLÉGER avec décisif insuffisant',
      d: decision({ tsb: -26, seances: SANS_SORTIE() }),
      cites: [{ nom: 'Fraîcheur', etat: 'alerte' }],
      verdict: 'alleger',
    },
    {
      nom: 'AUGMENTER, non décisif insuffisant',
      d: decision({ seances: [...SANS_FOOTINGS(), ...footings(2, 2)] }),
      cites: [],
      verdict: 'augmenter',
    },
  ];

  it.each(scenarios.map((s) => [s.nom, s] as const))('%s', (_nom, s) => {
    expect(s.d.verdict).toBe(s.verdict);
    const cites = s.d.signaux.filter((x) => s.d.phrase.includes(x.nom));
    expect(cites.map((x) => ({ nom: x.nom, etat: x.etat }))).toEqual(s.cites);
    for (const x of cites) {
      expect(x.etat).not.toBe('ok');
    }
  });
});

describe('une séance datée de J ou après n’entre pas dans le calcul', () => {
  it('une séance datée de J (21 octobre) est filtrée de tous les signaux', () => {
    const avec = decision({
      seances: [
        ...seancesDeBase(),
        sousSeuil('2026-10-21', [200]),
        footing('2026-10-21', 999),
        sortieLongue('2026-10-21', { valeur: 9 }),
      ],
    });
    expect(avec.signaux).toEqual(decision().signaux);
    expect(avec.verdict).toBe('augmenter');
  });
});
