import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { encoderFit, type EchantillonFit } from '../fixtures/encodeur-fit';
import { calculerDepuisBase, creerTraitement, type EntreeRecalcul, type Reponse, type CorpsRequete } from '../../src/worker/traitement';
import { fermerBases, nouvelleBase } from '../fixtures/lots';
import { lireMeta, listerActivites, lireParametres } from '../../src/store';
import { lireJournal } from '../../src/store/lecture';
import { executer } from '../../src/store/transaction';
import type { Base } from '../../src/store/types';
import type { Vue } from '../../src/core/types';

afterEach(() => {
  fermerBases();
  vi.restoreAllMocks();
});

const J = '2026-10-21';
const TETE_CSV = "ID de l'activité,Nom de l'activité,Type d'activité,Nom du fichier\n";

/** Un FIT de course à 1 Hz : durée en minutes, FC constante, allure constante. */
function fit(debut: number, min: number, decalageLocal_min = 120): Uint8Array {
  const records: EchantillonFit[] = [];
  for (let t = 0; t <= min * 60; t++) records.push({ t, dist: t * 3, fc: 150, vit: 3 });
  return encoderFit({ debut, decalageLocal_min, sport: 1, subSport: 2, records, laps: [], fabricant: 265 });
}

/** Une archive Strava : activities.csv et les fichiers cités, construits par code (ADR 0010). */
function archive(entrees: { id: string; debut: number; min: number }[]): Uint8Array {
  const lignes = entrees.map((e) => `${e.id},Sortie,Course à pied,activities/${e.id}.fit`);
  const fichiers: Record<string, Uint8Array> = {
    'activities.csv': strToU8(TETE_CSV + lignes.join('\n') + '\n'),
  };
  for (const e of entrees) fichiers[`activities/${e.id}.fit`] = fit(e.debut, e.min);
  return zipSync(fichiers);
}

/** Le fichier tel que l'interface l'envoie : un Blob. */
function enBlob(octets: Uint8Array): Blob {
  return new Blob([new Uint8Array(octets)]);
}

const DEBUT_A = Date.UTC(2026, 9, 10, 6, 0);
const DEBUT_B = Date.UTC(2026, 9, 12, 6, 0);

interface Options {
  stockage?: { persist?: () => Promise<boolean> };
  calculer?: Parameters<typeof creerTraitement>[0]['calculer'];
  ouvrir?: () => Promise<Base>;
}

interface Banc {
  base: Base;
  reponses: Reponse[];
  traiter: (requete: CorpsRequete) => Promise<void>;
  /** Fait avancer l'horloge injectée : le prochain appel la verra. */
  reglerHorloge: (instant: Date) => void;
  transferables: unknown[][];
}

/** Horloge figée par défaut : `derniereSynchro` ne change pas d'un import à l'autre. */
const HORLOGE_INITIALE = new Date('2026-10-21T10:00:00Z');

async function banc(options: Options = {}): Promise<Banc> {
  const base = await nouvelleBase();
  const reponses: Reponse[] = [];
  const transferables: unknown[][] = [];
  let horloge = HORLOGE_INITIALE;
  const traiter = creerTraitement({
    ouvrir: options.ouvrir ?? (async () => base),
    emettre: (r, liste) => {
      reponses.push(r);
      transferables.push(liste ?? []);
    },
    stockage: options.stockage,
    calculer: options.calculer,
    maintenant: () => horloge,
  });
  return {
    base,
    reponses,
    traiter,
    transferables,
    reglerHorloge: (instant) => {
      horloge = instant;
    },
  };
}

function lireRecalculs(base: Base): Promise<EntreeRecalcul[]> {
  return executer(base, ['journal_recalcul'], 'readonly', async (tx) => {
    return new Promise<EntreeRecalcul[]>((resoudre, rejeter) => {
      const demande = tx.objectStore('journal_recalcul').getAll();
      demande.onsuccess = () => resoudre(demande.result as EntreeRecalcul[]);
      demande.onerror = () => rejeter(demande.error);
    });
  });
}

/** Une base dont l'écriture dans `journal_recalcul` échoue, comme un disque plein. */
function baseQuiRefuseLeJournalDeRecalcul(base: Base): Base {
  return new Proxy(base, {
    get(cible, propriete) {
      if (propriete === 'transaction') {
        return (magasins: string | string[], mode?: IDBTransactionMode) => {
          const noms = Array.isArray(magasins) ? magasins : [magasins];
          if (mode === 'readwrite' && noms.includes('journal_recalcul')) throw new Error('disque plein');
          return cible.transaction(magasins, mode);
        };
      }
      const valeur: unknown = Reflect.get(cible, propriete, cible);
      return typeof valeur === 'function' ? valeur.bind(cible) : valeur;
    },
  });
}

