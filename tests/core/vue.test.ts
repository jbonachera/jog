import { describe, expect, it } from 'vitest';
import { calculerVue, seancesIntrinseques, type MemoireSeances } from '../../src/core/vue';
import { FORMAT_VUE, REGLES_VERSION } from '../../src/core/constantes';
import { footing } from '../fixtures/construire';
import type { ActivitePivot, DateCivile, Flux, ModifDatee, Parametres, SeanceIntrinseque } from '../../src/core/types';

const J = '2026-10-21';

type Pivot = Omit<ActivitePivot, 'flux'>;

interface Activite {
  pivot: Pivot;
  flux: Flux;
}

/** Une activité de course, à FC constante, datée comme la Vue la reçoit. */
function activite(cle: string, debutUtc: number, dateLocale: DateCivile, fc: number, min = 30): Activite {
  const { flux, ...pivot } = footing({ min, fc, allure: 330, pasFC: 1 }) as ActivitePivot;
  // Deux activités de contenu différent n'ont pas la même empreinte (ADR 0004) : la clé de mémorisation s'y fie.
  return { pivot: { ...pivot, cleSource: cle, empreinteBrute: `empreinte-${cle}`, source: 'fit', debutUtc, dateLocale }, flux };
}

/** Un `lireFlux` qui sert les flux des activités données, et note les lectures faites. */
function fluxDe(activites: Activite[]): { lireFlux: (cle: string) => Promise<Flux | null>; lus: string[] } {
  const lus: string[] = [];
  const parCle = new Map(activites.map((a) => [a.pivot.cleSource, a.flux] as const));
  return {
    lus,
    lireFlux: async (cle) => {
      lus.push(cle);
      return parCle.get(cle) ?? null;
    },
  };
}

/** Les séances intrinsèques de ces activités, telles que le Worker les produit. */
async function intrinseques(activites: Activite[], parametres: Parametres, jour: DateCivile = J): Promise<SeanceIntrinseque[]> {
  const { lireFlux } = fluxDe(activites);
  return seancesIntrinseques(
    activites.map((a) => a.pivot),
    lireFlux,
    parametres,
    jour,
  );
}

function parametres(modifs: ModifDatee[] = []): Parametres {
  return {
    globaux: { refHr: 164, paceHrK: 1.1, ctlDays: 42, atlDays: 7, subtPctLo: 20, subtPctHi: 25 },
    modifs,
  };
}

function modifLtHr(valeur: number, dateEffet: string): ModifDatee {
  return { id: `lt2-${dateEffet}-${valeur}`, cle: 'lt2Hr', valeur, dateEffet, enregistreLe: '2026-10-01T10:00:00Z' };
}

const DEBUT_10 = Date.UTC(2026, 9, 10, 8);
const DEBUT_19 = Date.UTC(2026, 9, 19, 8);
const DEBUT_20 = Date.UTC(2026, 9, 20, 8);
const DEBUT_21 = Date.UTC(2026, 9, 21, 8);
const DEBUT_22 = Date.UTC(2026, 9, 22, 8);

describe('seancesIntrinseques : étape ②a sur les activités antérieures à J (ADR 0006)', () => {
  it('ne lit pas le flux d\'une activité datée de J, ni de J+1', async () => {
    const passee = activite('strava:1', DEBUT_20, '2026-10-20', 150);
    const duJour = activite('strava:2', DEBUT_21, J, 150);
    const lendemain = activite('strava:3', DEBUT_22, '2026-10-22', 150);
    const { lireFlux, lus } = fluxDe([passee, duJour, lendemain]);

    const resultat = await seancesIntrinseques(
      [passee, duJour, lendemain].map((a) => a.pivot),
      lireFlux,
      parametres(),
      J,
    );

    expect(lus).toEqual(['strava:1']);
    expect(resultat.map((s) => s.cleSource)).toEqual(['strava:1']);
  });

  it('échoue, sans rendre de résultat partiel, quand le flux d\'une activité est absent', async () => {
    const a = activite('strava:1', DEBUT_10, '2026-10-10', 150);
    const b = activite('strava:2', DEBUT_20, '2026-10-20', 150);

    await expect(
      seancesIntrinseques([a.pivot, b.pivot], async (cle) => (cle === 'strava:2' ? null : a.flux), parametres(), J),
    ).rejects.toThrow('flux absent pour strava:2');
  });

  it('applique une modification à la séance qui tombe exactement le jour de son effet', async () => {
    // FC de 165 bpm : au-dessus de lt2Hr 160 ; sous 172 (valeur de départ), c'est de l'allure marathon.
    const veille = activite('strava:19', DEBUT_19, '2026-10-19', 165);
    const jourEffet = activite('strava:20', DEBUT_20, '2026-10-20', 165);

    // Valeur de départ datée du 1er : sans elle, le 19 prendrait déjà 160 (D-006, première valeur avant la première modification).
    const resultat = await intrinseques([veille, jourEffet], parametres([modifLtHr(172, '2026-10-01'), modifLtHr(160, '2026-10-20')]));

    const parCle = new Map(resultat.map((s) => [s.cleSource, s] as const));
    expect(parCle.get('strava:19')?.minutes.mp).toBeCloseTo(30, 6);
    expect(parCle.get('strava:20')?.minutes.hard).toBeCloseTo(30, 6);
  });
});

