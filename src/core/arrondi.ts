// Puissances de dix tirées d'une table : pas de Math.pow (ADR 0006).
const PUISSANCES_DE_DIX = [1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15];

// Un pas décimal s'écrit m / f : f est une puissance de dix, m un entier positif.
// Le couple est calculé une seule fois par pas, puis mémorisé.
interface Echelle {
  f: number;
  m: number;
}
const echelles = new Map<number, Echelle>();

/**
 * Arrondit x au pas décimal donné, au plus proche. Une valeur à mi-chemin
 * s'éloigne de zéro (D-015).
 */
export function arrondir(x: number, pas: number): number {
  const { f, m } = echellePour(pas);
  return arrondirSur(x, f, m);
}

/** Arrondit x à un nombre donné de décimales, avec la même règle que `arrondir`. */
export function arrondirDecimales(x: number, decimales: number): number {
  const f = PUISSANCES_DE_DIX[decimales];
  if (f === undefined) {
    throw new RangeError(`nombre de décimales hors table : ${decimales}`);
  }
  return arrondirSur(x, f, 1);
}

function echellePour(pas: number): Echelle {
  const memorisee = echelles.get(pas);
  if (memorisee !== undefined) {
    return memorisee;
  }
  for (const f of PUISSANCES_DE_DIX) {
    // 0,01 = 1 / 100, 0,1 = 1 / 10, 5 = 5 / 1. toPrecision(12) efface l'erreur de la multiplication.
    const m = Number((pas * f).toPrecision(12));
    if (Number.isInteger(m) && m > 0) {
      const echelle = { f, m };
      echelles.set(pas, echelle);
      return echelle;
    }
  }
  throw new RangeError(`pas non décimal : ${pas}`);
}

function arrondirSur(x: number, f: number, m: number): number {
  // toPrecision(15) efface le bruit binaire de la mise à l'échelle : 1,005 × 100 vaut
  // 100,49999999999999 en binaire, et doit s'arrondir à 101 comme le veut D-015.
  const echelonne = Number((x * f).toPrecision(15)) / m;
  const entier = arrondiMiChemin(echelonne);
  const resultat = (entier * m) / f;
  return resultat === 0 ? 0 : resultat; // pas de −0
}

function arrondiMiChemin(y: number): number {
  return y < 0 ? -Math.floor(-y + 0.5) : Math.floor(y + 0.5);
}