function typesEmis(reponses: Reponse[]): string[] {
  return reponses.map((r) => r.type);
}

/** La dernière Vue émise. */
function vueDe(reponses: Reponse[]): Vue | undefined {
  const reponse = reponses.filter((r) => r.type === 'vue').at(-1);
  return reponse?.type === 'vue' ? reponse.vue : undefined;
}

describe('démarrer (ADR 0009)', () => {
  it('sur une base vide, renvoie une Vue sans séance ni jour', async () => {
    const { reponses, traiter } = await banc();

    await traiter({ type: 'demarrer', J });

    expect(reponses).toHaveLength(1);
    const [reponse] = reponses;
    expect(reponse).toMatchObject({ type: 'vue', vue: { J, derniereSynchro: null, seances: [], jours: { date: [] } } });
  });

  it('écrit une entrée « demarrage » dans le journal de recalcul (ADR 0012)', async () => {
    const { base, traiter } = await banc();

    await traiter({ type: 'demarrer', J });

    const entrees = await lireRecalculs(base);
    expect(entrees).toEqual([expect.objectContaining({ cause: 'demarrage', seancesRecalculees: 0 })]);
  });

  it('un calcul en échec au démarrage est signalé par un message d\'erreur, et n\'est pas avalé', async () => {
    const { reponses, traiter } = await banc({ calculer: async () => { throw new Error('boum'); } });

    await traiter({ type: 'demarrer', J });

    expect(reponses).toEqual([{ type: 'erreur', message: 'boum' }]);
  });

  it('une ouverture de base rejetée remet la base à zéro : la requête suivante peut réussir', async () => {
    const base = await nouvelleBase();
    let tentatives = 0;
    const { reponses, traiter } = await banc({
      ouvrir: async () => {
        tentatives += 1;
        if (tentatives === 1) throw new Error('ouverture refusée');
        return base;
      },
    });

    await traiter({ type: 'demarrer', J });
    await traiter({ type: 'demarrer', J });

    expect(typesEmis(reponses)).toEqual(['erreur', 'vue']);
    expect(tentatives).toBe(2);
  });

  it('la Vue est émise avec une liste de transferts vide, pour l\'instant (ADR 0009)', async () => {
    const { traiter, transferables } = await banc();

    await traiter({ type: 'demarrer', J });

    expect(transferables).toEqual([[]]);
  });
});

