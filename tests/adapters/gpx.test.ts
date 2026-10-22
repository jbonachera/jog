import { describe, expect, it, vi } from 'vitest';
import { ErreurXml } from '../../src/adapters/xml/lecteur';
import { ErreurGpx, gpxVersPivot, type OptionsPivot } from '../../src/adapters/gpx/versPivot';

const OPTIONS: OptionsPivot = {
  cleSource: 'strava:42',
  source: 'strava-archive',
  nom: 'Sortie du matin',
  competition: false,
  empreinteBrute: 'empreinte-gpx',
};

// Distance d'un arc de 0,001° sur l'équateur, avec R = 6 371 008,8 m.
const UN_MILLIDEGRE_M = 111.19508;

interface PointGpx {
  lat: number;
  lon: number;
  time?: string | null;
  ele?: number;
  hr?: number;
  hrPrefixe?: string;
}

// Sans heure donnée, chaque point reçoit une seconde de plus que le précédent.
function point(p: PointGpx, rang: number): string {
  const defaut = new Date(Date.UTC(2026, 9, 20, 7, 30, rang)).toISOString().replace('.000Z', 'Z');
  const temps = p.time === null ? '' : `<time>${p.time ?? defaut}</time>`;
  const altitude = p.ele === undefined ? '' : `<ele>${p.ele}</ele>`;
  const fc =
    p.hr === undefined
      ? ''
      : `<extensions><${p.hrPrefixe ?? 'gpxtpx'}:TrackPointExtension><${p.hrPrefixe ?? 'gpxtpx'}:hr>${p.hr}</${p.hrPrefixe ?? 'gpxtpx'}:hr></${p.hrPrefixe ?? 'gpxtpx'}:TrackPointExtension></extensions>`;
  return `<trkpt lat="${p.lat}" lon="${p.lon}">${altitude}${temps}${fc}</trkpt>`;
}

function gpx(points: PointGpx[], type?: string | null): string {
  const typeXml = type === null ? '' : `<type>${type ?? 'running'}</type>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <name>Sortie</name>
    ${typeXml}
    <trkseg>
      ${points.map((p, rang) => point(p, rang)).join('\n      ')}
    </trkseg>
  </trk>
</gpx>`;
}

const TROIS_POINTS_EQUATEUR: PointGpx[] = [
  { lat: 0, lon: 0, time: '2026-10-20T07:30:00Z', hr: 150, ele: 100 },
  { lat: 0, lon: 0.001, time: '2026-10-20T07:30:01Z', hr: 152, ele: 101 },
  { lat: 0, lon: 0.002, time: '2026-10-20T07:30:02Z', hr: 155, ele: 102 },
];

function pivotDe(texte: string) {
  const resultat = gpxVersPivot(texte, OPTIONS);
  if ('ignoree' in resultat) {
    throw new Error(`activité inattendue ignorée : ${resultat.ignoree}`);
  }
  return resultat;
}

