import { describe, expect, it, vi } from 'vitest';
import { ErreurTcx, tcxVersPivot, type OptionsPivot } from '../../src/adapters/tcx/versPivot';
import { itPerf } from '../fixtures/perf';

const OPTIONS: OptionsPivot = {
  cleSource: 'strava:77',
  source: 'strava-archive',
  nom: 'Fractionné',
  competition: false,
  empreinteBrute: 'empreinte-tcx',
};

const DEBUT_ISO = '2026-10-20T07:30:00Z';
const DEBUT = Date.UTC(2026, 9, 20, 7, 30, 0);

interface PointTcx {
  seconde: number;
  dist?: number;
  alt?: number;
  hr?: number;
  vitesse?: number;
  prefixeTpx?: string;
}

interface TourTcx {
  debut?: string;
  declenchement?: string;
  intensite?: string;
  points: PointTcx[];
}

function heure(seconde: number): string {
  return new Date(DEBUT + seconde * 1000).toISOString().replace('.000Z', 'Z');
}

function trackpoint(p: PointTcx): string {
  const dist = p.dist === undefined ? '' : `<DistanceMeters>${p.dist}</DistanceMeters>`;
  const alt = p.alt === undefined ? '' : `<AltitudeMeters>${p.alt}</AltitudeMeters>`;
  const hr = p.hr === undefined ? '' : `<HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm>`;
  const prefixe = p.prefixeTpx ?? 'ns3';
  const vitesse =
    p.vitesse === undefined
      ? ''
      : `<Extensions><${prefixe}:TPX><${prefixe}:Speed>${p.vitesse}</${prefixe}:Speed></${prefixe}:TPX></Extensions>`;
  return `<Trackpoint><Time>${heure(p.seconde)}</Time><Position><LatitudeDegrees>48.5</LatitudeDegrees><LongitudeDegrees>2.25</LongitudeDegrees></Position>${alt}${dist}${hr}${vitesse}</Trackpoint>`;
}

function lap(tour: TourTcx): string {
  const debut = tour.debut ?? heure(tour.points[0]?.seconde ?? 0);
  const trigger = tour.declenchement === undefined ? '' : `<TriggerMethod>${tour.declenchement}</TriggerMethod>`;
  const intensite = tour.intensite === undefined ? '' : `<Intensity>${tour.intensite}</Intensity>`;
  return `<Lap StartTime="${debut}"><TotalTimeSeconds>0</TotalTimeSeconds><DistanceMeters>0</DistanceMeters>${trigger}${intensite}<Track>${tour.points.map(trackpoint).join('')}</Track></Lap>`;
}

function tcx(tours: TourTcx[], sport: string | null = 'Running'): string {
  const attributSport = sport === null ? '' : ` Sport="${sport}"`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities>
    <Activity${attributSport}>
      <Id>${DEBUT_ISO}</Id>
      ${tours.map(lap).join('\n      ')}
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
}

function segment(debut: number, n: number, pas = 1, extra: Partial<PointTcx> = {}): PointTcx[] {
  return Array.from({ length: n }, (_, k) => ({
    seconde: debut + k * pas,
    dist: (debut + k * pas) * 3,
    hr: 150 + k,
    ...extra,
  }));
}

