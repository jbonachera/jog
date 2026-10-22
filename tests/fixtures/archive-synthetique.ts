// Archive synthétique de 60 jours pour tests/scripts/verif-reel (ADR 0010, 0011) : footings, séances sous-seuil avec
// tours manuels, une sortie longue à dérive et une course nommée. Construite par code, jamais tirée d'un export réel.
import { strToU8, zipSync } from 'fflate';
import { encoderFit, type EchantillonFit, type TourFit } from './encodeur-fit';

export const NOM_SECRET = 'Footing-Secret-123';
/** 2026-08-22, 08:00 à Paris : J−60 pour J = 2026-10-21. */
export const DEBUT_PERIODE = Date.UTC(2026, 7, 22, 6, 0);
/** Durée de l'archive de 14 mois (tests de bout en bout) : 426 jours, le dernier étant le 2026-10-20. */
export const JOURS_14_MOIS = 426;
const JOUR_MS = 86_400_000;


/** Un tronçon : durée en secondes, FC constante, vitesse constante (m/s). */
type Troncon = [duree_s: number, fc: number, vitesse: number];

/** Échantillons toutes les `pas` secondes, pour une suite de tronçons (durées multiples de `pas`). */
function echantillons(troncons: Troncon[], pas: number): { records: EchantillonFit[]; fins: number[] } {
  const records: EchantillonFit[] = [];
  const fins: number[] = [];
  let t = 0;
  let dist = 0;
  for (const [duree, fc, v] of troncons) {
    for (let k = 0; k < duree; k += pas) {
      records.push({ t, dist, fc, vit: v });
      dist += v * pas;
      t += pas;
    }
    fins.push(t);
  }
  records.push({ t, dist, fc: troncons.at(-1)?.[1] ?? 0, vit: troncons.at(-1)?.[2] ?? 0 });
  return { records, fins };
}

/**
 * Un FIT de course : sans tours, ou avec des tours manuels (intensités Strava) aux fins données. Les footings « matin »
 * sont à 1 Hz, pour le chemin « FC à 1 s » (D-013) ; le reste est à 5 Hz, comme la plupart des exports réels.
 */
function fit(debut: number, troncons: Troncon[], pas: number, tours: { fin: number; intensite?: TourFit['intensity'] }[] = []): Uint8Array {
  const { records } = echantillons(troncons, pas);
  const laps: TourFit[] = tours.map((tour) => ({ fin: tour.fin, trigger: 'manuel', ...(tour.intensite ? { intensity: tour.intensite } : {}) }));
  return encoderFit({ debut, decalageLocal_min: 120, sport: 1, subSport: 2, records, laps, fabricant: 265 });
}

/** Une séance sous-seuil : échauffement, six répétitions de 6 min à 168 bpm, récupérations de 90 s, retour au calme. */
function sousSeuil(debut: number): Uint8Array {
  const troncons: Troncon[] = [[600, 135, 3.0]];
  for (let k = 0; k < 6; k++) {
    troncons.push([360, 168, 3.9]);
    if (k < 5) troncons.push([90, 140, 2.5]);
  }
  troncons.push([360, 130, 3.0]);
  const fins = echantillons(troncons, 5).fins;
  const tours: { fin: number; intensite?: TourFit['intensity'] }[] = [{ fin: fins[0] ?? 0, intensite: 'echauffement' }];
  for (let k = 0; k < 6; k++) {
    tours.push({ fin: fins[1 + 2 * k] ?? 0, intensite: 'actif' });
    if (k < 5) tours.push({ fin: fins[2 + 2 * k] ?? 0, intensite: 'recuperation' });
  }
  tours.push({ fin: fins.at(-1) ?? 0, intensite: 'retour' });
  return fit(debut, troncons, 5, tours);
}

/**
 * Une sortie longue de 100 min : 75 min faciles, un segment de 15 min à 160 bpm (allure marathon, hors du dernier quart),
 * puis 10 min faciles, de sorte que la FC mesurée 5 min après le segment existe (D-005).
 */
function sortieLongue(debut: number): Uint8Array {
  return fit(debut, [[4500, 140, 3.0], [900, 160, 3.0], [600, 140, 3.0]], 5);
}

/** Un footing à FC basse, de 45 minutes. */
function footing(debut: number, pas: number): Uint8Array {
  return fit(debut, [[2700, 135, 3.0]], pas);
}

/** Une course de 10 km en 42 minutes. */
function course(debut: number): Uint8Array {
  return fit(debut, [[2520, 172, 3.97]], 5);
}

/**
 * L'archive synthétique : `jours` jours (60 par défaut, 426 pour 14 mois), qui se terminent le 2026-10-20. Avec footings,
 * séances sous-seuil avec tours, une sortie longue et une course nommée (à J−10).
 */
export function archiveSynthetique(jours = 60): Uint8Array {
  const lignes: string[] = [];
  const fichiers: Record<string, Uint8Array> = {};
  const premier = DEBUT_PERIODE - (jours - 60) * JOUR_MS;
  for (let i = 0; i < jours; i++) {
    const debut = premier + i * JOUR_MS;
    const id = String(1_000_000 + i);
    let nom = 'Séance';
    const type = 'Course à pied';
    let octets: Uint8Array | null = null;
    if (i === jours - 10) {
      nom = '10k adidas';
      octets = course(debut);
    } else if (i % 7 === 1) {
      nom = i === 8 ? NOM_SECRET : 'Footing matin';
      octets = footing(debut, 1);
    } else if (i % 7 === 3) {
      nom = 'Fractionné';
      octets = sousSeuil(debut);
    } else if (i % 7 === 5) {
      nom = 'Footing soir';
      octets = footing(debut, 5);
    } else if (i % 7 === 6) {
      nom = 'Sortie longue';
      octets = sortieLongue(debut);
    }
    if (octets === null) continue;
    lignes.push(`${id},${nom},${type},activities/${id}.fit`);
    fichiers[`activities/${id}.fit`] = octets;
  }
  fichiers['activities.csv'] = strToU8(`ID de l'activité,Nom de l'activité,Type d'activité,Nom du fichier\n${lignes.join('\n')}\n`);
  return zipSync(fichiers);
}