describe('lecteur GPX', () => {
  it('calcule la distance cumulée par haversine à ±0,5 m (ADR 0003)', () => {
    const pivot = pivotDe(gpx(TROIS_POINTS_EQUATEUR));
    const dist = Array.from(pivot.flux.dist_m);

    expect(dist[0]).toBeCloseTo(0, 1);
    expect(Math.abs((dist[1] ?? NaN) - UN_MILLIDEGRE_M)).toBeLessThan(0.5);
    expect(Math.abs((dist[2] ?? NaN) - 2 * UN_MILLIDEGRE_M)).toBeLessThan(0.5);
    expect(Math.abs(pivot.distance_m - 2 * UN_MILLIDEGRE_M)).toBeLessThan(0.5);
  });

  it('lit la FC dans l’extension Garmin et calcule le pas médian', () => {
    const pivot = pivotDe(gpx(TROIS_POINTS_EQUATEUR));

    expect(Array.from(pivot.flux.fc_bpm ?? [])).toEqual([150, 152, 155]);
    expect(pivot.pasFC_s).toBe(1);
  });

  it('accepte n’importe quel préfixe d’espace de noms pour la FC', () => {
    const points = TROIS_POINTS_EQUATEUR.map((p) => ({ ...p, hrPrefixe: 'ext' }));
    const pivot = pivotDe(gpx(points));

    expect(Array.from(pivot.flux.fc_bpm ?? [])).toEqual([150, 152, 155]);
  });

  it('donne fc_bpm null quand le fichier n’a pas de FC', () => {
    const sansFc = TROIS_POINTS_EQUATEUR.map((p) => ({ lat: p.lat, lon: p.lon, time: p.time, ele: p.ele }));
    const pivot = pivotDe(gpx(sansFc));

    expect(pivot.flux.fc_bpm).toBeNull();
    expect(pivot.pasFC_s).toBeNull();
  });

  it('lit l’altitude de ele et laisse NaN quand elle manque à un point', () => {
    const points: PointGpx[] = [
      { lat: 0, lon: 0, ele: 100 },
      { lat: 0, lon: 0.001 },
      { lat: 0, lon: 0.002, ele: 104 },
    ];
    const alt = Array.from(pivotDe(gpx(points)).flux.alt_m ?? []);

    expect(alt[0]).toBe(100);
    expect(alt[1]).toBeNaN();
    expect(alt[2]).toBe(104);
  });

  it('donne alt_m null quand le fichier n’a aucune altitude', () => {
    const sansAlt = TROIS_POINTS_EQUATEUR.map((p) => ({ lat: p.lat, lon: p.lon, time: p.time, hr: p.hr }));

    expect(pivotDe(gpx(sansAlt)).flux.alt_m).toBeNull();
  });

  it.each(['running', 'run', '9'])('traite trk/type « %s » comme une course', (type) => {
    const resultat = gpxVersPivot(gpx(TROIS_POINTS_EQUATEUR, type), OPTIONS);

    expect('ignoree' in resultat).toBe(false);
    expect('typeSuppose' in resultat).toBe(false);
  });

  it('traite une activité sans type comme une course et le signale', () => {
    const resultat = gpxVersPivot(gpx(TROIS_POINTS_EQUATEUR, null), OPTIONS);

    expect(resultat).toMatchObject({ typeSuppose: true, dateLocale: '2026-10-20' });
  });

  it('ignore une activité d’un autre sport', () => {
    expect(gpxVersPivot(gpx(TROIS_POINTS_EQUATEUR, 'biking'), OPTIONS)).toEqual({
      ignoree: 'pas-une-course',
    });
  });

  it('ne met aucune coordonnée dans le pivot', () => {
    const points: PointGpx[] = [
      { lat: 48.123457, lon: 2.345678, hr: 140 },
      { lat: 48.123557, lon: 2.345778, hr: 142 },
    ];
    const sortie = JSON.stringify(pivotDe(gpx(points)));

    expect(sortie).not.toContain('48.123457');
    expect(sortie).not.toContain('2.345678');
    expect(sortie).not.toContain('48.123557');
    expect(sortie).not.toContain('2.345778');
  });

  it('marque le décalage comme inconnu, vitesse absente et aucun tour', () => {
    const pivot = pivotDe(gpx(TROIS_POINTS_EQUATEUR));

    expect(pivot).toMatchObject({
      decalageLocal_min: 0,
      decalageInconnu: true,
      debutUtc: Date.UTC(2026, 9, 20, 7, 30, 0),
      tours: [],
      flux: { vitesse_ms: null },
    });
    expect(pivot.duree_s).toBe(2);
  });

  it('reprend le nom, la compétition et l’empreinte fournis dans les options', () => {
    const pivot = pivotDe(gpx(TROIS_POINTS_EQUATEUR));

    expect(pivot).toMatchObject({
      cleSource: 'strava:42',
      source: 'strava-archive',
      nom: 'Sortie du matin',
      competition: false,
      empreinteBrute: 'empreinte-gpx',
      versionAdaptateur: '1.0.0',
    });
  });

  it('signale un fichier tronqué par une erreur explicite', () => {
    const complet = gpx(TROIS_POINTS_EQUATEUR);
    const tronque = complet.slice(0, complet.indexOf('</trkseg>'));

    expect(() => gpxVersPivot(tronque, OPTIONS)).toThrow(ErreurXml);
  });
});