describe('importer une archive (ADR 0004, 0009)', () => {
  it('émet une progression par activité lue, puis le journal, puis la Vue avec les séances attendues', async () => {
    const { reponses, traiter } = await banc();

    await traiter({ type: 'importer', fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }, { id: '2', debut: DEBUT_B, min: 45 }])), J });

    expect(typesEmis(reponses)).toEqual(['progression', 'progression', 'journal', 'vue']);
    expect(reponses.slice(0, 2)).toEqual([
      { type: 'progression', fait: 1, total: 2, etape: 'lecture' },
      { type: 'progression', fait: 2, total: 2, etape: 'lecture' },
    ]);

    const journal = reponses.find((r) => r.type === 'journal');
    expect(journal).toMatchObject({ journal: { ajoutees: 2, modifiees: 0, supprimees: 0 } });

    const vue = vueDe(reponses);
    expect(vue?.seances.map((s) => [s.date, s.type, Math.round(s.duree_min)])).toEqual([
      ['2026-10-10', 'footing', 30],
      ['2026-10-12', 'footing', 45],
    ]);
  });

  it('deux imports simultanés ne s\'entrelacent pas : chacun a sa progression, son journal et sa Vue', async () => {
    const { reponses, traiter } = await banc();

    const premier = traiter({ type: 'importer', fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }, { id: '2', debut: DEBUT_B, min: 45 }])), J });
    const second = traiter({ type: 'importer', fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }])), J });
    await Promise.all([premier, second]);

    expect(typesEmis(reponses)).toEqual(['progression', 'progression', 'journal', 'vue', 'progression', 'journal', 'vue']);
  });

  it('réimporter la même archive donne un journal à 0/0/0 et la même Vue', async () => {
    const { reponses, traiter } = await banc();
    const octets = archive([{ id: '1', debut: DEBUT_A, min: 30 }]);
    await traiter({ type: 'importer', fichier: enBlob(octets), J });
    await traiter({ type: 'importer', fichier: enBlob(octets), J });

    const journaux = reponses.filter((r) => r.type === 'journal');
    const vues = reponses.filter((r) => r.type === 'vue');
    expect(journaux.at(-1)).toMatchObject({ journal: { ajoutees: 0, modifiees: 0, supprimees: 0, ignorees: 0 } });
    expect(vues).toHaveLength(2);
    expect(vues[1]).toEqual(vues[0]);
  });

  it('une archive invalide donne un message d\'erreur, et la base reste intacte', async () => {
    const { base, reponses, traiter } = await banc();
    await traiter({ type: 'importer', fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }])), J });
    const activitesAvant = await listerActivites(base);
    const parametresAvant = await lireParametres(base);
    const journalAvant = await lireJournal(base);
    const recalculsAvant = await lireRecalculs(base);
    reponses.length = 0;

    await traiter({ type: 'importer', fichier: enBlob(strToU8('pas une archive')), J });

    expect(reponses).toHaveLength(1);
    expect(reponses[0]).toMatchObject({ type: 'erreur' });
    expect(await listerActivites(base)).toEqual(activitesAvant);
    expect(await lireParametres(base)).toEqual(parametresAvant);
    expect(await lireJournal(base)).toEqual(journalAvant);
    expect(await lireRecalculs(base)).toEqual(recalculsAvant);
  });

  it('une erreur de lecture n\'est pas suivie d\'une Vue, et elle n\'est pas avalée', async () => {
    const { reponses, traiter } = await banc();

    await traiter({ type: 'importer', fichier: enBlob(strToU8('pas une archive')), J });

    expect(typesEmis(reponses)).toEqual(['erreur']);
  });

  it('un GPX sans fuseau prend le décalage du fuseau de l\'appareil à l\'instant de début (ADR 0007)', async () => {
    // TZ=America/Los_Angeles (vitest.config.ts) : 03:00 UTC le 10 octobre, c'est 20:00 le 9 octobre.
    const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>` +
      [0, 1, 2].map((k) => `<trkpt lat="${48.85 + k * 0.0001}" lon="2.35"><time>2026-10-10T03:0${k}:00Z</time></trkpt>`).join('') +
      `</trkseg></trk></gpx>`;
    const octets = zipSync({
      'activities.csv': strToU8(TETE_CSV + '3,Sortie,Course à pied,activities/3.gpx\n'),
      'activities/3.gpx': strToU8(gpx),
    });
    const { reponses, traiter } = await banc();

    await traiter({ type: 'importer', fichier: enBlob(octets), J });

    expect(vueDe(reponses)?.seances.map((s) => s.date)).toEqual(['2026-10-09']);
  });

  it('le décalage de secours est calculé à chaque requête : un changement de fuseau compte au import suivant', async () => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>` +
      [0, 1, 2].map((k) => `<trkpt lat="${48.85 + k * 0.0001}" lon="2.35"><time>2026-10-10T03:0${k}:00Z</time></trkpt>`).join('') +
      `</trkseg></trk></gpx>`;
    const octets = zipSync({
      'activities.csv': strToU8(TETE_CSV + '3,Sortie,Course à pied,activities/3.gpx\n'),
      'activities/3.gpx': strToU8(gpx),
    });
    const fuseauAvant = process.env.TZ;
    try {
      const { reponses, traiter } = await banc();

      process.env.TZ = 'Europe/Paris';
      await traiter({ type: 'importer', fichier: enBlob(octets), J });

      // 03:00 UTC, c'est 05:00 à Paris le 10 octobre.
      expect(vueDe(reponses)?.seances.map((s) => s.date)).toEqual(['2026-10-10']);
    } finally {
      if (fuseauAvant === undefined) delete process.env.TZ;
      else process.env.TZ = fuseauAvant;
    }
  });

  it('une activité ignorée (doublon) n\'entre pas dans la Vue', async () => {
    // Deux activités au même instant : une seule est gardée (ADR 0004), l'autre est ignorée.
    const { reponses, traiter } = await banc();

    await traiter({
      type: 'importer',
      fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }, { id: '2', debut: DEBUT_A, min: 30 }])),
      J,
    });

    const seances = vueDe(reponses)?.seances ?? [];
    expect(seances).toHaveLength(1);
    expect(reponses.find((r) => r.type === 'journal')).toMatchObject({ journal: { ignorees: 1 } });
  });

  it('la Vue porte la date de la dernière synchronisation, celle de l\'import', async () => {
    const { reponses, traiter } = await banc();

    await traiter({ type: 'importer', fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }])), J });

    expect(vueDe(reponses)?.derniereSynchro).toBe(HORLOGE_INITIALE.toISOString());
  });

  it('un import sans J prend la date civile de l\'appareil à l\'instant de la requête', async () => {
    const { reponses, traiter, reglerHorloge } = await banc();
    await traiter({ type: 'demarrer', J });
    expect(vueDe(reponses)?.J).toBe(J);

    // 10:00 UTC le 21 octobre, puis le 22 : à Los Angeles, c'est 03:00 chaque jour.
    reglerHorloge(new Date('2026-10-22T10:00:00Z'));
    await traiter({ type: 'importer', fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }])) });

    expect(vueDe(reponses)?.J).toBe('2026-10-22');
  });

  it('une archive d\'un fichier qui n\'est ni Blob ni Uint8Array donne une erreur', async () => {
    const { reponses, traiter } = await banc();

    await traiter({ type: 'importer', fichier: 'export.zip' as unknown as Blob, J });

    expect(reponses).toEqual([{ type: 'erreur', message: expect.stringContaining('fichier') }]);
  });

  it('accepte un Uint8Array à l\'exécution, pour les tests', async () => {
    const { reponses, traiter } = await banc();

    await traiter({ type: 'importer', fichier: archive([{ id: '1', debut: DEBUT_A, min: 30 }]) as unknown as Blob, J });

    expect(typesEmis(reponses)).toEqual(['progression', 'journal', 'vue']);
  });

  it('une activité active dont le flux manque, sans séance mémorisée, donne echecRecalcul, et non une Vue partielle', async () => {
    const { base, traiter } = await banc();
    const octets = archive([{ id: '1', debut: DEBUT_A, min: 30 }]);
    await traiter({ type: 'importer', fichier: enBlob(octets), J });
    // Ni le flux ni la séance mémorisée (derive) ne restent : le Worker doit relire le flux, et il manque.
    await executer(base, ['flux', 'derive'], 'readwrite', async (tx) => {
      tx.objectStore('flux').delete('strava:1');
      tx.objectStore('derive').clear();
    });
    const { reponses: neuves, traiter: traiterNeuf } = await banc({ ouvrir: async () => base });

    // Même archive : l'activité ne change pas, son flux n'est pas réécrit.
    await traiterNeuf({ type: 'importer', fichier: enBlob(octets), J });

    expect(typesEmis(neuves)).toEqual(['progression', 'journal', 'echecRecalcul']);
    expect(vueDe(neuves)).toBeUndefined();
  });
});

