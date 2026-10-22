// A1 · Décision volume (03, 05) : colonne gauche, verdict, phrase, fourchette et simulateur ;
// colonne droite, les sept signaux. Le simulateur ne remplace que son encart (aria-live), jamais le verdict.
import { simuler } from '../../core/decision';
import type { Fourchette, ResultatSimulation, Simulateur } from '../../core/decision/types';
import { ajouterJours } from '../../core/dates';
import { formatDate, formatEcart, formatNombre } from '../../core/format';
import type { EtatSignal, Signal, Vue } from '../../core/types';
import { el } from '../dom';
import { kmTexte, pastille, type Teinte } from './commun';

const VERDICTS: Record<Vue['decision']['verdict'], { libelle: string; teinte: Teinte }> = {
  augmenter: { libelle: 'Augmenter', teinte: 'good' },
  maintenir: { libelle: 'Maintenir', teinte: 'warn' },
  alleger: { libelle: 'Alléger', teinte: 'bad' },
  aucun: { libelle: 'Pas encore de verdict', teinte: 'neutre' },
};

const ETATS: Record<EtatSignal, { texte: string; teinte: Teinte }> = {
  ok: { texte: 'OK', teinte: 'good' },
  surveiller: { texte: 'À surveiller', teinte: 'warn' },
  alerte: { texte: 'Alerte', teinte: 'bad' },
  insuffisant: { texte: 'Données insuffisantes', teinte: 'neutre' },
};

/** Rend A1 dans `conteneur`, en remplaçant son contenu. */
export function rendreA1(conteneur: HTMLElement, vue: Vue): void {
  const { decision } = vue;
  const verdict = VERDICTS[decision.verdict];
  const veille = ajouterJours(vue.J, -1);

  const gauche: Node[] = [
    el('p', { id: 'a1-surtitre', class: 'eyebrow' }, [`Décision volume · données arrêtées au ${formatDate(veille)} au soir`]),
    el('h2', { id: 'a1-verdict', class: `verdict etat-${verdict.teinte}` }, [verdict.libelle]),
    el('p', { class: 'dec-why' }, [typographie(decision.phrase)]),
  ];
  // La fourchette et le simulateur se conditionnent séparément ; le simulateur a besoin de la fourchette pour sa phrase.
  if (decision.fourchette !== null) gauche.push(fourchetteBloc(decision.fourchette));
  if (decision.fourchette !== null && decision.simulateur !== null) {
    gauche.push(simulateurBloc(decision.simulateur, decision.fourchette));
  }

  // role explicite : la grille retire la puce, et Safari retire alors la sémantique de liste (08).
  const signaux = el(
    'ul',
    { class: 'signaux-grille', role: 'list', 'aria-label': 'Signaux de la décision' },
    decision.signaux.map((signal) => carteSignal(signal)),
  );

  conteneur.replaceChildren(
    el('section', { class: 'decision', 'aria-labelledby': 'a1-surtitre a1-verdict' }, [el('div', { class: 'dec-main' }, gauche), signaux]),
  );
}

/** Les textes du cœur portent des apostrophes droites ; l'interface n'affiche que des typographiques (08). */
function typographie(texte: string): string {
  return texte.replace(/'/g, '’');
}

function fourchetteBloc(fourchette: Fourchette): HTMLElement {
  const reference =
    fourchette.sourceReference === 'palier'
      ? `Référence : ${formatNombre(fourchette.reference)} km, la dernière semaine terminée.`
      : `Référence : ${formatNombre(fourchette.reference)} km, moyenne des 30 derniers jours par semaine.`;
  return el('div', { class: 'dec-range' }, [
    el('span', { class: 'dec-range-titre' }, ['Fourchette raisonnable pour les 7 prochains jours']),
    el('span', { class: 'dec-range-valeur num' }, [`${formatNombre(fourchette.min)}–${formatNombre(fourchette.max)} km`]),
    el('span', { class: 'dec-range-ref' }, [reference]),
    el('span', { class: 'dec-range-note' }, ['C’est une borne calculée sur le réalisé, pas un programme d’entraînement.']),
  ]);
}

function simulateurBloc(simulateur: Simulateur, fourchette: Fourchette): HTMLElement {
  // Le nom du curseur est fixe ; la valeur courante est lue par aria-valuetext et affichée à part.
  const valeur = el('b', { class: 'num' });
  const curseur = el('input', {
    type: 'range',
    id: 'a1-km',
    min: String(simulateur.min),
    max: String(simulateur.max),
    step: '1',
    value: String(simulateur.defaut),
  });
  const sortie = el('div', { class: 'sim-out', 'aria-live': 'polite' });

  const afficher = (km: number): void => {
    const texte = kmTexte(km);
    valeur.textContent = texte;
    curseur.setAttribute('aria-valuetext', texte);
    sortie.replaceChildren(...resultatsSimulation(simuler(km, simulateur, fourchette)));
  };
  curseur.addEventListener('input', () => afficher(Number(curseur.value)));
  afficher(simulateur.defaut);

  return el('div', { class: 'sim' }, [
    el('div', { class: 'sim-tete' }, [el('label', { for: 'a1-km' }, ['Et si je cours sur les 7 prochains jours ?']), valeur]),
    curseur,
    sortie,
    // Hors de la zone annoncée : seuls les résultats sont lus à chaque mouvement du curseur (03).
    el('p', { class: 'aide' }, ['Estimation à intensité inchangée.']),
  ]);
}

function resultatsSimulation(r: ResultatSimulation): Node[] {
  const ratio = r.ratioProjete === null ? '–' : formatNombre(r.ratioProjete, 2);
  return [
    el('div', { class: 'sim-resultats' }, [
      mesureSimulation('Ratio projeté, 7 j / 30 j', ratio, ETATS[r.etatRatio].teinte, r.etatRatio),
      mesureSimulation('Fraîcheur dans 7 jours', formatEcart(r.fraicheur7j), ETATS[r.etatFraicheur].teinte, r.etatFraicheur),
    ]),
    el('p', { class: 'sim-position' }, [typographie(r.phrase)]),
  ];
}

function mesureSimulation(nom: string, valeur: string, teinte: Teinte, etat: EtatSignal): HTMLElement {
  return el('div', { class: 'sim-mesure' }, [
    el('span', { class: 'sim-nom' }, [nom]),
    el('span', { class: 'sim-valeur num' }, [valeur]),
    pastille(ETATS[etat].texte, teinte),
  ]);
}

function carteSignal(signal: Signal): HTMLElement {
  const teinteBord = signal.etat === 'surveiller' || signal.etat === 'alerte';
  const classes = ['signal'];
  if (teinteBord) classes.push('signal-teinte', signal.etat === 'alerte' ? 'signal-alerte' : 'signal-surveiller');
  const insuffisant = signal.etat === 'insuffisant';
  return el('li', { class: classes.join(' ') }, [
    el('div', { class: 'signal-tete' }, [
      pastille(ETATS[signal.etat].texte, ETATS[signal.etat].teinte),
      el('h3', { class: 'signal-nom' }, [typographie(signal.nom)]),
    ]),
    el('p', { class: 'signal-valeur num' }, [insuffisant ? '–' : signal.valeurTexte]),
    el('p', { class: 'signal-explication' }, [typographie(signal.explication)]),
  ]);
}
