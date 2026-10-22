import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory as FabriqueMemoire } from 'fake-indexeddb';
import {
  exporterSauvegarde,
  importer,
  lireBrut,
  lireFlux,
  lireJournal,
  lireMeta,
  listerActivites,
  ouvrirBase,
} from '../../src/store';
import type { Base } from '../../src/store/types';
import {
  activite,
  fermerBases,
  illisible,
  lot,
  MAINTENANT,
  manquant,
  nouvelleBase,
  pasUneCourse,
} from '../fixtures/lots';

afterEach(() => fermerBases());

const MAINTENANT_2 = new Date('2026-10-22T10:00:00Z');
const MAINTENANT_3 = new Date('2026-10-23T10:00:00Z');

describe('import d\'un lot (ADR 0004)', () => {
  it('importer deux fois le même lot ne change rien : le second journal est à 0/0/0', async () => {
    const base = await nouvelleBase();
    const lots = lot([activite({ cle: 'fit:a' }), activite({ cle: 'fit:b', debutUtc: Date.UTC(2026, 9, 12, 8) })]);

    const premier = await importer(base, 'fit', lots, { maintenant: MAINTENANT });
    const avant = await listerActivites(base);
    const second = await importer(base, 'fit', lots, { maintenant: MAINTENANT });

    expect(premier).toMatchObject({ ajoutees: 2, modifiees: 0, supprimees: 0, ignorees: 0 });
    expect(second).toMatchObject({ ajoutees: 0, modifiees: 0, supprimees: 0, ignorees: 0, dateMinTouchee: null });
    expect(await listerActivites(base)).toEqual(avant);
  });

  it('une activité renommée, donc de nouvelle empreinte, est comptée en modifiée et son nom est repris', async () => {
    const base = await nouvelleBase();
    await importer(base, 'strava-archive', lot([activite({ cle: 'strava:1', source: 'strava-archive', nom: 'Sortie' })]), {
      maintenant: MAINTENANT,
    });

    const journal = await importer(
      base,
      'strava-archive',
      lot([activite({ cle: 'strava:1', source: 'strava-archive', nom: 'Semi De Porto Vecchio', empreinte: 'renommee' })]),
      { maintenant: MAINTENANT },
    );

    expect(journal).toMatchObject({ ajoutees: 0, modifiees: 1, supprimees: 0 });
    const [activiteLue] = await listerActivites(base);
    expect(activiteLue?.nom).toBe('Semi De Porto Vecchio');
  });

  it('une activité absente d\'une nouvelle archive Strava est supprimée de activite, flux et brut', async () => {
    const base = await nouvelleBase();
    await importer(
      base,
      'strava-archive',
      lot([
        activite({ cle: 'strava:1', source: 'strava-archive' }),
        activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8) }),
      ]),
      { maintenant: MAINTENANT },
    );

    const journal = await importer(
      base,
      'strava-archive',
      lot([activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8) })]),
      { maintenant: MAINTENANT },
    );

    expect(journal.supprimees).toBe(1);
    expect((await listerActivites(base)).map((a) => a.cleSource)).toEqual(['strava:2']);
    expect(await lireFlux(base, 'strava:1')).toBeNull();
    expect(await lireBrut(base, 'strava:1')).toBeNull();
    expect(await lireFlux(base, 'strava:2')).not.toBeNull();
    expect(await lireBrut(base, 'strava:2')).not.toBeNull();
  });

  it('un import FIT isolé ne supprime aucune activité', async () => {
    const base = await nouvelleBase();
    await importer(
      base,
      'strava-archive',
      lot([activite({ cle: 'strava:1', source: 'strava-archive' }), activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8) })]),
      { maintenant: MAINTENANT },
    );

    const journal = await importer(
      base,
      'fit',
      lot([activite({ cle: 'fit:x', debutUtc: Date.UTC(2026, 9, 15, 8) })]),
      { maintenant: MAINTENANT },
    );

    expect(journal.supprimees).toBe(0);
    expect((await listerActivites(base)).map((a) => a.cleSource)).toEqual(['strava:1', 'strava:2', 'fit:x']);
  });

  it('un doublon FIT (FC à 1 s) contre une archive (FC à 5 s) : le FIT est gardé, l\'archive est ignorée', async () => {
    const base = await nouvelleBase();
    await importer(base, 'strava-archive', lot([activite({ cle: 'strava:1', source: 'strava-archive', pasFC: 5 })]), {
      maintenant: MAINTENANT,
    });

    const journal = await importer(base, 'fit', lot([activite({ cle: 'fit:1', pasFC: 1 })]), {
      maintenant: MAINTENANT,
    });

    expect(journal).toMatchObject({ ajoutees: 1, ignorees: 1 });
    const actives = await listerActivites(base, { statut: 'active' });
    const ignorees = await listerActivites(base, { statut: 'ignoree' });
    expect(actives.map((a) => a.cleSource)).toEqual(['fit:1']);
    expect(ignorees.map((a) => a.cleSource)).toEqual(['strava:1']);
  });

  it('l\'ordre des imports n\'a pas d\'effet sur les statuts', async () => {
    const archive = () =>
      lot([activite({ cle: 'strava:1', source: 'strava-archive', pasFC: 5 }), activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8) })]);
    const fichier = () => lot([activite({ cle: 'fit:1', pasFC: 1 })]);

    const ab = await nouvelleBase();
    await importer(ab, 'strava-archive', archive(), { maintenant: MAINTENANT });
    await importer(ab, 'fit', fichier(), { maintenant: MAINTENANT });

    const ba = await nouvelleBase();
    await importer(ba, 'fit', fichier(), { maintenant: MAINTENANT });
    await importer(ba, 'strava-archive', archive(), { maintenant: MAINTENANT });

    const etat = async (base: Base) => (await listerActivites(base)).map((a) => [a.cleSource, a.statut]);
    const attendu = [
      ['fit:1', 'active'],
      ['strava:1', 'ignoree'],
      ['strava:2', 'active'],
    ];
    expect(await etat(ab)).toEqual(attendu);
    expect(await etat(ba)).toEqual(attendu);
  });

  it('quand la version gardée disparaît, l\'activité ignorée redevient active', async () => {
    const base = await nouvelleBase();
    await importer(base, 'fit', lot([activite({ cle: 'fit:1', pasFC: 5 })]), { maintenant: MAINTENANT });
    await importer(base, 'strava-archive', lot([activite({ cle: 'strava:1', source: 'strava-archive', pasFC: 1 })]), {
      maintenant: MAINTENANT,
    });
    expect((await listerActivites(base, { statut: 'ignoree' })).map((a) => a.cleSource)).toEqual(['fit:1']);

    await importer(base, 'strava-archive', lot([]), { maintenant: MAINTENANT });

    expect((await listerActivites(base)).map((a) => [a.cleSource, a.statut])).toEqual([['fit:1', 'active']]);
  });

  it('dateMinTouchee est la plus petite date locale des activités touchées', async () => {
    const base = await nouvelleBase();
    const octobre = activite({ cle: 'strava:oct', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 10, 8) });
    const septembre = activite({ cle: 'strava:sep', source: 'strava-archive', debutUtc: Date.UTC(2026, 8, 15, 8) });

    const premier = await importer(base, 'strava-archive', lot([octobre, septembre]), { maintenant: MAINTENANT });
    expect(premier.dateMinTouchee).toBe('2026-09-15');

    // Une seule activité d'octobre est renommée, et celle de septembre disparaît : la plus petite date
    // touchée est celle de la suppression.
    const renommee = { ...octobre, nom: 'Renommée', empreinteBrute: 'nouvelle' };
    const second = await importer(base, 'strava-archive', lot([renommee]), { maintenant: MAINTENANT });
    expect(second.dateMinTouchee).toBe('2026-09-15');

    // Seule l'activité d'octobre change : c'est la date qui compte.
    const troisieme = await importer(
      base,
      'strava-archive',
      lot([{ ...renommee, empreinteBrute: 'encore' }]),
      { maintenant: MAINTENANT },
    );
    expect(troisieme.dateMinTouchee).toBe('2026-10-10');
  });

  it('une erreur d\'écriture au milieu d\'un lot n\'écrit rien et n\'inscrit aucun journal', async () => {
    const base = await nouvelleBase();
    await importer(base, 'strava-archive', lot([activite({ cle: 'strava:0', source: 'strava-archive' })]), {
      maintenant: MAINTENANT,
    });

    // Le troisième pivot porte un flux non clonable : IndexedDB refuse de l'écrire.
    const casse = activite({ cle: 'strava:3', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 13, 8) });
    casse.flux.alt_m = (() => 0) as unknown as Float32Array;
    const lots = lot([
      activite({ cle: 'strava:1', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 11, 8) }),
      activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8) }),
      casse,
    ]);

    await expect(importer(base, 'strava-archive', lots, { maintenant: MAINTENANT })).rejects.toThrow();

    expect((await listerActivites(base)).map((a) => a.cleSource)).toEqual(['strava:0']);
    expect(await lireFlux(base, 'strava:1')).toBeNull();
    expect(await lireJournal(base)).toHaveLength(1);
    expect((await lireMeta(base)).derniereSynchro).toBe(MAINTENANT.toISOString());
  });

  it('derniereSynchro est mise à jour après un import réussi', async () => {
    const base = await nouvelleBase();
    expect((await lireMeta(base)).derniereSynchro).toBeNull();

    const journal = await importer(base, 'fit', lot([activite({ cle: 'fit:1' })]), { maintenant: MAINTENANT });

    expect((await lireMeta(base)).derniereSynchro).toBe(MAINTENANT.toISOString());
    expect(journal.date).toBe(MAINTENANT.toISOString());
  });

  it('le flux est relu tel qu\'il a été écrit, en Float32Array', async () => {
    const base = await nouvelleBase();
    const pivot = activite({ cle: 'fit:1', fc: 150, min: 1 });
    await importer(base, 'fit', lot([pivot]), { maintenant: MAINTENANT });

    const flux = await lireFlux(base, 'fit:1');
    expect(flux?.fc_bpm).toBeInstanceOf(Float32Array);
    expect(Array.from(flux?.t_s ?? [])).toEqual(Array.from(pivot.flux.t_s));
  });

  it('le brut est stocké tel qu\'il a été reçu, avec son empreinte', async () => {
    const base = await nouvelleBase();
    await importer(base, 'fit', lot([activite({ cle: 'fit:1', empreinte: 'empreinte-A' })]), {
      maintenant: MAINTENANT,
    });

    const brut = await lireBrut(base, 'fit:1');
    expect(new TextDecoder().decode(brut?.octets)).toBe('empreinte-A');
    expect(brut?.empreinte).toBe('empreinte-A');
  });

  it('exporterSauvegarde ne contient que les champs prévus (aucune clé d\'API)', async () => {
    const base = await nouvelleBase();
    await importer(base, 'fit', lot([activite({ cle: 'fit:1' })]), { maintenant: MAINTENANT });

    const sauvegarde = await exporterSauvegarde(base);

    expect(Object.keys(sauvegarde).sort()).toEqual(['athlete', 'formatVersion', 'journal', 'param_date', 'param_global']);
  });
});