describe('recalcul en échec après un import réussi (ADR 0009, 0012, D-010)', () => {
  it('le journal est émis, puis echecRecalcul avec le message, sans Vue', async () => {
    const { reponses, traiter } = await banc({ calculer: async () => { throw new Error('boum'); } });

    await traiter({ type: 'importer', fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }])), J });

    expect(reponses.map((r) => r.type)).toEqual(['progression', 'journal', 'echecRecalcul']);
    expect(reponses.at(-1)).toEqual({ type: 'echecRecalcul', message: 'boum' });
  });

  it('l\'import est gardé, les paramètres ne bougent pas, et l\'entrée de recalcul porte l\'erreur, sans séance recalculée', async () => {
    const { base, traiter } = await banc({ calculer: async () => { throw new Error('boum'); } });
    const parametresAvant = await lireParametres(base);

    await traiter({ type: 'importer', fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }])), J });

    expect(await lireJournal(base)).toHaveLength(1);
    expect((await listerActivites(base)).map((a) => a.cleSource)).toEqual(['strava:1']);
    expect(await lireParametres(base)).toEqual(parametresAvant);
    const entrees = await lireRecalculs(base);
    expect(entrees).toEqual([expect.objectContaining({ cause: 'import', seancesRecalculees: 0, erreur: 'boum' })]);
  });

  it('la requête suivante fonctionne', async () => {
    let echecs = 1;
    const { reponses, traiter } = await banc({
      calculer: async (b, date) => {
        if (echecs > 0) {
          echecs -= 1;
          throw new Error('boum');
        }
        return calculerDepuisBase(b, date);
      },
    });
    const octets = archive([{ id: '1', debut: DEBUT_A, min: 30 }]);

    await traiter({ type: 'importer', fichier: enBlob(octets), J });
    await traiter({ type: 'importer', fichier: enBlob(octets), J });

    expect(typesEmis(reponses).slice(-2)).toEqual(['journal', 'vue']);
    expect(vueDe(reponses)?.seances).toHaveLength(1);
  });

  it('une Vue calculée est émise avant l\'écriture du journal, et un échec d\'écriture est seulement noté dans la console', async () => {
    const avertissements = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const base = await nouvelleBase();
    const { reponses, traiter } = await banc({ ouvrir: async () => baseQuiRefuseLeJournalDeRecalcul(base) });

    await traiter({ type: 'importer', fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }])), J });

    expect(typesEmis(reponses)).toEqual(['progression', 'journal', 'vue']);
    expect(avertissements).toHaveBeenCalled();
  });

  it('un journal de recalcul en échec au démarrage ne retient pas la Vue', async () => {
    const avertissements = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const base = await nouvelleBase();
    const { reponses, traiter } = await banc({ ouvrir: async () => baseQuiRefuseLeJournalDeRecalcul(base) });

    await traiter({ type: 'demarrer', J });

    expect(typesEmis(reponses)).toEqual(['vue']);
    expect(avertissements).toHaveBeenCalled();
  });
});

