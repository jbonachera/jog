// P5 · Niveau estimé (03, P5 ; 04, « Équivalences », « Records » ; D-014). Fonction pure.
import { arrondir } from '../arrondi';
import { DISTANCES_STANDARD_KM } from '../constantes';
import { formatDate } from '../format';
import { tempsRiegel } from '../riegel';
import type { DateCivile, SeanceVue, Vue } from '../types';

const DISTANCE_SOURCE_KM = 5;
const LIBELLES = ['5 km', '10 km', 'Semi', 'Marathon'];

export interface SourceNiveau {
  date: DateCivile;
  distance_km: number;
  temps_s: number;
  type: 'test' | 'course';
}

export interface RecordNiveau {
  temps_s: number;
  date: DateCivile;
}

export interface LigneNiveau {
  distance_km: number;
  libelle: string;
  /** Temps équivalent à la distance, par Riegel, en secondes. */
  equivalence_s: number;
  allure_skm: number;
  record: RecordNiveau | null;
  /** Date du record écrite (« 4 oct. »), ou « pas encore couru ». */
  libelleDateRecord: string;
  /** Équivalence moins record, en secondes, toutes deux arrondies à la seconde (D-015). Null sans record. */
  ecart_s: number | null;
  /** Vrai si l’équivalence arrondie est plus rapide que le record arrondi. Faux sans record. */
  bat: boolean;
}

export type NiveauEstime =
  | { source: SourceNiveau; lignes: LigneNiveau[] }
  | { source: null; raison: string };

/**
 * Le niveau estimé, depuis le dernier test ou la dernière course de 5 km (04). Les records portent sur les courses
 * et les tests de chaque distance de référence (D-014). Sans test ni course de 5 km, il n’y a pas de source.
 */
export function niveauEstime(vue: Vue): NiveauEstime {
  const chronos = vue.seances.filter((s) => estChrono(s) && s.distanceRef_km === DISTANCE_SOURCE_KM && s.temps_s !== null);
  const derniere = chronos.at(-1);
  if (derniere === undefined || derniere.temps_s === null) {
    return { source: null, raison: 'Aucun test ni course de 5 km dans l’historique : pas de niveau estimé.' };
  }
  const source: SourceNiveau = {
    date: derniere.date,
    distance_km: DISTANCE_SOURCE_KM,
    temps_s: derniere.temps_s,
    type: derniere.type === 'test' ? 'test' : 'course',
  };
  const lignes = DISTANCES_STANDARD_KM.map((distance, i) => ligne(vue, source, distance, LIBELLES[i] ?? ''));
  return { source, lignes };
}

// L’équivalence et le record se comparent à la seconde près : ce que l’athlète lit est ce qui est jugé (D-015).
function ligne(vue: Vue, source: SourceNiveau, distance_km: number, libelle: string): LigneNiveau {
  const equivalence_s = tempsRiegel(source.temps_s, source.distance_km, distance_km);
  const record = meilleurRecord(vue.seances, distance_km);
  const equivalenceAffichee = arrondir(equivalence_s, 1);
  const recordAffiche = record === null ? null : arrondir(record.temps_s, 1);
  return {
    distance_km,
    libelle,
    equivalence_s,
    allure_skm: equivalence_s / distance_km,
    record,
    libelleDateRecord: record === null ? 'pas encore couru' : formatDate(record.date),
    ecart_s: recordAffiche === null ? null : equivalenceAffichee - recordAffiche,
    bat: recordAffiche !== null && equivalenceAffichee < recordAffiche,
  };
}

// Meilleur temps des courses et des tests de la distance ; à égalité, la plus ancienne (ordre de la Vue).
function meilleurRecord(seances: readonly SeanceVue[], distance_km: number): RecordNiveau | null {
  let meilleur: RecordNiveau | null = null;
  for (const s of seances) {
    if (!estChrono(s) || s.distanceRef_km !== distance_km || s.temps_s === null) continue;
    if (meilleur === null || s.temps_s < meilleur.temps_s) meilleur = { temps_s: s.temps_s, date: s.date };
  }
  return meilleur;
}

function estChrono(s: SeanceVue): boolean {
  return s.type === 'course' || s.type === 'test';
}
