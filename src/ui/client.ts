// Pont entre l'interface et le Worker (ADR 0009). Le client réel est `ClientWorker` (clientWorker.ts) ;
// les tests utilisent leur propre client factice (tests/fixtures/montage.ts).
import type { DateCivile, Parametres, Vue } from '../core/types';
import type { JournalImport } from '../store/types';

/** Progression d'un import : `fait` sur `total`, avec l'étape en cours (ADR 0009). */
export interface Progression {
  fait: number;
  total: number;
  etape: string;
}

export type SurProgression = (progression: Progression) => void;

export interface ResultatImport {
  /** Vue recalculée, ou null si le recalcul a échoué (voir `erreurRecalcul`). */
  vue: Vue | null;
  journal: JournalImport;
  /** Présent quand l'import a réussi mais que le recalcul a échoué. */
  erreurRecalcul?: string;
}

/**
 * Résultat d'un changement de paramètres (06, D-010). `ok: false` avec `champ` : validation refusée, rien n'est
 * écrit. `recalculEchoue` : le recalcul a échoué, les paramètres précédents restent en vigueur.
 */
export type ResultatParametres =
  | { ok: true; vue: Vue }
  | { ok: false; champ?: string; message: string; recalculEchoue?: boolean };

/** Contenu d'une sauvegarde prête à être téléchargée (D-012). */
export interface ExportSauvegarde {
  contenu: string;
  nomFichier: string;
}

export interface ClientJog {
  /** Rend la dernière Vue connue, ou null si aucune donnée n'est importée. La Vue est aussi diffusée à `surVue`. */
  demarrer(J: DateCivile): Promise<Vue | null>;
  /** Importe une archive Strava. Rend le journal de l'import et la Vue recalculée, diffusée à `surVue`. */
  importerArchive(fichier: File, surProgression: SurProgression): Promise<ResultatImport>;
  /**
   * Abonne un callback à chaque Vue reçue : celle du démarrage, celle d'un import, et les Vues recalculées sans requête
   * (ADR 0009). `perimee` : la Vue vient du cache et ne correspond plus aux entrées ; la Vue recalculée suit.
   * C'est le seul chemin d'une Vue vers l'interface.
   */
  surVue(callback: (vue: Vue, perimee: boolean) => void): void;
  /** Enregistre les paramètres proposés, après validation et recalcul (D-010). La Vue recalculée est diffusée à `surVue`. */
  enregistrerParams(proposes: Parametres): Promise<ResultatParametres>;
  /** « Revenir aux valeurs par défaut » (06). La Vue recalculée est diffusée à `surVue`. */
  reinitialiserParams(): Promise<ResultatParametres>;
  /** Supprime une modification datée (06), puis recalcule. La Vue recalculée est diffusée à `surVue`. */
  supprimerModification(idModification: string): Promise<ResultatParametres>;
  /** Produit la sauvegarde JSON (D-012). */
  exporterSauvegarde(): Promise<ExportSauvegarde>;
  /** Remplace les paramètres et le journal par ceux de la sauvegarde, puis recalcule. Rend la Vue recalculée. */
  importerSauvegarde(contenu: string): Promise<Vue>;
}