// Plusieurs activités dans un même fichier, chacune avec son Sport (absent si null).
function tcxAvecActivites(activites: { sport?: string | null; tours: TourTcx[] }[]): string {
  const corps = activites
    .map(({ sport = 'Running', tours }) => {
      const attribut = sport === null ? '' : ` Sport="${sport}"`;
      return `<Activity${attribut}><Id>${DEBUT_ISO}</Id>${tours.map(lap).join('')}</Activity>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Activities>${corps}</Activities></TrainingCenterDatabase>`;
}

// Un seul tour, dont les trackpoints sont donnés tels quels (XML brut).
function tcxBrut(trackpoints: string, debutTour = DEBUT_ISO): string {
  return `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${DEBUT_ISO}</Id><Lap StartTime="${debutTour}"><Track>${trackpoints}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
}

function mediane(valeurs: number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  return triees[Math.floor(triees.length / 2)] ?? Number.NaN;
}

function pivotDe(texte: string) {
  const resultat = tcxVersPivot(texte, OPTIONS);
  if ('ignoree' in resultat) {
    throw new Error(`activité inattendue ignorée : ${resultat.ignoree}`);
  }
  return resultat;
}

describe('lecteur TCX', () => {
  it('lit les tours avec les indices des trackpoints de chaque Lap', () => {
    const pivot = pivotDe(
      tcx([
        { declenchement: 'Manual', intensite: 'Active', points: segment(0, 3) },
        { declenchement: 'Distance', intensite: 'Resting', points: segment(3, 2) },
      ]),
    );

    expect(pivot.tours).toEqual([
      { iDebut: 0, iFin: 2, declenchement: 'manuel', intensite: 'actif' },
      { iDebut: 3, iFin: 4, declenchement: 'distance', intensite: 'repos' },
    ]);
  });

  it.each([
    ['Manual', 'manuel'],
    ['Distance', 'distance'],
    ['Time', 'temps'],
    ['Location', 'position'],
    ['Autre', 'inconnu'],
  ])('traduit TriggerMethod « %s » en « %s »', (valeur, attendu) => {
    const pivot = pivotDe(tcx([{ declenchement: valeur, points: segment(0, 2) }]));

    expect(pivot.tours[0]?.declenchement).toBe(attendu);
  });

  it('ne donne pas d’intensité à un tour sans Intensity', () => {
    const pivot = pivotDe(tcx([{ declenchement: 'Time', points: segment(0, 2) }]));

    expect(pivot.tours[0]).not.toHaveProperty('intensite');
  });

  it('lit la FC dans HeartRateBpm/Value et calcule le pas médian', () => {
    const pivot = pivotDe(tcx([{ points: segment(0, 4, 5) }]));

    expect(Array.from(pivot.flux.fc_bpm ?? [])).toEqual([150, 151, 152, 153]);
    expect(pivot.pasFC_s).toBe(5);
  });

  it('donne fc_bpm null quand aucun trackpoint n’a de FC', () => {
    const pivot = pivotDe(tcx([{ points: segment(0, 3, 1, { hr: undefined }) }]));

    expect(pivot.flux.fc_bpm).toBeNull();
  });

  it.each(['ns3', 'tpx', 'ext'])('lit la vitesse dans TPX/Speed avec le préfixe « %s »', (prefixe) => {
    const points = segment(0, 3, 1, { vitesse: 3.5, prefixeTpx: prefixe });
    const pivot = pivotDe(tcx([{ points }]));

    expect(Array.from(pivot.flux.vitesse_ms ?? [])).toEqual([3.5, 3.5, 3.5]);
  });

  it('donne vitesse_ms null sans extension de vitesse', () => {
    const pivot = pivotDe(tcx([{ points: segment(0, 3) }]));

    expect(pivot.flux.vitesse_ms).toBeNull();
  });

  it('lit DistanceMeters et donne la distance totale de l’activité', () => {
    const pivot = pivotDe(tcx([{ points: segment(0, 4) }]));

    expect(Array.from(pivot.flux.dist_m)).toEqual([0, 3, 6, 9]);
    expect(pivot.distance_m).toBe(9);
  });

  it('lit l’altitude de AltitudeMeters', () => {
    const pivot = pivotDe(tcx([{ points: segment(0, 2, 1, { alt: 120 }) }]));

    expect(Array.from(pivot.flux.alt_m ?? [])).toEqual([120, 120]);
  });

  it('date l’activité du début du premier tour, sans décalage connu', () => {
    const pivot = pivotDe(tcx([{ points: segment(0, 2) }]));

    expect(pivot).toMatchObject({
      debutUtc: DEBUT,
      decalageLocal_min: 0,
      decalageInconnu: true,
      sousType: 'inconnu',
      competition: false,
      nom: 'Fractionné',
    });
  });

  it('ignore une activité Biking', () => {
    expect(tcxVersPivot(tcx([{ points: segment(0, 3) }], 'Biking'), OPTIONS)).toEqual({
      ignoree: 'pas-une-course',
    });
  });

  itPerf('lit un TCX de 20 000 trackpoints en moins de 300 ms', () => {
    const tours: TourTcx[] = [
      { declenchement: 'Distance', intensite: 'Active', points: segment(0, 20_000, 1, { vitesse: 3 }) },
    ];
    const texte = tcx(tours);

    const durees: number[] = [];
    let pivot = pivotDe(texte);
    for (let k = 0; k < 3; k++) {
      const debut = performance.now();
      pivot = pivotDe(texte);
      durees.push(performance.now() - debut);
    }

    expect(pivot.flux.t_s.length).toBe(20_000);
    expect(pivot.tours).toHaveLength(1);
    expect(mediane(durees)).toBeLessThan(300);
  });
});

describe('décalage de secours, horodatages et FC (ADR 0007, D2, D5)', () => {
  it('sans décalage dans le fichier, decalageSecours est appelé et son résultat s’applique', () => {
    const secours = vi.fn(() => -480);
    const pivot = tcxVersPivot(tcx([{ points: segment(0, 2) }]), { ...OPTIONS, decalageSecours: secours });

    expect(secours).toHaveBeenCalledWith(DEBUT);
    expect(pivot).toMatchObject({ decalageLocal_min: -480, decalageInconnu: true, dateLocale: '2026-10-19' });
  });

  it('écarte les trackpoints antérieurs au début de l’activité (StartTime), t_s[0] vaut 0', () => {
    const pivot = pivotDe(tcx([{ debut: heure(0), points: segment(-2, 4) }]));

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 1]);
  });

  it('trie les trackpoints hors ordre et fusionne les doublons (D2)', () => {
    const points: PointTcx[] = [
      { seconde: 0, dist: 0, hr: 150 },
      { seconde: 2, hr: 152 },
      { seconde: 1, dist: 3, hr: 151 },
      { seconde: 2, dist: 6 },
    ];
    const pivot = pivotDe(tcx([{ points }]));

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 1, 2]);
    expect(Array.from(pivot.flux.fc_bpm ?? [])).toEqual([150, 151, 152]);
    expect(Array.from(pivot.flux.dist_m)).toEqual([0, 3, 6]);
  });

  it('un tour dont les trackpoints sont hors ordre garde ses indices après tri (D2)', () => {
    const points: PointTcx[] = [{ seconde: 2 }, { seconde: 0 }, { seconde: 1 }];
    const pivot = pivotDe(tcx([{ declenchement: 'Manual', debut: heure(0), points }]));

    expect(pivot.tours).toEqual([{ iDebut: 0, iFin: 2, declenchement: 'manuel' }]);
  });

  it('une FC inférieure à 30 ou supérieure à 250 bpm devient NaN (D5)', () => {
    const points: PointTcx[] = [
      { seconde: 0, hr: 150 },
      { seconde: 1, hr: 20 },
      { seconde: 2, hr: 300 },
    ];
    const fc = Array.from(pivotDe(tcx([{ points }])).flux.fc_bpm ?? []);

    expect(fc[0]).toBe(150);
    expect(fc[1]).toBeNaN();
    expect(fc[2]).toBeNaN();
  });
});

describe('tours, fusions et plusieurs activités (décisions TCX)', () => {
  it('rend les tours dans l’ordre du document, même si leurs trackpoints sont hors ordre', () => {
    const pivot = pivotDe(
      tcx([
        { declenchement: 'Manual', debut: heure(0), points: segment(2, 2) },
        { declenchement: 'Distance', points: segment(0, 2) },
      ]),
    );

    expect(pivot.tours).toEqual([
      { iDebut: 2, iFin: 3, declenchement: 'manuel' },
      { iDebut: 0, iFin: 1, declenchement: 'distance' },
    ]);
  });

  it('fusionne altitude, vitesse et distance venant de trackpoints distincts d’un même instant', () => {
    const points: PointTcx[] = [
      { seconde: 0, dist: 0, alt: 100, vitesse: 3 },
      { seconde: 1, alt: 101 },
      { seconde: 1, dist: 3, vitesse: 3.2 },
      { seconde: 1, hr: 150 },
    ];
    const pivot = pivotDe(tcx([{ points }]));

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 1]);
    expect(Array.from(pivot.flux.alt_m ?? [])).toEqual([100, 101]);
    expect(Array.from(pivot.flux.vitesse_ms ?? []).map((v) => Math.round(v * 10) / 10)).toEqual([3, 3.2]);
    expect(Array.from(pivot.flux.dist_m)).toEqual([0, 3]);
    expect(pivot.flux.fc_bpm?.[1]).toBe(150);
  });

  it('garde la dernière distance valide quand plusieurs trackpoints d’un même instant en donnent une', () => {
    const points: PointTcx[] = [
      { seconde: 0, dist: 0 },
      { seconde: 1, dist: 3 },
      { seconde: 1, dist: 4 },
    ];
    const pivot = pivotDe(tcx([{ points }]));

    expect(Array.from(pivot.flux.dist_m)).toEqual([0, 4]);
  });

  it('prend la première activité Running quand le fichier en contient plusieurs', () => {
    const texte = tcxAvecActivites([
      { sport: 'Biking', tours: [{ points: segment(0, 5) }] },
      { sport: 'Running', tours: [{ points: segment(0, 3) }] },
    ]);
    const resultat = tcxVersPivot(texte, OPTIONS);

    expect('ignoree' in resultat).toBe(false);
    if ('ignoree' in resultat) return;
    expect(resultat.flux.t_s.length).toBe(3);
    expect(resultat).not.toHaveProperty('typeSuppose');
  });

  it('ignore le fichier quand aucune de ses activités n’est une course', () => {
    const texte = tcxAvecActivites([
      { sport: 'Biking', tours: [{ points: segment(0, 3) }] },
      { sport: 'Other', tours: [{ points: segment(0, 3) }] },
    ]);

    expect(tcxVersPivot(texte, OPTIONS)).toEqual({ ignoree: 'pas-une-course' });
  });

  it('retient une activité sans Sport quand aucune n’est déclarée Running, et la marque comme supposée', () => {
    const texte = tcxAvecActivites([{ sport: null, tours: [{ points: segment(0, 3) }] }]);
    const resultat = tcxVersPivot(texte, OPTIONS);

    expect(resultat).toMatchObject({ typeSuppose: true });
  });

  it('compare Sport sans tenir compte de la casse', () => {
    const texte = tcxAvecActivites([{ sport: 'RUNNING', tours: [{ points: segment(0, 3) }] }]);
    const resultat = tcxVersPivot(texte, OPTIONS);

    expect('ignoree' in resultat).toBe(false);
    expect(resultat).not.toHaveProperty('typeSuppose');
  });

  it('donne une durée égale à l’instant du dernier trackpoint moins le début', () => {
    expect(pivotDe(tcx([{ points: segment(0, 4) }])).duree_s).toBe(3);
  });

  it('donne alt_m null quand aucun trackpoint n’a d’altitude', () => {
    expect(pivotDe(tcx([{ points: segment(0, 3) }])).flux.alt_m).toBeNull();
  });
});

describe('distance absente (décision TCX sans distance)', () => {
  it('laisse NaN les distances absentes et donne distance_m 0 quand aucune n’est mesurée', () => {
    const pivot = pivotDe(tcx([{ points: segment(0, 3, 1, { dist: undefined }) }]));

    expect(Array.from(pivot.flux.dist_m).every((d) => Number.isNaN(d))).toBe(true);
    expect(pivot.distance_m).toBe(0);
  });

  it('donne pour distance_m la dernière distance finie, même si les derniers instants n’en ont pas', () => {
    const points: PointTcx[] = [{ seconde: 0, dist: 0 }, { seconde: 1 }, { seconde: 2, dist: 6 }, { seconde: 3 }];
    const pivot = pivotDe(tcx([{ points }]));

    expect(pivot.flux.dist_m[0]).toBe(0);
    expect(pivot.flux.dist_m[1]).toBeNaN();
    expect(pivot.flux.dist_m[2]).toBe(6);
    expect(pivot.flux.dist_m[3]).toBeNaN();
    expect(pivot.distance_m).toBe(6);
  });
});

describe('erreurs et gardes', () => {
  it('refuse une racine qui n’est pas TrainingCenterDatabase', () => {
    expect(() => tcxVersPivot('<gpx/>', OPTIONS)).toThrow(ErreurTcx);
  });

  it('refuse un fichier sans aucun trackpoint', () => {
    expect(() => tcxVersPivot(tcx([{ points: [] }]), OPTIONS)).toThrow(ErreurTcx);
  });

  it('lève ErreurTcx quand tous les trackpoints précèdent le StartTime', () => {
    expect(() => tcxVersPivot(tcx([{ debut: heure(100), points: segment(0, 3) }]), OPTIONS)).toThrow(ErreurTcx);
  });

  it('ignore un trackpoint dont l’horodatage n’a pas de fuseau, même sous TZ=America/Los_Angeles', () => {
    const texte = tcxBrut(
      `<Trackpoint><Time>2026-10-20T07:30:00Z</Time></Trackpoint>` +
        `<Trackpoint><Time>2026-10-20T07:30:01</Time></Trackpoint>` +
        `<Trackpoint><Time>2026-10-20T07:30:02Z</Time></Trackpoint>`,
    );
    const pivot = pivotDe(texte);

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 2]);
  });

  it('traite un StartTime sans fuseau comme absent : le début est l’instant le plus ancien', () => {
    const texte = tcxBrut(
      `<Trackpoint><Time>2026-10-20T07:30:00Z</Time></Trackpoint>` +
        `<Trackpoint><Time>2026-10-20T07:30:01Z</Time></Trackpoint>` +
        `<Trackpoint><Time>2026-10-20T07:30:02Z</Time></Trackpoint>`,
      '2026-10-20T07:30:01',
    );
    const pivot = pivotDe(texte);

    expect(pivot.debutUtc).toBe(DEBUT);
    expect(Array.from(pivot.flux.t_s)).toEqual([0, 1, 2]);
  });

  it('traite comme absente une FC qui n’est pas un nombre décimal fini', () => {
    const texte = tcxBrut(
      `<Trackpoint><Time>2026-10-20T07:30:00Z</Time><HeartRateBpm><Value>0x10</Value></HeartRateBpm></Trackpoint>` +
        `<Trackpoint><Time>2026-10-20T07:30:01Z</Time><HeartRateBpm><Value>Infinity</Value></HeartRateBpm></Trackpoint>` +
        `<Trackpoint><Time>2026-10-20T07:30:02Z</Time><HeartRateBpm><Value>151</Value></HeartRateBpm></Trackpoint>`,
    );
    const fc = Array.from(pivotDe(texte).flux.fc_bpm ?? []);

    expect(fc[0]).toBeNaN();
    expect(fc[1]).toBeNaN();
    expect(fc[2]).toBe(151);
  });

  it('ne met aucune coordonnée dans le pivot', () => {
    const texte = tcxBrut(
      `<Trackpoint><Time>2026-10-20T07:30:00Z</Time><Position><LatitudeDegrees>48.123457</LatitudeDegrees><LongitudeDegrees>2.345678</LongitudeDegrees></Position></Trackpoint>` +
        `<Trackpoint><Time>2026-10-20T07:30:01Z</Time><Position><LatitudeDegrees>48.123557</LatitudeDegrees><LongitudeDegrees>2.345778</LongitudeDegrees></Position></Trackpoint>`,
    );
    const sortie = JSON.stringify(pivotDe(texte));

    for (const coordonnee of ['48.123457', '2.345678', '48.123557', '2.345778']) {
      expect(sortie).not.toContain(coordonnee);
    }
  });
});

