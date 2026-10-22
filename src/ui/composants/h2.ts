// H2 · Journal hebdomadaire (03, H2 ; 08, « Accessibilité »). Un tableau de onze colonnes, la semaine la plus récente en
// haut, la semaine en cours surlignée, dans un conteneur de 560 px au plus qui défile, avec un en-tête collant.
import { formatDateAnnee, formatDuree, formatNombre, formatPourcentage } from '../../core/format';
import { selectionHistorique, type PeriodeHistorique, type SemaineHistorique } from '../../core/selecteurs';
import type { Vue } from '../../core/types';
import { el } from '../dom';
import { nombreSemaines, type Teinte } from './commun';

/** Largeur de la barre de répartition, en pixels (03, H2). */
const LARGEUR_REPARTITION = 120;
const HAUTEUR_REPARTITION = 8;

/** Rend H2 dans `conteneur`, en remplaçant son contenu. La période vient de H1 (un seul sélecteur, 03). */
export function rendreH2(conteneur: HTMLElement, vue: Vue, periode: PeriodeHistorique): void {
  const selection = selectionHistorique(vue, periode);
  const titres = [
    'Semaine',
    'km',
    'Durée',
    'Répartition',
    'Sous-seuil',
    'Séances SS',
    'Charge',
    'Ratio 7 j / 30 j',
    'Monotonie',
    'Contrainte',
    `Footings ≤ ${selection.plafondFootingsBpm} bpm`,
  ];
  // Le corps est rempli en HTML : chaque ligne compte onze cellules et une barre SVG, et l'onglet dix ans en compte 520.
  // Avec `el`, le rendu dépasse le budget de 100 ms dans happy-dom (méthode 6). Toute valeur passe par `echapper`.
  const corps = el('tbody');
  corps.innerHTML = selection.journal.map(ligneHtml).join('');
  const tableau = el('table', { class: 'journal' }, [
    el('caption', { class: 'visuellement-masque' }, ['Journal hebdomadaire, la semaine la plus récente en premier']),
    el('thead', {}, [el('tr', {}, titres.map((titre) => el('th', { scope: 'col' }, [titre])))]),
    corps,
  ]);
  // Une seule région, nommée par le titre : le conteneur qui défile. La section n'a pas de nom, donc pas de rôle.
  const contenu =
    selection.semaines.length === 0
      ? el('p', { class: 'aide' }, ['Aucune semaine sur cette période.'])
      : el('div', { class: 'journal-conteneur', role: 'region', 'aria-labelledby': 'h2-titre', tabindex: '0' }, [tableau]);
  const resume =
    selection.semaines.length === 0 ? nombreSemaines(0) : `${nombreSemaines(selection.semaines.length)} · la plus récente en haut`;
  conteneur.replaceChildren(
    el('section', { class: 'h2' }, [
      el('div', { class: 'sec-head' }, [el('h2', { id: 'h2-titre' }, ['Journal hebdomadaire']), el('p', { class: 'resume' }, [resume])]),
      contenu,
    ]),
  );
}

/** Une ligne du journal, en HTML. La semaine en cours porte la classe `en-cours` (surlignée). */
function ligneHtml(s: SemaineHistorique): string {
  const ouverture = s.enCours ? '<tr class="en-cours" aria-current="date">' : '<tr>';
  return [
    ouverture,
    `<th scope="row">${echapper(formatDateAnnee(s.lundi))}</th>`,
    `<td>${echapper(formatNombre(s.km, 1))}</td>`,
    `<td>${echapper(formatDuree(s.min))}</td>`,
    `<td>${barreRepartitionHtml(s)}</td>`,
    `<td>${sousSeuilHtml(s)}</td>`,
    `<td>${s.nbSS}</td>`,
    `<td>${echapper(formatNombre(s.charge))}</td>`,
    `<td>${ratioHtml(s)}</td>`,
    `<td>${s.monotonie === null ? '–' : echapper(formatNombre(s.monotonie, 2))}</td>`,
    `<td>${s.contrainte === null ? '–' : echapper(formatNombre(s.contrainte))}</td>`,
    `<td>${footingsHtml(s)}</td>`,
    '</tr>',
  ].join('');
}

