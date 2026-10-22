// Étape ④ : ratio de progressivité 7 j / 30 j en km (04, D-003). Fonction pure.
import type { JourAgrege } from '../jours';
import { verifierContigus } from './commun';
import type { PointRatio } from './types';

// r n'est défini qu'à partir du 30ᵉ jour d'historique (04).
const JOURS_HISTORIQUE_MIN = 30;

/**
 * s7(d) = Σ km(d−6 … d) ; chronic(d) = Σ km(d−29 … d) ÷ 30 × 7 ; r = s7 ÷ chronic.
 * Un jour avant le premier de la série compte 0 km.
 */
export function serieRatio(jours: readonly JourAgrege[]): PointRatio[] {
  verifierContigus(jours);
  const kms = jours.map((jour) => jour.km);

  // Somme des km des indices du, au ; les indices négatifs (avant le jour 1) valent 0.
  const sommeKm = (du: number, au: number): number => {
    let total = 0;
    for (let k = Math.max(du, 0); k <= au; k++) {
      total += kms[k] ?? 0;
    }
    return total;
  };

  return jours.map((jour, i) => {
    const s7 = sommeKm(i - 6, i);
    const chronic = (sommeKm(i - 29, i) / 30) * 7;
    const historiqueSuffisant = i + 1 >= JOURS_HISTORIQUE_MIN;
    return {
      date: jour.date,
      s7,
      chronic,
      r: historiqueSuffisant && chronic !== 0 ? s7 / chronic : null,
    };
  });
}