describe('calculerVue : paramètres datés appliqués à la date de chaque séance', () => {
  it('une modification de lt2Hr ne change le classement que des séances qui suivent sa date d\'effet', async () => {
    // FC de 165 bpm : sous 172 (lt2Hr de départ), c'est de l'allure marathon ; au-dessus de 160 à partir du 15, c'est au-dessus du seuil.
    // Une valeur de départ datée du 1er est nécessaire : avant la première modification, la première valeur s'applique (ADR 0005).
    const avant = activite('strava:avant', DEBUT_10, '2026-10-10', 165);
    const apres = activite('strava:apres', DEBUT_20, '2026-10-20', 165);
    const p = parametres([modifLtHr(172, '2026-10-01'), modifLtHr(160, '2026-10-15')]);
    const vue = calculerVue({ intrinseques: await intrinseques([avant, apres], p), parametres: p, J, derniereSynchro: null });

    const parCle = new Map(vue.seances.map((s) => [s.cleSource, s] as const));
    expect(parCle.get('strava:avant')?.minutes.hard).toBe(0);
    expect(parCle.get('strava:avant')?.minutes.mp).toBeCloseTo(30, 6);
    expect(parCle.get('strava:apres')?.minutes.hard).toBeCloseTo(30, 6);
    expect(parCle.get('strava:apres')?.minutes.mp).toBe(0);
  });
});

describe('calculerVue : séances, jours et paramètres (lot 1)', () => {
  it('ne compte ni une séance datée de J, ni une séance de J+1', async () => {
    const p = parametres();
    const calculees = await intrinseques(
      [activite('strava:1', DEBUT_20, '2026-10-20', 150), activite('strava:2', DEBUT_21, J, 150), activite('strava:3', DEBUT_22, '2026-10-22', 150)],
      p,
    );
    const vue = calculerVue({ intrinseques: calculees, parametres: p, J, derniereSynchro: null });

    expect(vue.seances.map((s) => s.cleSource)).toEqual(['strava:1']);
    expect(vue.jours.date).toEqual(['2026-10-20']);
  });

  it('porte les champs de version, la date de synchro et le premier jour de l\'historique', async () => {
    const p = parametres();
    const vue = calculerVue({
      intrinseques: await intrinseques([activite('strava:1', DEBUT_10, '2026-10-10', 150)], p),
      parametres: p,
      J,
      derniereSynchro: '2026-10-21T09:00:00.000Z',
    });

    expect(vue).toMatchObject({
      formatVersion: FORMAT_VUE,
      reglesVersion: REGLES_VERSION,
      J,
      derniereSynchro: '2026-10-21T09:00:00.000Z',
      premierJour: '2026-10-10',
    });
  });

  it('une Vue sans aucune séance est vide, et son verdict est « aucun » (ADR 0009)', () => {
    const p = parametres();
    const vue = calculerVue({ intrinseques: [], parametres: p, J, derniereSynchro: null });

    expect(vue).toMatchObject({
      premierJour: null,
      seances: [],
      semaines: [],
      palier: { semaines: 0, reference_km: 0 },
      decision: { verdict: 'aucun', phrase: '', signaux: [], fourchette: null, simulateur: null },
    });
    expect(vue.jours.date).toEqual([]);
    expect(vue.serieCharge).toEqual([]);
    expect(vue.ratio.date).toEqual([]);
  });

  it('rend des jours de la première séance à J−1, repos compris, et une liste vide sans séance', async () => {
    const p = parametres();
    const vue = calculerVue({
      intrinseques: await intrinseques([activite('strava:1', DEBUT_10, '2026-10-10', 150)], p),
      parametres: p,
      J,
      derniereSynchro: null,
    });
    const vide = calculerVue({ intrinseques: [], parametres: p, J, derniereSynchro: null });

    expect(vue.jours.date).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
    expect(vue.jours.km[1]).toBe(0);
    expect(vue.jours.min[1]).toBe(0);
    expect(vue.jours.types[1]).toEqual([]);
    expect(vide.seances).toEqual([]);
    expect(vide.jours.date).toEqual([]);
  });

  it('expose les paramètres en vigueur : globaux, et datés à J−1 ; une modification datée de J n\'y figure pas', () => {
    const p = parametres([
      modifLtHr(160, '2026-10-15'),
      modifLtHr(166, '2026-10-20'),
      modifLtHr(150, J),
    ]);
    const vue = calculerVue({ intrinseques: [], parametres: p, J, derniereSynchro: null });

    expect(vue.parametresEnVigueur.globaux.refHr).toBe(164);
    expect(vue.parametresEnVigueur.datesAJm1.lt2Hr).toBe(166);
  });
});

