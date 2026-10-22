import { describe, expect, it, vi } from 'vitest';
import { ErreurFit, lireFit } from '../../src/adapters/fit/lecteur';
import { fitVersPivot, type OptionsFit } from '../../src/adapters/fit/versPivot';
import {
  encoderFit,
  type ActiviteFit,
  type EchantillonFit,
  type OptionsEncodeur,
  type TourFit,
} from '../fixtures/encodeur-fit';
import { itPerf } from '../fixtures/perf';

const DEBUT = Date.UTC(2026, 9, 20, 7, 30, 0); // 2026-10-20 07:30 UTC

const OPTIONS: OptionsFit = {
  cleSource: 'fit:test',
  source: 'fit',
  nom: 'Sortie test',
  competition: false,
  empreinteBrute: 'empreinte-test',
};

interface Forme {
  fc?: (t: number) => number | undefined;
  sansAltitude?: boolean;
  sansVitesse?: boolean;
}

function echantillons(n: number, forme: Forme = {}): EchantillonFit[] {
  const fc = forme.fc ?? ((t: number) => 150 + (t % 20));
  return Array.from({ length: n }, (_, t) => ({
    t,
    dist: t * 3,
    fc: fc(t),
    alt: forme.sansAltitude === true ? undefined : 100 + t / 5,
    vit: forme.sansVitesse === true ? undefined : 3.2,
  }));
}

function activite(records: EchantillonFit[], extras: Partial<ActiviteFit> = {}): ActiviteFit {
  return {
    debut: DEBUT,
    decalageLocal_min: 120,
    sport: 1,
    subSport: 2,
    records,
    laps: [],
    fabricant: 265,
    ...extras,
  };
}

function pivotDe(entree: ActiviteFit, options: OptionsEncodeur = {}, extras: Partial<OptionsFit> = {}) {
  const resultat = fitVersPivot(encoderFit(entree, options), { ...OPTIONS, ...extras });
  if ('ignoree' in resultat) {
    throw new Error(`activité inattendue ignorée : ${resultat.ignoree}`);
  }
  return resultat;
}

// Enregistrements à des instants donnés, avec une FC et une distance à chaque instant.
function aInstants(temps: number[]): EchantillonFit[] {
  return temps.map((t) => ({ t, dist: t * 3, fc: 150 + t }));
}

