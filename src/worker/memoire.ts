// Mémoire du Worker (ADR 0006, 0009) : séances ②a mémorisées par clé, et dernière Vue calculée.
// Les deux vivent dans le magasin `derive` (ADR 0005), et la mémoire vive du Worker en est le miroir.
import type { MemoireSeances } from '../core/vue';
import type { DateCivile, SeanceIntrinseque, Vue } from '../core/types';
import { executer, requete } from '../store/transaction';
import type { Base } from '../store/types';

/** Préfixe des clés de séance dans `derive` : `seance:<clé de mémorisation>`. */
const PREFIXE_SEANCE = 'seance:';
/** Clé de la dernière Vue dans `derive`. */
const CLE_VUE = 'vue';

/** Dernière Vue calculée, avec la clé qui dit à quelles entrées elle correspond (ADR 0009). */
export interface EnregistrementVue {
  empreinteEntrees: string;
  J: DateCivile;
  vue: Vue;
}

/**
 * Cache des séances ②a (ADR 0006). La mémoire vive (`memoire`) contient les séances connues du Worker. Au premier
 * calcul réussi, elle se charge depuis `derive` ; une entrée qui n'a pas la forme attendue est ignorée, et sera
 * recalculée. Après chaque recalcul réussi, les entrées des activités disparues sont purgées, en mémoire et dans
 * `derive`. Le cache n'est qu'une accélération : aucune de ses erreurs n'empêche le calcul.
 */
export class CacheSeances {
  /** Séances connues, par clé de mémorisation. `seancesIntrinseques` y écrit les nouvelles. */
  readonly memoire: MemoireSeances = new Map();
  /** Vrai une fois `derive` lu avec succès. Tant que ce n'est pas le cas, le cache ne sait pas ce qu'il contient. */
  private chargee = false;
  /** Clés présentes dans `derive`, telles qu'on sait qu'elles y sont. */
  private dansDerive = new Set<string>();
  /** Clés dont la valeur dans `derive` est déjà celle de la mémoire vive : rien à réécrire. */
  private synchronisees = new Set<string>();
  /** Clés chargées depuis `derive` : un échec de calcul qui les utilise peut venir du cache (repli à froid). */
  private venuesDeDerive = new Set<string>();

  /** Charge `derive` une seule fois. Un échec de lecture ne retient pas le calcul : il part de zéro. */
  async charger(base: Base): Promise<MemoireSeances> {
    if (!this.chargee) {
      try {
        const lues = await lireSeances(base);
        for (const [cle, seance] of lues.valides) {
          if (this.memoire.has(cle)) continue;
          this.memoire.set(cle, seance);
          this.synchronisees.add(cle);
          this.venuesDeDerive.add(cle);
        }
        for (const cle of lues.toutes) this.dansDerive.add(cle);
        this.chargee = true;
      } catch (erreur) {
        console.warn('séances mémorisées illisibles, calcul à froid :', messageDe(erreur));
      }
    }
    return this.memoire;
  }

  /** Copie de la mémoire vive, pour un calcul proposé qui ne doit rien laisser derrière lui si on le rejette (D-010). */
  copier(): MemoireSeances {
    return new Map(this.memoire);
  }

  /** Vrai si l'une des clés demandées vient de `derive` : un calcul qui échoue alors peut être refait à froid. */
  utilise(cles: readonly string[]): boolean {
    return cles.some((cle) => this.venuesDeDerive.has(cle));
  }

  /**
   * Repli à froid (ADR 0006) : vide la mémoire vive et toutes les entrées `seance:*` de `derive`. Ne lève jamais :
   * la mémoire vive est vidée dans tous les cas, et le calcul qui suit n'en dépend pas.
   */
  async vider(base: Base): Promise<void> {
    this.memoire.clear();
    this.synchronisees.clear();
    this.venuesDeDerive.clear();
    try {
      await executer(base, ['derive'], 'readwrite', async (tx) => {
        const magasin = tx.objectStore('derive');
        const cles = (await requete(magasin.getAllKeys())) as IDBValidKey[];
        for (const cle of cles) {
          if (typeof cle === 'string' && cle.startsWith(PREFIXE_SEANCE)) magasin.delete(cle);
        }
      });
    } catch (erreur) {
      console.warn('séances mémorisées non effacées :', messageDe(erreur));
    }
    this.dansDerive.clear();
  }

