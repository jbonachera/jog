// Étape ⑥ (05, « Règle du verdict », « Fourchette », D-007, D-008, D-015).
import { arrondir } from '../arrondi';
import { FOURCHETTE, MINIMUMS, SEUILS } from '../constantes';
import type { CleSignal, Signal, Verdict } from '../types';
import { enumerer, jours } from './commun';
import type { EntreesDecision, Fourchette } from './types';

type SemaineEntree = EntreesDecision['semaines'][number];

// Signaux décisifs : seuls eux peuvent déclencher « Alléger », et seuls eux empêchent « Augmenter ».
const DECISIFS: readonly CleSignal[] = ['progressivite', 'fraicheur', 'reponse', 'decouplage'];

export interface VerdictEtPhrase {
  verdict: Verdict;
  phrase: string;
}

/**
 * Le verdict et sa phrase, d’après les 7 signaux (05). `manqueProgressivite` sert à la phrase
 * « Pas encore de verdict ».
 */
export function verdictDe(signaux: readonly Signal[], manqueProgressivite: number): VerdictEtPhrase {
  const progressivite = signaux.find((s) => s.cle === 'progressivite');
  if (progressivite?.etat === 'insuffisant') {
    // Sans historique suffisant, la phrase dit ce qui manque. Avec l’historique, c’est la phrase du signal :
    // « Aucun km sur les 30 derniers jours. » (ratio indéfini).
    return {
      verdict: 'aucun',
      phrase:
        manqueProgressivite > 0
          ? `Il faut ${MINIMUMS.progressiviteJours} jours d’historique pour comparer la semaine au mois (encore ${jours(manqueProgressivite)}).`
          : progressivite.explication,
    };
  }

  const decisifs = signaux.filter((s) => DECISIFS.includes(s.cle));
  const alertesDecisives = decisifs.filter((s) => s.etat === 'alerte');
  if (alertesDecisives.length > 0) {
    return { verdict: 'alleger', phrase: `À surveiller en priorité : ${noms(alertesDecisives)}.` };
  }

  const insuffisantsDecisifs = decisifs.filter((s) => s.etat === 'insuffisant');
  const aSurveiller = signaux.filter((s) => s.etat === 'surveiller' || s.etat === 'alerte');
  if (aSurveiller.length > 0) {
    const titre = aSurveiller.length === 1 ? 'Point à surveiller' : 'Points à surveiller';
    let phrase = `Rien d’alarmant, mais mieux vaut consolider avant de monter. ${titre} : ${noms(aSurveiller)}.`;
    if (insuffisantsDecisifs.length > 0) {
      phrase += ` Pas assez de données sur : ${noms(insuffisantsDecisifs)}.`;
    }
    return { verdict: 'maintenir', phrase };
  }

  if (insuffisantsDecisifs.length > 0) {
    return {
      verdict: 'maintenir',
      phrase: `Aucun signal défavorable, mais pas assez de données pour conseiller une hausse : ${noms(insuffisantsDecisifs)}.`,
    };
  }

  const insuffisantAilleurs = signaux.some((s) => s.etat === 'insuffisant');
  return {
    verdict: 'augmenter',
    phrase: insuffisantAilleurs
      ? 'Tous les signaux disponibles sont au vert : la charge actuelle est absorbée.'
      : 'Tous les signaux sont au vert : la charge actuelle est absorbée.',
  };
}

/**
 * La fourchette des 7 prochains jours (05). La référence est le km de la dernière semaine terminée
 * quand le verdict n’est pas « Alléger » et que le palier atteint 2 ; sinon chronic(J−1).
 * Les bornes sont arrondies au km.
 */
export function fourchetteDe(
  verdict: Verdict,
  entrees: Pick<EntreesDecision, 'semaines' | 'palier'>,
  chronic: number | undefined,
): Fourchette | null {
  if (verdict === 'aucun' || chronic === undefined || !Number.isFinite(chronic)) return null;

  const coefficients = FOURCHETTE[verdict];
  const derniere = derniereSemaineTerminee(entrees.semaines);
  const palierAtteint = entrees.palier.semaines >= SEUILS.palier.semainesOk;
  const parPalier = verdict !== 'alleger' && palierAtteint && derniere !== undefined;
  const reference = parPalier ? derniere.km : chronic;
  return {
    min: arrondir(reference * coefficients.min, 1),
    max: arrondir(reference * coefficients.max, 1),
    reference,
    sourceReference: parPalier ? 'palier' : 'moyenne30j',
  };
}

function derniereSemaineTerminee(semaines: EntreesDecision['semaines']): SemaineEntree | undefined {
  let derniere: SemaineEntree | undefined;
  for (const semaine of semaines) {
    if (semaine.statut !== 'terminee') continue;
    if (derniere === undefined || semaine.lundi > derniere.lundi) derniere = semaine;
  }
  return derniere;
}

function noms(signaux: readonly Signal[]): string {
  return enumerer(signaux.map((s) => s.nom));
}
