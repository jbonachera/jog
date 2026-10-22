import { createHash } from 'node:crypto';
import { gzipSync, strToU8, zipSync, type Zippable } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { lireArchiveStrava, type ResultatArchive } from '../../src/adapters/strava-archive/lecteur';
import { ErreurArchive } from '../../src/adapters/strava-archive/erreurs';
import {
  encoderFit,
  type EchantillonFit,
  type OptionsEncodeur,
} from '../fixtures/encodeur-fit';
import { itPerf } from '../fixtures/perf';

// Archive d'export Strava, construite par code (ADR 0010 : aucune donnée réelle dans le dépôt).
// Les colonnes utiles sont à leur position réelle dans activities.csv (103 colonnes).

const DEBUT = Date.UTC(2026, 9, 20, 7, 30, 0);
const TAILLE_CSV = 103;
const POSITION = {
  id: 0,
  date: 1,
  nom: 2,
  type: 3,
  description: 4,
  fichier: 12,
  competition: 95,
};

const ENTETES_FR: string[] = Array.from({ length: TAILLE_CSV }, (_, i) => `Champ ${i}`);
ENTETES_FR[POSITION.id] = "ID de l'activité";
ENTETES_FR[POSITION.date] = "Date de l'activité";
ENTETES_FR[POSITION.nom] = "Nom de l'activité";
ENTETES_FR[POSITION.type] = "Type d'activité";
ENTETES_FR[POSITION.description] = "Description de l'activité";
ENTETES_FR[POSITION.fichier] = 'Nom du fichier';
ENTETES_FR[POSITION.competition] = 'Compétition';
// Noms répétés, comme dans l'export réel : seule la première occurrence compte.
ENTETES_FR[5] = 'Temps écoulé';
ENTETES_FR[30] = 'Temps écoulé';
ENTETES_FR[20] = 'Distance';
ENTETES_FR[60] = 'Distance';

const ENTETES_EN: string[] = [...ENTETES_FR];
ENTETES_EN[POSITION.id] = 'Activity ID';
ENTETES_EN[POSITION.date] = 'Activity Date';
ENTETES_EN[POSITION.nom] = 'Activity Name';
ENTETES_EN[POSITION.type] = 'Activity Type';
ENTETES_EN[POSITION.description] = 'Activity Description';
ENTETES_EN[POSITION.fichier] = 'Filename';
ENTETES_EN[POSITION.competition] = 'Competition';

interface LigneCsv {
  id: string;
  nom?: string;
  type?: string;
  description?: string;
  fichier?: string;
  competition?: string;
}

const COURSE = 'Course à pied';

function ligne(valeurs: LigneCsv): string[] {
  const cases = Array.from({ length: TAILLE_CSV }, () => '');
  cases[POSITION.id] = valeurs.id;
  cases[POSITION.nom] = valeurs.nom ?? '';
  cases[POSITION.type] = valeurs.type ?? COURSE;
  cases[POSITION.description] = valeurs.description ?? '';
  cases[POSITION.fichier] = valeurs.fichier ?? `activities/${valeurs.id}.fit.gz`;
  cases[POSITION.competition] = valeurs.competition ?? '';
  return cases;
}

