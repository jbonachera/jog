// Découplage aérobie candidat (D-005, 04). Il n'est calculé que sur les portions faciles d'une séance :
// hors des segments à allure marathon, et hors des 300 s qui suivent la fin de chaque segment.
// Seule une sortie longue s'en servira (étape ②b) : ici, c'est un candidat.
import {
  DELAI_APRES_SEGMENT_MP_S,
  DUREE_MIN_CANDIDAT_DECOUPLAGE_MIN,
  DUREE_MIN_RETENUE_DECOUPLAGE_S,
} from '../constantes';
import type { SeanceIntrinseque } from '../types';
import type { GrilleSeance } from './miseEnForme';

export type Decouplage = NonNullable<SeanceIntrinseque['decouplage']>;

/** Un morceau de la moitié : durée (s), distance (m) et FC pondérée par dt, les morceaux sans FC exclus. */
interface Moitie {
  temps_s: number;
  distance_m: number;
  fcSomme: number;
  fcPoids: number;
}

/**
 * Découplage candidat d'une séance, ou null si la séance est trop courte ou sans FC.
 * Le découplage porte sur les portions retenues, coupées en deux moitiés de même durée retenue (D-005).
 */
export function calculerDecouplage(g: GrilleSeance, segmentsMp: { debut_s: number; fin_s: number }[]): Decouplage | null {
  const dureeTotale_s = sommeDt(g);
  if (dureeTotale_s < DUREE_MIN_CANDIDAT_DECOUPLAGE_MIN * 60) return null;
  if (!ilYaDeLaFc(g)) return null;

  const retenus = portionsRetenues(g, segmentsMp);
  const dureeRetenue_s = retenus.reduce((somme, i) => somme + (g.dt_s[i] ?? 0), 0);
  const base = {
    retenu_min: dureeRetenue_s / 60,
    total_min: dureeTotale_s / 60,
    avecMp: segmentsMp.length > 0,
  };
  if (dureeRetenue_s < DUREE_MIN_RETENUE_DECOUPLAGE_S) return { valeur: null, ...base };

  const [premiere, seconde] = couperEnDeux(g, retenus, dureeRetenue_s / 2);
  const ef1 = efficacite(premiere);
  const ef2 = efficacite(seconde);
  if (ef1 === null || ef2 === null) return { valeur: null, ...base };
  return { valeur: (1 - ef2 / ef1) * 100, ...base };
}

// Indices des échantillons retenus : hors des segments mp, et hors des DELAI_APRES_SEGMENT_MP_S qui les suivent.
function portionsRetenues(g: GrilleSeance, segmentsMp: { debut_s: number; fin_s: number }[]): number[] {
  const retenus: number[] = [];
  for (let i = 0; i < g.n; i++) {
    const t = g.t_s[i] ?? 0;
    const exclu = segmentsMp.some((s) => t >= s.debut_s && t < s.fin_s + DELAI_APRES_SEGMENT_MP_S);
    if (!exclu) retenus.push(i);
  }
  return retenus;
}

// Coupe les échantillons retenus à `moitie_s` de durée cumulée. Un échantillon à cheval se répartit au
// prorata de sa durée : les deux moitiés durent exactement la même durée retenue.
function couperEnDeux(g: GrilleSeance, retenus: number[], moitie_s: number): [Moitie, Moitie] {
  const premiere = moitieVide();
  const seconde = moitieVide();
  let cumul = 0;
  for (const i of retenus) {
    const dt = g.dt_s[i] ?? 0;
    if (dt <= 0) continue;
    const distance = distanceDe(g, i);
    const fc = g.fc_bpm[i] ?? Number.NaN;
    const part = Math.min(1, Math.max(0, (moitie_s - cumul) / dt));
    ajouter(premiere, dt * part, distance * part, fc);
    ajouter(seconde, dt * (1 - part), distance * (1 - part), fc);
    cumul += dt;
  }
  return [premiere, seconde];
}

// Distance parcourue pendant l'échantillon i : l'accroissement de la distance grille sur son intervalle,
// au prorata de sa durée dt. Le dernier échantillon reprend l'intervalle précédent.
function distanceDe(g: GrilleSeance, i: number): number {
  const j = i < g.n - 1 ? i : i - 1;
  if (j < 0) return 0;
  const intervalle = (g.t_s[j + 1] ?? 0) - (g.t_s[j] ?? 0);
  if (intervalle <= 0) return 0;
  const accroissement = (g.distance_m[j + 1] ?? 0) - (g.distance_m[j] ?? 0);
  return (accroissement * (g.dt_s[i] ?? 0)) / intervalle;
}

function moitieVide(): Moitie {
  return { temps_s: 0, distance_m: 0, fcSomme: 0, fcPoids: 0 };
}

// Seul un échantillon qui a une FC entre dans l'EF : temps, distance et FC. Un morceau sans FC est écarté (D-013).
function ajouter(moitie: Moitie, temps_s: number, distance_m: number, fc: number): void {
  if (Number.isNaN(fc)) return;
  moitie.temps_s += temps_s;
  moitie.distance_m += distance_m;
  moitie.fcSomme += fc * temps_s;
  moitie.fcPoids += temps_s;
}

// EF d'une moitié = vitesse moyenne (m/min) ÷ FC moyenne pondérée par dt (04). Null si non définie.
function efficacite(moitie: Moitie): number | null {
  if (moitie.temps_s <= 0 || moitie.fcPoids <= 0) return null;
  const vitesse_mmin = (moitie.distance_m * 60) / moitie.temps_s;
  const fcMoyenne = moitie.fcSomme / moitie.fcPoids;
  const ef = vitesse_mmin / fcMoyenne;
  return Number.isFinite(ef) && ef > 0 ? ef : null;
}

function sommeDt(g: GrilleSeance): number {
  let somme = 0;
  for (let i = 0; i < g.n; i++) somme += g.dt_s[i] ?? 0;
  return somme;
}

function ilYaDeLaFc(g: GrilleSeance): boolean {
  for (let i = 0; i < g.n; i++) {
    if (!Number.isNaN(g.fc_bpm[i] ?? Number.NaN)) return true;
  }
  return false;
}
