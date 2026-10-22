// Import d'un lot dans la base (ADR 0004). Une seule transaction : en cas d'erreur, rien n'est écrit.
import type { ActivitePivot, DateCivile } from '../core/types';
import { resoudreDoublons } from './doublons';
import { CLE_META } from './schema';
import { executer, requete } from './transaction';
import type {
  ActiviteStockee,
  Base,
  BrutStocke,
  JournalImport,
  LotImport,
  Meta,
  SourceImport,
  Statut,
} from './types';

export interface OptionsImport {
  /** Instant de l'import : sert au journal et à `derniereSynchro`. */
  maintenant: Date;
}

const MAGASINS_IMPORT = ['meta', 'brut', 'activite', 'flux', 'journal'];

/**
 * Applique un lot à la base (ADR 0004) et rend le journal de l'import.
 *
 * - Un pivot nouveau, ou dont l'empreinte a changé, est écrit (activite, flux, brut).
 * - Pour `strava-archive`, qui est un instantané, les activités `strava-archive` absentes de l'archive
 *   sont supprimées. Une activité illisible ou manquante est encore dans l'archive : elle est conservée.
 *   Une activité classée hors course (`ignorees`) n'est plus une course : elle est supprimée.
 *   Pour `fit`, rien n'est supprimé.
 * - Les statuts sont recalculés sur l'ensemble stocké (doublons, ADR 0004).
 * - Un lot incohérent est refusé avant toute écriture.
 */
export async function importer(
  base: Base,
  source: SourceImport,
  lot: LotImport,
  options: OptionsImport,
): Promise<JournalImport> {
  verifierLot(lot, source);
  const iso = options.maintenant.toISOString();

  return executer(base, MAGASINS_IMPORT, 'readwrite', async (tx) => {
    const activites = tx.objectStore('activite');
    const anciennes = new Map(
      ((await requete(activites.getAll())) as ActiviteStockee[]).map((a) => [a.cleSource, a] as const),
    );
    const etat = new Map(anciennes);
    const brutsParCle = new Map(lot.bruts.map((b) => [b.cleSource, b] as const));
    const ecrites = new Map<string, ActivitePivot>();
    const touchees: DateCivile[] = [];
    let ajoutees = 0;
    let modifiees = 0;

    for (const pivot of lot.pivots) {
      const ancienne = anciennes.get(pivot.cleSource);
      if (ancienne?.empreinteBrute === pivot.empreinteBrute) continue;
      ecrites.set(pivot.cleSource, pivot);
      etat.set(pivot.cleSource, versResume(pivot));
      touchees.push(pivot.dateLocale);
      if (ancienne === undefined) {
        ajoutees++;
      } else {
        modifiees++;
        touchees.push(ancienne.dateLocale);
      }
    }

    const supprimees: ActiviteStockee[] = [];
    if (source === 'strava-archive') {
      const presentes = new Set([
        ...lot.pivots.map((p) => p.cleSource),
        ...lot.illisibles.map((i) => i.cleSource),
        ...lot.manquants.map((m) => m.cleSource),
      ]);
      for (const ancienne of anciennes.values()) {
        if (ancienne.source === 'strava-archive' && !presentes.has(ancienne.cleSource)) {
          etat.delete(ancienne.cleSource);
          supprimees.push(ancienne);
          touchees.push(ancienne.dateLocale);
        }
      }
    }

    const statuts = resoudreDoublons([...etat.values()]);
    let ignorees = 0;
    for (const [cle, resume] of etat) {
      const statut: Statut = statuts.get(cle) ?? 'active';
      const ancienne = anciennes.get(cle);
      const ecrite = ecrites.get(cle);
      const statutChange = ancienne !== undefined && ancienne.statut !== statut;
      if (ecrite === undefined && !statutChange) continue;

      if (statut === 'ignoree' && ancienne?.statut !== 'ignoree') ignorees++;
      if (ecrite === undefined) touchees.push(resume.dateLocale);
      activites.put({ ...resume, statut });

      if (ecrite !== undefined) {
        tx.objectStore('flux').put({ cleSource: cle, ...ecrite.flux });
        const brut = brutsParCle.get(cle);
        if (brut === undefined) {
          tx.objectStore('brut').delete(cle);
        } else {
          const enregistrement: BrutStocke = {
            cleSource: cle,
            source: ecrite.source,
            format: brut.format,
            compresse: brut.compresse,
            octets: brut.octets,
            empreinte: ecrite.empreinteBrute,
            recuLe: iso,
          };
          tx.objectStore('brut').put(enregistrement);
        }
      }
    }

    for (const retiree of supprimees) {
      activites.delete(retiree.cleSource);
      tx.objectStore('flux').delete(retiree.cleSource);
      tx.objectStore('brut').delete(retiree.cleSource);
    }

    const meta = (await requete(tx.objectStore('meta').get(CLE_META))) as Meta;
    tx.objectStore('meta').put({ ...meta, derniereSynchro: iso }, CLE_META);

    const entree = {
      date: iso,
      source,
      ajoutees,
      modifiees,
      supprimees: supprimees.length,
      ignorees,
      illisibles: lot.illisibles.map((i) => i.fichier),
      manquants: lot.manquants.length,
      dateMinTouchee: plusPetiteDate(touchees),
    };
    const id = (await requete(tx.objectStore('journal').add(entree))) as number;
    return { id, ...entree };
  });
}

/** Refuse un lot incohérent avant toute écriture : clé en double, ou source d'un pivot autre que celle de l'import. */
function verifierLot(lot: LotImport, source: SourceImport): void {
  const vues = new Set<string>();
  for (const pivot of lot.pivots) {
    if (vues.has(pivot.cleSource)) {
      throw new Error(`clé source en double dans le lot : ${pivot.cleSource}`);
    }
    vues.add(pivot.cleSource);
    if (pivot.source !== source) {
      throw new Error(`activité ${pivot.cleSource} : source ${pivot.source} dans un import « ${source} »`);
    }
  }
}

function versResume(pivot: ActivitePivot): ActiviteStockee {
  return {
    cleSource: pivot.cleSource,
    statut: 'active',
    source: pivot.source,
    versionAdaptateur: pivot.versionAdaptateur,
    empreinteBrute: pivot.empreinteBrute,
    debutUtc: pivot.debutUtc,
    decalageLocal_min: pivot.decalageLocal_min,
    dateLocale: pivot.dateLocale,
    duree_s: pivot.duree_s,
    distance_m: pivot.distance_m,
    nom: pivot.nom,
    competition: pivot.competition,
    sousType: pivot.sousType,
    pasFC_s: pivot.pasFC_s,
    nbEchantillons: pivot.flux.t_s.length,
    tours: pivot.tours,
  };
}

/** Les dates AAAA-MM-JJ se comparent comme des textes. */
function plusPetiteDate(dates: readonly DateCivile[]): DateCivile | null {
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (b < a ? b : a));
}
