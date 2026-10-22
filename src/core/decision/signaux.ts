// Étape ⑤ (05, D-007, D-015) : les 7 signaux à J−1. Chaque mesure est arrondie à sa précision
// d’affichage avant d’être comparée aux seuils. Les paramètres datés sont ceux du jour de la
// séance, sauf pour les phrases, qui citent la valeur à J−1 (D-006).
import { arrondir } from '../arrondi';
import { MINIMUMS, PRECISION, SEANCES_SOUS_SEUIL_SIGNAUX, SEUILS } from '../constantes';
import { formatAllure, formatDate, formatEcart, formatNombre, formatPourcentage } from '../format';
import type { CleSignal, ParamsDates, ParamsGlobaux, Repetition, Seance, Signal } from '../types';
import { dansFenetre, jours, joursManquants } from './commun';
import {
  etatDecouplage,
  etatFootings,
  etatFraicheur,
  etatHorsSousSeuil,
  etatPalier,
  etatProgressivite,
  etatReponse,
} from './etats';
import type { EntreesDecision } from './types';

export const NOMS_SIGNAUX: Record<CleSignal, string> = {
  progressivite: 'Progressivité',
  fraicheur: 'Fraîcheur',
  reponse: "Réponse à l’effort",
  horsSousSeuil: 'Répétitions hors sous-seuil',
  footings: 'Footings sous le plafond',
  decouplage: 'Découplage de la dernière sortie longue',
  palier: 'Palier de volume',
};

/** Phrase d’une mesure qui n’est pas un nombre fini (NaN, infini) : état insuffisant, valeur « – ». */
const NON_CALCULABLE = 'Mesure non calculable.';
/** Phrase du ratio quand il n’y a aucun km sur 30 jours (chronic nul) : il n’est pas défini. */
const RATIO_INDEFINI = 'Aucun km sur les 30 derniers jours.';

interface Contexte {
  e: EntreesDecision;
  J: string;
  veille: string;
  paramsVeille: ParamsDates;
}

/** Tous les signaux, dans l’ordre de la liste de 05. `e.seances` doit être trié (voir `decider`). */
export function calculerSignaux(e: EntreesDecision, veille: string): Signal[] {
  const ctx: Contexte = { e, J: e.J, veille, paramsVeille: e.paramsAuJour(veille) };
  return [
    progressivite(ctx),
    fraicheur(ctx),
    reponse(ctx),
    horsSousSeuil(ctx),
    footings(ctx),
    decouplage(ctx),
    palier(ctx),
  ];
}

function insuffisant(cle: CleSignal, explication: string): Signal {
  return { cle, nom: NOMS_SIGNAUX[cle], etat: 'insuffisant', valeur: null, valeurTexte: '–', explication };
}

// ── 1 · Progressivité : r(J−1) ──────────────────────────────────────────────

function progressivite({ e, veille }: Contexte): Signal {
  const cle = 'progressivite';
  const manque = joursManquants(MINIMUMS.progressiviteJours, e.premierJour, veille);
  if (manque > 0) {
    return insuffisant(cle, `Il faut ${MINIMUMS.progressiviteJours} jours d’historique (encore ${jours(manque)}).`);
  }
  const entree = e.ratio.find((x) => x.date === veille);
  if (entree === undefined || (entree.r !== null && !Number.isFinite(entree.r))) {
    return insuffisant(cle, NON_CALCULABLE);
  }
  if (entree.r === null) {
    return insuffisant(cle, RATIO_INDEFINI);
  }
  const valeur = arrondir(entree.r, PRECISION.progressivite);
  const etat = etatProgressivite(valeur);
  const explication =
    etat === 'ok'
      ? 'Volume récent cohérent avec le mois écoulé.'
      : valeur < SEUILS.progressivite.okMin
        ? 'Semaine nettement plus légère que la moyenne du mois.'
        : 'Les 7 derniers jours dépassent nettement la moyenne du mois.';
  return { cle, nom: NOMS_SIGNAUX[cle], etat, valeur, valeurTexte: formatNombre(valeur, 2), explication };
}

// ── 2 · Fraîcheur : TSB(J−1) ────────────────────────────────────────────────

function fraicheur({ e, veille }: Contexte): Signal {
  const cle = 'fraicheur';
  const manque = joursManquants(MINIMUMS.fraicheurJours, e.premierJour, veille);
  if (manque > 0) {
    return insuffisant(cle, `Il faut ${MINIMUMS.fraicheurJours} jours d’historique pour estimer la fatigue (encore ${jours(manque)}).`);
  }
  const entree = e.serieCharge.find((x) => x.date === veille);
  if (entree === undefined || !Number.isFinite(entree.tsb)) {
    return insuffisant(cle, NON_CALCULABLE);
  }
  const valeur = arrondir(entree.tsb, PRECISION.fraicheur);
  const etat = etatFraicheur(valeur);
  const explication =
    etat === 'alerte'
      ? 'Fatigue nettement au-dessus de ce que la forme absorbe.'
      : etat === 'surveiller'
        ? 'Très frais : il y a de la marge pour charger.'
        : "Fatigue d’entraînement normale.";
  return { cle, nom: NOMS_SIGNAUX[cle], etat, valeur, valeurTexte: formatEcart(valeur, 0), explication };
}