describe('activités illisibles, manquantes ou hors course d\'une archive Strava (ADR 0004)', () => {
  it('une activité illisible et une activité manquante restent intactes : même empreinte, même flux, même brut', async () => {
    const base = await nouvelleBase();
    await importer(
      base,
      'strava-archive',
      lot([
        activite({ cle: 'strava:1', source: 'strava-archive' }),
        activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 11, 8), empreinte: 'v2' }),
        activite({ cle: 'strava:3', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8), empreinte: 'v3' }),
      ]),
      { maintenant: MAINTENANT },
    );
    const avantActivites = await listerActivites(base);
    const avantFlux = await lireFlux(base, 'strava:2');
    const avantBrut = await lireBrut(base, 'strava:3');

    const journal = await importer(
      base,
      'strava-archive',
      lot([activite({ cle: 'strava:1', source: 'strava-archive' })], {
        illisibles: [illisible('strava:2')],
        manquants: [manquant('strava:3')],
      }),
      { maintenant: MAINTENANT_2 },
    );

    expect(journal).toMatchObject({ supprimees: 0, modifiees: 0, ajoutees: 0, manquants: 1 });
    expect(await listerActivites(base)).toEqual(avantActivites);
    expect(await lireFlux(base, 'strava:2')).toEqual(avantFlux);
    expect(await lireBrut(base, 'strava:3')).toEqual(avantBrut);
  });

  it('une activité que l\'index classe hors course est supprimée de activite, flux et brut', async () => {
    const base = await nouvelleBase();
    await importer(
      base,
      'strava-archive',
      lot([
        activite({ cle: 'strava:1', source: 'strava-archive' }),
        activite({ cle: 'strava:4', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8) }),
      ]),
      { maintenant: MAINTENANT },
    );

    const journal = await importer(
      base,
      'strava-archive',
      lot([activite({ cle: 'strava:1', source: 'strava-archive' })], { ignorees: [pasUneCourse('strava:4')] }),
      { maintenant: MAINTENANT_2 },
    );

    expect(journal.supprimees).toBe(1);
    expect((await listerActivites(base)).map((a) => a.cleSource)).toEqual(['strava:1']);
    expect(await lireFlux(base, 'strava:4')).toBeNull();
    expect(await lireBrut(base, 'strava:4')).toBeNull();
  });

  it('le journal donne les noms des fichiers illisibles et le nombre de fichiers manquants', async () => {
    const base = await nouvelleBase();

    const journal = await importer(
      base,
      'strava-archive',
      lot([activite({ cle: 'strava:1', source: 'strava-archive' })], {
        illisibles: [illisible('strava:9', 'activities/9.fit.gz')],
        manquants: [manquant('strava:8'), manquant('strava:7')],
      }),
      { maintenant: MAINTENANT },
    );

    expect(journal).toMatchObject({ illisibles: ['activities/9.fit.gz'], manquants: 2 });
    expect((await lireJournal(base))[0]).toMatchObject({ illisibles: ['activities/9.fit.gz'], manquants: 2 });
  });
});