describe('calculerVue : déterminisme (ADR 0006)', () => {
  const activites = (): Activite[] => [
    activite('strava:1', DEBUT_10, '2026-10-10', 150),
    activite('strava:2', DEBUT_20, '2026-10-20', 165),
    activite('strava:3', DEBUT_20 + 3_600_000, '2026-10-20', 140, 20),
  ];

  it('deux appels aux mêmes entrées donnent la même Vue', async () => {
    const p = parametres([modifLtHr(160, '2026-10-15')]);
    const entree = { intrinseques: await intrinseques(activites(), p), parametres: p, J, derniereSynchro: null };

    expect(calculerVue(entree)).toEqual(calculerVue(entree));
  });

  it('l\'ordre des activités en entrée n\'a pas d\'effet sur la Vue, même à débuts identiques départagés par cleSource', async () => {
    // Trois activités au même instant, du même jour : seul cleSource les distingue.
    const egales = (): Activite[] => [
      activite('strava:b', DEBUT_20, '2026-10-20', 150),
      activite('strava:a', DEBUT_20, '2026-10-20', 165, 20),
      activite('strava:c', DEBUT_20, '2026-10-20', 140),
    ];
    const p = parametres();
    const reference = calculerVue({ intrinseques: await intrinseques(egales(), p), parametres: p, J, derniereSynchro: null });

    for (const ordre of permutations([0, 1, 2])) {
      const entrees = egales();
      const permutees = ordre.map((i) => entrees[i] as Activite);
      const vue = calculerVue({ intrinseques: await intrinseques(permutees, p), parametres: p, J, derniereSynchro: null });
      expect(vue).toEqual(reference);
    }
    expect(reference.seances.map((s) => s.cleSource)).toEqual(['strava:a', 'strava:b', 'strava:c']);
  });

  it('l\'ordre des séances intrinsèques en entrée de calculerVue n\'a pas d\'effet non plus', async () => {
    const p = parametres();
    const sortie = await intrinseques(activites(), p);
    const dans = calculerVue({ intrinseques: sortie, parametres: p, J, derniereSynchro: null });
    const inverse = calculerVue({ intrinseques: [...sortie].reverse(), parametres: p, J, derniereSynchro: null });

    expect(inverse).toEqual(dans);
  });
});

/** Toutes les permutations d'une liste courte. */
function permutations<T>(elements: readonly T[]): T[][] {
  if (elements.length <= 1) return [[...elements]];
  return elements.flatMap((e, i) =>
    permutations([...elements.slice(0, i), ...elements.slice(i + 1)]).map((reste) => [e, ...reste]),
  );
}

describe('séances mémorisées partagées par empreinte brute (ADR 0006)', () => {
  it('deux activités de même empreinte brute et de cleSource différentes : la mémoire sert les deux, et chacune garde son identité', async () => {
    const p = parametres();
    const memoire: MemoireSeances = new Map();
    const original = activite('strava:a', DEBUT_10, '2026-10-10', 150);
    // Même fichier, identifiant changé : même empreinte brute, même flux.
    const renommee: Activite = { pivot: { ...original.pivot, cleSource: 'strava:b' }, flux: original.flux };

    const premiere = await seancesIntrinseques([original.pivot], fluxDe([original]).lireFlux, p, J, memoire);
    const seconde = fluxDe([renommee]);
    const deuxieme = await seancesIntrinseques([renommee.pivot], seconde.lireFlux, p, J, memoire);
    const vue = calculerVue({ intrinseques: [...premiere, ...deuxieme], parametres: p, J, derniereSynchro: null });

    expect(seconde.lus).toEqual([]);
    expect(vue.seances.map((s) => [s.cleSource, s.date])).toEqual([
      ['strava:a', '2026-10-10'],
      ['strava:b', '2026-10-10'],
    ]);
  });
});