describe('journal de recalcul (ADR 0012)', () => {
  it('une entrée par import, et le journal est plafonné aux 50 dernières entrées', async () => {
    const { base, traiter } = await banc();
    const octets = archive([{ id: '1', debut: DEBUT_A, min: 5 }]);

    for (let k = 0; k < 52; k++) await traiter({ type: 'importer', fichier: enBlob(octets), J });

    const entrees = await lireRecalculs(base);
    expect(entrees).toHaveLength(50);
    expect(entrees.map((e) => e.id)).toEqual(Array.from({ length: 50 }, (_, k) => k + 3));
    expect(entrees.every((e) => e.cause === 'import' && typeof e.duree_ms === 'number')).toBe(true);
    expect(entrees.every((e) => e.erreur === undefined)).toBe(true);
  });

  it('une entrée d\'import contient le nombre de séances recalculées, une durée positive ou nulle, et pas d\'erreur', async () => {
    const { base, traiter } = await banc();

    await traiter({ type: 'importer', fichier: enBlob(archive([{ id: '1', debut: DEBUT_A, min: 30 }])), J });

    const [entree] = await lireRecalculs(base);
    expect(entree).toMatchObject({ cause: 'import', seancesRecalculees: 1 });
    expect(entree?.duree_ms).toBeGreaterThanOrEqual(0);
    expect(entree?.erreur).toBeUndefined();
  });

  it('la demande de stockage persistant est faite une seule fois, même après 52 imports, et son résultat est noté dans meta', async () => {
    let appels = 0;
    const { base, traiter } = await banc({
      stockage: {
        persist: async () => {
          appels += 1;
          return true;
        },
      },
    });
    const octets = archive([{ id: '1', debut: DEBUT_A, min: 5 }]);
    for (let k = 0; k < 52; k++) await traiter({ type: 'importer', fichier: enBlob(octets), J });

    await traiter({ type: 'demarrer', J });
    await traiter({ type: 'demarrer', J });

    expect(appels).toBe(1);
    // La demande part hors de la file : son résultat arrive à son rythme, et se lit dans meta (ADR 0005).
    await vi.waitFor(async () => expect(await lireMeta(base)).toMatchObject({ persistance: { accordee: true } }));
  });

  it('un refus ou une erreur du stockage persistant ne bloque pas la Vue', async () => {
    const { reponses, traiter } = await banc({
      stockage: {
        persist: async () => {
          throw new Error('non supporté');
        },
      },
    });

    await traiter({ type: 'demarrer', J });

    expect(typesEmis(reponses)).toEqual(['vue']);
  });
});

describe('messages inconnus (ADR 0009)', () => {
  it('un type de message inconnu donne une erreur qui le nomme', async () => {
    const { reponses, traiter } = await banc();

    await traiter({ type: 'inconnu' } as unknown as CorpsRequete);

    expect(reponses).toEqual([{ type: 'erreur', message: 'message inconnu : inconnu' }]);
  });
});
