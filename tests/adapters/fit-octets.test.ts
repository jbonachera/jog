// Fichiers FIT écrits à la main, octet par octet, sans passer par l'encodeur de test : une
// erreur partagée par l'encodeur et le lecteur ne peut pas se voir ici. Les valeurs attendues
// sont calculées à la main (reference-fit.md).
import { describe, expect, it } from 'vitest';
import { ErreurFit, lireFit } from '../../src/adapters/fit/lecteur';
import { fitVersPivot, type OptionsFit } from '../../src/adapters/fit/versPivot';

const OPTIONS: OptionsFit = {
  cleSource: 'fit:main',
  source: 'fit',
  nom: null,
  competition: false,
  empreinteBrute: 'empreinte-main',
};

// Octets écrits en hexadécimal, espaces ignorés.
function octets(texte: string | Uint8Array): Uint8Array {
  if (texte instanceof Uint8Array) return texte;
  const hex = texte.replace(/\s+/g, '');
  const sortie = new Uint8Array(hex.length / 2);
  for (let i = 0; i < sortie.length; i++) sortie[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return sortie;
}

// En-tête de 14 octets dont la taille de données est calculée, CRC de données à 0 (non vérifié).
function fichier(donnees: string): Uint8Array {
  const corps = octets(donnees);
  const sortie = new Uint8Array(14 + corps.length + 2);
  sortie.set(octets('0E 20 54 08 00 00 00 00 2E 46 49 54 00 00'));
  new DataView(sortie.buffer).setUint32(4, corps.length, true);
  sortie.set(corps, 14);
  return sortie;
}

function pivotDe(entree: Uint8Array) {
  const resultat = fitVersPivot(entree, OPTIONS);
  if ('ignoree' in resultat) throw new Error(`activité inattendue ignorée : ${resultat.ignoree}`);
  return resultat;
}

// Exemple du relecteur : petit-boutiste, un record avec position (ignorée), un tour, une session
// de course « trail », une activité à −3 h. Taille des données : 165 octets (0xA5).
const EXEMPLE_PETIT = [
  '0E 20 54 08 A5 00 00 00 2E 46 49 54 00 00',
  '40 00 00 14 00 07 FD 04 86 00 04 85 01 04 85 03 01 02 05 04 86 49 04 86 4E 04 86',
  '00 00 ca 9a 3b  00 00 00 20  00 00 00 10  96  39 30 00 00  b2 0c 00 00  2d 0c 00 00',
  '00 01 ca 9a 3b  01 00 00 20  01 00 00 10  FF  FF FF FF FF  e4 0c 00 00  32 0c 00 00',
  '41 00 00 13 00 04 FD 04 86 02 04 86 18 01 00 17 01 00',
  '01 01 ca 9a 3b  00 ca 9a 3b  02  01',
  '42 00 00 12 00 05 02 04 86 05 01 00 06 01 00 07 04 86 09 04 86',
  '02 00 ca 9a 3b  01  03  dc 05 00 00  20 4e 00 00',
  '43 00 00 22 00 02 FD 04 86 05 04 86',
  '03 01 ca 9a 3b  d1 9f 9a 3b',
  '00 00', // CRC de données (non vérifié)
].join(' ');

describe('exemple écrit à la main, petit-boutiste (reference-fit)', () => {
  it('donne le pivot calculé à la main : date, décalage, durée, distance, tour et flux', () => {
    const pivot = pivotDe(octets(EXEMPLE_PETIT));

    expect(pivot.debutUtc).toBe(1631065600000);
    expect(pivot.decalageLocal_min).toBe(-180);
    expect(pivot.dateLocale).toBe('2021-09-07');
    expect(pivot.decalageInconnu).toBeUndefined();
    expect(pivot.duree_s).toBe(1.5);
    expect(pivot.distance_m).toBe(200);
    expect(pivot.sousType).toBe('trail');
    expect(pivot.pasFC_s).toBeNull();
    expect(pivot.tours).toEqual([
      { iDebut: 0, iFin: 1, declenchement: 'distance', intensite: 'repos' },
    ]);
    expect(pivot.flux.t_s).toEqual(new Float32Array([0, 1]));
    expect(pivot.flux.dist_m[0]).toBeCloseTo(123.45, 5);
    expect(pivot.flux.dist_m[1]).toBeNaN();
    expect(pivot.flux.fc_bpm?.[0]).toBe(150);
    expect(pivot.flux.fc_bpm?.[1]).toBeNaN();
    expect(pivot.flux.alt_m?.[0]).toBeCloseTo(123.4, 5);
    expect(pivot.flux.alt_m?.[1]).toBeCloseTo(124.4, 5);
    expect(pivot.flux.vitesse_ms?.[0]).toBeCloseTo(3.25, 5);
    expect(pivot.flux.vitesse_ms?.[1]).toBeCloseTo(3.3, 5);
  });

  it('ne décode jamais la latitude ni la longitude (ADR 0010)', () => {
    const { records } = lireFit(octets(EXEMPLE_PETIT));

    expect(records).toHaveLength(2);
    for (const enregistrement of records) {
      expect(enregistrement.champs.has(0)).toBe(false);
      expect(enregistrement.champs.has(1)).toBe(false);
    }
    expect([...(records[0]?.champs.keys() ?? [])].sort((a, b) => a - b)).toEqual([3, 5, 73, 78, 253]);
  });
});

describe('exemple écrit à la main, grand-boutiste (reference-fit)', () => {
  // Session (local 0) : start_time 1000000000, course, total_elapsed 2 s, total_distance 6 m.
  // Records (local 1) : t = 0, 1, 2 s ; FC 150, 151, 152 ; distance 0, 3, 6 m. Tout en BE.
  const GRAND = fichier(
    [
      '40 00 01 00 12 04 02 04 86 05 01 00 07 04 86 09 04 86',
      '00 3B 9A CA 00 01 00 00 07 D0 00 00 02 58',
      '41 00 01 00 14 03 FD 04 86 03 01 02 05 04 86',
      '01 3B 9A CA 00 96 00 00 00 00',
      '01 3B 9A CA 01 97 00 00 01 2C',
      '01 3B 9A CA 02 98 00 00 02 58',
    ].join(' '),
  );

  it('donne le même pivot qu’un fichier petit-boutiste', () => {
    const pivot = pivotDe(GRAND);

    expect(pivot.debutUtc).toBe(1631065600000);
    expect(pivot.duree_s).toBe(2);
    expect(pivot.distance_m).toBe(6);
    expect(Array.from(pivot.flux.dist_m)).toEqual([0, 3, 6]);
    expect(Array.from(pivot.flux.fc_bpm ?? [])).toEqual([150, 151, 152]);
    expect(pivot.pasFC_s).toBe(1);
    expect(pivot.sousType).toBe('inconnu');
    expect(pivot.tours).toEqual([]);
  });
});

describe('horodatage compressé écrit à la main (reference-fit)', () => {
  it('rattrape 32 s quand le décalage est inférieur aux 5 bits de poids faible du dernier temps', () => {
    // Session start 1000000020 (0x…14). Record normal à 1000000020, puis en-tête compressé
    // 0xA5 (local 1, décalage 5) : 1000000000 + 5 + 32 = 1000000037, soit t = 17 s.
    const pivot = pivotDe(
      fichier(
        [
          '42 00 00 12 00 02 02 04 86 05 01 00',
          '02 14 CA 9A 3B 01',
          '40 00 00 14 00 02 FD 04 86 03 01 02',
          '00 14 CA 9A 3B 96',
          '41 00 00 14 00 01 03 01 02',
          'A5 97',
        ].join(' '),
      ),
    );

    expect(pivot.debutUtc).toBe(1631065620000);
    expect(Array.from(pivot.flux.t_s)).toEqual([0, 17]);
    expect(Array.from(pivot.flux.fc_bpm ?? [])).toEqual([150, 151]);
    expect(pivot.pasFC_s).toBe(17);
  });

  it('sur le type local 3, prend pour base le timestamp d’un autre message (activité)', () => {
    // Record à 1000000000 ; activité à 1000000050 (dernier temps, bas 5 bits = 18) ;
    // puis 0xEA (local 3, décalage 10 < 18) : 1000000032 + 10 + 32 = 1000000074, soit t = 74 ;
    // puis 0xF4 (local 3, décalage 20 ≥ 10) : 1000000064 + 20 = 1000000084, soit t = 84.
    const pivot = pivotDe(
      fichier(
        [
          '42 00 00 12 00 02 02 04 86 05 01 00',
          '02 00 CA 9A 3B 01',
          '40 00 00 14 00 02 FD 04 86 03 01 02',
          '00 00 CA 9A 3B 96',
          '45 00 00 22 00 01 FD 04 86',
          '05 32 CA 9A 3B',
          '43 00 00 14 00 01 03 01 02',
          'EA 97',
          'F4 98',
        ].join(' '),
      ),
    );

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 74, 84]);
    expect(Array.from(pivot.flux.fc_bpm ?? [])).toEqual([150, 151, 152]);
  });

  it('prend pour base le timestamp d’un message non lu (FIT : chaque message avec horodatage compte)', () => {
    // Même principe, avec un message de numéro 4242 (0x1092) que Jog ne lit pas.
    const pivot = pivotDe(
      fichier(
        [
          '42 00 00 12 00 02 02 04 86 05 01 00',
          '02 00 CA 9A 3B 01',
          '40 00 00 14 00 02 FD 04 86 03 01 02',
          '00 00 CA 9A 3B 96',
          '46 00 00 92 10 01 FD 04 86',
          '06 32 CA 9A 3B',
          '43 00 00 14 00 01 03 01 02',
          'EA 97',
        ].join(' '),
      ),
    );

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 74]);
  });
});