describe('lecture d\'un fichier construit (ADR 0003)', () => {
  it('redonne le pivot attendu : début, décalage, date, durée, distance et flux', () => {
    const pivot = pivotDe(activite(echantillons(600)));

    expect(pivot.source).toBe('fit');
    expect(pivot.cleSource).toBe('fit:test');
    expect(pivot.versionAdaptateur).toBe('1.0.0');
    expect(pivot.empreinteBrute).toBe('empreinte-test');
    expect(pivot.nom).toBe('Sortie test');
    expect(pivot.competition).toBe(false);
    expect(pivot.debutUtc).toBe(DEBUT);
    expect(pivot.decalageLocal_min).toBe(120);
    expect(pivot.dateLocale).toBe('2026-10-20');
    expect(pivot.duree_s).toBe(599);
    expect(pivot.distance_m).toBeCloseTo(1797);
    expect(pivot.sousType).toBe('route');
    expect(pivot.pasFC_s).toBe(1);
    expect(pivot.tours).toEqual([]);

    expect(pivot.flux.t_s).toHaveLength(600);
    expect(pivot.flux.t_s[0]).toBe(0);
    expect(pivot.flux.t_s[599]).toBe(599);
    expect(pivot.flux.dist_m[10]).toBeCloseTo(30);
    expect(pivot.flux.alt_m?.[10]).toBeCloseTo(102);
    expect(pivot.flux.vitesse_ms?.[10]).toBeCloseTo(3.2);
    expect(pivot.flux.fc_bpm?.[3]).toBe(153);
  });

  it.each<[string, number, number, string]>([
    ['un décalage négatif (−180 min) : 1 h 30 UTC est la veille à 22 h 30', Date.UTC(2026, 9, 21, 1, 30), -180, '2026-10-20'],
    ['une sortie de 23 h 50 locales qui passe minuit compte pour le jour du départ', Date.UTC(2026, 9, 20, 21, 50), 120, '2026-10-20'],
    ['une sortie qui part à 0 h 30 locales a la date du lendemain', Date.UTC(2026, 9, 20, 22, 30), 120, '2026-10-21'],
  ])('%s (ADR 0007)', (_nom, debut, decalage, dateAttendue) => {
    const pivot = pivotDe(activite(echantillons(1200), { debut, decalageLocal_min: decalage }));

    expect(pivot.decalageLocal_min).toBe(decalage);
    expect(pivot.dateLocale).toBe(dateAttendue);
  });

  it('préfère enhanced_altitude et enhanced_speed aux champs anciens (ADR 0003)', () => {
    const avecAnciensChamps = echantillons(20).map((e) => ({ ...e, altLegacy: 10, vitLegacy: 1 }));
    const pivot = pivotDe(activite(avecAnciensChamps));

    expect(pivot.flux.alt_m?.[5]).toBeCloseTo(101);
    expect(pivot.flux.vitesse_ms?.[5]).toBeCloseTo(3.2);
  });

  it('lit l’altitude et la vitesse des seuls champs enrichis, ou des seuls champs anciens', () => {
    const entree = activite(echantillons(20).map((e) => ({ ...e, altLegacy: e.alt, vitLegacy: e.vit })));
    const reference = pivotDe(entree);

    expect(pivotDe(entree, { sansChampsAnciens: true }).flux).toEqual(reference.flux);
    expect(pivotDe(entree, { sansChampsEnrichis: true }).flux).toEqual(reference.flux);
  });

  it('un fichier sans FC, sans altitude ni vitesse donne null pour ces flux et pour pasFC_s', () => {
    const pivot = pivotDe(
      activite(echantillons(30, { fc: () => undefined, sansAltitude: true, sansVitesse: true })),
    );

    expect(pivot.flux.fc_bpm).toBeNull();
    expect(pivot.flux.alt_m).toBeNull();
    expect(pivot.flux.vitesse_ms).toBeNull();
    expect(pivot.pasFC_s).toBeNull();
  });

  it('mélange de valeurs invalides : alt_m et vitesse_ms sont partiellement NaN, pas null', () => {
    const records = echantillons(10).map((e) => ({
      ...e,
      alt: e.t % 2 === 0 ? undefined : e.alt,
      vit: e.t === 4 ? undefined : e.vit,
    }));
    const pivot = pivotDe(activite(records));

    expect(pivot.flux.alt_m).not.toBeNull();
    expect(pivot.flux.alt_m?.[0]).toBeNaN();
    expect(pivot.flux.alt_m?.[1]).toBeCloseTo(100.2);
    expect(pivot.flux.vitesse_ms).not.toBeNull();
    expect(pivot.flux.vitesse_ms?.[4]).toBeNaN();
    expect(pivot.flux.vitesse_ms?.[5]).toBeCloseTo(3.2);
  });

  it('distance toutes les 3 s : dist_m est NaN aux instants sans mesure, et la vitesse reste intacte', () => {
    const records = echantillons(12).map((e) => ({ ...e, dist: e.t % 3 === 0 ? e.dist : undefined }));
    const pivot = pivotDe(activite(records));

    expect(pivot.flux.dist_m[0]).toBe(0);
    expect(pivot.flux.dist_m[1]).toBeNaN();
    expect(pivot.flux.dist_m[2]).toBeNaN();
    expect(pivot.flux.dist_m[3]).toBeCloseTo(9);
    expect(pivot.flux.vitesse_ms?.every((v) => Math.abs(v - 3.2) < 1e-5)).toBe(true);
  });
});

