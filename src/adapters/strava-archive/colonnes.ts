// Repérage des colonnes utiles de activities.csv, par nom d'en-tête et numéro d'occurrence.
// Les noms français priment ; les noms anglais sont un repli non vérifié sur un export réel.
import { ErreurArchive } from './erreurs';

export interface Colonnes {
  id: number;
  fichier: number;
  nom?: number;
  type?: number;
  competition?: number;
}

interface Definition {
  fr: string;
  en: string;
  /** Numéro de l'occurrence, à partir de 1, quand un nom est répété dans l'en-tête. */
  occurrence?: number;
}

const ID: Definition = { fr: "ID de l'activité", en: 'Activity ID' };
const FICHIER: Definition = { fr: 'Nom du fichier', en: 'Filename' };
const NOM: Definition = { fr: "Nom de l'activité", en: 'Activity Name' };
const TYPE: Definition = { fr: "Type d'activité", en: 'Activity Type' };
const COMPETITION: Definition = { fr: 'Compétition', en: 'Competition' };

/** Normalise un en-tête : espaces autour, et apostrophe typographique ramenée à l'apostrophe droite. */
function normaliser(entete: string): string {
  return entete.trim().replace(/’/g, "'");
}

function indiceDe(entetes: readonly string[], nom: string, occurrence: number): number | undefined {
  let vues = 0;
  for (let i = 0; i < entetes.length; i++) {
    if (normaliser(entetes[i] ?? '') !== nom) continue;
    vues++;
    if (vues === occurrence) return i;
  }
  return undefined;
}

function chercher(entetes: readonly string[], definition: Definition): number | undefined {
  const occurrence = definition.occurrence ?? 1;
  return indiceDe(entetes, definition.fr, occurrence) ?? indiceDe(entetes, definition.en, occurrence);
}

function obligatoire(entetes: readonly string[], definition: Definition): number {
  const indice = chercher(entetes, definition);
  if (indice === undefined) {
    throw new ErreurArchive(
      `en-tête « ${definition.fr} » (ou « ${definition.en} ») introuvable dans activities.csv`,
    );
  }
  return indice;
}

/** Repère les colonnes. ID et Nom du fichier sont obligatoires ; les autres sont facultatives. */
export function repererColonnes(entetes: readonly string[]): Colonnes {
  return {
    id: obligatoire(entetes, ID),
    fichier: obligatoire(entetes, FICHIER),
    nom: chercher(entetes, NOM),
    type: chercher(entetes, TYPE),
    competition: chercher(entetes, COMPETITION),
  };
}