function cellule(valeur: string): string {
  return /[",\r\n]/.test(valeur) ? `"${valeur.replace(/"/g, '""')}"` : valeur;
}

function csv(
  entetes: string[],
  lignes: string[][],
  options: { bom?: boolean; crlf?: boolean } = {},
): Uint8Array {
  const fin = options.crlf === true ? '\r\n' : '\n';
  const texte = [entetes, ...lignes].map((l) => l.map(cellule).join(',')).join(fin) + fin;
  const bom = options.bom === true ? '﻿' : '';
  return strToU8(bom + texte);
}

function fitCourse(nbEchantillons = 600, options: OptionsEncodeur = {}): Uint8Array {
  const records: EchantillonFit[] = Array.from({ length: nbEchantillons }, (_, t) => ({
    t,
    dist: t * 3,
    fc: 150 + (t % 20),
    alt: 100 + t / 5,
    vit: 3.2,
  }));
  return encoderFit(
    { debut: DEBUT, decalageLocal_min: 120, sport: 1, subSport: 2, records, laps: [], fabricant: 265 },
    options,
  );
}

// Un seul gzip partagé : son horodatage d'en-tête rend l'empreinte comparable d'une archive à l'autre.
const FIT_GZ = gzipSync(fitCourse());

function gpxCourse(): Uint8Array {
  const points = [0, 1, 2]
    .map(
      (k) =>
        `<trkpt lat="${48.85 + k * 0.0001}" lon="2.35"><ele>35</ele><time>2026-10-20T07:3${k}:00Z</time></trkpt>`,
    )
    .join('');
  return strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">' +
      `<trk><type>running</type><trkseg>${points}</trkseg></trk></gpx>`,
  );
}

function tcxCourse(): Uint8Array {
  const trackpoints = [0, 1, 2]
    .map(
      (k) =>
        `<Trackpoint><Time>2026-10-20T07:3${k}:00Z</Time><DistanceMeters>${k * 3}</DistanceMeters></Trackpoint>`,
    )
    .join('');
  return strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">' +
      '<Activities><Activity Sport="Running"><Id>2026-10-20T07:30:00Z</Id>' +
      '<Lap StartTime="2026-10-20T07:30:00Z"><TotalTimeSeconds>60</TotalTimeSeconds><DistanceMeters>6</DistanceMeters>' +
      `<TriggerMethod>Manual</TriggerMethod><Track>${trackpoints}</Track></Lap>` +
      '</Activity></Activities></TrainingCenterDatabase>',
  );
}

// Localise une entrée du ZIP, en-tête local (signature 0x04034b50) ou central (0x02014b50), par son nom.
function offsetEnTete(archive: Uint8Array, signature: number, nom: string): number {
  const vue = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const decodeur = new TextDecoder();
  const enLocal = signature === 0x04034b50;
  const offsetLongueur = enLocal ? 26 : 28;
  const debutNom = enLocal ? 30 : 46;
  for (let i = 0; i + debutNom <= archive.length; i++) {
    if (vue.getUint32(i, true) !== signature) continue;
    const longueur = vue.getUint16(i + offsetLongueur, true);
    if (decodeur.decode(archive.subarray(i + debutNom, i + debutNom + longueur)) === nom) return i;
  }
  throw new Error(`entrée « ${nom} » introuvable dans le ZIP de test`);
}

// Change la méthode de compression d'une entrée, dans ses deux index (locale et centrale).
function methodeDeCompression(archive: Uint8Array, nom: string, methode: number): Uint8Array {
  const copie = new Uint8Array(archive);
  const vue = new DataView(copie.buffer);
  vue.setUint16(offsetEnTete(copie, 0x04034b50, nom) + 8, methode, true);
  vue.setUint16(offsetEnTete(copie, 0x02014b50, nom) + 10, methode, true);
  return copie;
}

const LIGNES_TYPIQUES: string[][] = [
  ligne({ id: '1001', nom: 'Semi De Porto Vecchio' }),
  ligne({ id: '1002', nom: 'Sortie du matin' }),
  ligne({ id: '1003', nom: '10k adidas' }),
  ligne({ id: '1004', nom: 'Balade', type: 'Vélo' }),
  ligne({ id: '1005', nom: 'Course à pied le midi', fichier: 'activities/1005.gpx' }),
];

function archiveTypique(
  lignes: string[][] = LIGNES_TYPIQUES,
  extra: Zippable = {},
): Uint8Array {
  return zipSync({
    'activities.csv': csv(ENTETES_FR, lignes),
    'activities/1001.fit.gz': FIT_GZ,
    'activities/1002.fit.gz': FIT_GZ,
    'activities/1003.fit.gz': FIT_GZ,
    'activities/1004.fit.gz': FIT_GZ,
    'activities/1005.gpx': gpxCourse(),
    ...extra,
  });
}

describe('archive de 3 courses FIT, 1 vélo et 1 GPX (ADR 0003)', () => {
  it('donne 4 pivots nommés avec les clés strava:{id}, et ignore le vélo', async () => {
    const resultat = await lireArchiveStrava(archiveTypique());

    expect(resultat.pivots.map((p) => [p.cleSource, p.nom, p.source])).toEqual([
      ['strava:1001', 'Semi De Porto Vecchio', 'strava-archive'],
      ['strava:1002', 'Sortie du matin', 'strava-archive'],
      ['strava:1003', '10k adidas', 'strava-archive'],
      ['strava:1005', 'Course à pied le midi', 'strava-archive'],
    ]);
    expect(resultat.ignorees).toEqual([{ cleSource: 'strava:1004', raison: 'pas-une-course', type: 'Vélo' }]);
    expect(resultat.illisibles).toEqual([]);
    expect(resultat.manquants).toEqual([]);
  });

  it('conserve les octets bruts tels que stockés, avec leur format et leur compression', async () => {
    const resultat = await lireArchiveStrava(archiveTypique());

    expect(resultat.bruts.map((b) => [b.cleSource, b.format, b.compresse])).toEqual([
      ['strava:1001', 'fit', true],
      ['strava:1002', 'fit', true],
      ['strava:1003', 'fit', true],
      ['strava:1005', 'gpx', false],
    ]);
    expect(resultat.bruts[0]?.octets).toEqual(FIT_GZ);
  });

  it('ignore une ligne « course » dont le FIT déclare un autre sport (confirmé par le lecteur)', async () => {
    const fitVelo = encoderFit(
      { debut: DEBUT, decalageLocal_min: 120, sport: 2, subSport: 2, records: [], laps: [], fabricant: 265 },
      {},
    );
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [ligne({ id: '1100', nom: 'Course mal typée' })]),
      'activities/1100.fit.gz': gzipSync(fitVelo),
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots).toEqual([]);
    expect(resultat.ignorees).toEqual([{ cleSource: 'strava:1100', raison: 'pas-une-course', type: COURSE }]);
    expect(resultat.illisibles).toEqual([]);
  });
});

describe('lecture minimale de l\'archive (ADR 0010)', () => {
  it('ne décompresse pas le fichier d\'une activité ignorée, même invalide', async () => {
    const archive = archiveTypique(LIGNES_TYPIQUES, {
      'activities/1004.fit.gz': strToU8("ceci n'est pas un gzip"),
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.illisibles).toEqual([]);
    expect(resultat.ignorees).toEqual([{ cleSource: 'strava:1004', raison: 'pas-une-course', type: 'Vélo' }]);
  });

  it('ne lit jamais les fichiers personnels, même corrompus ou dans une méthode de compression inconnue', async () => {
    // Les données des fichiers personnels sont stockées, puis leur méthode est falsifiée :
    // 8 (deflate) sur des octets invalides pour messages, 99 (inconnue) pour les contacts.
    const avecPersonnels = archiveTypique(LIGNES_TYPIQUES, {
      'messaging.json': [new Uint8Array(16).fill(0xff), { level: 0 }],
      'contacts.csv': [strToU8('Nom,Telephone\nAlice,0600000000\n'), { level: 0 }],
      'activities/9999.fit.gz': strToU8('non cité par activities.csv'),
    });
    const archive = methodeDeCompression(
      methodeDeCompression(avecPersonnels, 'messaging.json', 8),
      'contacts.csv',
      99,
    );

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual([
      'strava:1001',
      'strava:1002',
      'strava:1003',
      'strava:1005',
    ]);
    expect(resultat.illisibles).toEqual([]);
  });
});

describe('lecture du CSV', () => {
  it('garde les champs sur plusieurs lignes, les virgules et les guillemets doublés', async () => {
    const lignes = [
      ligne({
        id: '2001',
        nom: 'Semi, "de" test',
        description: "Fartlek,\nvirages \"serrés\"\r\n3 x 10'",
      }),
      ligne({ id: '2002', nom: 'Sortie' }),
    ];
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, lignes),
      'activities/2001.fit.gz': FIT_GZ,
      'activities/2002.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => [p.cleSource, p.nom])).toEqual([
      ['strava:2001', 'Semi, "de" test'],
      ['strava:2002', 'Sortie'],
    ]);
  });

  it('accepte un export avec BOM et fins de ligne CRLF', async () => {
    const archive = zipSync({
      'activities.csv': csv(
        ENTETES_FR,
        [ligne({ id: '3001', nom: 'Course BOM' }), ligne({ id: '3002', nom: 'Course CRLF' })],
        { bom: true, crlf: true },
      ),
      'activities/3001.fit.gz': FIT_GZ,
      'activities/3002.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => [p.cleSource, p.nom])).toEqual([
      ['strava:3001', 'Course BOM'],
      ['strava:3002', 'Course CRLF'],
    ]);
  });

  it('accepte les en-têtes anglais, à titre de repli', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_EN, [ligne({ id: '4001', nom: 'English run', competition: '1' })]),
      'activities/4001.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => [p.cleSource, p.nom, p.competition])).toEqual([
      ['strava:4001', 'English run', true],
    ]);
  });

  it.each([
    ["ID de l'activité", /ID de l'activité/],
    ['Nom du fichier', /Nom du fichier/],
  ])('lève une erreur explicite quand l\'en-tête « %s » manque', async (manquant, attendu) => {
    const entetes = ENTETES_FR.map((nom) => (nom === manquant ? 'Autre' : nom));
    const archive = zipSync({
      'activities.csv': csv(entetes, [ligne({ id: '5001' })]),
      'activities/5001.fit.gz': FIT_GZ,
    });

    await expect(lireArchiveStrava(archive)).rejects.toThrow(attendu);
  });
});

describe('fichiers illisibles et manquants', () => {
  it('nomme un fichier corrompu dans illisibles, et lit les autres', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [
        ligne({ id: '6001', nom: 'Bon' }),
        ligne({ id: '6002', nom: 'Tronqué' }),
        ligne({ id: '6003', nom: 'Gzip cassé' }),
      ]),
      'activities/6001.fit.gz': FIT_GZ,
      'activities/6002.fit.gz': gzipSync(fitCourse(600, { tronquer: 120 })),
      'activities/6003.fit.gz': strToU8('pas un gzip du tout'),
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:6001']);
    expect(resultat.illisibles.map((i) => [i.cleSource, i.fichier])).toEqual([
      ['strava:6002', 'activities/6002.fit.gz'],
      ['strava:6003', 'activities/6003.fit.gz'],
    ]);
    for (const i of resultat.illisibles) expect(i.message.length).toBeGreaterThan(0);
  });

  it('signale dans manquants le fichier cité par le CSV et absent du ZIP', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [
        ligne({ id: '7001', nom: 'Présent' }),
        ligne({ id: '7002', nom: 'Absent' }),
      ]),
      'activities/7001.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:7001']);
    expect(resultat.manquants).toEqual([{ cleSource: 'strava:7002', fichier: 'activities/7002.fit.gz' }]);
    expect(resultat.illisibles).toEqual([]);
  });
});

describe('message d\'erreur de l\'archive (08, Rédaction)', () => {
  it('un ZIP sans activities.csv le dit avec une apostrophe typographique, comme tout texte affiché', async () => {
    const archive = zipSync({ 'autre.txt': strToU8('sans index') });

    await expect(lireArchiveStrava(archive)).rejects.toThrow('activities.csv absent de l’archive');
  });
});

describe('marquage « Compétition » (D-014)', () => {
  it('reconnaît une compétition quand la colonne vaut 1, 1.0, true ou True', async () => {
    const valeurs = ['1', '1.0', 'true', 'True', '0', ''];
    const lignes = valeurs.map((competition, k) =>
      ligne({ id: `80${k}`, nom: `Valeur ${competition}`, competition }),
    );
    const fichiers: Zippable = {};
    valeurs.forEach((_, k) => {
      fichiers[`activities/80${k}.fit.gz`] = FIT_GZ;
    });
    const archive = zipSync({ 'activities.csv': csv(ENTETES_FR, lignes), ...fichiers });

    const resultat = await lireArchiveStrava(archive);

    expect(Object.fromEntries(resultat.pivots.map((p) => [p.nom, p.competition]))).toEqual({
      'Valeur 1': true,
      'Valeur 1.0': true,
      'Valeur true': true,
      'Valeur True': true,
      'Valeur 0': false,
      'Valeur ': false,
    });
  });
});

describe('empreinte (ADR 0004)', () => {
  it('est stable pour une même archive, et change quand le nom change', async () => {
    const empreinte = (resultat: ResultatArchive, cle: string) =>
      resultat.pivots.find((p) => p.cleSource === cle)?.empreinteBrute;

    const premiere = await lireArchiveStrava(archiveTypique());
    const seconde = await lireArchiveStrava(archiveTypique());
    const renommee = await lireArchiveStrava(
      archiveTypique([
        ligne({ id: '1001', nom: 'Renommée' }),
        ...LIGNES_TYPIQUES.slice(1),
      ]),
    );

    expect(empreinte(premiere, 'strava:1001')).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinte(seconde, 'strava:1001')).toBe(empreinte(premiere, 'strava:1001'));
    expect(empreinte(renommee, 'strava:1001')).not.toBe(empreinte(premiere, 'strava:1001'));
    expect(empreinte(renommee, 'strava:1002')).toBe(empreinte(premiere, 'strava:1002'));
  });
});

describe('progression', () => {
  it('appelle surProgression une fois par fichier lu, avec le total', async () => {
    const appels: [number, number][] = [];

    await lireArchiveStrava(archiveTypique(), {
      surProgression: (fait, total) => appels.push([fait, total]),
    });

    expect(appels).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });
});

describe('format TCX', () => {
  it('lit un TCX choisi par son extension', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [
        ligne({ id: '9001', nom: 'Course TCX', fichier: 'activities/9001.tcx' }),
      ]),
      'activities/9001.tcx': tcxCourse(),
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => [p.cleSource, p.nom])).toEqual([['strava:9001', 'Course TCX']]);
    expect(resultat.bruts.map((b) => [b.format, b.compresse])).toEqual([['tcx', false]]);
  });
});

describe('performance', () => {
  itPerf('lit 400 FIT de 3 600 enregistrements en moins de 5 s', async () => {
    const gz = gzipSync(fitCourse(3600));
    const fichiers: Zippable = {};
    const lignes: string[][] = [];
    for (let k = 0; k < 400; k++) {
      const id = String(10_000 + k);
      lignes.push(ligne({ id, nom: `Course ${k}` }));
      fichiers[`activities/${id}.fit.gz`] = gz;
    }
    const archive = zipSync({ 'activities.csv': csv(ENTETES_FR, lignes), ...fichiers });

    const durees: number[] = [];
    let resultat = await lireArchiveStrava(archive);
    for (let k = 0; k < 3; k++) {
      const debut = performance.now();
      resultat = await lireArchiveStrava(archive);
      durees.push(performance.now() - debut);
    }

    expect(resultat.pivots).toHaveLength(400);
    const triees = [...durees].sort((a, b) => a - b);
    expect(triees[1] ?? Number.NaN).toBeLessThan(5000);
  }, 120_000);
});

// Texte CSV brut : chaque cellule est écrite telle quelle (aucun guillemet ajouté).
function brut(cases: string[]): string {
  return cases.join(',');
}

// Activité Course à pied, FIT gzip, dans une ligne brute de 103 colonnes.
function ligneBrute(valeurs: LigneCsv): string {
  return brut(ligne(valeurs));
}

const ENTETE_BRUTE = brut(ENTETES_FR);

describe('limites de taille (archive piégée)', () => {
  it('refuse un .gz qui se décompresse au-delà de 50 Mo, et lit les autres activités', async () => {
    const bombe = gzipSync(new Uint8Array(60 * 1024 * 1024));
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [ligne({ id: '11001', nom: 'Piégée' }), ligne({ id: '11002', nom: 'Saine' })]),
      'activities/11001.fit.gz': bombe,
      'activities/11002.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:11002']);
    expect(resultat.illisibles.map((i) => [i.cleSource, i.fichier])).toEqual([
      ['strava:11001', 'activities/11001.fit.gz'],
    ]);
    expect(resultat.illisibles[0]?.message).toMatch(/50 Mo/);
  });

  it('refuse une entrée non compressée dont la taille déclarée dépasse 50 Mo', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [ligne({ id: '11101', fichier: 'activities/11101.gpx' }), ligne({ id: '11102' })]),
      'activities/11101.gpx': new Uint8Array(51 * 1024 * 1024),
      'activities/11102.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:11102']);
    expect(resultat.illisibles.map((i) => i.cleSource)).toEqual(['strava:11101']);
  });

  it('fait échouer l’archive quand activities.csv dépasse 20 Mo', async () => {
    const texte = `${ENTETE_BRUTE}\n${'a'.repeat(20 * 1024 * 1024 + 1)}`;
    const archive = zipSync({ 'activities.csv': strToU8(texte) });

    await expect(lireArchiveStrava(archive)).rejects.toThrow(ErreurArchive);
    await expect(lireArchiveStrava(archive)).rejects.toThrow(/activities\.csv.*20 Mo/);
  });
});

describe('entrée ZIP corrompue (décompression entrée par entrée)', () => {
  it('une entrée deflate corrompue va dans illisibles, et une entrée saine est lue', async () => {
    const archive = methodeDeCompression(
      zipSync({
        'activities.csv': csv(ENTETES_FR, [
          ligne({ id: '12001', nom: 'Corrompue', fichier: 'activities/12001.fit' }),
          ligne({ id: '12002', nom: 'Saine' }),
        ]),
        'activities/12001.fit': [new Uint8Array(16).fill(0xff), { level: 0 }],
        'activities/12002.fit.gz': FIT_GZ,
      }),
      'activities/12001.fit',
      8,
    );

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:12002']);
    expect(resultat.illisibles.map((i) => [i.cleSource, i.fichier])).toEqual([
      ['strava:12001', 'activities/12001.fit'],
    ]);
  });
});

describe('lignes du CSV', () => {
  it('range en illisible une ligne dont l’ID est vide', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [ligne({ id: '' }), ligne({ id: '13002' })]),
      'activities/13002.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:13002']);
    expect(resultat.illisibles).toHaveLength(1);
    expect(resultat.illisibles[0]?.message).toMatch(/ID manquant/);
  });

  it('garde la première ligne d’un ID en double et range la seconde en illisible', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [
        ligne({ id: '14001', nom: 'Première' }),
        ligne({ id: '14001', nom: 'Seconde', fichier: 'activities/14002.fit.gz' }),
      ]),
      'activities/14001.fit.gz': FIT_GZ,
      'activities/14002.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => [p.cleSource, p.nom])).toEqual([['strava:14001', 'Première']]);
    expect(resultat.illisibles).toEqual([
      { cleSource: 'strava:14001', fichier: 'activities/14002.fit.gz', message: expect.stringMatching(/ID en double/) },
    ]);
  });

  it('range en illisible une ligne trop courte pour contenir ses colonnes obligatoires', async () => {
    const texte = `${ENTETE_BRUTE}\n${ligneBrute({ id: '15001' })}\n14101\n`;
    const archive = zipSync({
      'activities.csv': strToU8(texte),
      'activities/15001.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:15001']);
    expect(resultat.illisibles.map((i) => i.cleSource)).toEqual(['strava:14101']);
    expect(resultat.illisibles[0]?.message).toMatch(/trop courte/);
  });
});

describe('syntaxe du CSV', () => {
  it('ignore les lignes vides au milieu et à la fin', async () => {
    const texte = `${ENTETE_BRUTE}\n${ligneBrute({ id: '16001' })}\n\n\n${ligneBrute({ id: '16002' })}\n\n`;
    const archive = zipSync({
      'activities.csv': strToU8(texte),
      'activities/16001.fit.gz': FIT_GZ,
      'activities/16002.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:16001', 'strava:16002']);
    expect(resultat.illisibles).toEqual([]);
  });

  it('accepte les fins de ligne CR seul', async () => {
    const texte = `${ENTETE_BRUTE}\r${ligneBrute({ id: '16101' })}\r${ligneBrute({ id: '16102' })}\r`;
    const archive = zipSync({
      'activities.csv': strToU8(texte),
      'activities/16101.fit.gz': FIT_GZ,
      'activities/16102.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:16101', 'strava:16102']);
  });

  it('lève une erreur explicite pour un guillemet non fermé', async () => {
    const texte = `${ENTETE_BRUTE}\n${brut(ligne({ id: '16201' })).replace(',,', ',"')}\n`;
    const archive = zipSync({ 'activities.csv': strToU8(texte) });

    await expect(lireArchiveStrava(archive)).rejects.toThrow(ErreurArchive);
    await expect(lireArchiveStrava(archive)).rejects.toThrow(/guillemet non fermé/);
  });

  it('lit la dernière ligne même sans fin de ligne', async () => {
    const texte = `${ENTETE_BRUTE}\n${ligneBrute({ id: '16301' })}\n${ligneBrute({ id: '16302' })}`;
    const archive = zipSync({
      'activities.csv': strToU8(texte),
      'activities/16301.fit.gz': FIT_GZ,
      'activities/16302.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:16301', 'strava:16302']);
  });

  it('garde un guillemet isolé au milieu d’un champ non cité comme un caractère ordinaire', async () => {
    const texte = `${ENTETE_BRUTE}\n${ligneBrute({ id: '16401', nom: 'Sortie 5" test' })}\n`;
    const archive = zipSync({
      'activities.csv': strToU8(texte),
      'activities/16401.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => [p.cleSource, p.nom])).toEqual([['strava:16401', 'Sortie 5" test']]);
  });
});

describe('en-têtes, types et noms', () => {
  it('reconnaît les en-têtes à apostrophe typographique', async () => {
    const entetes = [...ENTETES_FR];
    entetes[POSITION.id] = 'ID de l’activité';
    entetes[POSITION.nom] = 'Nom de l’activité';
    const archive = zipSync({
      'activities.csv': csv(entetes, [ligne({ id: '17101', nom: 'Typographie' })]),
      'activities/17101.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => [p.cleSource, p.nom])).toEqual([['strava:17101', 'Typographie']]);
  });

  it('privilégie l’en-tête français sur l’anglais, même quand l’anglais vient en premier', async () => {
    const entetes = [...ENTETES_FR];
    entetes[0] = 'Activity ID';
    entetes[1] = "ID de l'activité";
    const cases = ligne({ id: '999', fichier: 'activities/1234.fit.gz' });
    cases[1] = '1234';
    const archive = zipSync({
      'activities.csv': csv(entetes, [cases]),
      'activities/1234.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:1234']);
  });

  it.each(['Course sur tapis', 'Trail', 'Virtual Run'])('compte « %s » parmi les courses', async (type) => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [ligne({ id: '18001', type })]),
      'activities/18001.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:18001']);
    expect(resultat.ignorees).toEqual([]);
  });

  it('retire les espaces autour du type et du nom de fichier', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [
        ligne({ id: '18101', type: ' Course à pied ', fichier: ' activities/18101.fit.gz ' }),
      ]),
      'activities/18101.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots.map((p) => p.cleSource)).toEqual(['strava:18101']);
  });

  it('donne un nom null quand la colonne du nom est vide', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [ligne({ id: '18201', nom: '' })]),
      'activities/18201.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots[0]?.nom).toBeNull();
  });

  it('range en illisible un fichier situé hors du dossier activities/, sans le lire', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [ligne({ id: '18301', fichier: 'messages/18301.fit.gz' })]),
      'messages/18301.fit.gz': FIT_GZ,
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots).toEqual([]);
    expect(resultat.illisibles.map((i) => [i.cleSource, i.fichier])).toEqual([
      ['strava:18301', 'messages/18301.fit.gz'],
    ]);
  });

  it('range en illisible un fichier vide', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [ligne({ id: '18401', fichier: 'activities/18401.gpx' })]),
      'activities/18401.gpx': new Uint8Array(0),
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots).toEqual([]);
    expect(resultat.illisibles.map((i) => i.cleSource)).toEqual(['strava:18401']);
  });
});

describe('décalage de secours (ADR 0007)', () => {
  it('transmet decalageSecours à un fichier sans décalage et applique son résultat à la date locale', async () => {
    const secours = vi.fn(() => -480);
    const archive = archiveTypique([ligne({ id: '1005', nom: 'Sans décalage', fichier: 'activities/1005.gpx' })]);

    const resultat = await lireArchiveStrava(archive, { decalageSecours: secours });

    expect(secours).toHaveBeenCalledWith(DEBUT);
    expect(resultat.pivots[0]).toMatchObject({ decalageLocal_min: -480, dateLocale: '2026-10-19', decalageInconnu: true });
  });
});

describe('empreinte de référence (ADR 0004)', () => {
  it('vaut le SHA-256 des octets .gz, suivis de « \\0 », du nom, « \\0 » et de la compétition', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [ligne({ id: '19001', nom: 'Référence', competition: '' })]),
      'activities/19001.fit.gz': FIT_GZ,
    });
    const attendu = createHash('sha256')
      .update(Buffer.concat([Buffer.from(FIT_GZ), Buffer.from('\u0000Référence\u0000false', 'utf8')]))
      .digest('hex');

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.pivots[0]?.empreinteBrute).toBe(attendu);
  });

  it('change quand la case Compétition bascule', async () => {
    const empreinte = async (competition: string): Promise<string | undefined> => {
      const archive = zipSync({
        'activities.csv': csv(ENTETES_FR, [ligne({ id: '19101', nom: 'Bascule', competition })]),
        'activities/19101.fit.gz': FIT_GZ,
      });
      return (await lireArchiveStrava(archive)).pivots[0]?.empreinteBrute;
    };

    expect(await empreinte('1')).not.toBe(await empreinte(''));
  });
});

describe('illisibles et manquants portent la clé de l’activité', () => {
  it('donne à chaque fichier manquant sa clé strava:{id}', async () => {
    const archive = zipSync({
      'activities.csv': csv(ENTETES_FR, [ligne({ id: '20001' }), ligne({ id: '20002' })]),
    });

    const resultat = await lireArchiveStrava(archive);

    expect(resultat.manquants).toEqual([
      { cleSource: 'strava:20001', fichier: 'activities/20001.fit.gz' },
      { cleSource: 'strava:20002', fichier: 'activities/20002.fit.gz' },
    ]);
  });
});

