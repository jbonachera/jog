// Polices auto-hébergées : seuls les sous-ensembles latin et latin-ext, graisses utilisées (08).
import '@fontsource/schibsted-grotesk/latin-400.css';
import '@fontsource/schibsted-grotesk/latin-ext-400.css';
import '@fontsource/schibsted-grotesk/latin-600.css';
import '@fontsource/schibsted-grotesk/latin-ext-600.css';
import '@fontsource/schibsted-grotesk/latin-700.css';
import '@fontsource/schibsted-grotesk/latin-ext-700.css';
import '@fontsource/schibsted-grotesk/latin-800.css';
import '@fontsource/schibsted-grotesk/latin-ext-800.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import './ui/styles.css';
import { monterApplication } from './ui/app';
import { creerClientWorker } from './ui/clientWorker';
import { dateCivileAppareil, fuseauAppareil } from './worker/horloge';

const racine = document.getElementById('app');
if (racine === null) {
  throw new Error('élément #app absent de index.html');
}

// J est la date civile de l'appareil, dans son fuseau (ADR 0007).
void monterApplication(racine, creerClientWorker(), undefined, dateCivileAppareil(Date.now(), fuseauAppareil()));
