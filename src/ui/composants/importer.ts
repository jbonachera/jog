// Import d'une archive Strava (D-018) : un champ de fichier .zip et une barre de progression.
// L'état de l'import (en cours, progression) est porté par la coque et réappliqué à chaque rendu (ADR 0009).
import type { JournalImport } from '../../store/types';
import type { Progression } from '../client';
import { el, svgEl } from '../dom';

export interface EtatImport {
  enCours: boolean;
  progression: Progression | null;
}

export interface ActionsImport {
  /** Demande l'import de ce fichier. La coque décide s'il part, ou s'il est ignoré pendant un import. */
  choisir(fichier: File): void;
}

/** Rend le champ d'import dans `conteneur`, en remplaçant son contenu, selon l'état reçu. */
export function rendreImport(conteneur: HTMLElement, etat: EtatImport, actions: ActionsImport): void {
  const champ = el('input', { type: 'file', accept: '.zip' });
  champ.disabled = etat.enCours;
  const etiquette = el('label', { class: 'fichier' }, ['Choisir une archive Strava (.zip)', champ]);

  const progression = etat.progression ?? { fait: 0, total: 1, etape: '' };
  const pourcentage = pourcentageDe(progression);
  const barre = svgEl('svg', {
    class: 'progres-barre',
    viewBox: '0 0 100 6',
    preserveAspectRatio: 'none',
    role: 'progressbar',
    'aria-label': 'Progression de l’import',
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': pourcentage,
  });
  barre.append(
    svgEl('rect', { class: 'progres-fond', x: 0, y: 0, width: 100, height: 6 }),
    svgEl('rect', { class: 'progres-rempli', x: 0, y: 0, width: pourcentage, height: 6 }),
  );
  const etape = el('p', { class: 'aide', 'aria-live': 'polite' }, [progression.etape]);
  const progres = el('div', { class: 'progres' }, [barre, etape]);
  progres.hidden = !etat.enCours;

  champ.addEventListener('change', () => {
    const fichier = champ.files?.[0];
    if (fichier !== undefined) actions.choisir(fichier);
  });

  conteneur.replaceChildren(etiquette, progres);
}

/** Pourcentage affiché, borné entre 0 et 100 ; 0 quand le total est nul. */
function pourcentageDe({ fait, total }: Progression): number {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((100 * fait) / total)));
}

/** Résumé d'un import, accordé en français : « 2 activités ajoutées, 1 activité modifiée ». */
export function resumeImport(journal: JournalImport): string {
  const morceaux = [phrase(journal.ajoutees, 'ajoutée')];
  if (journal.modifiees > 0) morceaux.push(phrase(journal.modifiees, 'modifiée'));
  if (journal.supprimees > 0) morceaux.push(phrase(journal.supprimees, 'supprimée'));
  return morceaux.join(', ');
}

function phrase(nombre: number, participe: string): string {
  if (nombre === 0) return '0 activité';
  if (nombre === 1) return `1 activité ${participe}`;
  return `${nombre} activités ${participe}s`;
}
