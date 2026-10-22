// Validation des paramètres proposés, au moment d'enregistrer (06, « Validation, au moment d'enregistrer »).
// Fonction pure. Les règles s'appliquent au jeu de valeurs en vigueur à chaque date touchée (06) : pour chaque
// date d'effet distincte, et pour la première valeur enregistrée (celle qui vaut avant toute modification).
// Ordre : la structure des modifications, puis la règle 1 sur tous les champs, puis les règles 2, 3 et 4.
// Elle rend le premier échec trouvé, avec le champ fautif. Aucune exception n'en sort.
import { estDateCivile, instantUtc } from './dates';
import { indexerParametres } from './parametres';
import type { DateCivile, ParamsDates, Parametres } from './types';

export type ResultatValidation = { ok: true } | { ok: false; champ: string; message: string };

const CLES_GLOBAUX = ['refHr', 'paceHrK', 'ctlDays', 'atlDays', 'subtPctLo', 'subtPctHi'] as const;
const CLES_DATEES = ['hrMax', 'hrRest', 'z1', 'z2', 'z3', 'z4', 'lt2Hr', 'lt2Pace', 'easyCap', 'subtHrLo', 'subtHrHi'] as const;

/** Libellés de 06, « Champs ». Ils servent au message « Valeur manquante ou invalide : {libellé}. ». */
export const LIBELLES: Record<(typeof CLES_GLOBAUX | typeof CLES_DATEES)[number], string> = {
  refHr: 'FC de référence pour l’allure normalisée',
  paceHrK: 'Coefficient allure ↔ FC',
  ctlDays: 'Forme de fond (CTL)',
  atlDays: 'Fatigue (ATL)',
  subtPctLo: 'Part de sous-seuil, min',
  subtPctHi: 'Part de sous-seuil, max',
  hrMax: 'FC max',
  hrRest: 'FC repos',
  z1: 'Limite haute de la zone 1',
  z2: 'Limite haute de la zone 2',
  z3: 'Limite haute de la zone 3',
  z4: 'Limite haute de la zone 4',
  lt2Hr: 'FC au seuil',
  lt2Pace: 'Allure au seuil',
  easyCap: 'Plafond des footings',
  subtHrLo: 'FC de fin de répétition, bas',
  subtHrHi: 'FC de fin de répétition, haut',
};

/** Messages de 06, « Validation, au moment d'enregistrer », et de sa forme (règles 3 et 4, date d'effet). */
export const MESSAGE_FUTUR = 'La date d’effet ne peut pas être dans le futur.';
/** Ajout à 06 : la spécification ne prévoit pas ce cas (voir le compte rendu de la correction). */
export const MESSAGE_FORMAT_DATE = 'La date d’effet n’est pas une date valide.';
export const MESSAGE_FORMAT_ALLURE = 'Allure au seuil : utilisez le format m:ss, par exemple 4:02.';
export const MESSAGE_PACE_HR_K = 'Coefficient allure ↔ FC : choisissez une valeur entre 0,6 et 3.';
export const MESSAGE_BORNES = 'Chaque borne basse doit être inférieure à la borne haute, et les zones doivent croître.';
/** Forme d'une modification : instant d'enregistrement invalide, identifiant absent. */
export const MESSAGE_ENREGISTREMENT = 'La date d’enregistrement n’est pas valide.';
export const MESSAGE_ID_ABSENT = 'Identifiant de modification absent.';

/** Date antérieure à toute date d'effet : le jeu qu'elle désigne est celui d'avant la première modification. */
const AVANT_TOUT = '0000-01-01';

/**
 * Valide les paramètres proposés, à la date J. Le champ fautif est une clé de paramètre, ou `dateEffet`, ou `id`,
 * ou `enregistreLe`. Pour une paire `a < b` violée, le champ renvoyé est `b` ; pour `z4 < 100`, c'est `z4`.
 */