describe('décalage de secours, horodatages et FC (ADR 0007, D2, D5)', () => {
  it('sans décalage dans le fichier, decalageSecours est appelé et son résultat s’applique', () => {
    const debut = Date.UTC(2026, 9, 20, 23, 30, 0);
    const points: PointGpx[] = [
      { lat: 0, lon: 0, time: '2026-10-20T23:30:00Z', hr: 150 },
      { lat: 0, lon: 0.001, time: '2026-10-20T23:30:01Z', hr: 151 },
    ];
    const secours = vi.fn(() => 120);
    const resultat = gpxVersPivot(gpx(points), { ...OPTIONS, decalageSecours: secours });

    expect(secours).toHaveBeenCalledWith(debut);
    expect(resultat).toMatchObject({
      decalageLocal_min: 120,
      decalageInconnu: true,
      dateLocale: '2026-10-21',
    });
  });

  it('trie les points hors ordre et calcule la distance dans l’ordre des instants (D2)', () => {
    const points: PointGpx[] = [
      { lat: 0, lon: 0.002, time: '2026-10-20T07:30:02Z' },
      { lat: 0, lon: 0, time: '2026-10-20T07:30:00Z' },
      { lat: 0, lon: 0.001, time: '2026-10-20T07:30:01Z' },
    ];
    const pivot = pivotDe(gpx(points));

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 1, 2]);
    expect(Array.from(pivot.flux.dist_m).map((d) => Math.round(d))).toEqual([0, 111, 222]);
  });

  it('fusionne les points de même instant : FC dans l’un, altitude dans l’autre (D2)', () => {
    const points: PointGpx[] = [
      { lat: 0, lon: 0, time: '2026-10-20T07:30:00Z', ele: 100, hr: 150 },
      { lat: 0, lon: 0.001, time: '2026-10-20T07:30:01Z', hr: 152 },
      { lat: 0, lon: 0.001, time: '2026-10-20T07:30:01Z', ele: 101 },
      { lat: 0, lon: 0.002, time: '2026-10-20T07:30:02Z', ele: 102, hr: 155 },
    ];
    const pivot = pivotDe(gpx(points));

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 1, 2]);
    expect(Array.from(pivot.flux.fc_bpm ?? [])).toEqual([150, 152, 155]);
    expect(Array.from(pivot.flux.alt_m ?? [])).toEqual([100, 101, 102]);
    expect(pivot.pasFC_s).toBe(1);
  });

  it('une FC inférieure à 30 ou supérieure à 250 bpm devient NaN (D5)', () => {
    const points: PointGpx[] = [
      { lat: 0, lon: 0, hr: 150 },
      { lat: 0, lon: 0.001, hr: 20 },
      { lat: 0, lon: 0.002, hr: 255 },
      { lat: 0, lon: 0.003, hr: 250 },
    ];
    const fc = Array.from(pivotDe(gpx(points)).flux.fc_bpm ?? []);

    expect(fc[0]).toBe(150);
    expect(fc[1]).toBeNaN();
    expect(fc[2]).toBeNaN();
    expect(fc[3]).toBe(250);
  });
});

