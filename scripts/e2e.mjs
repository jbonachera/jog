// Scénarios de bout en bout (lots 6.2 et 6.3) : `vite build`, puis `vite preview` sur un port libre, puis les scénarios
// Chromium de tests/e2e/ (vitest, configuration vitest.e2e.config.ts). Le serveur est arrêté à la fin, quel que soit le
// résultat. Aucun navigateur n'est téléchargé : playwright-core utilise celui du cache Playwright.
import { spawn, spawnSync } from 'node:child_process';
import { get } from 'node:http';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';

const racine = resolve(import.meta.dirname, '..');
const viteBin = resolve(racine, 'node_modules/vite/bin/vite.js');
const vitestBin = resolve(racine, 'node_modules/vitest/vitest.mjs');

/** Un port TCP libre sur la machine locale. */
function portLibre() {
  return new Promise((ok, ko) => {
    const serveur = createServer();
    serveur.unref();
    serveur.on('error', ko);
    serveur.listen(0, '127.0.0.1', () => {
      const { port } = serveur.address();
      serveur.close(() => ok(port));
    });
  });
}

/** Vrai quand le serveur répond à `url` avec un statut 2xx. */
function repond(url) {
  return new Promise((ok) => {
    const requete = get(url, (reponse) => {
      reponse.resume();
      ok((reponse.statusCode ?? 500) < 300);
    });
    requete.on('error', () => ok(false));
    requete.setTimeout(1000, () => {
      requete.destroy();
      ok(false);
    });
  });
}

async function attendreServeur(url, delaiMs) {
  const limite = Date.now() + delaiMs;
  while (Date.now() < limite) {
    if (await repond(url)) return;
    await attendre(150);
  }
  throw new Error(`le serveur ne répond pas sur ${url}`);
}

const build = spawnSync(process.execPath, [viteBin, 'build'], { cwd: racine, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

// Mode de secours sans socket (JOG_SANS_SOCKET=1) : pour un environnement qui interdit les connexions locales. Le
// navigateur reçoit les fichiers de dist/ par interception Playwright ; aucun serveur n'est lancé. Le mode par défaut,
// celui du projet, sert dist/ avec `vite preview` sur un port libre.
const sansSocket = process.env.JOG_SANS_SOCKET === '1';
let preview = null;
// localhost est un contexte sécurisé, comme 127.0.0.1 : WebCrypto (SHA-256 de l’import) y est disponible.
let url = 'http://localhost:4173/';
if (!sansSocket) {
  const port = await portLibre();
  url = `http://127.0.0.1:${port}/`;
  preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: racine,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

let code;
try {
  if (!sansSocket) await attendreServeur(url, 20_000);
  const env = { ...process.env, JOG_URL: url };
  if (sansSocket) env.JOG_DIST = resolve(racine, 'dist');
  const tests = spawn(process.execPath, [vitestBin, 'run', '--config', 'vitest.e2e.config.ts'], {
    cwd: racine,
    stdio: 'inherit',
    env,
  });
  code = await new Promise((ok) => tests.on('exit', (c) => ok(c ?? 1)));
} catch (erreur) {
  console.error(erreur instanceof Error ? erreur.message : String(erreur));
  code = 1;
} finally {
  preview?.kill('SIGTERM');
}
process.exit(code);