describe('horodatages hors ordre et doublons (D2)', () => {
  it('trie les enregistrements et garde t_s strictement croissant, à partir de 0', () => {
    const pivot = pivotDe(activite(aInstants([0, 1, 2, 3, 2, 3, 4, 5])));

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Array.from(pivot.flux.dist_m)).toEqual([0, 3, 6, 9, 12, 15]);
  });

  it('fusionne les doublons : chaque champ prend sa dernière valeur valide (FC dans l’un, distance dans l’autre)', () => {
    const records: EchantillonFit[] = [
      ...aInstants([0, 1, 2, 3, 4]),
      { t: 5, fc: 150 },
      { t: 5, dist: 15 },
      ...aInstants([6, 7, 8, 9]),
    ];
    const pivot = pivotDe(activite(records));

    expect(pivot.flux.t_s).toHaveLength(10);
    expect(pivot.flux.fc_bpm?.[5]).toBe(150);
    expect(pivot.flux.dist_m[5]).toBeCloseTo(15);
  });

  it('découpe les tours sur les instants triés : tour [2 ; 4[ puis [4 ; 5] au dernier', () => {
    const laps: TourFit[] = [
      { fin: 2, trigger: 'manuel' },
      { fin: 4, trigger: 'manuel' },
      { fin: 5, trigger: 'manuel' },
    ];
    const pivot = pivotDe(activite(aInstants([0, 1, 2, 3, 2, 3, 4, 5]), { laps }));

    expect(pivot.tours).toEqual([
      { iDebut: 0, iFin: 1, declenchement: 'manuel' },
      { iDebut: 2, iFin: 3, declenchement: 'manuel' },
      { iDebut: 4, iFin: 5, declenchement: 'manuel' },
    ]);
  });

  it('écarte les enregistrements antérieurs à start_time', () => {
    const pivot = pivotDe(activite(aInstants([-2, -1, 0, 1, 2])));

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 1, 2]);
    expect(pivot.flux.fc_bpm?.[0]).toBe(150);
  });
});

describe('course sans enregistrement horodaté (ErreurFit)', () => {
  it('un fichier sans aucun enregistrement lève « aucun enregistrement horodaté »', () => {
    const entree = encoderFit(activite([]));

    expect(() => fitVersPivot(entree, OPTIONS)).toThrow(ErreurFit);
    expect(() => fitVersPivot(entree, OPTIONS)).toThrow('aucun enregistrement horodaté');
  });

  it('des enregistrements sans timestamp lèvent la même erreur', () => {
    const entree = encoderFit(activite(echantillons(20)), { sansTemps: true });

    expect(() => fitVersPivot(entree, OPTIONS)).toThrow('aucun enregistrement horodaté');
  });
});

describe('session absente (08, Rédaction)', () => {
  it('une activité sans message session le dit avec une apostrophe typographique', () => {
    const entree = encoderFit(activite(echantillons(30)), { sansSeance: true });

    expect(() => fitVersPivot(entree, OPTIONS)).toThrow('impossible de dater l’activité');
  });
});

describe('session et fichier (ADR 0003)', () => {
  it('une session sans start_time lève une erreur explicite', () => {
    const entree = encoderFit(activite(echantillons(30)), { sansDebutSeance: true });

    expect(() => fitVersPivot(entree, OPTIONS)).toThrow(ErreurFit);
    expect(() => fitVersPivot(entree, OPTIONS)).toThrow(/start_time/);
  });

  it('une session sans sport est ignorée', () => {
    const entree = encoderFit(activite(echantillons(30), { sport: undefined }));

    expect(fitVersPivot(entree, OPTIONS)).toEqual({ ignoree: 'pas-une-course' });
  });

  it('un fichier sans message session lève ErreurFit', () => {
    const entree = encoderFit(activite(echantillons(30)), { sansSeance: true });

    expect(() => fitVersPivot(entree, OPTIONS)).toThrow(ErreurFit);
  });

  it('file_id.type différent de 4 (activité) : le fichier est ignoré', () => {
    const entree = encoderFit(activite(echantillons(30), { typeFichier: 2 }));

    expect(fitVersPivot(entree, OPTIONS)).toEqual({ ignoree: 'pas-une-course' });
  });
});