// ── 3 · Réponse à l’effort : allure normalisée, 3 dernières séances contre les 6 précédentes ──

function reponse({ e, veille }: Contexte): Signal {
  const cle = 'reponse';
  const { recentes, precedentes } = SEANCES_SOUS_SEUIL_SIGNAUX;
  const valeurs = seancesSousSeuil(e, veille).map((s) => ({ date: s.date, norm: allureNormaliseeSeance(s, e.globaux) }));

  if (valeurs.length < MINIMUMS.reponseSeancesSousSeuil) {
    return insuffisant(cle, `Il faut ${MINIMUMS.reponseSeancesSousSeuil} séances sous-seuil (${valeurs.length} pour l’instant).`);
  }
  const dernieres = valeurs.slice(-recentes);
  if (!dernieres.every((x) => dansFenetre(x.date, e.J, MINIMUMS.reponseFenetreJours, veille))) {
    return insuffisant(cle, `Moins de ${MINIMUMS.reponseSeancesRecentes} séances sous-seuil sur les ${MINIMUMS.reponseFenetreJours} derniers jours.`);
  }

  const avant = valeurs.slice(-(recentes + precedentes), -recentes);
  const ecart = moyenne(dernieres.map((x) => x.norm)) - moyenne(avant.map((x) => x.norm));
  const valeur = arrondir(ecart, PRECISION.reponseEffort);
  const texte =
    valeur > 0
      ? `${formatNombre(valeur)} s/km plus lent à FC égale`
      : valeur < 0
        ? `${formatNombre(-valeur)} s/km plus rapide à FC égale`
        : '0 s/km, sans écart à FC égale';
  return {
    cle,
    nom: NOMS_SIGNAUX[cle],
    etat: etatReponse(valeur),
    valeur,
    valeurTexte: texte,
    explication: `Allure normalisée à ${e.globaux.refHr} bpm, ${recentes} dernières séances sous-seuil comparées aux ${precedentes} précédentes.`,
  };
}

// ── 4 · Répétitions hors sous-seuil : sur les 3 dernières séances sous-seuil ────

function horsSousSeuil({ e, veille, paramsVeille }: Contexte): Signal {
  const cle = 'horsSousSeuil';
  const sousSeuil = seancesSousSeuil(e, veille);
  const dansLaFenetre = sousSeuil.filter((s) => dansFenetre(s.date, e.J, MINIMUMS.horsSousSeuilFenetreJours, veille));
  if (dansLaFenetre.length < MINIMUMS.horsSousSeuilSeances) {
    return insuffisant(cle, `Moins de ${MINIMUMS.horsSousSeuilSeances} séances sous-seuil sur les ${MINIMUMS.horsSousSeuilFenetreJours} derniers jours.`);
  }

  const recentes = sousSeuil.slice(-SEANCES_SOUS_SEUIL_SIGNAUX.recentes);
  let hors = 0;
  let total = 0;
  for (const s of recentes) {
    const params = e.paramsAuJour(s.date);
    for (const r of s.repetitions) {
      if (!repetitionUtilisable(r, e.globaux)) continue;
      total += 1;
      if (estHorsSousSeuil(r, params)) hors += 1;
    }
  }

  const valeur = arrondir(hors, PRECISION.horsSousSeuil);
  return {
    cle,
    nom: NOMS_SIGNAUX[cle],
    etat: etatHorsSousSeuil(valeur),
    valeur,
    valeurTexte: `${formatNombre(hors)} sur ${formatNombre(total)}`,
    explication: `Plus rapides que l’allure seuil (${formatAllure(paramsVeille.lt2Pace)}/km) ou FC de fin au-dessus de ${formatNombre(paramsVeille.subtHrHi)} bpm, ${SEANCES_SOUS_SEUIL_SIGNAUX.recentes} dernières séances.`,
  };
}

// ── 5 · Footings sous le plafond : sur 14 jours ─────────────────────────────

function footings({ e, veille, paramsVeille }: Contexte): Signal {
  const cle = 'footings';
  const fenetre = e.seances.filter(
    (s) => (s.type === 'footing' || s.type === 'footing-lignes-droites') && dansFenetre(s.date, e.J, MINIMUMS.footingsFenetreJours, veille),
  );
  if (fenetre.length < MINIMUMS.footingsNombre) {
    return insuffisant(cle, `Il faut ${MINIMUMS.footingsNombre} footings sur ${MINIMUMS.footingsFenetreJours} jours (${fenetre.length} pour l’instant).`);
  }
  // Chaque footing est jugé avec le plafond en vigueur à sa date (D-006). Sans FC moyenne finie, il n’est pas conforme.
  const conformes = fenetre.filter((s) => s.fcMoy !== null && Number.isFinite(s.fcMoy) && s.fcMoy <= e.paramsAuJour(s.date).easyCap).length;
  const valeur = arrondir((conformes * 100) / fenetre.length, PRECISION.footings);
  return {
    cle,
    nom: NOMS_SIGNAUX[cle],
    etat: etatFootings(valeur),
    valeur,
    valeurTexte: formatPourcentage(valeur),
    explication: `FC moyenne ≤ ${formatNombre(paramsVeille.easyCap)} bpm. Des footings trop rapides empiètent sur la récupération.`,
  };
}