describe('compteurs et journal (ADR 0004)', () => {
  const DEBUT = Date.UTC(2026, 9, 10, 8, 0);

  it('une modification qui déplace l\'activité à une date ultérieure : la date d\'origine reste la plus petite', async () => {
    const base = await nouvelleBase();
    await importer(base, 'fit', lot([activite({ cle: 'fit:1', debutUtc: Date.UTC(2026, 8, 15, 8) })]), {
      maintenant: MAINTENANT,
    });

    const deplacee = await importer(
      base,
      'fit',
      lot([activite({ cle: 'fit:1', debutUtc: Date.UTC(2026, 9, 10, 8), empreinte: 'deplacee' })]),
      { maintenant: MAINTENANT },
    );

    expect(deplacee).toMatchObject({ modifiees: 1, dateMinTouchee: '2026-09-15' });
  });

  it('une modification qui ramène l\'activité à une date antérieure : la nouvelle date est la plus petite', async () => {
    const base = await nouvelleBase();
    await importer(base, 'fit', lot([activite({ cle: 'fit:1', debutUtc: Date.UTC(2026, 9, 10, 8) })]), {
      maintenant: MAINTENANT,
    });

    const ramenee = await importer(
      base,
      'fit',
      lot([activite({ cle: 'fit:1', debutUtc: Date.UTC(2026, 8, 1, 8), empreinte: 'ramenee' })]),
      { maintenant: MAINTENANT },
    );

    expect(ramenee).toMatchObject({ modifiees: 1, dateMinTouchee: '2026-09-01' });
  });

  it('un changement de statut seul compte dans dateMinTouchee', async () => {
    const base = await nouvelleBase();
    // Y (30 sept., 23 h 50 UTC) recouvre R (1er oct., 0 h UTC) à 20 min sur 30 : Y est ignorée.
    const y = activite({ cle: 'fit:y', pasFC: 5, min: 30, debutUtc: Date.UTC(2026, 8, 30, 23, 50) });
    const r = activite({ cle: 'strava:r', source: 'strava-archive', pasFC: 1, min: 30, debutUtc: Date.UTC(2026, 9, 1, 0, 0) });
    await importer(base, 'strava-archive', lot([r]), { maintenant: MAINTENANT });
    await importer(base, 'fit', lot([y]), { maintenant: MAINTENANT });
    expect((await listerActivites(base, { statut: 'ignoree' })).map((a) => a.cleSource)).toEqual(['fit:y']);

    // R disparaît : seule Y change, et ce changement de statut est la seule chose touchée à sa date.
    const journal = await importer(base, 'strava-archive', lot([]), { maintenant: MAINTENANT_2 });

    expect(journal).toMatchObject({ supprimees: 1, dateMinTouchee: '2026-09-30' });
    expect((await listerActivites(base)).map((a) => [a.cleSource, a.statut])).toEqual([['fit:y', 'active']]);
  });

  it('ignorees compte les activités passées à ignoree, sans les recompter au second import', async () => {
    const base = await nouvelleBase();
    const lots = lot([
      activite({ cle: 'fit:long', min: 60, debutUtc: DEBUT }),
      activite({ cle: 'fit:court', min: 20, debutUtc: DEBUT + 48 * 60_000, fc: null }),
    ]);

    const premier = await importer(base, 'fit', lots, { maintenant: MAINTENANT });
    const second = await importer(base, 'fit', lots, { maintenant: MAINTENANT_2 });

    expect(premier.ignorees).toBe(1);
    expect(second.ignorees).toBe(0);
  });

  it('une activité déjà ignorée qui revient modifiée (renommée) reste ignorée, sans être recomptée', async () => {
    const base = await nouvelleBase();
    await importer(
      base,
      'fit',
      lot([activite({ cle: 'fit:long', min: 60, debutUtc: DEBUT }), activite({ cle: 'fit:court', min: 20, debutUtc: DEBUT + 48 * 60_000, fc: null })]),
      { maintenant: MAINTENANT },
    );

    const renommee = await importer(
      base,
      'fit',
      lot([activite({ cle: 'fit:court', min: 20, debutUtc: DEBUT + 48 * 60_000, fc: null, nom: 'Renommée', empreinte: 'renommee' })]),
      { maintenant: MAINTENANT_2 },
    );

    expect(renommee).toMatchObject({ modifiees: 1, ignorees: 0 });
    expect((await listerActivites(base, { statut: 'ignoree' })).map((a) => a.cleSource)).toEqual(['fit:court']);
  });

  it('un pivot modifié qui n\'apporte pas de brut efface l\'ancien brut', async () => {
    const base = await nouvelleBase();
    await importer(base, 'fit', lot([activite({ cle: 'fit:1', empreinte: 'v1' })]), { maintenant: MAINTENANT });
    expect(await lireBrut(base, 'fit:1')).not.toBeNull();

    await importer(base, 'fit', lot([activite({ cle: 'fit:1', empreinte: 'v2' })], { bruts: [] }), {
      maintenant: MAINTENANT_2,
    });

    expect(await lireBrut(base, 'fit:1')).toBeNull();
    expect((await listerActivites(base)).map((a) => a.empreinteBrute)).toEqual(['v2']);
  });

  it('recuLe du brut est conservé quand l\'import ne touche pas à l\'activité', async () => {
    const base = await nouvelleBase();
    await importer(base, 'fit', lot([activite({ cle: 'fit:1' })]), { maintenant: MAINTENANT });

    await importer(base, 'fit', lot([activite({ cle: 'fit:1' })]), { maintenant: MAINTENANT_2 });

    expect((await lireBrut(base, 'fit:1'))?.recuLe).toBe(MAINTENANT.toISOString());
  });

  it('un import avec un fichier illisible écrit une seule entrée de journal, qui le nomme', async () => {
    const base = await nouvelleBase();

    await importer(base, 'strava-archive', lot([], { illisibles: [illisible('strava:9', 'activities/9.fit')] }), {
      maintenant: MAINTENANT,
    });
    const journal = await lireJournal(base);

    expect(journal).toHaveLength(1);
    expect(journal[0]?.illisibles).toEqual(['activities/9.fit']);
  });
});

