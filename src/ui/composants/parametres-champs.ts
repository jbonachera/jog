// Champs de l'onglet Paramètres (06, « Champs ») : groupes, libellés, unités, phrases d'aide, et la portée datée ou
// globale de chaque paramètre (06, « Portée d'une modification », D-006). Données pures, sans DOM.
import { formatAllure } from '../../core/format';
import type { ParamsDates, ParamsGlobaux } from '../../core/types';

export type CleDatee = keyof ParamsDates;
export type CleGlobale = keyof ParamsGlobaux;
export type Cle = CleDatee | CleGlobale;

export interface DefChamp {
  cle: Cle;
  libelle: string;
  unite: string;
  aide?: string;
  /** Allure au seuil : saisie en m:ss, stockée en secondes par km. */
  mmss?: boolean;
}

export interface DefGroupe {
  titre: string;
  aide: string;
  champs: DefChamp[];
  /** Le groupe Zones porte le tableau des zones en bpm, mis à jour pendant la saisie (06). */
  zones?: boolean;
}

const LIMITES_ZONES: readonly { cle: CleDatee; n: number }[] = [
  { cle: 'z1', n: 1 },
  { cle: 'z2', n: 2 },
  { cle: 'z3', n: 3 },
  { cle: 'z4', n: 4 },
];

export const GROUPES: readonly DefGroupe[] = [
  {
    titre: 'Fréquence cardiaque',
    aide: 'Bases de calcul des zones et des plafonds.',
    champs: [
      { cle: 'hrMax', libelle: 'FC max', unite: 'bpm', aide: 'Mesurée en test ou en fin de course courte.' },
      { cle: 'hrRest', libelle: 'FC repos', unite: 'bpm', aide: 'Réservé : sans effet sur les calculs pour l’instant.' },
      { cle: 'easyCap', libelle: 'Plafond des footings', unite: 'bpm', aide: 'Au-dessus, un footing compte comme trop rapide.' },
    ],
  },
  {
    titre: 'Seuil',
    aide: 'Seuil estimé à la FC et à l’allure, par un test de 30 min ou un 10 km couru autour d’une heure.',
    champs: [
      { cle: 'lt2Hr', libelle: 'FC au seuil', unite: 'bpm' },
      { cle: 'lt2Pace', libelle: 'Allure au seuil', unite: '/km (m:ss)', aide: 'Format m:ss, par exemple 4:02.', mmss: true },
      { cle: 'refHr', libelle: 'FC de référence pour l’allure normalisée', unite: 'bpm', aide: 'Sert au suivi « allure à FC constante ».' },
      { cle: 'paceHrK', libelle: 'Coefficient allure ↔ FC', unite: 's/km par bpm', aide: 'Allure normalisée : même effet que la FC de référence.' },
    ],
  },
  {
    titre: 'Méthode NSA',
    aide: 'Repères utilisés pour juger le réalisé.',
    champs: [
      { cle: 'subtPctLo', libelle: 'Part de sous-seuil, min', unite: '%' },
      { cle: 'subtPctHi', libelle: 'Part de sous-seuil, max', unite: '%' },
      { cle: 'subtHrLo', libelle: 'FC de fin de répétition, bas', unite: 'bpm' },
      { cle: 'subtHrHi', libelle: 'FC de fin de répétition, haut', unite: 'bpm' },
    ],
  },
  {
    titre: 'Zones',
    aide: 'Limite haute de chaque zone, en % de la FC max. La zone 5 va jusqu’à la FC max.',
    zones: true,
    champs: LIMITES_ZONES.map(({ cle, n }) => ({ cle, libelle: `Limite haute de la zone ${n}`, unite: '% FC max' })),
  },
  {
    titre: 'Modèle de charge',
    aide: 'Constantes de temps du modèle forme / fatigue.',
    champs: [
      { cle: 'ctlDays', libelle: 'Forme de fond (CTL)', unite: 'jours' },
      { cle: 'atlDays', libelle: 'Fatigue (ATL)', unite: 'jours' },
    ],
  },
];

/** Les paramètres datés (mesures de l'athlète, D-006). */
export const CLES_DATEES: readonly CleDatee[] = ['hrMax', 'hrRest', 'z1', 'z2', 'z3', 'z4', 'lt2Hr', 'lt2Pace', 'easyCap', 'subtHrLo', 'subtHrHi'];

export function estDatee(cle: Cle): cle is CleDatee {
  return (CLES_DATEES as readonly Cle[]).includes(cle);
}

/** Tous les champs, dans l'ordre du formulaire. */
export function tousLesChamps(): DefChamp[] {
  return GROUPES.flatMap((groupe) => groupe.champs);
}

/** Libellé d'un paramètre, pour l'historique des modifications. */
export function libelleDe(cle: Cle): string {
  return tousLesChamps().find((champ) => champ.cle === cle)?.libelle ?? cle;
}

/** Une valeur de paramètre daté, écrite pour l'historique : « 172 bpm », « 3:58 /km », « 80 % FC max ». */
export function texteValeur(cle: CleDatee, valeur: number): string {
  if (cle === 'lt2Pace') return `${formatAllure(valeur)} /km`;
  const champ = tousLesChamps().find((c) => c.cle === cle);
  return `${String(Math.round(valeur))} ${champ?.unite ?? ''}`.trim();
}

/** Allure en m:ss (238 → « 3:58 »), champ de saisie. */
export function secondesVersMmss(secondes: number): string {
  return formatAllure(secondes);
}

/**
 * Lit une allure saisie en m:ss (06, règle 2). Rend le nombre de secondes par km, ou null si la saisie n'est pas au
 * format m:ss (secondes sur deux chiffres, inférieures à 60, total strictement positif).
 */
export function mmssVersSecondes(saisie: string): number | null {
  const correspondance = /^(\d{1,3}):([0-5]\d)$/.exec(saisie.trim());
  if (correspondance === null) return null;
  const total = Number(correspondance[1]) * 60 + Number(correspondance[2]);
  return total > 0 ? total : null;
}
