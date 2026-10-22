// Pic soutenu de la FC (D-019, ADR 0013) : la plus haute FC tenue au moins DUREE_PIC_FC_S s d'affilée, hors des
// DEBUT_PIC_FC_S premières secondes. Minimum glissant de fc_bpm (D-013) par une file monotone : une seule passe, O(n),
// sans allocation dans la boucle.
import { DEBUT_PIC_FC_S, DUREE_PIC_FC_S, ECART_MAX_GRILLE_S } from '../constantes';
import type { GrilleSeance } from './miseEnForme';

/**
 * Pas de la grille : le mode des écarts entre mesures consécutives, positifs et au plus ECART_MAX_GRILLE_S (1 s pour un
 * flux à 1 Hz, 5 s pour un flux à 5 s). Un écart plus grand qu'un pas est une coupure : pause, trou de mesure.
 */
function pasGrille(t: Float64Array, n: number): number {
  const compte = new Int32Array(ECART_MAX_GRILLE_S + 1);
  for (let j = 0; j < n - 1; j++) {
    const ecart = Math.round((t[j + 1] ?? 0) - (t[j] ?? 0));
    if (ecart >= 1 && ecart <= ECART_MAX_GRILLE_S) compte[ecart] = (compte[ecart] ?? 0) + 1;
  }
  let pas = 1;
  let meilleur = 0;
  for (let e = 1; e <= ECART_MAX_GRILLE_S; e++) {
    if ((compte[e] ?? 0) > meilleur) {
      meilleur = compte[e] ?? 0;
      pas = e;
    }
  }
  return pas;
}

// Écart entre la mesure j et la suivante, plus grand qu'un pas (0 pour la dernière mesure : pas d'écart suivant).
function coupure(t: Float64Array, n: number, j: number, pas: number): boolean {
  return j + 1 < n && (t[j + 1] ?? 0) - (t[j] ?? 0) > pas;
}

/**
 * Fenêtre commençant à l'échantillon i : les échantillons d'instant dans [t_i, t_i + 15 s). Elle est valide si
 * aucun de ses échantillons n'est NaN, si t_i ≥ 300 s, si aucun écart entre mesures consécutives, y compris celui vers
 * la mesure qui suit la fenêtre, ne dépasse le pas de la grille (une pause ou un trou la coupe), et si, à la fin du
 * flux, la dernière mesure est à un pas au plus de la fin de la fenêtre. Le pic est le plus haut minimum des fenêtres
 * valides, brut.
 */
export function calculerFcPic(g: GrilleSeance): number | null {
  const { n, t_s: t, fc_bpm: fc } = g;
  const pas = pasGrille(t, n);
  // File des indices de la fenêtre, FC croissante de la tête à la queue : la tête est le minimum de la fenêtre.
  const file = new Int32Array(n);
  let tete = 0;
  let queue = 0;
  // Nombre de NaN dans la fenêtre courante, qui n'entrent pas dans la file.
  let nbNaN = 0;
  // Nombre de coupures entre mesures consécutives de la fenêtre : pour j de i à dernier, l'écart de j à j+1.
  let nbCoupures = 0;
  // Dernier indice entré dans la fenêtre (instant < t_i + 15 s).
  let dernier = -1;
  let pic = Number.NaN;

  for (let i = 0; i < n; i++) {
    const debut = t[i] ?? 0;
    const fin = debut + DUREE_PIC_FC_S;
    if (i > 0) {
      if (Number.isNaN(fc[i - 1] ?? Number.NaN)) nbNaN--;
      if (coupure(t, n, i - 1, pas)) nbCoupures--;
    }

    while (dernier + 1 < n && (t[dernier + 1] ?? 0) < fin) {
      dernier++;
      if (coupure(t, n, dernier, pas)) nbCoupures++;
      const v = fc[dernier] ?? Number.NaN;
      if (Number.isNaN(v)) {
        nbNaN++;
        continue;
      }
      while (queue > tete && (fc[file[queue - 1] ?? 0] ?? Number.NaN) >= v) queue--;
      file[queue] = dernier;
      queue++;
    }
    while (tete < queue && (file[tete] ?? 0) < i) tete++;

    // Fin de flux : la fenêtre n'est couverte que si sa dernière mesure est à un pas au plus de sa fin. Plus loin, la
    // coupure vers la mesure suivante (comptée ci-dessus) couvre ce cas.
    const finDeFlux = dernier + 1 >= n;
    const couverte = !finDeFlux || fin - (t[dernier] ?? 0) <= pas;
    const valide = debut >= DEBUT_PIC_FC_S && nbNaN === 0 && nbCoupures === 0 && couverte;
    if (valide) {
      const minimum = fc[file[tete] ?? 0] ?? Number.NaN;
      if (Number.isNaN(pic) || minimum > pic) pic = minimum;
    }
  }

  return Number.isNaN(pic) ? null : pic;
}
