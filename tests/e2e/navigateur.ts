// Outillage commun des scénarios de bout en bout (lots 6.2 et 6.3).
//
// Chromium est lancé par `playwright-core` (version exacte 1.62.1). Cette bibliothèque trouve seule le navigateur déjà
// présent dans le cache Playwright (`~/Library/Caches/ms-playwright/chromium_headless_shell-1234` en mode sans tête) : rien
// n'est téléchargé, et `playwright install` n'est jamais lancé. Si le cache est ailleurs, la variable `FJORD_CHROMIUM`
// donne le chemin du binaire, passé en `executablePath`.
//
// Les données viennent de l'archive synthétique (tests/fixtures), importée par le vrai champ « Choisir une archive
// Strava (.zip) ». L'export réel n'est jamais ouvert.
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright-core';
import { archiveSynthetique, JOURS_14_MOIS } from '../fixtures/archive-synthetique';

/**
 * Adresse de l'application servie par `vite preview`, fournie par scripts/e2e.mjs. En mode de secours (`FJORD_DIST`, voir
 * scripts/e2e.mjs), c'est une adresse fictive dont les requêtes sont servies depuis `dist/` par Playwright.
 */
export function urlFjord(): string {
  const url = process.env.FJORD_URL;
  if (url === undefined || url === '') throw new Error('FJORD_URL absent : lancer les scénarios par `npm run test:e2e`.');
  return url;
}

/** Le jour de l'appareil est fixé (J = 2026-10-21) : la dernière séance de l'archive est la veille. */
const INSTANT_FIXE = new Date('2026-10-21T10:00:00Z');

export async function lancerChromium(): Promise<Browser> {
  const executablePath = process.env.FJORD_CHROMIUM;
  return chromium.launch(executablePath === undefined || executablePath === '' ? {} : { executablePath });
}

/** Ce qui s'est passé pendant la navigation : rien ne doit apparaître ici pour que le scénario soit vert. */
export interface Observations {
  /** Erreurs de console, exceptions non rattrapées et requêtes échouées. */
  erreurs: string[];
  /** Violations de la politique de sécurité du contenu (événement `securitypolicyviolation`). */
  violationsCsp: string[];
  /** Adresses sollicitées hors de l'origine de l'application (data: et blob: exclus). */
  requetesExternes: string[];
  /** Adresses des Workers créés. */
  workers: string[];
  /** Adresses des polices chargées, avec leur statut HTTP. */
  polices: { url: string; statut: number }[];
}

export interface Session {
  contexte: BrowserContext;
  page: Page;
  observations: Observations;
}

export interface OptionsSession {
  largeur?: number;
  hauteur?: number;
  colorScheme?: 'light' | 'dark';
  reducedMotion?: 'reduce' | 'no-preference';
}

