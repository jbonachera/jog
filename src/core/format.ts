import { arrondirDecimales } from './arrondi';
import { estDateCivile, jourDeSemaine } from './dates';
import type { DateCivile } from './types';

// Rédaction en français (08, « Rédaction »).
const ESPACE_INSECABLE = ' ';
const MOINS = '−';

const JOURS_ABREGES = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MOIS_ABREGES = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
// Valeur absente ou invalide (tiret demi-cadratin).
const TIRET = '–';

/** Nombre à virgule décimale, espace des milliers, vrai signe moins. */
export function formatNombre(valeur: number, decimales = 0): string {
  const arrondie = arrondirDecimales(valeur, decimales);
  const [partieEntiere = '', partieDecimale] = Math.abs(arrondie).toFixed(decimales).split('.');
  const groupee = partieEntiere.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_INSECABLE);
  const corps = partieDecimale === undefined ? groupee : `${groupee},${partieDecimale}`;
  return (arrondie < 0 ? MOINS : '') + corps;
}

/** Écart : signe plus explicite pour une valeur positive, vrai signe moins pour une négative. */
export function formatEcart(valeur: number, decimales = 0): string {
  const arrondie = arrondirDecimales(valeur, decimales);
  return (arrondie > 0 ? '+' : '') + formatNombre(arrondie, decimales);
}

/** Allure en secondes par km, écrite m:ss (238 s → 3:58). */
export function formatAllure(secondesParKm: number): string {
  if (!Number.isFinite(secondesParKm) || secondesParKm < 0) {
    return TIRET;
  }
  const total = arrondirDecimales(secondesParKm, 0);
  const minutes = Math.floor(total / 60);
  const secondes = total - minutes * 60;
  return `${minutes}:${pad2(secondes)}`;
}

/** Durée en minutes, écrite h:mm (479 min → 7h59). */
export function formatDuree(minutes: number): string {
  const total = arrondirDecimales(minutes, 0);
  const heures = Math.floor(total / 60);
  const reste = total - heures * 60;
  return `${heures}h${pad2(reste)}`;
}

/** Pourcentage, avec une espace insécable avant le signe (22 %). */
export function formatPourcentage(valeur: number, decimales = 0): string {
  return `${formatNombre(valeur, decimales)}${ESPACE_INSECABLE}%`;
}

/** Écart en points de pourcentage (+2 pt). */
export function formatEcartPoints(valeur: number, decimales = 0): string {
  return `${formatEcart(valeur, decimales)}${ESPACE_INSECABLE}pt`;
}

/** Date courte (19 oct.). */
export function formatDate(d: DateCivile): string {
  if (!estDateCivile(d)) {
    return TIRET;
  }
  const jour = Number(d.slice(8, 10));
  const mois = Number(d.slice(5, 7));
  return `${jour} ${MOIS_ABREGES[mois - 1]}`;
}

/** Date courte avec l'année sur deux chiffres (12 oct. 26), pour une colonne ou une infobulle qui couvre plusieurs saisons. */
export function formatDateAnnee(d: DateCivile): string {
  if (!estDateCivile(d)) {
    return TIRET;
  }
  return `${formatDate(d)} ${d.slice(2, 4)}`;
}

/** Jour de la semaine et date (dim. 18 oct.). */
export function formatJourDate(d: DateCivile): string {
  if (!estDateCivile(d)) {
    return TIRET;
  }
  return `${JOURS_ABREGES[jourDeSemaine(d)]} ${formatDate(d)}`;
}

/** Semaine repérée par son lundi (semaine du 12 oct.). */
export function formatSemaine(lundi: DateCivile): string {
  return `semaine du ${formatDate(lundi)}`;
}

function pad2(valeur: number): string {
  return String(valeur).padStart(2, '0');
}

/** Temps d'une course en secondes : h:mm:ss au-delà d'une heure (1:31:42), sinon m:ss (19:51). Secondes entières (D-015). */
export function formatTempsCourse(secondes: number): string {
  if (!Number.isFinite(secondes) || secondes < 0) {
    return TIRET;
  }
  const total = arrondirDecimales(secondes, 0);
  const heures = Math.floor(total / 3600);
  const minutes = Math.floor((total - heures * 3600) / 60);
  const reste = total - heures * 3600 - minutes * 60;
  if (heures === 0) {
    return `${minutes}:${pad2(reste)}`;
  }
  return `${heures}:${pad2(minutes)}:${pad2(reste)}`;
}
