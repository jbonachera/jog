// Entrées et sorties de la décision (étapes ⑤ et ⑥, 05). Ces types ne dépendent pas de `series` :
// l'étape ④ fournit ces structures simples, à J−1.
import type { DateCivile, EtatSignal, ParamsDates, ParamsGlobaux, Seance, Vue } from '../types';

export interface EntreesDecision {
  J: DateCivile;
  premierJour: DateCivile | null;                         // jour 1 de l'historique
  serieCharge: { date: DateCivile; ctl: number; atl: number; tsb: number }[];   // jusqu'à J−1
  ratio: { date: DateCivile; s7: number; chronic: number; r: number | null }[]; // jusqu'à J−1
  joursKm: { date: DateCivile; km: number; charge: number }[];                  // jusqu'à J−1, repos compris
  semaines: { lundi: DateCivile; statut: 'terminee' | 'en-cours'; km: number }[];
  palier: { semaines: number; reference_km: number };     // fourni tel quel
  seances: Seance[];                                      // classées, jusqu'à J−1
  globaux: ParamsGlobaux;
  paramsAuJour: (d: DateCivile) => ParamsDates;
}

/** La décision telle que la Vue la porte. */
export type Decision = Vue['decision'];
export type Fourchette = NonNullable<Decision['fourchette']>;
export type Simulateur = NonNullable<Decision['simulateur']>;

export type PositionFourchette = 'dans' | 'au-dessus' | 'dessous';

export interface ResultatSimulation {
  ratioProjete: number | null;        // arrondi à 0,01 ; null si le dénominateur est nul
  etatRatio: EtatSignal;
  fraicheur7j: number;                // arrondie au point
  etatFraicheur: EtatSignal;
  positionFourchette: PositionFourchette;
  ecart_km: number;
  phrase: string;
}
