import { decomposerDate, instantUtc } from './dates';
import type { DateCivile, ModifDatee, ParamsDates, ParamsGlobaux, Parametres } from './types';

// Défauts de 06, « Champs ».
const DATES_PAR_DEFAUT: ParamsDates = {
  hrMax: 188,
  hrRest: 46,
  z1: 68,
  z2: 78,
  z3: 85,
  z4: 92,
  lt2Hr: 172,
  lt2Pace: 238,
  easyCap: 140,
  subtHrLo: 160,
  subtHrHi: 168,
};

const GLOBAUX_PAR_DEFAUT: ParamsGlobaux = {
  refHr: 164,
  paceHrK: 1.1,
  ctlDays: 42,
  atlDays: 7,
  subtPctLo: 20,
  subtPctHi: 25,
};

const CLES_DATEES = [
  'hrMax',
  'hrRest',
  'z1',
  'z2',
  'z3',
  'z4',
  'lt2Hr',
  'lt2Pace',
  'easyCap',
  'subtHrLo',
  'subtHrHi',
] satisfies readonly (keyof ParamsDates)[];

export function parametresDefaut(): Parametres {
  return { globaux: { ...GLOBAUX_PAR_DEFAUT }, modifs: [] };
}

/** Un index des modifications, prêt à répondre pour une date donnée (ADR 0006). */
export interface IndexParametres {
  auJour(date: DateCivile): ParamsDates;
}

interface ModifIndexee {
  modif: ModifDatee;
  instant: number; // enregistreLe en millisecondes UTC
}

/**
 * Indexe les modifications par paramètre, triées une seule fois : par date d'effet,
 * puis par instant d'enregistrement, puis par identifiant. Chaque lecture est une
 * recherche binaire. L'entrée n'est pas modifiée.
 */
export function indexerParametres(params: Parametres): IndexParametres {
  const parCle = new Map<keyof ParamsDates, ModifIndexee[]>();
  for (const modif of params.modifs) {
    decomposerDate(modif.dateEffet);
    const indexee = { modif, instant: instantUtc(modif.enregistreLe) };
    const groupe = parCle.get(modif.cle);
    if (groupe === undefined) {
      parCle.set(modif.cle, [indexee]);
    } else {
      groupe.push(indexee);
    }
  }
  for (const groupe of parCle.values()) {
    groupe.sort(ordreChronologique);
  }

  return {
    auJour(date: DateCivile): ParamsDates {
      const resultat: ParamsDates = { ...DATES_PAR_DEFAUT };
      for (const cle of CLES_DATEES) {
        const groupe = parCle.get(cle);
        const valeur = groupe === undefined ? undefined : valeurEnVigueur(groupe, date);
        if (valeur !== undefined) {
          resultat[cle] = valeur;
        }
      }
      return resultat;
    },
  };
}

/**
 * Valeurs des paramètres datés en vigueur à un jour donné (D-006, ADR 0005).
 * La valeur retenue est celle de la dernière modification dont la date d'effet
 * est ≤ au jour. Avant la première modification, c'est la première valeur qui
 * s'applique. À même date d'effet, la modification enregistrée la plus récente l'emporte.
 */
export function parametresAuJour(params: Parametres, date: DateCivile): ParamsDates {
  return indexerParametres(params).auJour(date);
}

// Le groupe est trié. On cherche la dernière modification dont la date d'effet est ≤ au
// jour ; s'il n'y en a aucune, c'est la première (D-006).
function valeurEnVigueur(groupe: ModifIndexee[], date: DateCivile): number | undefined {
  let bas = 0;
  let haut = groupe.length;
  while (bas < haut) {
    const milieu = (bas + haut) >>> 1;
    const candidat = groupe[milieu];
    if (candidat !== undefined && candidat.modif.dateEffet <= date) {
      bas = milieu + 1;
    } else {
      haut = milieu;
    }
  }
  return groupe[Math.max(bas - 1, 0)]?.modif.valeur;
}

function ordreChronologique(a: ModifIndexee, b: ModifIndexee): number {
  if (a.modif.dateEffet !== b.modif.dateEffet) {
    return a.modif.dateEffet < b.modif.dateEffet ? -1 : 1;
  }
  if (a.instant !== b.instant) {
    return a.instant < b.instant ? -1 : 1;
  }
  const { id: idA } = a.modif;
  const { id: idB } = b.modif;
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

/** Une modification de l'historique affiché par 06 : « ancienne → nouvelle valeur » (ancienne nulle pour la première). */
export interface ModificationHistorique {
  id: string;
  cle: keyof ParamsDates;
  dateEffet: DateCivile;
  ancienne: number | null;
  nouvelle: number;
  enregistreLe: string;
}

/**
 * Les modifications triées par (paramètre, date d'effet, instant d'enregistrement, identifiant). L'instant se compare
 * en instants, non en texte. Les copies rendues ne partagent rien avec l'entrée.
 */
export function trierModifs(modifs: readonly ModifDatee[]): ModifDatee[] {
  return modifs
    .map((modif) => ({ modif, instant: instantUtc(modif.enregistreLe) }))
    .sort((a, b) => comparer(a.modif.cle, b.modif.cle) || comparer(a.modif.dateEffet, b.modif.dateEffet) || a.instant - b.instant || comparer(a.modif.id, b.modif.id))
    .map(({ modif }) => ({ ...modif }));
}

/**
 * Historique des modifications pour l'affichage de 06 (D-006). `ancienne` est la valeur de la modification précédente
 * du même paramètre, dans l'ordre de `trierModifs` ; elle est nulle pour la première. La liste va de la date d'effet
 * la plus récente à la plus ancienne. L'entrée n'est pas modifiée.
 */
export function historiqueModifications(params: Parametres): ModificationHistorique[] {
  const precedente = new Map<keyof ParamsDates, number>();
  const historique = trierModifs(params.modifs).map((modif): ModificationHistorique => {
    const ancienne = precedente.get(modif.cle) ?? null;
    precedente.set(modif.cle, modif.valeur);
    return {
      id: modif.id,
      cle: modif.cle,
      dateEffet: modif.dateEffet,
      ancienne,
      nouvelle: modif.valeur,
      enregistreLe: modif.enregistreLe,
    };
  });
  return historique.sort(
    (a, b) =>
      comparer(b.dateEffet, a.dateEffet) ||
      instantUtc(b.enregistreLe) - instantUtc(a.enregistreLe) ||
      comparer(b.id, a.id),
  );
}

function comparer<T extends string>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