// ── 6 · Découplage de la dernière sortie longue utilisable, sur 14 jours ────

function decouplage({ e, veille }: Contexte): Signal {
  const cle = 'decouplage';
  // La dernière sortie longue de la fenêtre qui a un découplage (null : pas utilisable, D-005).
  let derniere: { seance: Seance; valeur: number } | undefined;
  for (const seance of e.seances) {
    const valeur = seance.decouplage?.valeur ?? null;
    if (seance.type === 'sortie-longue' && valeur !== null && dansFenetre(seance.date, e.J, MINIMUMS.decouplageFenetreJours, veille)) {
      derniere = { seance, valeur };
    }
  }
  if (derniere === undefined) {
    return insuffisant(cle, `Aucune sortie longue utilisable sur les ${MINIMUMS.decouplageFenetreJours} derniers jours.`);
  }
  if (!Number.isFinite(derniere.valeur)) {
    return insuffisant(cle, NON_CALCULABLE);
  }

  const { seance } = derniere;
  const valeur = arrondir(derniere.valeur, PRECISION.decouplage);
  const decimales = Number.isInteger(arrondir(seance.km, 0.1)) ? 0 : 1;
  let explication = `Sortie longue du ${formatDate(seance.date)} (${formatNombre(seance.km, decimales)} km). Sous ${formatPourcentage(SEUILS.decouplage.surveillerApres)}, la base aérobie tient la durée.`;
  const detail = seance.decouplage;
  if (detail?.avecMp) {
    explication += ` Portions faciles : ${formatNombre(detail.retenu_min)} min sur ${formatNombre(detail.total_min)}.`;
  }
  return {
    cle,
    nom: NOMS_SIGNAUX[cle],
    etat: etatDecouplage(valeur),
    valeur,
    valeurTexte: formatPourcentage(valeur, 1),
    explication,
  };
}

// ── 7 · Palier de volume : jamais d’alerte ──────────────────────────────────

function palier({ e }: Contexte): Signal {
  const cle = 'palier';
  const terminees = e.semaines.filter((s) => s.statut === 'terminee').length;
  if (terminees < MINIMUMS.palierSemaines) {
    return insuffisant(cle, `Il faut ${MINIMUMS.palierSemaines} semaines terminées.`);
  }
  const semaines = e.palier.semaines;
  const etat = etatPalier(semaines);
  return {
    cle,
    nom: NOMS_SIGNAUX[cle],
    etat,
    valeur: semaines,
    valeurTexte: `${formatNombre(semaines)} sem. autour de ${formatNombre(e.palier.reference_km)} km`,
    explication:
      etat === 'ok'
        ? 'Volume tenu assez longtemps pour envisager une hausse.'
        : 'Volume atteint récemment : le consolider avant de monter.',
  };
}

// ── Outils ──────────────────────────────────────────────────────────────────

/**
 * Séances sous-seuil utilisables (04), à J−1 au plus, dans l’ordre de la Vue. Une séance sans aucune
 * répétition d’allure finie (allure normalisée finie, D-004) n’est comptée ni par le signal 3 ni par le
 * signal 4 : elle est exclue des deux décomptes.
 */
function seancesSousSeuil(e: EntreesDecision, veille: string): Seance[] {
  return e.seances.filter(
    (s) => s.type === 'sous-seuil' && s.date <= veille && s.repetitions.some((r) => repetitionUtilisable(r, e.globaux)),
  );
}

/** Allure normalisée d’une répétition (04, D-004) : allure + (FC de fin − refHr) × paceHrK. */
function allureNormaliseeRepetition(r: Repetition, globaux: ParamsGlobaux): number {
  return r.allure_skm + (r.fcFin - globaux.refHr) * globaux.paceHrK;
}

/** Une répétition compte si son allure normalisée est finie. */
function repetitionUtilisable(r: Repetition, globaux: ParamsGlobaux): boolean {
  return Number.isFinite(allureNormaliseeRepetition(r, globaux));
}

/** Moyenne des allures normalisées des répétitions utilisables de la séance (04). */
function allureNormaliseeSeance(s: Seance, globaux: ParamsGlobaux): number {
  return moyenne(s.repetitions.filter((r) => repetitionUtilisable(r, globaux)).map((r) => allureNormaliseeRepetition(r, globaux)));
}

/** Une répétition est hors sous-seuil si elle est plus rapide que lt2Pace, ou si sa FC de fin dépasse subtHrHi (04). */
function estHorsSousSeuil(r: Repetition, params: ParamsDates): boolean {
  return r.allure_skm < params.lt2Pace || r.fcFin > params.subtHrHi;
}

function moyenne(valeurs: readonly number[]): number {
  let somme = 0;
  for (const v of valeurs) somme += v;
  return somme / valeurs.length;
}
