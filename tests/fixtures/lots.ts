// Lots et activités de test, construits par code (ADR 0010) : aucune donnée réelle.
// S'appuie sur construire.ts pour les tronçons et les flux.
import { IDBFactory as FabriqueMemoire } from 'fake-indexeddb';
import { dateLocale } from '../../src/core/dates';
import type { ActivitePivot, Source } from '../../src/core/types';
import { ouvrirBase } from '../../src/store/schema';
import type { Base, BrutLot, LotImport } from '../../src/store/types';
import { footing } from './construire';

/** Instant de référence des tests : 2026-10-21 10:00 UTC. */
export const MAINTENANT = new Date('2026-10-21T10:00:00Z');

/** 2026-10-10 08:00 UTC, date par défaut des activités de test. */
const DEBUT_PAR_DEFAUT = Date.UTC(2026, 9, 10, 8, 0);

export interface OptionsActivite {
  cle: string;
  source?: Source;
  debutUtc?: number;
  /** Durée en minutes (défaut 30). */
  min?: number;
  /** FC constante (défaut 150) ; null pour une activité sans FC. */
  fc?: number | null;
  /** Pas de mesure de la FC, en secondes (défaut 1). */
  pasFC?: 1 | 5;
  nom?: string;
  /** Empreinte de la source (défaut : dérivée de la clé). Changer l'empreinte = le fichier a changé. */
  empreinte?: string;
  /** Allure en s/km (défaut 330). */
  allure?: number;
}

/** Une activité de course à allure et FC constantes. */
export function activite(o: OptionsActivite): ActivitePivot {
  const debutUtc = o.debutUtc ?? DEBUT_PAR_DEFAUT;
  const base = footing({
    min: o.min ?? 30,
    fc: o.fc === undefined ? 150 : o.fc,
    allure: o.allure ?? 330,
    pasFC: o.pasFC ?? 1,
  });
  return {
    ...base,
    cleSource: o.cle,
    source: o.source ?? 'fit',
    empreinteBrute: o.empreinte ?? `empreinte-${o.cle}`,
    debutUtc,
    dateLocale: dateLocale(debutUtc, 0),
    nom: o.nom ?? null,
  };
}

/** Octets d'origine de test : l'empreinte, pour vérifier plus tard quelle version est stockée. */
export function brutPour(pivot: ActivitePivot): BrutLot {
  return {
    cleSource: pivot.cleSource,
    format: 'fit',
    compresse: true,
    octets: new TextEncoder().encode(pivot.empreinteBrute),
  };
}

/** Un lot complet. Par défaut, chaque pivot a son brut. */
export function lot(
  pivots: ActivitePivot[],
  extras: Partial<Omit<LotImport, 'pivots'>> = {},
): LotImport {
  return {
    ignorees: [],
    illisibles: [],
    manquants: [],
    ...extras,
    pivots,
    bruts: extras.bruts ?? pivots.map(brutPour),
  };
}

/** Une activité citée par l'index de l'archive, dont le fichier est illisible. */
export function illisible(cle: string, fichier: string = `activities/${cle}.fit`): LotImport['illisibles'][number] {
  return { cleSource: cle, fichier, message: 'en-tête FIT tronqué' };
}

/** Une activité citée par l'index de l'archive, dont le fichier est absent du ZIP. */
export function manquant(cle: string, fichier: string = `activities/${cle}.fit.gz`): LotImport['manquants'][number] {
  return { cleSource: cle, fichier };
}

/** Une activité que l'index classe hors course (type « Ride » par défaut). */
export function pasUneCourse(cle: string, type: string = 'Ride'): LotImport['ignorees'][number] {
  return { cleSource: cle, raison: 'pas-une-course', type };
}

const bases: Base[] = [];

/** Une base neuve, dans une fabrique neuve : aucun état ne passe d'un test à l'autre. */
export async function nouvelleBase(): Promise<Base> {
  const base = await ouvrirBase('test', new FabriqueMemoire() as unknown as IDBFactory);
  bases.push(base);
  return base;
}

/** Ferme les bases ouvertes par `nouvelleBase`. À appeler dans afterEach. */
export function fermerBases(): void {
  for (const base of bases.splice(0)) base.close();
}
