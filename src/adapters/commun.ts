// Éléments communs aux adaptateurs de fichiers d'activité (FIT, GPX, TCX).

export const VERSION_ADAPTATEUR = '1.0.0';

/** Données que l'appelant fournit à un lecteur. */
export interface OptionsPivot {
  cleSource: string;
  source: 'strava-archive' | 'fit' | 'intervals-icu';
  nom: string | null;
  competition: boolean;
  empreinteBrute: string;
  /**
   * Décalage de secours, en minutes, pour un fichier qui n'en donne pas (ADR 0007). Elle reçoit
   * l'instant de début (ms UTC). En son absence, le décalage vaut 0. Dans les deux cas, le pivot
   * porte `decalageInconnu: true`.
   */
  decalageSecours?: (debutUtc_ms: number) => number;
}

const FC_MIN_BPM = 30;
const FC_MAX_BPM = 250;

// Notation décimale simple, avec signe facultatif : pas de « 0x10 », de « 1e3 », d'« Infinity ».
const EXPRESSION_DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
// Horodatage ISO 8601 : secondes obligatoires, fraction facultative, fuseau explicite (Z ou ±hh:mm).
const EXPRESSION_HORODATAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Nombre décimal fini d'un texte ; NaN sinon (vide, notation exotique, infini). */
export function nombreOuNaN(texte: string): number {
  const propre = texte.trim();
  if (!EXPRESSION_DECIMAL.test(propre)) return Number.NaN;
  const nombre = Number(propre);
  return Number.isFinite(nombre) ? nombre : Number.NaN;
}

/** Instant (ms UTC) d'un horodatage ISO 8601 qui porte son fuseau ; NaN sans fuseau ou mal formé. */
export function instantAvecFuseau(texte: string): number {
  return EXPRESSION_HORODATAGE.test(texte) ? Date.parse(texte) : Number.NaN;
}

/** Vrai quand la latitude est dans [-90 ; 90] et la longitude dans [-180 ; 180]. */
export function coordonneesValides(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/** FC plausible (D5) : hors de [30 ; 250] bpm, la mesure devient NaN. */
export function fcPlausible(bpm: number): number {
  return bpm < FC_MIN_BPM || bpm > FC_MAX_BPM ? Number.NaN : bpm;
}

/** Décalage de secours, en minutes (ADR 0007) : 0 quand l'appelant n'en fournit pas. */
export function decalageDeSecours(options: OptionsPivot, debutUtc_ms: number): number {
  return options.decalageSecours?.(debutUtc_ms) ?? 0;
}

export interface GroupeInstant {
  instant: number;
  indices: number[]; // indices des enregistrements bruts, dans l'ordre du fichier
}

/**
 * Tri stable par instant puis fusion des enregistrements de même instant (D2). Les enregistrements
 * antérieurs à `debut` sont écartés. Le résultat est strictement croissant en instant.
 */
export function regrouperParInstant(temps: readonly number[], debut: number): GroupeInstant[] {
  const indices: number[] = [];
  for (let i = 0; i < temps.length; i++) {
    if ((temps[i] ?? Number.NaN) >= debut) indices.push(i);
  }
  indices.sort((a, b) => (temps[a] ?? 0) - (temps[b] ?? 0) || a - b);

  const groupes: GroupeInstant[] = [];
  for (const i of indices) {
    const instant = temps[i] ?? 0;
    const dernier = groupes.at(-1);
    if (dernier !== undefined && dernier.instant === instant) {
      dernier.indices.push(i);
    } else {
      groupes.push({ instant, indices: [i] });
    }
  }
  return groupes;
}

/** Vrai quand aucune valeur de la colonne n'est mesurée (NaN partout). */
export function toutAbsent(valeurs: Float32Array): boolean {
  return valeurs.every((v) => Number.isNaN(v));
}

/** Médiane des écarts entre deux mesures de FC (D-013) ; null avec moins de deux mesures. */
export function pasMedianFc(fc: Float32Array, tSec: Float32Array): number | null {
  const instants = new Float64Array(fc.length);
  let n = 0;
  for (let i = 0; i < fc.length; i++) {
    if (!Number.isNaN(fc[i] ?? Number.NaN)) instants[n++] = tSec[i] ?? 0;
  }
  if (n < 2) return null;

  const ecarts = new Float64Array(n - 1);
  for (let k = 0; k < ecarts.length; k++) {
    ecarts[k] = (instants[k + 1] ?? 0) - (instants[k] ?? 0);
  }
  ecarts.sort();
  const milieu = ecarts.length >> 1;
  if (ecarts.length % 2 === 1) return ecarts[milieu] ?? null;
  return ((ecarts[milieu - 1] ?? 0) + (ecarts[milieu] ?? 0)) / 2;
}

/** Dernière valeur mesurée d'une colonne, ou 0 si elle n'en a aucune. */
export function derniereMesure(valeurs: Float32Array): number {
  for (let i = valeurs.length - 1; i >= 0; i--) {
    const v = valeurs[i] ?? Number.NaN;
    if (!Number.isNaN(v)) return v;
  }
  return 0;
}