describe('décalage horaire (ADR 0007, D3, D4)', () => {
  it('un écart d’une seconde entre local_timestamp et timestamp donne 0 minute', () => {
    const pivot = pivotDe(activite(echantillons(60), { decalageLocal_min: 1 / 60 }));

    expect(pivot.decalageLocal_min).toBe(0);
    expect(pivot.decalageInconnu).not.toBe(true);
  });

  it('un décalage de 7,5 min s’arrondit à 8 min, à mi-chemin loin de zéro', () => {
    const pivot = pivotDe(activite(echantillons(60), { decalageLocal_min: 7.5 }));

    expect(pivot.decalageLocal_min).toBe(8);
  });

  it('un décalage de 14 h est accepté, au-delà il est traité comme inconnu', () => {
    expect(pivotDe(activite(echantillons(60), { decalageLocal_min: 840 })).decalageInconnu).not.toBe(true);

    const corrompu = pivotDe(activite(echantillons(60), { decalageLocal_min: 900 }));
    expect(corrompu.decalageInconnu).toBe(true);
    expect(corrompu.decalageLocal_min).toBe(0);
  });

  it('une valeur corrompue donne un décalage inconnu, repris du secours', () => {
    const pivot = pivotDe(activite(echantillons(60), { decalageLocal_min: 1000 }), {}, {
      decalageSecours: () => 60,
    });

    expect(pivot.decalageInconnu).toBe(true);
    expect(pivot.decalageLocal_min).toBe(60);
  });

  it('sans local_timestamp, decalageSecours est appelé avec l’instant de début et son résultat est appliqué', () => {
    const secours = vi.fn(() => 120);
    const debut = Date.UTC(2026, 9, 20, 23, 30, 0);
    const pivot = pivotDe(activite(echantillons(60), { debut }), { sansHeureLocale: true }, {
      decalageSecours: secours,
    });

    expect(secours).toHaveBeenCalledWith(debut);
    expect(pivot.decalageLocal_min).toBe(120);
    expect(pivot.decalageInconnu).toBe(true);
    expect(pivot.dateLocale).toBe('2026-10-21');
  });

  it('avec local_timestamp, decalageSecours n’est pas appelé', () => {
    const secours = vi.fn(() => 999);
    pivotDe(activite(echantillons(60)), {}, { decalageSecours: secours });

    expect(secours).not.toHaveBeenCalled();
  });
});

describe('fréquence et plausibilité de la FC (D-013, D5)', () => {
  it('une FC mesurée toutes les 5 s donne pasFC_s = 5 et des NaN entre les mesures', () => {
    const pivot = pivotDe(activite(echantillons(60, { fc: (t) => 140 + t })), { pasFC: 5 });
    const fc = pivot.flux.fc_bpm;

    expect(pivot.pasFC_s).toBe(5);
    expect(fc?.[0]).toBe(140);
    expect(fc?.[1]).toBeNaN();
    expect(fc?.[4]).toBeNaN();
    expect(fc?.[5]).toBe(145);
    expect(fc?.[55]).toBe(195);
    expect(fc?.[59]).toBeNaN();
  });

  it('pas de FC irrégulier : une mesure donne null, deux écarts pairs donnent leur moyenne', () => {
    const avecFc = (temps: number[]) =>
      activite(
        Array.from({ length: 11 }, (_, t) => ({ t, fc: temps.includes(t) ? 150 : undefined })),
      );

    expect(pivotDe(avecFc([3])).pasFC_s).toBeNull();
    expect(pivotDe(avecFc([0, 5, 10])).pasFC_s).toBe(5);
    expect(pivotDe(avecFc([0, 2, 7])).pasFC_s).toBe(3.5);
    expect(pivotDe(avecFc([0, 2, 7, 9])).pasFC_s).toBe(2);
  });

  it('une FC inférieure à 30 ou supérieure à 250 bpm devient NaN (D5)', () => {
    const pivot = pivotDe(
      activite(echantillons(6, { fc: (t) => [10, 30, 150, 250, 252, 0x7f][t] })),
    );

    // 10 et 252 sont hors de [30 ; 250] ; 30, 150, 250 et 127 sont gardés.
    expect(pivot.flux.fc_bpm?.[0]).toBeNaN();
    expect(pivot.flux.fc_bpm?.[1]).toBe(30);
    expect(pivot.flux.fc_bpm?.[2]).toBe(150);
    expect(pivot.flux.fc_bpm?.[3]).toBe(250);
    expect(pivot.flux.fc_bpm?.[4]).toBeNaN();
    expect(pivot.flux.fc_bpm?.[5]).toBe(127);
  });
});

describe('positions GPS (ADR 0010)', () => {
  it('l’encodeur écrit bien position_lat et position_long (sint32) dans les records', () => {
    const avec = encoderFit(activite(echantillons(20)), { positions: true });
    const sans = encoderFit(activite(echantillons(20)));
    const motif = [0x00, 0x04, 0x85, 0x01, 0x04, 0x85];
    const trouve = (octets: Uint8Array) =>
      octets.some((_, i) => motif.every((o, k) => octets[i + k] === o));

    expect(trouve(avec)).toBe(true);
    expect(trouve(sans)).toBe(false);
  });

  it('les champs 0 et 1 n’entrent jamais dans les champs lus', () => {
    const { records } = lireFit(encoderFit(activite(echantillons(20)), { positions: true }));

    for (const m of records) {
      expect(m.champs.has(0)).toBe(false);
      expect(m.champs.has(1)).toBe(false);
    }
  });

  it('le pivot est identique avec ou sans position', () => {
    const entree = activite(echantillons(120));

    expect(pivotDe(entree, { positions: true })).toEqual(pivotDe(entree));
  });
});