/** Ouvre l'application dans un contexte neuf (stockage vide), avec les observations branchées avant la navigation. */
export async function ouvrirFjord(navigateur: Browser, options: OptionsSession = {}): Promise<Session> {
  const origine = new URL(urlFjord()).origin;
  const contexte = await navigateur.newContext({
    viewport: { width: options.largeur ?? 1440, height: options.hauteur ?? 900 },
    colorScheme: options.colorScheme ?? 'light',
    reducedMotion: options.reducedMotion ?? 'no-preference',
  });
  const page = await contexte.newPage();
  await page.clock.setFixedTime(INSTANT_FIXE);

  const observations: Observations = { erreurs: [], violationsCsp: [], requetesExternes: [], workers: [], polices: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') observations.erreurs.push(`console : ${message.text()}`);
  });
  page.on('pageerror', (erreur) => observations.erreurs.push(`exception : ${erreur.message}`));
  page.on('requestfailed', (requete) => observations.erreurs.push(`requête échouée : ${requete.url()}`));
  page.on('request', (requete) => {
    const url = new URL(requete.url());
    if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== origine) observations.requetesExternes.push(requete.url());
  });
  page.on('response', (reponse) => {
    if (reponse.url().endsWith('.woff2')) observations.polices.push({ url: reponse.url(), statut: reponse.status() });
  });
  page.on('worker', (worker) => observations.workers.push(worker.url()));
  await page.exposeFunction('remonterViolationCsp', (texte: string) => observations.violationsCsp.push(texte));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (evenement) => {
      (window as unknown as Record<string, (texte: string) => void>).remonterViolationCsp?.(
        `${evenement.violatedDirective} ${evenement.blockedURI}`,
      );
    });
  });

  const dist = process.env.FJORD_DIST;
  if (dist !== undefined && dist !== '') {
    // Mode de secours sans socket : chaque requête vers l'origine de l'application reçoit le fichier de `dist/`.
    await contexte.route(`${origine}/**`, (route) => servirDepuisDist(route, dist));
  }

  await page.goto(urlFjord());
  await page.locator('#t-apercu').waitFor();
  return { contexte, page, observations };
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/** Répond à une requête par le fichier correspondant dans `dist`, ou par un 404 (même chemin que `vite preview`). */
async function servirDepuisDist(route: Route, dist: string): Promise<void> {
  const racine = resolve(dist);
  const chemin = new URL(route.request().url()).pathname;
  const fichier = resolve(racine, chemin === '/' ? 'index.html' : `.${chemin}`);
  if (!fichier.startsWith(`${racine}${sep}`)) {
    await route.fulfill({ status: 404 });
    return;
  }
  try {
    const corps = await readFile(fichier);
    await route.fulfill({ status: 200, body: corps, contentType: TYPES[extname(fichier)] ?? 'application/octet-stream' });
  } catch {
    await route.fulfill({ status: 404 });
  }
}

/** Archive synthétique de 14 mois, construite une fois par fichier de scénarios. */
let archive: Buffer | undefined;
export function archiveDeTest(): Buffer {
  archive ??= Buffer.from(archiveSynthetique(JOURS_14_MOIS));
  return archive;
}

/** Archive de 14 mois avec deux séances de FC (pic soutenu à 194 bpm, pointe de début), pour la FC max observée (D-019). */
let archiveAvecPic: Buffer | undefined;
export function archiveAvecPicFc(): Buffer {
  archiveAvecPic ??= Buffer.from(archiveSynthetique(JOURS_14_MOIS, { picsFc: true }));
  return archiveAvecPic;
}

/**
 * Importe une archive par le champ réel « Choisir une archive Strava (.zip) » (setInputFiles), puis attend la fin de
 * l'import. Rend la durée en millisecondes.
 */
export async function importerArchive(page: Page, octets: Buffer): Promise<number> {
  const debut = performance.now();
  await page.locator('input[type="file"][accept=".zip"]').first().setInputFiles({
    name: 'archive-synthetique.zip',
    mimeType: 'application/zip',
    buffer: octets,
  });
  await page.waitForFunction(
    () => {
      const statut = document.querySelector('.statut')?.textContent ?? '';
      return statut.startsWith('Import') || statut.startsWith('L’import');
    },
    undefined,
    { timeout: 120_000 },
  );
  const duree = performance.now() - debut;
  const statut = (await page.locator('.statut').textContent()) ?? '';
  if (!statut.startsWith('Import terminé')) throw new Error(`import refusé : ${statut}`);
  return duree;
}

/** Importe l'archive synthétique de 14 mois (voir `importerArchive`). */
export function importerArchiveSynthetique(page: Page): Promise<number> {
  return importerArchive(page, archiveDeTest());
}

/** Ouvre un onglet par son identifiant (`aperçu`, `charge`, `progression`, `historique`, `reglages`) et attend son panneau. */
export async function ouvrirOnglet(page: Page, id: string): Promise<void> {
  await page.locator(`#t-${id}`).click();
  await page.locator(`#v-${id}:not([hidden])`).waitFor();
}

/** Médiane d'une série de mesures. */
export function mediane(valeurs: number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1 ? (triees[milieu] ?? 0) : ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2;
}
