// Scénario 3 : budgets de performance de l'ADR 0012, mesurés dans Chromium sur l'archive synthétique de 14 mois.
// Chaque mesure est une assertion avec son budget, sauf l'import (archive synthétique : information seulement). Les
// valeurs sont écrites dans tests/e2e/out/mesures.md (ignoré par git) même quand un budget n'est pas tenu. Aucun budget
// n'est modifié ici : un échec signale un budget non tenu.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { importerArchiveSynthetique, lancerChromium, mediane, ouvrirJog, ouvrirOnglet, type Session } from './navigateur';

const DOSSIER_E2E = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(DOSSIER_E2E, '../..');
const SORTIE = resolve(DOSSIER_E2E, 'out/mesures.md');

/** Une ligne du rapport : la valeur mesurée, son budget et le verdict. `null` pour une simple information. */
interface Ligne {
  mesure: string;
  valeur: string;
  budget: string;
  verdict: 'tenu' | 'non tenu' | 'information';
  methode: string;
}

const lignes: Ligne[] = [];
let navigateur: Browser;
let session: Session;
let versionChromium = 'inconnue';
let dureeImport = 0;

const ENTREES_ONGLETS = ['charge', 'progression', 'historique', 'reglages', 'apercu'] as const;
const NOM_ONGLET: Record<string, string> = {
  apercu: 'Aperçu',
  charge: 'Charge',
  progression: 'Progression',
  historique: 'Historique',
  reglages: 'Paramètres',
};

function virgule(nombre: number, decimales: number): string {
  return nombre.toFixed(decimales).replace('.', ',');
}

function verdict(valeur: number, budget: number): 'tenu' | 'non tenu' {
  return valeur < budget ? 'tenu' : 'non tenu';
}

beforeAll(async () => {
  navigateur = await lancerChromium();
  versionChromium = navigateur.version();
  session = await ouvrirJog(navigateur);
  dureeImport = await importerArchiveSynthetique(session.page);
}, 180_000);

afterAll(async () => {
  await writeFile(SORTIE, await rediger(), 'utf8').catch(() => undefined);
  await session?.contexte.close();
  await navigateur?.close();
});

