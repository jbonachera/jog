import type { DateCivile, NumeroJour } from './types';

// Calculs sur les dates civiles en arithmétique entière, sans objet Date ni fuseau
// (ADR 0007). Algorithme des jours civils (Howard Hinnant), grégorien proleptique.
// Les années hors de 0000–9999 n'ont pas de forme « AAAA-MM-JJ » : elles lèvent RangeError.

const MS_PAR_JOUR = 86_400_000;
const MS_PAR_HEURE = 3_600_000;
const MS_PAR_MINUTE = 60_000;
const MS_PAR_SECONDE = 1_000;

const EXPRESSION_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EXPRESSION_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

/** Numéro de jour (jours depuis 1970-01-01) d'une date civile « AAAA-MM-JJ ». */
export function numeroJour(d: DateCivile): NumeroJour {
  const { annee, mois, jour } = decomposerDate(d);
  const annee2 = mois <= 2 ? annee - 1 : annee;
  const ere = Math.floor(annee2 / 400);
  const anneeDansEre = annee2 - ere * 400;
  const moisDecale = (mois + 9) % 12; // mars = 0
  const jourDansAnnee = Math.floor((153 * moisDecale + 2) / 5) + jour - 1;
  const jourDansEre =
    anneeDansEre * 365 + Math.floor(anneeDansEre / 4) - Math.floor(anneeDansEre / 100) + jourDansAnnee;
  return ere * 146097 + jourDansEre - 719468;
}

/** Date civile « AAAA-MM-JJ » d'un numéro de jour entier. */
export function dateDepuisNumero(n: NumeroJour): DateCivile {
  if (!Number.isInteger(n)) {
    throw new RangeError(`numéro de jour non entier : ${n}`);
  }
  const z = n + 719468;
  const ere = Math.floor(z / 146097);
  const jourDansEre = z - ere * 146097;
  const anneeDansEre = Math.floor(
    (jourDansEre - Math.floor(jourDansEre / 1460) + Math.floor(jourDansEre / 36524) - Math.floor(jourDansEre / 146096)) /
      365,
  );
  const annee = anneeDansEre + ere * 400;
  const jourDansAnnee = jourDansEre - (365 * anneeDansEre + Math.floor(anneeDansEre / 4) - Math.floor(anneeDansEre / 100));
  const moisDecale = Math.floor((5 * jourDansAnnee + 2) / 153);
  const jour = jourDansAnnee - Math.floor((153 * moisDecale + 2) / 5) + 1;
  const mois = moisDecale < 10 ? moisDecale + 3 : moisDecale - 9;
  const anneeCivile = mois <= 2 ? annee + 1 : annee;
  if (anneeCivile < 0 || anneeCivile > 9999) {
    throw new RangeError(`année hors de 0000–9999 pour le jour ${n}`);
  }
  return `${String(anneeCivile).padStart(4, '0')}-${pad2(mois)}-${pad2(jour)}`;
}

/** Ajoute n jours civils à une date (n entier, peut être négatif). */
export function ajouterJours(d: DateCivile, n: number): DateCivile {
  return dateDepuisNumero(numeroJour(d) + n);
}

/** Jour de la semaine, lundi = 0 … dimanche = 6 (ISO). */
export function jourDeSemaine(d: DateCivile): number {
  // 1970-01-01 est un jeudi : avec lundi = 0, l'indice est (n + 3) modulo 7.
  return (((numeroJour(d) + 3) % 7) + 7) % 7;
}

/** Lundi de la semaine ISO de d. */
export function lundiISO(d: DateCivile): DateCivile {
  return dateDepuisNumero(numeroJour(d) - jourDeSemaine(d));
}

/**
 * Date locale d'une activité : la date civile de son début UTC décalé de son
 * décalage local (ADR 0007). L'arithmétique est en UTC, sans fuseau.
 */
export function dateLocale(debutUtc_ms: number, decalage_min: number): DateCivile {
  return dateDepuisNumero(Math.floor((debutUtc_ms + decalage_min * MS_PAR_MINUTE) / MS_PAR_JOUR));
}

/**
 * Une semaine (du lundi au dimanche) est terminée si son dimanche est ≤ J−1,
 * c'est-à-dire strictement avant J (ADR 0007). Lève RangeError si lundi n'est pas un lundi.
 */
export function semaineTerminee(lundi: DateCivile, J: DateCivile): boolean {
  if (jourDeSemaine(lundi) !== 0) {
    throw new RangeError(`pas un lundi : ${lundi}`);
  }
  return numeroJour(lundi) + 6 < numeroJour(J);
}

/** Année, mois (1 à 12) et jour d'une date civile « AAAA-MM-JJ » ; lève RangeError si elle n'existe pas. */
export function decomposerDate(d: DateCivile): { annee: number; mois: number; jour: number } {
  const resultat = analyserDate(d);
  if (resultat === null) {
    throw new RangeError(`date civile invalide : ${d}`);
  }
  return resultat;
}

/** Vrai si d est une date civile « AAAA-MM-JJ » qui existe (29 février compris). */
export function estDateCivile(d: DateCivile): boolean {
  return analyserDate(d) !== null;
}

/**
 * Instant UTC d'un enregistrement, en millisecondes depuis l'époque, à partir d'une
 * date-heure ISO 8601 terminée par Z (« 2026-04-10T18:00:00Z », fraction de seconde
 * facultative). Lève RangeError si le format diffère (contrat de types.ts).
 */
export function instantUtc(iso: string): number {
  const correspondance = EXPRESSION_INSTANT.exec(iso);
  const date = correspondance === null ? null : analyserDate(`${correspondance[1]}-${correspondance[2]}-${correspondance[3]}`);
  if (correspondance === null || date === null) {
    throw new RangeError(`instant UTC invalide, attendu AAAA-MM-JJThh:mm:ss[.fff]Z : ${iso}`);
  }
  const heure = Number(correspondance[4]);
  const minute = Number(correspondance[5]);
  const seconde = Number(correspondance[6]);
  if (heure > 23 || minute > 59 || seconde > 59) {
    throw new RangeError(`heure hors bornes : ${iso}`);
  }
  const fraction = correspondance[7] ?? '';
  const millisecondes = fraction === '' ? 0 : Number(fraction.padEnd(3, '0'));
  const jours = numeroJour(`${correspondance[1]}-${correspondance[2]}-${correspondance[3]}`);
  return jours * MS_PAR_JOUR + heure * MS_PAR_HEURE + minute * MS_PAR_MINUTE + seconde * MS_PAR_SECONDE + millisecondes;
}

function analyserDate(d: DateCivile): { annee: number; mois: number; jour: number } | null {
  const correspondance = EXPRESSION_DATE.exec(d);
  if (correspondance === null) {
    return null;
  }
  const annee = Number(correspondance[1]);
  const mois = Number(correspondance[2]);
  const jour = Number(correspondance[3]);
  if (mois < 1 || mois > 12 || jour < 1 || jour > joursDuMois(annee, mois)) {
    return null;
  }
  return { annee, mois, jour };
}

function joursDuMois(annee: number, mois: number): number {
  if (mois === 2) {
    return estBissextile(annee) ? 29 : 28;
  }
  return mois === 4 || mois === 6 || mois === 9 || mois === 11 ? 30 : 31;
}

function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

function pad2(valeur: number): string {
  return String(valeur).padStart(2, '0');
}