describe('import mixte, concurrent et réouverture (ADR 0004, 0005)', () => {
  it('un import mêle ajout, modification et suppression : compteurs et état justes', async () => {
    const base = await nouvelleBase();
    await importer(
      base,
      'strava-archive',
      lot([
        activite({ cle: 'strava:1', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 10, 8) }),
        activite({ cle: 'strava:4', source: 'strava-archive', debutUtc: Date.UTC(2026, 8, 1, 8) }),
        activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 11, 8) }),
      ]),
      { maintenant: MAINTENANT },
    );

    const journal = await importer(
      base,
      'strava-archive',
      lot([
        activite({ cle: 'strava:1', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 10, 8), nom: 'Renommée', empreinte: 'v2' }),
        activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 11, 8) }),
        activite({ cle: 'strava:3', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8) }),
      ]),
      { maintenant: MAINTENANT_2 },
    );

    expect(journal).toMatchObject({ ajoutees: 1, modifiees: 1, supprimees: 1, ignorees: 0, dateMinTouchee: '2026-09-01' });
    const etat = await listerActivites(base);
    expect(etat.map((a) => a.cleSource)).toEqual(['strava:1', 'strava:2', 'strava:3']);
    expect(etat[0]?.nom).toBe('Renommée');
  });

  it('deux imports lancés en même temps s\'enchaînent : chacun voit l\'effet de l\'autre', async () => {
    const base = await nouvelleBase();
    await importer(
      base,
      'strava-archive',
      lot([
        activite({ cle: 'strava:1', source: 'strava-archive' }),
        activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8) }),
      ]),
      { maintenant: MAINTENANT },
    );

    const [archive, fichier] = await Promise.all([
      importer(base, 'strava-archive', lot([activite({ cle: 'strava:1', source: 'strava-archive' })]), {
        maintenant: MAINTENANT_2,
      }),
      importer(base, 'fit', lot([activite({ cle: 'fit:5', debutUtc: Date.UTC(2026, 9, 15, 8) })]), {
        maintenant: MAINTENANT_2,
      }),
    ]);

    expect(archive.supprimees).toBe(1);
    expect(fichier.ajoutees).toBe(1);
    expect((await listerActivites(base)).map((a) => a.cleSource)).toEqual(['strava:1', 'fit:5']);
    expect(await lireJournal(base)).toHaveLength(3);
  });

  it('après réouverture, flux, brut, derniereSynchro, statuts et journal sont ceux du dernier import', async () => {
    const fabrique = new FabriqueMemoire() as unknown as IDBFactory;
    const premiere = await ouvrirBase('reouverture', fabrique);
    await importer(
      premiere,
      'strava-archive',
      lot([
        activite({ cle: 'strava:1', source: 'strava-archive', pasFC: 1 }),
        activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8) }),
      ]),
      { maintenant: MAINTENANT },
    );
    await importer(
      premiere,
      'fit',
      lot([activite({ cle: 'fit:3', debutUtc: Date.UTC(2026, 9, 20, 8), pasFC: 1 })]),
      { maintenant: MAINTENANT_2 },
    );
    // Dernier import : strava:2 disparaît (supprimée) et strava:5, moins fine que fit:3, est ignorée.
    await importer(
      premiere,
      'strava-archive',
      lot([
        activite({ cle: 'strava:1', source: 'strava-archive', pasFC: 1 }),
        activite({ cle: 'strava:5', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 20, 8), pasFC: 5 }),
      ]),
      { maintenant: MAINTENANT_3 },
    );
    const avantActivites = await listerActivites(premiere);
    const avantFlux = await lireFlux(premiere, 'strava:1');
    const avantBrut = await lireBrut(premiere, 'strava:1');
    const avantJournal = await lireJournal(premiere);
    premiere.close();

    const seconde = await ouvrirBase('reouverture', fabrique);
    try {
      expect(await listerActivites(seconde)).toEqual(avantActivites);
      expect(avantActivites.map((a) => [a.cleSource, a.statut])).toEqual([
        ['strava:1', 'active'],
        ['fit:3', 'active'],
        ['strava:5', 'ignoree'],
      ]);
      expect(await lireFlux(seconde, 'strava:1')).toEqual(avantFlux);
      expect(await lireBrut(seconde, 'strava:1')).toEqual(avantBrut);
      expect(await lireJournal(seconde)).toEqual(avantJournal);
      expect(avantJournal[2]).toMatchObject({ supprimees: 1, ignorees: 1 });
      expect((await lireMeta(seconde)).derniereSynchro).toBe(MAINTENANT_3.toISOString());
    } finally {
      seconde.close();
    }
  });
});

