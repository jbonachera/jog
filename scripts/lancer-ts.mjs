// Lanceur de scripts TypeScript du dépôt (tâche 6.1). Vite charge le module en SSR, avec la même chaîne de
// transformation que le projet, sans compilation séparée ni nouvelle dépendance. Le module doit exporter
// `principal(arguments)`, qui rend un code de sortie (0 par défaut). Une erreur s'affiche sans pile.
import { resolve } from 'node:path';
import { createServer } from 'vite';

const [, , fichier, ...argumentsScript] = process.argv;
if (fichier === undefined) {
  console.error('usage : node scripts/lancer-ts.mjs <fichier.ts> [arguments]');
  process.exit(2);
}

const racine = resolve(import.meta.dirname, '..');
const serveur = await createServer({
  root: racine,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
});

try {
  const module = await serveur.ssrLoadModule(resolve(racine, fichier));
  if (typeof module.principal !== 'function') {
    throw new Error(`${fichier} doit exporter une fonction principal()`);
  }
  const code = await module.principal(argumentsScript);
  process.exitCode = typeof code === 'number' ? code : 0;
} catch (erreur) {
  console.error(erreur instanceof Error ? erreur.message : String(erreur));
  process.exitCode = 1;
} finally {
  await serveur.close();
}
