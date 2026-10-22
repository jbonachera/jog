// Rapport sur données réelles (tâche 6.1) : testé sur une archive synthétique de 60 jours, jamais sur l'export réel
// (ADR 0010, 0011). Le test appelle la fonction exportée, sans sous-processus.
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { archiveSynthetique, NOM_SECRET } from '../fixtures/archive-synthetique';
import { verifierReel } from '../../scripts/verif-reel';

const J = '2026-10-21';

const RACINE = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const SORTIE = resolve(RACINE, 'tests/local/out');
// Sous-dossier de tests/local/out/ : le test n'écrit jamais à côté du vrai rapport (rapport.md).
const SORTIE_TEST = resolve(SORTIE, 'test-synthetique');
/** Les fichiers du dépôt (sans les dossiers générés, ni l'export local), avec leur date de modification. */
async function fichiersDuDepot(dossier: string, racine: string): Promise<{ chemin: string; mtime: number }[]> {
  const resultat: { chemin: string; mtime: number }[] = [];
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    const relatif = chemin.slice(racine.length + 1);
    if (['node_modules', 'dist', '.git', 'tests/local'].some((exclu) => relatif === exclu || relatif.startsWith(`${exclu}/`))) continue;
    if (entree.name.startsWith('export_')) continue;
    if (entree.isDirectory()) {
      resultat.push(...(await fichiersDuDepot(chemin, racine)));
    } else {
      resultat.push({ chemin, mtime: (await stat(chemin)).mtimeMs });
    }
  }
  return resultat;
}

describe('rapport sur données réelles (tâche 6.1)', () => {
  let dossierTemp = '';
  let zipChemin = '';
  let debut = 0;
  let rapport = '';
  let cheminRapport = '';
  let cheminSnapshot: string | null = null;

  beforeAll(async () => {
    dossierTemp = await mkdtemp(join(tmpdir(), 'fjord-verif-'));
    zipChemin = join(dossierTemp, 'archive-synthetique.zip');
    await writeFile(zipChemin, archiveSynthetique());
    debut = Date.now();
    const resultat = await verifierReel({
      env: { JOG_EXPORT: zipChemin, JOG_J: J },
      maintenant: () => new Date('2026-10-21T10:00:00Z'),
      sortie: SORTIE_TEST,
      snapshot: true,
    });
    cheminRapport = resultat.cheminRapport;
    cheminSnapshot = resultat.cheminSnapshot;
    rapport = await readFile(cheminRapport, 'utf8');
  }, 120_000);

  afterAll(async () => {
    if (dossierTemp !== '') await rm(dossierTemp, { recursive: true, force: true });
    await rm(SORTIE_TEST, { recursive: true, force: true });
  });

  it('produit le rapport dans tests/local/out/ (ADR 0010)', () => {
    expect(cheminRapport).toBe(join(SORTIE_TEST, 'rapport.md'));
    expect(rapport.length).toBeGreaterThan(0);
  });

  it('avec le snapshot, écrit la Vue complète versionnée par REGLES_VERSION', async () => {
    expect(cheminSnapshot).toBe(join(SORTIE_TEST, 'vue-1.0.0.json'));
    const vue = JSON.parse(await readFile(cheminSnapshot ?? '', 'utf8')) as { formatVersion: number; J: string };
    expect(vue.formatVersion).toBe(4);
    expect(vue.J).toBe(J);
  });

  it('refuse une sortie hors de tests/local/out/', async () => {
    await expect(verifierReel({ env: { JOG_EXPORT: zipChemin }, sortie: dossierTemp })).rejects.toThrow(/tests\/local\/out/);
  });

  it('contient une section par point de 09 et les budgets de 0012', () => {
    for (const reference of ['Classification', 'D-001', 'D-002', 'D-003', 'D-004', 'D-005', 'D-006', 'D-007', 'D-008', 'D-009', 'D-010', 'D-013', 'D-014', 'ADR 0012']) {
      expect(rapport, reference).toContain(reference);
    }
  });

  it('ne contient aucun nom d\'activité, ni le chemin de l\'archive (ADR 0010)', () => {
    expect(rapport).not.toContain(NOM_SECRET);
    expect(rapport).not.toContain(zipChemin);
    expect(rapport).not.toContain(dossierTemp);
  });

  it('n\'écrit rien hors de tests/local/out/ pendant son exécution', async () => {
    const apres = await fichiersDuDepot(RACINE, RACINE);
    const modifies = apres.filter((f) => f.mtime >= debut - 1000 && !f.chemin.startsWith(SORTIE));
    expect(modifies.map((f) => f.chemin)).toEqual([]);
  });

  it('refuse de tourner sans JOG_EXPORT, avec un message d\'usage', async () => {
    await expect(verifierReel({ env: {} })).rejects.toThrow(/JOG_EXPORT/);
  });

  it('refuse une date J mal formée', async () => {
    await expect(verifierReel({ env: { JOG_EXPORT: zipChemin, JOG_J: '21/10/2026' } })).rejects.toThrow(/JOG_J/);
  });
});