describe('lots incohérents, refusés avant toute écriture (ADR 0004)', () => {
  it('une même clé source présente deux fois dans le lot lève une erreur qui la nomme, et n\'écrit rien', async () => {
    const base = await nouvelleBase();

    await expect(
      importer(
        base,
        'fit',
        lot([activite({ cle: 'fit:1' }), activite({ cle: 'fit:1', debutUtc: Date.UTC(2026, 9, 12, 8) })]),
        { maintenant: MAINTENANT },
      ),
    ).rejects.toThrow(/fit:1/);

    expect(await listerActivites(base)).toEqual([]);
    expect(await lireJournal(base)).toEqual([]);
  });

  it('un pivot dont la source n\'est pas celle de l\'import est refusé, dans les deux sens, sans rien écrire', async () => {
    const base = await nouvelleBase();

    await expect(
      importer(base, 'fit', lot([activite({ cle: 'strava:1', source: 'strava-archive' })]), { maintenant: MAINTENANT }),
    ).rejects.toThrow(/strava:1/);
    await expect(
      importer(base, 'strava-archive', lot([activite({ cle: 'fit:1', source: 'fit' })]), { maintenant: MAINTENANT }),
    ).rejects.toThrow(/fit:1/);

    expect(await listerActivites(base)).toEqual([]);
    expect(await lireJournal(base)).toEqual([]);
    expect((await lireMeta(base)).derniereSynchro).toBeNull();
  });
});