describe('durée et distance de la session (MINEUR 8)', () => {
  it('duree_s vaut total_timer_time quand il est présent', () => {
    const pivot = pivotDe(activite(echantillons(1200)), { dureeMinuterie_s: 1000 });

    expect(pivot.duree_s).toBe(1000);
  });

  it('sans total_timer_time, duree_s vaut total_elapsed_time', () => {
    const pivot = pivotDe(activite(echantillons(1200)), { sansDureeMinuterie: true });

    expect(pivot.duree_s).toBe(1199);
  });

  it('sans total_distance, distance_m vaut la dernière distance finie', () => {
    const records = echantillons(300).map((e) => ({ ...e, dist: e.t % 3 === 0 ? e.dist : undefined }));
    const pivot = pivotDe(activite(records), { sansDistanceSeance: true });

    expect(pivot.distance_m).toBeCloseTo(891);
  });
});

describe('tours (D1)', () => {
  const records1200 = (): EchantillonFit[] => echantillons(1200);

  it('un tour manuel et des tours au km gardent leurs indices et leur déclenchement', () => {
    const laps: TourFit[] = [
      { fin: 300, trigger: 'manuel' },
      { fin: 600, trigger: 'distance' },
      { fin: 900, trigger: 'distance' },
      { fin: 1200, trigger: 'manuel' },
    ];
    const pivot = pivotDe(activite(records1200(), { laps }));

    expect(pivot.tours).toEqual([
      { iDebut: 0, iFin: 299, declenchement: 'manuel' },
      { iDebut: 300, iFin: 599, declenchement: 'distance' },
      { iDebut: 600, iFin: 899, declenchement: 'distance' },
      { iDebut: 900, iFin: 1199, declenchement: 'manuel' },
    ]);
  });

  it('les tours sont contigus : le début d’un tour est l’indice qui suit la fin du précédent', () => {
    const laps: TourFit[] = [
      { fin: 250, trigger: 'manuel' },
      { fin: 700, trigger: 'distance' },
      { fin: 1199, trigger: 'manuel' },
    ];
    const { tours } = pivotDe(activite(records1200(), { laps }));

    for (let k = 1; k < tours.length; k++) {
      expect(tours[k]?.iDebut).toBe((tours[k - 1]?.iFin ?? -2) + 1);
    }
  });

  it('un tour qui ne couvre aucun enregistrement n’est pas produit', () => {
    const laps: TourFit[] = [
      { fin: 600, trigger: 'manuel' },
      { debut: 1300, fin: 1400, trigger: 'distance' },
    ];
    const pivot = pivotDe(activite(records1200(), { laps }));

    expect(pivot.tours).toEqual([{ iDebut: 0, iFin: 599, declenchement: 'manuel' }]);
  });

  it('seul le dernier tour inclut t = timestamp ; les autres excluent leur fin', () => {
    const laps: TourFit[] = [
      { fin: 300, trigger: 'manuel' },
      { fin: 599, trigger: 'manuel' },
    ];
    const pivot = pivotDe(activite(echantillons(600), { laps }));

    expect(pivot.tours[0]?.iFin).toBe(299);
    expect(pivot.tours[1]?.iFin).toBe(599);
  });

  it('un tour final de fin de séance (déclenchement 7) est conservé', () => {
    const laps: TourFit[] = [
      { fin: 600, trigger: 'manuel' },
      { fin: 603, trigger: 'fin' },
    ];
    const pivot = pivotDe(activite(echantillons(604), { laps }));

    expect(pivot.tours).toHaveLength(2);
    expect(pivot.tours[1]).toEqual({ iDebut: 600, iFin: 603, declenchement: 'fin' });
  });

  it('l\'intensité d\'un tour est reprise quand la montre la donne, et absente sinon', () => {
    const laps: TourFit[] = [
      { fin: 300, trigger: 'manuel', intensity: 'echauffement' },
      { fin: 600, trigger: 'manuel' },
    ];
    const pivot = pivotDe(activite(echantillons(600), { laps }));

    expect(pivot.tours[0]?.intensite).toBe('echauffement');
    expect(pivot.tours[1]).not.toHaveProperty('intensite');
  });
});