  /**
   * Planifie l'écriture de `retenue` (la mémoire d'un calcul) dans `derive`, pour les clés `actives`. Rien n'est écrit
   * ici : `ecrire` met les modifications dans une transaction ouverte par l'appelant, et `valider` reprend l'état
   * une fois la transaction validée. Une clé est réécrite si elle est nouvelle, ou si sa valeur n'est plus celle
   * que `derive` contient (repli à froid, ADR 0006).
   */
  planifierEcriture(retenue: MemoireSeances, actives: ReadonlySet<string>): EcritureSeances {
    const apres = new Map<string, SeanceIntrinseque>();
    for (const [cle, seance] of retenue) {
      if (actives.has(cle)) apres.set(cle, seance);
    }
    const aSupprimer = [...this.dansDerive].filter((cle) => !actives.has(cle));
    const aEcrire = [...apres].filter(([cle, seance]) => !this.synchronisees.has(cle) || this.memoire.get(cle) !== seance);
    return {
      ecrire: (magasin) => {
        for (const cle of aSupprimer) magasin.delete(PREFIXE_SEANCE + cle);
        for (const [cle, seance] of aEcrire) magasin.put(seance, PREFIXE_SEANCE + cle);
      },
      valider: () => {
        this.memoire.clear();
        for (const [cle, seance] of apres) this.memoire.set(cle, seance);
        for (const cle of aSupprimer) {
          this.dansDerive.delete(cle);
          this.synchronisees.delete(cle);
          this.venuesDeDerive.delete(cle);
        }
        for (const [cle] of aEcrire) {
          this.dansDerive.add(cle);
          this.synchronisees.add(cle);
        }
      },
    };
  }

  /** Après un recalcul réussi : purge et écrit `derive` dans sa propre transaction. Une seule transaction. */
  async enregistrer(base: Base, actives: ReadonlySet<string>): Promise<void> {
    const ecriture = this.planifierEcriture(this.memoire, actives);
    await executer(base, ['derive'], 'readwrite', async (tx) => ecriture.ecrire(tx.objectStore('derive')));
    // L'état ne suit `derive` qu'une fois la transaction validée.
    ecriture.valider();
  }
}

/** Écriture des séances planifiée par `CacheSeances.planifierEcriture`. */
export interface EcritureSeances {
  /** Met les modifications de `derive` dans la transaction ouverte par l'appelant. */
  ecrire(magasin: IDBObjectStore): void;
  /** À appeler une fois la transaction validée : reprend l'état de la mémoire et de `derive`. */
  valider(): void;
}

/**
 * Forme minimale d'une séance mémorisée : les champs que le calcul lit sans les vérifier. Une entrée plus ancienne,
 * ou abîmée, n'y répond pas : elle est ignorée et recalculée à partir de son flux.
 */
function estSeanceMemorisable(valeur: unknown): valeur is SeanceIntrinseque {
  if (typeof valeur !== 'object' || valeur === null) return false;
  const seance = valeur as Record<string, unknown>;
  return (
    typeof seance.minutes === 'object' &&
    seance.minutes !== null &&
    Array.isArray(seance.repetitions) &&
    typeof seance.charge === 'number' &&
    typeof seance.duree_min === 'number' &&
    typeof seance.km === 'number' &&
    typeof seance.mp_min === 'number'
  );
}

/** Les séances de `derive` : celles qui ont la forme attendue, et toutes les clés présentes (sans préfixe). */
function lireSeances(base: Base): Promise<{ valides: Map<string, SeanceIntrinseque>; toutes: string[] }> {
  return executer(base, ['derive'], 'readonly', async (tx) => {
    const magasin = tx.objectStore('derive');
    const cles = (await requete(magasin.getAllKeys())) as IDBValidKey[];
    const deSeance = cles.filter((cle): cle is string => typeof cle === 'string' && cle.startsWith(PREFIXE_SEANCE));
    const valeurs = await Promise.all(deSeance.map((cle) => requete(magasin.get(cle))));
    const valides = new Map<string, SeanceIntrinseque>();
    deSeance.forEach((cle, i) => {
      const valeur: unknown = valeurs[i];
      if (estSeanceMemorisable(valeur)) valides.set(cle.slice(PREFIXE_SEANCE.length), valeur);
    });
    return { valides, toutes: deSeance.map((cle) => cle.slice(PREFIXE_SEANCE.length)) };
  });
}

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/** La dernière Vue calculée, ou undefined. */
export function lireVue(base: Base): Promise<EnregistrementVue | undefined> {
  return executer(base, ['derive'], 'readonly', async (tx) => {
    return (await requete(tx.objectStore('derive').get(CLE_VUE))) as EnregistrementVue | undefined;
  });
}

/** Écrit la dernière Vue calculée, en remplacement de la précédente. */
export function ecrireVue(base: Base, enregistrement: EnregistrementVue): Promise<void> {
  return executer(base, ['derive'], 'readwrite', async (tx) => ecrireVueDans(tx, enregistrement));
}

/** Écrit la dernière Vue calculée dans une transaction déjà ouverte (sur `derive`). */
export function ecrireVueDans(tx: IDBTransaction, enregistrement: EnregistrementVue): void {
  tx.objectStore('derive').put(enregistrement, CLE_VUE);
}