/** Part de sous-seuil et pastille « dans la cible », « hors cible » ou « en cours » (08 : le texte porte l'état). */
function sousSeuilHtml(s: SemaineHistorique): string {
  const valeur = s.partSSPct === null ? '–' : formatPourcentage(s.partSSPct);
  const etats: Record<NonNullable<SemaineHistorique['etatCible']>, { texte: string; teinte: Teinte }> = {
    'dans-la-cible': { texte: 'dans la cible', teinte: 'good' },
    'hors-cible': { texte: 'hors cible', teinte: 'warn' },
    'en-cours': { texte: 'en cours', teinte: 'neutre' },
  };
  return avecPastille(valeur, s.etatCible === null ? null : etats[s.etatCible]);
}

/** Ratio 7 j / 30 j du dimanche (ou de J−1) : orange au-delà de 1,3 ou sous 0,8, rouge au-delà de 1,5 (03). */
function ratioHtml(s: SemaineHistorique): string {
  const valeur = s.ratioDimanche === null ? '–' : formatNombre(s.ratioDimanche, 2);
  if (s.etatRatio === 'surveiller') return avecPastille(valeur, { texte: 'À surveiller', teinte: 'warn' });
  if (s.etatRatio === 'alerte') return avecPastille(valeur, { texte: 'Alerte', teinte: 'bad' });
  return echapper(valeur);
}

/** Part des footings sous le plafond : orange sous 90 %, rouge sous 75 % (03, H2). Rien sans footing. */
function footingsHtml(s: SemaineHistorique): string {
  const valeur = s.conformitePct === null ? '–' : formatPourcentage(s.conformitePct);
  if (s.etatFootings === 'surveiller') return avecPastille(valeur, { texte: 'À surveiller', teinte: 'warn' });
  if (s.etatFootings === 'alerte') return avecPastille(valeur, { texte: 'Alerte', teinte: 'bad' });
  return echapper(valeur);
}

/** Une valeur, suivie de sa pastille quand il y en a une. Même balisage que `pastille` (composants/commun). */
function avecPastille(valeur: string, etat: { texte: string; teinte: Teinte } | null): string {
  if (etat === null) return echapper(valeur);
  return `${echapper(valeur)} <span class="pastille pastille-${etat.teinte}"><span class="puce" aria-hidden="true"></span>${echapper(etat.texte)}</span>`;
}

/**
 * Répartition de la semaine : une barre SVG de 120 px, un segment par intensité, au prorata des km (H1, H2).
 * Une semaine sans km n'a pas de segment.
 */
function barreRepartitionHtml(s: SemaineHistorique): string {
  const { easy, mp, subt, hard } = s.kmParIntensite;
  const total = easy + mp + subt + hard;
  const segments: [string, number][] = [
    ['z-easy', easy],
    ['z-mp', mp],
    ['z-subt', subt],
    ['z-hard', hard],
  ];
  let x = 0;
  let rectangles = '';
  for (const [classe, km] of segments) {
    if (total <= 0 || km <= 0) continue;
    const largeur = (LARGEUR_REPARTITION * km) / total;
    rectangles += `<rect class="${classe}" x="${x}" width="${largeur}" height="${HAUTEUR_REPARTITION}"></rect>`;
    x += largeur;
  }
  return (
    `<svg class="repartition" width="${LARGEUR_REPARTITION}" viewBox="0 0 ${LARGEUR_REPARTITION} ${HAUTEUR_REPARTITION}" role="img" aria-label="Répartition par intensité">` +
    `${rectangles}</svg>`
  );
}

/** Échappe un texte pour du HTML. Les valeurs viennent de la Vue, mais on ne les insère jamais brutes. */
function echapper(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
