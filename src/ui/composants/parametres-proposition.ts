// Construction de la proposition de paramètres à partir du formulaire (06, « Validation », D-006, D-010). Fonction pure :
// elle applique les règles 1 et 2 de 06 (qui se vérifient dans l'interface), puis `validerParametres` pour les règles 3,
// 4 et la date d'effet, avant tout envoi au Worker. Le premier échec rend le champ fautif et son message.
import { estDateCivile } from '../../core/dates';
import { indexerParametres } from '../../core/parametres';
import type { DateCivile, ModifDatee, ParamsDates, ParamsGlobaux, Parametres } from '../../core/types';
import { MESSAGE_FUTUR, validerParametres } from '../../core/validationParametres';
import { CLES_DATEES, mmssVersSecondes, tousLesChamps, type CleDatee } from './parametres-champs';

/** Ce que l'athlète a saisi : la date « À partir du » et le texte de chaque champ, par clé. */
export interface SaisieParametres {
  dateEffet: string;
  valeurs: Record<string, string>;
}

/** Ce qui était affiché avant la saisie : les valeurs en vigueur à J−1, les globaux et l'historique (06). */
export interface ReferenceParametres {
  globaux: ParamsGlobaux;
  datesAJm1: ParamsDates;
  modifs: ModifDatee[];
}

export type ResultatProposition = { ok: true; proposes: Parametres } | { ok: false; champ: string; message: string };

/** Messages de 06, « Validation, au moment d'enregistrer ». Ils sont repris tels quels. */
export const MESSAGE_ALLURE = 'Allure au seuil : utilisez le format m:ss, par exemple 4:02.';
export const MESSAGE_DATE_INVALIDE = 'La date d’effet n’est pas une date valide.';

/** Champs numériques du formulaire, dans l'ordre d'affichage (tout sauf l'allure au seuil, saisie en m:ss). */
const CHAMPS_NUMERIQUES = tousLesChamps().filter((champ) => champ.mmss !== true);

/** Le champ de l'allure au seuil, qui a sa propre règle de format (règle 2). */
const CHAMP_ALLURE = tousLesChamps().find((champ) => champ.cle === 'lt2Pace');

export function construireProposition(
  saisie: SaisieParametres,
  reference: ReferenceParametres,
  J: DateCivile,
  instant: string,
  nouvelId: () => string,
): ResultatProposition {
  if (!estDateCivile(saisie.dateEffet)) return echec('dateEffet', MESSAGE_DATE_INVALIDE);
  // Une date future est refusée même si aucune valeur datée n'a changé : sans modification, `validerParametres` ne la verrait pas.
  if (saisie.dateEffet > J) return echec('dateEffet', MESSAGE_FUTUR);

  // Règle 1 : tout champ numérique est présent, fini et strictement positif. L'allure vide relève aussi de la règle 1.
  const nombres = new Map<string, number>();
  for (const champ of CHAMPS_NUMERIQUES) {
    const brut = (saisie.valeurs[champ.cle] ?? '').trim();
    const valeur = brut === '' ? Number.NaN : Number(brut);
    if (!(Number.isFinite(valeur) && valeur > 0)) {
      return echec(champ.cle, `Valeur manquante ou invalide : ${champ.libelle}.`);
    }
    nombres.set(champ.cle, valeur);
  }
  if ((saisie.valeurs.lt2Pace ?? '').trim() === '') {
    return echec('lt2Pace', `Valeur manquante ou invalide : ${CHAMP_ALLURE?.libelle ?? 'Allure au seuil'}.`);
  }

  // Règle 2 : l'allure au seuil est au format m:ss.
  const secondes = mmssVersSecondes(saisie.valeurs.lt2Pace ?? '');
  if (secondes === null) return echec('lt2Pace', MESSAGE_ALLURE);
  nombres.set('lt2Pace', secondes);

  const lire = (cle: string): number => nombres.get(cle) ?? Number.NaN;
  const globaux: ParamsGlobaux = {
    refHr: lire('refHr'),
    paceHrK: lire('paceHrK'),
    ctlDays: lire('ctlDays'),
    atlDays: lire('atlDays'),
    subtPctLo: lire('subtPctLo'),
    subtPctHi: lire('subtPctHi'),
  };

  // Un champ daté est « changé » s'il diffère de la valeur en vigueur à la date « À partir du » choisie (D-006).
  const enVigueur = indexerParametres({ globaux: reference.globaux, modifs: reference.modifs }).auJour(saisie.dateEffet);
  const nouvelles: ModifDatee[] = CLES_DATEES.filter((cle: CleDatee) => lire(cle) !== enVigueur[cle]).map((cle) => ({
    id: nouvelId(),
    cle,
    valeur: lire(cle),
    dateEffet: saisie.dateEffet,
    enregistreLe: instant,
  }));

  const proposes: Parametres = {
    globaux,
    modifs: [...reference.modifs.map((modif) => ({ ...modif })), ...nouvelles],
  };

  return verifier(proposes, J);
}

/**
 * Proposition de « Utiliser » (D-019) : les paramètres enregistrés, plus une seule modification de FC max datée de la
 * séance (D-006). La saisie en cours du formulaire n'y entre pas. Même validation que le formulaire.
 */
export function construirePropositionHrMax(
  suggestion: { bpm: number; date: DateCivile },
  reference: ReferenceParametres,
  J: DateCivile,
  instant: string,
  nouvelId: () => string,
): ResultatProposition {
  const proposes: Parametres = {
    globaux: { ...reference.globaux },
    modifs: [
      ...reference.modifs.map((modif) => ({ ...modif })),
      { id: nouvelId(), cle: 'hrMax', valeur: suggestion.bpm, dateEffet: suggestion.date, enregistreLe: instant },
    ],
  };
  return verifier(proposes, J);
}

/** Date d'effet future, règles 3 et 4 : `validerParametres` fait foi, et le Worker revalide la même chose. */
function verifier(proposes: Parametres, J: DateCivile): ResultatProposition {
  const verdict = validerParametres(proposes, J);
  if (!verdict.ok) return echec(verdict.champ, verdict.message);
  return { ok: true, proposes };
}

function echec(champ: string, message: string): ResultatProposition {
  return { ok: false, champ, message };
}
