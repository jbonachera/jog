// Sorties des séries (étape ④, 04). Les types de la Vue (SemaineVue) restent dans src/core/types.ts.
import type { DateCivile, TypeSeance } from '../types';

export interface OptionsCharge {
  ctlDays: number;
  atlDays: number;
}

export interface PointCharge {
  date: DateCivile;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface PointRatio {
  date: DateCivile;
  s7: number;
  chronic: number;
  r: number | null;
}

export interface Palier {
  semaines: number;
  reference_km: number;
}

/** Une barre d'un mini-graphique : un jour, ou une semaine pour l'année. */
export interface BarreVolume {
  date: DateCivile;
  km: number;
  type: TypeSeance | null;
}

export interface Volume {
  km: number;
  duree_min: number;
  nbSeances: number;
  /** (A − B) ÷ B ; null sans historique précédent, ou si B vaut 0. */
  ecart: number | null;
  historiquePrecedent: boolean;
  serie: BarreVolume[];
}

export interface VolumeAnnee extends Volume {
  /** km ÷ nombre de jours × 7, sur le 1er janvier → J−1. */
  moyenneHebdo_km: number;
}

export interface Compteurs {
  annee: VolumeAnnee;
  jours30: Volume;
  jours7: Volume;
}
