// Étape ②b (ADR 0006, 07 règles 1 à 4) : type de chaque séance, avec le contexte de sa semaine.
// Pure et déterministe : le résultat ne dépend pas de l'ordre d'entrée.
import {
  DUREE_SORTIE_LONGUE_MIN,
  FACTEUR_SORTIE_LONGUE_SEMAINE,
} from '../constantes';
import { lundiISO } from '../dates';
import type { DateCivile, Seance, SeanceIntrinseque, TypeSeance } from '../types';
import { mediane } from './repetitions';

/** Classe les séances intrinsèques (étape ②a) : chacune reçoit son type (07, règles 1 à 4). */
export function classerSeances(intrinseques: SeanceIntrinseque[]): Seance[] {
  const ordonnees = [...intrinseques].sort(comparerSeances);

  const parSemaine = new Map<DateCivile, SeanceIntrinseque[]>();
  for (const s of ordonnees) {
    const lundi = lundiISO(s.date);
    const groupe = parSemaine.get(lundi);
    if (groupe === undefined) parSemaine.set(lundi, [s]);
    else groupe.push(s);
  }

  // Sorties longues par la semaine (règle 3) : la plus longue séance de la semaine, si elle dépasse
  // 1,5 × la médiane des footings. En cas d'égalité, la première dans l'ordre. « La plus longue » se lit
  // littéralement : une course ou un sous-seuil plus long que tout la rend sans effet, et `typer` l'ignore.
  const sortiesLonguesParSemaine = new Set<SeanceIntrinseque>();
  for (const semaine of parSemaine.values()) {
    const mediane_min = medianeDesFootings(semaine);
    if (mediane_min === null) continue;
    const plusLongue = semaine.reduce((meilleure, s) => (s.duree_min > meilleure.duree_min ? s : meilleure));
    if (plusLongue.duree_min > FACTEUR_SORTIE_LONGUE_SEMAINE * mediane_min) sortiesLonguesParSemaine.add(plusLongue);
  }

  return ordonnees.map((s) => ({ ...s, type: typer(s, sortiesLonguesParSemaine) }));
}

function typer(s: SeanceIntrinseque, sortiesLonguesParSemaine: Set<SeanceIntrinseque>): TypeSeance {
  if (s.marquage === 'course') return 'course';
  if (s.marquage === 'test') return 'test';
  if (s.repetitions.length > 0) return 'sous-seuil';
  if (s.duree_min >= DUREE_SORTIE_LONGUE_MIN || sortiesLonguesParSemaine.has(s)) return 'sortie-longue';
  return s.lignesDroites ? 'footing-lignes-droites' : 'footing';
}

// Footings de la semaine : ni course ni test, sans répétition, et de moins de 90 min (règle 3, sans cercle).
function medianeDesFootings(semaine: SeanceIntrinseque[]): number | null {
  const durees = semaine
    .filter((s) => !estEnCompetition(s) && s.repetitions.length === 0 && s.duree_min < DUREE_SORTIE_LONGUE_MIN)
    .map((s) => s.duree_min);
  return mediane(durees);
}

function estEnCompetition(s: SeanceIntrinseque): boolean {
  return s.marquage === 'course' || s.marquage === 'test';
}

function comparerSeances(a: SeanceIntrinseque, b: SeanceIntrinseque): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.debutUtc !== b.debutUtc) return a.debutUtc < b.debutUtc ? -1 : 1;
  if (a.cleSource !== b.cleSource) return a.cleSource < b.cleSource ? -1 : 1;
  return 0;
}
