import { defineConfig, type Plugin } from 'vite';

// En dev, Vite injecte le CSS via des balises <style> (HMR), bloquées par
// style-src 'self'. On relâche style-src uniquement pour le serveur de dev ;
// le build garde la CSP stricte de l'ADR 0010 (CSS extrait en fichier).
function cspDev(): Plugin {
  return {
    name: 'fjord-csp-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [cspDev()],
});