// GPX brut : le corps est donné tel quel, pour construire plusieurs pistes ou segments.
function gpxBrut(corps: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${corps}</gpx>`;
}

function trkpt(lat: string, lon: string, temps?: string, extra = ''): string {
  const heure = temps === undefined ? '' : `<time>${temps}</time>`;
  return `<trkpt lat="${lat}" lon="${lon}">${extra}${heure}</trkpt>`;
}

describe('pistes et segments (décision GPX)', () => {
  it('lit tous les segments et ne compte pas le saut entre la fin d’un segment et le début du suivant', () => {
    const texte = gpxBrut(
      `<trk><type>running</type>` +
        `<trkseg>${trkpt('0', '0', '2026-10-20T07:30:00Z')}${trkpt('0', '0.001', '2026-10-20T07:30:01Z')}</trkseg>` +
        `<trkseg>${trkpt('0', '0.5', '2026-10-20T07:30:02Z')}${trkpt('0', '0.501', '2026-10-20T07:30:03Z')}</trkseg>` +
        `</trk>`,
    );
    const pivot = pivotDe(texte);

    expect(pivot.flux.t_s.length).toBe(4);
    expect(Array.from(pivot.flux.dist_m).map((d) => Math.round(d))).toEqual([0, 111, 111, 222]);
    expect(Math.abs(pivot.distance_m - 2 * UN_MILLIDEGRE_M)).toBeLessThan(0.5);
  });

  it('lit toutes les pistes, dans l’ordre des instants', () => {
    const texte = gpxBrut(
      `<trk><trkseg>${trkpt('0', '0', '2026-10-20T07:30:00Z')}${trkpt('0', '0.001', '2026-10-20T07:30:01Z')}</trkseg></trk>` +
        `<trk><type>running</type><trkseg>${trkpt('0', '0.002', '2026-10-20T07:30:02Z')}</trkseg></trk>`,
    );
    const resultat = gpxVersPivot(texte, OPTIONS);

    expect('ignoree' in resultat).toBe(false);
    expect(resultat).not.toHaveProperty('typeSuppose');
    if ('ignoree' in resultat) return;
    expect(Array.from(resultat.flux.t_s)).toEqual([0, 1, 2]);
  });

  it('prend le type de la première piste qui en déclare un : une piste « biking » ignore l’activité', () => {
    const texte = gpxBrut(
      `<trk><trkseg>${trkpt('0', '0', '2026-10-20T07:30:00Z')}</trkseg></trk>` +
        `<trk><type>biking</type><trkseg>${trkpt('0', '0.001', '2026-10-20T07:30:01Z')}</trkseg></trk>` +
        `<trk><type>running</type><trkseg>${trkpt('0', '0.002', '2026-10-20T07:30:02Z')}</trkseg></trk>`,
    );

    expect(gpxVersPivot(texte, OPTIONS)).toEqual({ ignoree: 'pas-une-course' });
  });

  it('accepte le type « Running » quelle que soit la casse', () => {
    const resultat = gpxVersPivot(gpx(TROIS_POINTS_EQUATEUR, 'Running'), OPTIONS);

    expect('ignoree' in resultat).toBe(false);
    expect(resultat).not.toHaveProperty('typeSuppose');
  });

  it('considère une activité sans aucun type déclaré comme course supposée', () => {
    const texte = gpxBrut(`<trk><trkseg>${trkpt('0', '0', '2026-10-20T07:30:00Z')}${trkpt('0', '0.001', '2026-10-20T07:30:01Z')}</trkseg></trk>`);

    expect(gpxVersPivot(texte, OPTIONS)).toMatchObject({ typeSuppose: true });
  });

  it('refuse une racine qui n’est pas gpx', () => {
    expect(() => gpxVersPivot('<kml><trk/></kml>', OPTIONS)).toThrow(ErreurGpx);
  });

  it('refuse un fichier sans aucun point exploitable', () => {
    expect(() => gpxVersPivot(gpxBrut('<trk><trkseg></trkseg></trk>'), OPTIONS)).toThrow(ErreurGpx);
    expect(() => gpxVersPivot(gpxBrut('<wpt lat="0" lon="0"/>'), OPTIONS)).toThrow(ErreurGpx);
  });
});

describe('points ignorés (horodatage, coordonnées, bornes, nombres)', () => {
  it('ignore un point sans horodatage', () => {
    const texte = gpxBrut(
      `<trk><trkseg>${trkpt('0', '0', '2026-10-20T07:30:00Z')}${trkpt('0', '0.001')}${trkpt('0', '0.002', '2026-10-20T07:30:02Z')}</trkseg></trk>`,
    );
    const pivot = pivotDe(texte);

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 2]);
  });

  it('ignore un point sans coordonnées', () => {
    const texte = gpxBrut(
      `<trk><trkseg>${trkpt('0', '0', '2026-10-20T07:30:00Z')}<trkpt><time>2026-10-20T07:30:01Z</time></trkpt>${trkpt('0', '0.002', '2026-10-20T07:30:02Z')}</trkseg></trk>`,
    );

    expect(Array.from(pivotDe(texte).flux.t_s)).toEqual([0, 2]);
  });

  it('ignore un horodatage sans fuseau, même sous TZ=America/Los_Angeles, et accepte un décalage explicite', () => {
    const texte = gpxBrut(
      `<trk><trkseg>${trkpt('0', '0', '2026-10-20T00:30:00-07:00')}${trkpt('0', '0.001', '2026-10-20T07:30:01')}${trkpt('0', '0.002', '2026-10-20T07:30:02Z')}</trkseg></trk>`,
    );
    const pivot = pivotDe(texte);

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 2]);
    expect(pivot.debutUtc).toBe(Date.UTC(2026, 9, 20, 7, 30, 0));
  });

  it('ignore un point dont la latitude ou la longitude sort des bornes', () => {
    const texte = gpxBrut(
      `<trk><trkseg>${trkpt('91', '0', '2026-10-20T07:30:00Z')}${trkpt('0', '181', '2026-10-20T07:30:01Z')}${trkpt('-90', '-180', '2026-10-20T07:30:02Z')}</trkseg></trk>`,
    );

    const pivot = pivotDe(texte);

    expect(pivot.debutUtc).toBe(Date.UTC(2026, 9, 20, 7, 30, 2));
    expect(Array.from(pivot.flux.t_s)).toEqual([0]);
  });

  it('ignore les coordonnées et les altitudes qui ne sont pas des nombres décimaux finis', () => {
    const texte = gpxBrut(
      `<trk><trkseg>` +
        `${trkpt('Infinity', '0', '2026-10-20T07:30:00Z')}` +
        `${trkpt('0', '0x10', '2026-10-20T07:30:01Z')}` +
        `${trkpt('0', '0', '2026-10-20T07:30:02Z', '<ele>1e400</ele>')}` +
        `${trkpt('0', '0.001', '2026-10-20T07:30:03Z', '<ele> 12.5 </ele>')}` +
        `</trkseg></trk>`,
    );
    const pivot = pivotDe(texte);

    expect(Array.from(pivot.flux.t_s)).toEqual([0, 1]);
    expect(Array.from(pivot.flux.alt_m ?? []).map((a) => (Number.isNaN(a) ? 'NaN' : a))).toEqual(['NaN', 12.5]);
  });
});