describe('3 · budgets de performance (ADR 0012)', () => {
  it('JS initial compressé, mesuré à partir de dist/index.html : moins de 100 Ko', async () => {
    const html = await readFile(resolve(RACINE, 'dist/index.html'), 'utf8');
    const fichiers = [...html.matchAll(/<(?:script|link)[^>]*?\s(?:src|href)="\.\/([^"]+\.js)"/g)].map((m) => m[1] ?? '');
    expect(fichiers.length).toBeGreaterThan(0);
    let octets = 0;
    for (const fichier of fichiers) {
      octets += gzipSync(await readFile(resolve(RACINE, 'dist', fichier))).length;
    }
    const kilo = octets / 1024;
    lignes.push({
      mesure: 'JS initial compressé (gzip)',
      valeur: `${virgule(kilo, 1)} Ko`,
      budget: '< 100 Ko',
      verdict: verdict(kilo, 100),
      methode: `Scripts de dist/index.html (${fichiers.join(', ')}), gzip niveau par défaut. Hors polices et Worker.`,
    });
    expect(kilo).toBeLessThan(100);
  });

  it('import de l’archive synthétique : durée donnée à titre d’information', () => {
    lignes.push({
      mesure: 'Import de l’archive synthétique (14 mois, 243 activités)',
      valeur: `${virgule(dureeImport / 1000, 2)} s`,
      budget: 'non assertée (le budget de 15 s vise l’export réel de 406 FIT)',
      verdict: 'information',
      methode: 'Du setInputFiles au statut « Import terminé ».',
    });
    expect(dureeImport).toBeGreaterThan(0);
  });

  it('affichage de la dernière Vue au rechargement (cache) : médiane de 5 rechargements, moins de 300 ms', async () => {
    const durees: number[] = [];
    for (let k = 0; k < 5; k++) {
      const debut = performance.now();
      await session.page.reload({ waitUntil: 'domcontentloaded' });
      await session.page.locator('#a1-verdict').waitFor();
      durees.push(performance.now() - debut);
    }
    const mediane5 = mediane(durees);
    lignes.push({
      mesure: 'Affichage de la dernière Vue au lancement (cache)',
      valeur: `${virgule(mediane5, 0)} ms (max ${virgule(Math.max(...durees), 0)} ms)`,
      budget: '< 300 ms',
      verdict: verdict(mediane5, 300),
      methode: 'Du rechargement à l’apparition du verdict de l’Aperçu. Médiane de 5 rechargements.',
    });
    expect(mediane5).toBeLessThan(300);
  });

  it('rendu de chaque onglet : médiane de 3 passages, moins de 50 ms chacun', async () => {
    await ouvrirOnglet(session.page, 'apercu');
    const par: Record<string, number[]> = {};
    const contenus: Record<string, number[]> = {};
    for (let passage = 0; passage < 3; passage++) {
      // Chaque passage ouvre les cinq onglets dans l'ordre : chacun est rendu à son ouverture (ADR 0009).
      const { durees, tailles } = await session.page.evaluate((ids: readonly string[]) => {
        const durees: Record<string, number> = {};
        const tailles: Record<string, number> = {};
        for (const id of ids) {
          const bouton = document.getElementById(`t-${id}`) as HTMLButtonElement;
          const panneau = document.getElementById(`v-${id}`) as HTMLElement;
          const debut = performance.now();
          bouton.click();
          // Le rendu est synchrone : on force la mise en page du panneau pour compter le travail jusqu'au rendu terminé.
          void panneau.getBoundingClientRect();
          durees[id] = performance.now() - debut;
          tailles[id] = panneau.childElementCount;
        }
        return { durees, tailles };
      }, ENTREES_ONGLETS);
      for (const [id, duree] of Object.entries(durees)) (par[id] ??= []).push(duree);
      for (const [id, taille] of Object.entries(tailles)) (contenus[id] ??= []).push(taille);
    }
    // Un onglet ouvert a bien été rendu : son panneau n'est pas vide, à chaque passage.
    for (const id of ['charge', 'progression', 'historique', 'reglages', 'apercu']) {
      expect(Math.min(...(contenus[id] ?? [0]))).toBeGreaterThan(0);
    }

    const echecs: string[] = [];
    for (const id of ['charge', 'progression', 'historique', 'reglages', 'apercu']) {
      const duree = mediane(par[id] ?? []);
      lignes.push({
        mesure: `Rendu de l’onglet ${NOM_ONGLET[id]}`,
        valeur: `${virgule(duree, 1)} ms (max ${virgule(Math.max(...(par[id] ?? [0])), 1)} ms)`,
        budget: '< 50 ms',
        verdict: verdict(duree, 50),
        methode: 'performance.now() autour du clic sur l’onglet, jusqu’à la mise en page du panneau. Médiane de 3 passages.',
      });
      if (duree >= 50) echecs.push(`${NOM_ONGLET[id]} : ${virgule(duree, 1)} ms`);
    }
    expect(echecs).toEqual([]);
  });

  it('mouvement du curseur du simulateur : médiane de 5 lots de 10 mouvements, moins de 16 ms', async () => {
    await ouvrirOnglet(session.page, 'apercu');
    // Le chronomètre du navigateur a une résolution de 0,1 ms : un mouvement isolé est trop court pour être lu. On mesure
    // donc des lots de 10 mouvements, et on rend la durée moyenne d'un mouvement dans chaque lot.
    const durees = await session.page.evaluate(() => {
      const curseur = document.getElementById('a1-km') as HTMLInputElement;
      const sortie = document.querySelector('.sim-out') as HTMLElement;
      const min = Number(curseur.min);
      const max = Number(curseur.max);
      const resultat: number[] = [];
      for (let lot = 0; lot < 5; lot++) {
        const debut = performance.now();
        for (let k = 0; k < 10; k++) {
          // Des valeurs qui se suivent sans se répéter : chaque mouvement change réellement la sortie.
          const rang = lot * 10 + k;
          curseur.value = String(Math.round(min + ((max - min) * ((rang * 11) % 50)) / 49));
          curseur.dispatchEvent(new Event('input'));
          void sortie.getBoundingClientRect();
        }
        resultat.push((performance.now() - debut) / 10);
      }
      return resultat;
    });
    const medianeLots = mediane(durees);
    lignes.push({
      mesure: 'Mouvement du curseur du simulateur (A1)',
      valeur: `${virgule(medianeLots, 2)} ms (max ${virgule(Math.max(...durees), 2)} ms)`,
      budget: '< 16 ms (une image)',
      verdict: verdict(medianeLots, 16),
      methode: 'Événement input du curseur, puis mise en page de la sortie. Durée moyenne d’un mouvement dans 5 lots de 10. Médiane des lots.',
    });
    expect(medianeLots).toBeLessThan(16);
  });

  it('recalcul après modification de refHr (paramètre global) : médiane de 3 enregistrements, moins de 1 s', async () => {
    const page = session.page;
    await ouvrirOnglet(page, 'reglages');
    const durees: number[] = [];
    for (const valeur of ['165', '166', '167']) {
      await page.getByLabel('FC de référence pour l’allure normalisée', { exact: true }).fill(valeur);
      // La zone d'annonce est vidée avant chaque enregistrement, pour que le message attendu soit bien celui de celui-ci.
      await page.evaluate(() => {
        const statut = document.querySelector('.statut');
        if (statut !== null) statut.textContent = '';
      });
      const debut = performance.now();
      await page.locator('#params-enregistrer').click();
      await page.waitForFunction(() => document.querySelector('.statut')?.textContent === 'Enregistré. Tableau de bord recalculé.', undefined, {
        timeout: 30_000,
      });
      durees.push(performance.now() - debut);
    }
    const mediane3 = mediane(durees);
    lignes.push({
      mesure: 'Recalcul après modification de refHr (paramètre global)',
      valeur: `${virgule(mediane3, 0)} ms (max ${virgule(Math.max(...durees), 0)} ms)`,
      budget: '< 1 000 ms (ordinateur)',
      verdict: verdict(mediane3, 1000),
      methode: 'Du clic sur « Enregistrer et recalculer » au message « Enregistré. Tableau de bord recalculé. ». Médiane de 3.',
    });
    expect(mediane3).toBeLessThan(1000);
  });
});

/** Le rapport Markdown, écrit à la fin des mesures. */
async function rediger(): Promise<string> {
  await mkdir(dirname(SORTIE), { recursive: true });
  const date = new Date().toISOString();
  const cpu = cpus()[0]?.model ?? 'inconnu';
  const tableau = lignes
    .map((l) => `| ${l.mesure} | ${l.valeur} | ${l.budget} | ${l.verdict} | ${l.methode} |`)
    .join('\n');
  return [
    '# Mesures de performance (ADR 0012)',
    '',
    `- Généré le ${date} par \`npm run test:e2e\`.`,
    `- Chromium ${versionChromium} (playwright-core 1.62.1), ${platform()} ${release()}, ${cpu}.`,
    '- Données : archive synthétique de 14 mois (426 jours), importée par le champ réel de l’application.',
    '- Ko = 1 024 octets. Les budgets sont ceux de l’ADR 0012, sans modification.',
    '',
    '| Mesure | Valeur | Budget | Verdict | Méthode |',
    '|---|---|---|---|---|',
    tableau,
    '',
  ].join('\n');
}
