// Lignes droites (07, règle 4) : accélérations courtes dans les 15 dernières minutes d'une séance sans répétition.
// Une accélération est une plage de 10 s à moins de 30 s où la vitesse lissée sur 3 s dépasse 1,3 × la vitesse médiane.
// Seule la part de la plage dans la fenêtre compte.
import {
  DEMI_FENETRE_ACCELERATION_S,
  DUREE_MAX_ACCELERATION_S,
  DUREE_MIN_ACCELERATION_S,
  FACTEUR_ACCELERATION,
  FENETRE_LIGNES_DROITES_S,
  NOMBRE_MIN_ACCELERATIONS,
} from '../constantes';
import { mediane } from './repetitions';
import { type GrilleSeance, moyenneGlissante } from './miseEnForme';

/** Vrai si la séance compte au moins trois accélérations courtes dans ses 15 dernières minutes. */
export function detecterLignesDroites(g: GrilleSeance): boolean {
  if (g.n === 0) return false;
  const vitesses: number[] = [];
  for (let i = 0; i < g.n; i++) {
    const v = g.vitesse_ms[i] ?? Number.NaN;
    if (Number.isFinite(v)) vitesses.push(v);
  }
  const medianeVitesse = mediane(vitesses);
  if (medianeVitesse === null || medianeVitesse <= 0) return false;
  const seuil = FACTEUR_ACCELERATION * medianeVitesse;

  const lissee = moyenneGlissante(
    g.vitesse_ms,
    g.t_s,
    g.dt_s,
    DEMI_FENETRE_ACCELERATION_S,
    DEMI_FENETRE_ACCELERATION_S,
  );
  const finSeance_s = (g.t_s[g.n - 1] ?? 0) + (g.dt_s[g.n - 1] ?? 0);
  const debutFenetre_s = finSeance_s - FENETRE_LIGNES_DROITES_S;

  let accelerations = 0;
  let dureePlage_s = 0;
  for (let i = 0; i < g.n; i++) {
    const t = g.t_s[i] ?? 0;
    const rapide = t >= debutFenetre_s && (lissee[i] ?? Number.NaN) > seuil;
    if (rapide) {
      dureePlage_s += g.dt_s[i] ?? 0;
      continue;
    }
    if (estAcceleration(dureePlage_s)) accelerations++;
    dureePlage_s = 0;
  }
  if (estAcceleration(dureePlage_s)) accelerations++;
  return accelerations >= NOMBRE_MIN_ACCELERATIONS;
}

// 10 s ≤ durée < 30 s (07 règle 4) : la borne haute est exclue.
function estAcceleration(duree_s: number): boolean {
  return duree_s >= DUREE_MIN_ACCELERATION_S && duree_s < DUREE_MAX_ACCELERATION_S;
}