describe('redéfinition et types de champs (reference-fit)', () => {
  it('une redéfinition du type local en cours de fichier s’applique au message suivant', () => {
    // Définition A du local 0 : (253, hr). Définition B du local 0 : (distance, hr, 253).
    const pivot = pivotDe(
      fichier(
        [
          '42 00 00 12 00 02 02 04 86 05 01 00',
          '02 00 CA 9A 3B 01',
          '40 00 00 14 00 02 FD 04 86 03 01 02',
          '00 00 CA 9A 3B 96',
          '40 00 00 14 00 03 05 04 86 03 01 02 FD 04 86',
          '00 2C 01 00 00 97 01 CA 9A 3B', // distance 300 en petit-boutiste
        ].join(' '),
      ),
    );

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 1]);
    expect(Array.from(pivot.flux.fc_bpm ?? [])).toEqual([150, 151]);
    expect(pivot.flux.dist_m[0]).toBeNaN();
    expect(pivot.flux.dist_m[1]).toBeCloseTo(3, 5);
  });

  it('une valeur invalide en sint8, sint16, sint32 ou float32 n’est pas lue', () => {
    // Record 0 : toutes les valeurs sont invalides (0x7F, 0x7FFF, 0x7FFFFFFF, NaN).
    // Record 1 : valeurs valides (80, 2600, 300, 3.5).
    const { records } = lireFit(
      fichier(
        [
          '40 00 00 14 00 05 FD 04 86 03 01 01 02 02 83 05 04 85 06 04 88',
          '00 00 CA 9A 3B 7F FF 7F FF FF FF 7F 00 00 C0 7F',
          '00 01 CA 9A 3B 50 28 0A 2C 01 00 00 00 00 60 40',
        ].join(' '),
      ),
    );

    expect(records).toHaveLength(2);
    expect([...(records[0]?.champs.keys() ?? [])]).toEqual([253]);
    expect(records[1]?.champs.get(3)).toBe(80);
    expect(records[1]?.champs.get(2)).toBe(2600);
    expect(records[1]?.champs.get(5)).toBe(300);
    expect(records[1]?.champs.get(6)).toBe(3.5);
  });

  it('uint8z : la valeur 0 est invalide pour un tour (intensité)', () => {
    const { laps } = lireFit(
      octets(
        fichier(
          [
            '41 00 00 13 00 02 FD 04 86 17 01 0A',
            '01 00 CA 9A 3B 00',
            '01 01 CA 9A 3B 01',
          ].join(' '),
        ),
      ),
    );

    expect(laps[0]?.champs.has(23)).toBe(false);
    expect(laps[1]?.champs.get(23)).toBe(1);
  });

  it('un champ de taille qui n’est pas multiple de son type est sauté, et les suivants restent justes', () => {
    // altitude (2) est déclarée sur 3 octets pour un uint16 : elle est sautée, hr (3) reste à 150.
    const { records } = lireFit(
      octets(
        fichier(
          [
            '40 00 00 14 00 03 FD 04 86 02 03 84 03 01 02',
            '00 00 CA 9A 3B AA BB CC 96',
          ].join(' '),
        ),
      ),
    );

    expect(records[0]?.champs.has(2)).toBe(false);
    expect(records[0]?.champs.get(3)).toBe(150);
  });

  it('un champ de taille multiple de son type lit son premier élément', () => {
    // heart_rate (3) est déclarée sur 2 octets pour un uint8 : tableau, on lit le premier élément.
    const { records } = lireFit(
      octets(fichier(['40 00 00 14 00 02 FD 04 86 03 02 02', '00 00 CA 9A 3B 96 00'].join(' '))),
    );

    expect(records[0]?.champs.get(3)).toBe(150);
  });
});

describe('fichier coupé (ADR 0003)', () => {
  it('un dernier message coupé dans un fichier à en-tête cohérent lève ErreurFit (tronqué)', () => {
    // Le dernier record annonce 6 octets ; il n'en reste que 3, et la taille d'en-tête correspond.
    const entree = fichier(
      [
        '40 00 00 14 00 02 FD 04 86 03 01 02',
        '00 00 CA 9A 3B 96',
        '00 01 CA',
      ].join(' '),
    );

    expect(() => lireFit(entree)).toThrow(ErreurFit);
    expect(() => lireFit(entree)).toThrow(/tronqué/);
  });

  it('un fichier sans les 2 octets de CRC est lu : la tolérance est documentée dans contrats.md', () => {
    const sansCrc = octets(EXEMPLE_PETIT).slice(0, -2);

    expect(pivotDe(sansCrc)).toEqual(pivotDe(octets(EXEMPLE_PETIT)));
  });
});
