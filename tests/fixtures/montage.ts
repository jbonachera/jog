// Montage de l'application dans happy-dom, client factice et stockages de test (02, persistance, ADR 0009).
import { monterApplication, type StockageFjord } from '../../src/ui/app';
import type { ClientFjord, ExportSauvegarde, ResultatImport, ResultatParametres, SurProgression } from '../../src/ui/client';
import type { Parametres, Vue } from '../../src/core/types';

/** Un stockage en mémoire, qui se comporte comme localStorage. */
export class StockageMemoire implements StockageFjord {
  private readonly valeurs = new Map<string, string>();

  getItem(cle: string): string | null {
    return this.valeurs.get(cle) ?? null;
  }

  setItem(cle: string, valeur: string): void {
    this.valeurs.set(cle, valeur);
  }
}

/** Un stockage bloqué, comme en navigation privée : toute lecture et toute écriture lèvent. */
export class StockageEnPanne implements StockageFjord {
  getItem(): string | null {
    throw new DOMException('stockage bloqué', 'SecurityError');
  }

  setItem(): void {
    throw new DOMException('stockage bloqué', 'SecurityError');
  }
}

export type ImporteurFactice = (fichier: File, surProgression: SurProgression) => Promise<ResultatImport>;

export interface OptionsClientFactice {
  /** Vue renvoyée au démarrage, si `demarrer` n'est pas fourni. */
  vue?: Vue | null;
  importer?: ImporteurFactice;
  demarrer?: () => Promise<Vue | null>;
  /** Réponses scriptables des requêtes de paramètres et de sauvegarde (06, D-010, D-012). */
  enregistrer?: (proposes: Parametres) => Promise<ResultatParametres>;
  reinitialiser?: () => Promise<ResultatParametres>;
  supprimer?: (idModification: string) => Promise<ResultatParametres>;
  exporter?: () => Promise<ExportSauvegarde>;
  importerSauvegarde?: (contenu: string) => Promise<Vue>;
}

/**
 * Client sans Worker, réservé aux tests. Comme le vrai client, il diffuse chaque Vue à `surVue`,
 * que ce soit celle du démarrage ou celle d'un import.
 */
export class ClientFactice implements ClientFjord {
  private vue: Vue | null;
  private readonly abonnes: ((vue: Vue, perimee: boolean) => void)[] = [];

  constructor(private readonly options: OptionsClientFactice = {}) {
    this.vue = options.vue ?? null;
  }

  async demarrer(): Promise<Vue | null> {
    const vue = this.options.demarrer !== undefined ? await this.options.demarrer() : this.vue;
    if (vue !== null) this.diffuser(vue);
    return vue;
  }

  async importerArchive(fichier: File, surProgression: SurProgression): Promise<ResultatImport> {
    if (this.options.importer === undefined) {
      throw new Error('import non disponible avec le client factice');
    }
    const resultat = await this.options.importer(fichier, surProgression);
    if (resultat.vue !== null) {
      this.vue = resultat.vue;
      this.diffuser(resultat.vue);
    }
    return resultat;
  }

  surVue(callback: (vue: Vue, perimee: boolean) => void): void {
    this.abonnes.push(callback);
  }

  // Paramètres et sauvegarde : réponses scriptées par les options. Sans script, la requête est refusée.
  // Comme le vrai client, une Vue reçue est diffusée à `surVue` avant que la promesse ne se résolve (D-010).
  async enregistrerParams(proposes: Parametres): Promise<ResultatParametres> {
    return this.reponseParametres(() => this.options.enregistrer?.(proposes));
  }

  async reinitialiserParams(): Promise<ResultatParametres> {
    return this.reponseParametres(() => this.options.reinitialiser?.());
  }

  async supprimerModification(idModification: string): Promise<ResultatParametres> {
    return this.reponseParametres(() => this.options.supprimer?.(idModification));
  }

  async exporterSauvegarde(): Promise<ExportSauvegarde> {
    if (this.options.exporter === undefined) throw new Error('export non disponible avec le client factice');
    return this.options.exporter();
  }

  async importerSauvegarde(contenu: string): Promise<Vue> {
    if (this.options.importerSauvegarde === undefined) {
      throw new Error('import de sauvegarde non disponible avec le client factice');
    }
    const vue = await this.options.importerSauvegarde(contenu);
    this.vue = vue;
    this.diffuser(vue);
    return vue;
  }

  private async reponseParametres(appel: () => Promise<ResultatParametres> | undefined): Promise<ResultatParametres> {
    const resultat = (await appel()) ?? { ok: false, message: 'non disponible avec le client factice' };
    if (resultat.ok) {
      this.vue = resultat.vue;
      this.diffuser(resultat.vue);
    }
    return resultat;
  }

  private diffuser(vue: Vue): void {
    for (const abonne of this.abonnes) abonne(vue, false);
  }
}

/** Monte l'application dans un conteneur neuf, attaché au document, et attend le premier rendu. */
export async function monter(
  client: ClientFjord,
  stockage: StockageFjord = new StockageMemoire(),
  J = '2026-10-21',
): Promise<HTMLElement> {
  const racine = document.createElement('div');
  document.body.append(racine);
  await monterApplication(racine, client, stockage, J);
  return racine;
}