describe('formats d\'écriture (reference-fit, D-013)', () => {
  const laps: TourFit[] = [
    { fin: 150, trigger: 'manuel' },
    { fin: 300, trigger: 'distance' },
  ];

  it('un fichier à horodatages compressés donne les mêmes flux et les mêmes tours', () => {
    const entree = activite(echantillons(300), { laps });
    const normal = pivotDe(entree);
    const compresse = pivotDe(entree, { compresserTimestamps: true });

    expect(encoderFit(entree, { compresserTimestamps: true }).length).toBeLessThan(encoderFit(entree).length);
    expect(compresse.flux).toEqual(normal.flux);
    expect(compresse.tours).toEqual(normal.tours);
    expect(compresse.duree_s).toBe(normal.duree_s);
  });

  it('un fichier en grand-boutiste donne le même pivot qu\'en petit-boutiste', () => {
    const entree = activite(echantillons(300), { laps });

    expect(pivotDe(entree, { grandBoutiste: true })).toEqual(pivotDe(entree));
  });

  it('les champs de développeur sont sautés sans erreur', () => {
    const entree = activite(echantillons(300), { laps });

    expect(pivotDe(entree, { champsDeveloppeur: true })).toEqual(pivotDe(entree));
  });

  it('les messages d\'un type non lu sont sautés sans décaler la lecture', () => {
    const entree = activite(echantillons(300), { laps });

    expect(pivotDe(entree, { messagesInconnus: 40 })).toEqual(pivotDe(entree));
  });

  it('un fichier sans les 2 octets de CRC donne le même pivot (tolérance documentée)', () => {
    const entree = activite(echantillons(300), { laps });
    const resultat = fitVersPivot(encoderFit(entree, { sansCrc: true }), OPTIONS);

    expect(resultat).toEqual(pivotDe(entree));
  });
});

describe('erreurs de lecture (ADR 0003)', () => {
  it('un fichier tronqué lève ErreurFit, avec un message qui le dit', () => {
    const octets = encoderFit(activite(echantillons(300)), { tronquer: 1000 });

    expect(() => lireFit(octets)).toThrow(ErreurFit);
    expect(() => lireFit(octets)).toThrow(/tronqué/);
    expect(() => fitVersPivot(octets, OPTIONS)).toThrow(ErreurFit);
  });

  it('un fichier qui n\'a pas la signature « .FIT » lève ErreurFit', () => {
    const octets = encoderFit(activite(echantillons(30)));
    octets.set([0x58, 0x58, 0x58, 0x58], 8);

    expect(() => lireFit(octets)).toThrow(ErreurFit);
  });

  it('un octet de taille d\'en-tête impossible lève ErreurFit', () => {
    expect(() => lireFit(new Uint8Array(64))).toThrow(ErreurFit);
  });
});

describe('activités non courses (ADR 0003)', () => {
  it('une activité qui n\'est pas une course est ignorée', () => {
    const resultat = fitVersPivot(encoderFit(activite(echantillons(60), { sport: 2 })), OPTIONS);

    expect(resultat).toEqual({ ignoree: 'pas-une-course' });
  });

  it.each<[number, string]>([
    [1, 'tapis'],
    [2, 'route'],
    [3, 'trail'],
    [4, 'piste'],
    [0, 'inconnu'],
  ])('sub_sport %i donne sousType « %s » (reference-fit)', (subSport, attendu) => {
    const pivot = pivotDe(activite(echantillons(30), { subSport }));

    expect(pivot.sousType).toBe(attendu);
  });
});

describe('performance : croissance (ADR 0012)', () => {
  function medianeDeTrois(octets: Uint8Array): number {
    fitVersPivot(octets, OPTIONS); // échauffement
    const durees = Array.from({ length: 3 }, () => {
      const debut = performance.now();
      fitVersPivot(octets, OPTIONS);
      return performance.now() - debut;
    }).sort((a, b) => a - b);
    return durees[1] ?? 0;
  }

  itPerf('100 000 enregistrements coûtent moins de 20 fois 20 000 (un algorithme quadratique coûterait environ 25 fois)', () => {
    const petit = encoderFit(activite(echantillons(20000)));
    const grand = encoderFit(activite(echantillons(100000)));

    const medianePetit = medianeDeTrois(petit);
    const medianeGrand = medianeDeTrois(grand);

    expect(medianeGrand).toBeLessThan(20 * medianePetit);
    // pas de borne absolue : la durée dépend de la charge de la machine ; le ratio protège la complexité
  });
});