export function validerParametres(proposes: Parametres, J: DateCivile): ResultatValidation {
  const structure = verifierStructure(proposes);
  if (!structure.ok) return structure;

  for (const modif of proposes.modifs) {
    if (modif.dateEffet > J) return echec('dateEffet', MESSAGE_FUTUR);
  }

  // Règle 1 sur tous les champs, d'abord : globaux, puis le jeu de chaque date touchée.
  const index = indexerParametres(proposes);
  const dates = [...new Set([AVANT_TOUT, ...proposes.modifs.map((m) => m.dateEffet)])].sort();
  const jeux = dates.map((date) => ({ date, jeu: index.auJour(date) }));
  for (const cle of CLES_GLOBAUX) {
    if (!estPositif(proposes.globaux[cle])) return manquante(cle);
  }
  for (const { jeu } of jeux) {
    for (const cle of CLES_DATEES) {
      if (!estPositif(jeu[cle])) return manquante(cle);
    }
  }

  // Règles 3, 2 et 4, ensuite.
  if (proposes.globaux.paceHrK < 0.6 || proposes.globaux.paceHrK > 3) return echec('paceHrK', MESSAGE_PACE_HR_K);
  if (!(proposes.globaux.subtPctLo < proposes.globaux.subtPctHi)) return echec('subtPctHi', MESSAGE_BORNES);
  for (const { jeu } of jeux) {
    const erreur = validerJeuDate(jeu);
    if (erreur !== undefined) return erreur;
  }
  return { ok: true };
}

/** Règles 2 et 4 appliquées au jeu de valeurs en vigueur à une date (la règle 1 l'a déjà été). */
function validerJeuDate(jeu: ParamsDates): ResultatValidation | undefined {
  if (!Number.isInteger(jeu.lt2Pace)) return echec('lt2Pace', MESSAGE_FORMAT_ALLURE);
  if (!(jeu.subtHrLo < jeu.subtHrHi)) return echec('subtHrHi', MESSAGE_BORNES);
  if (!(jeu.z1 < jeu.z2)) return echec('z2', MESSAGE_BORNES);
  if (!(jeu.z2 < jeu.z3)) return echec('z3', MESSAGE_BORNES);
  if (!(jeu.z3 < jeu.z4)) return echec('z4', MESSAGE_BORNES);
  if (!(jeu.z4 < 100)) return echec('z4', MESSAGE_BORNES);
  return undefined;
}

/**
 * Forme des modifications : clé connue, identifiant non vide et unique, valeur de type nombre, instant d'enregistrement
 * valide. Une forme inconnue est refusée avant tout calcul, sans lever d'exception.
 */
function verifierStructure(proposes: Parametres): ResultatValidation {
  const ids = new Set<string>();
  for (const modif of proposes.modifs) {
    if (typeof modif.dateEffet !== 'string' || !estDateCivile(modif.dateEffet)) return echec('dateEffet', MESSAGE_FORMAT_DATE);
    const cle: string = String(modif.cle);
    if (!(CLES_DATEES as readonly string[]).includes(cle)) return echec(cle, `Paramètre inconnu : ${cle}.`);
    if (typeof modif.id !== 'string' || modif.id === '') return echec('id', MESSAGE_ID_ABSENT);
    if (ids.has(modif.id)) return echec('id', `Identifiant de modification en double : ${modif.id}.`);
    ids.add(modif.id);
    if (typeof modif.valeur !== 'number') return echec(cle, `Valeur non numérique : ${LIBELLES[modif.cle]}.`);
    if (!instantValide(modif.enregistreLe)) return echec('enregistreLe', MESSAGE_ENREGISTREMENT);
  }
  return { ok: true };
}

function instantValide(valeur: unknown): boolean {
  if (typeof valeur !== 'string') return false;
  try {
    instantUtc(valeur);
    return true;
  } catch {
    return false;
  }
}

function estPositif(valeur: number): boolean {
  return Number.isFinite(valeur) && valeur > 0;
}

function manquante(cle: keyof typeof LIBELLES): ResultatValidation {
  return echec(cle, `Valeur manquante ou invalide : ${LIBELLES[cle]}.`);
}

function echec(champ: string, message: string): ResultatValidation {
  return { ok: false, champ, message };
}
