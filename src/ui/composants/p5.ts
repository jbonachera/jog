// P5 · Niveau estimé (03, P5 ; 04, « Équivalences », « Records » ; D-014, D-015). Un tableau par distance de référence :
// équivalence depuis le dernier test ou la dernière course de 5 km (Riegel), allure, record et son écart. La pastille
// verte signale une équivalence qui bat le record.
import { formatAllure, formatDate, formatTempsCourse } from '../../core/format';
import { niveauEstime, type LigneNiveau, type SourceNiveau } from '../../core/progression';
import type { Vue } from '../../core/types';
import { el } from '../dom';
import { pastille } from './commun';

const SOUS_TITRE = 'c’est un niveau, pas une prédiction ; la performance sur longue distance dépend aussi du volume';
const SANS_SOURCE = 'Aucun test ni course de 5 km : pas de niveau estimé.';

/** Rend P5 dans `conteneur`, en remplaçant son contenu. */
export function rendreP5(conteneur: HTMLElement, vue: Vue): void {
  const niveau = niveauEstime(vue);
  // Le titre, puis le sous-titre juste dessous : deux éléments frères, sans conteneur de mise en page.
  const titre = [el('h2', { id: 'p5-titre' }, ['Niveau estimé']), el('p', { class: 'aide p5-sous-titre' }, [SOUS_TITRE])];
  if (niveau.source === null) {
    conteneur.replaceChildren(el('section', { class: 'p5', 'aria-labelledby': 'p5-titre' }, [...titre, el('p', { class: 'aide' }, [SANS_SOURCE])]));
    return;
  }
  conteneur.replaceChildren(
    el('section', { class: 'p5', 'aria-labelledby': 'p5-titre' }, [
      ...titre,
      el('p', { class: 'aide p5-source' }, [libelleSource(niveau.source)]),
      el('div', { class: 'tablebox', tabindex: '0', role: 'region', 'aria-label': 'Niveau estimé par distance' }, [
        el('table', { class: 'p5-table' }, [
          el('caption', { class: 'visuellement-masque' }, ['Niveau estimé par distance']),
          el('thead', {}, [
            el(
              'tr',
              {},
              ['Distance', 'Équivalence', 'Allure', 'Record', 'Date du record', 'Écart au record'].map((titreCol, i) =>
                el('th', { scope: 'col', class: NUMERIQUES.has(i) ? 'num' : '' }, [titreCol]),
              ),
            ),
          ]),
          el('tbody', {}, niveau.lignes.map(ligneTableau)),
        ]),
      ]),
    ]),
  );
}

/** Les colonnes numériques (index de colonne) sont alignées à droite : équivalence, allure, record, écart. */
const NUMERIQUES = new Set([1, 2, 3, 5]);

function libelleSource(source: SourceNiveau): string {
  const nature = source.type === 'test' ? 'Test' : 'Course';
  return `Source : ${nature.toLowerCase()} de 5 km du ${formatDate(source.date)}, en ${formatTempsCourse(source.temps_s)}.`;
}

function ligneTableau(l: LigneNiveau): HTMLElement {
  return el('tr', {}, [
    el('th', { scope: 'row' }, [l.libelle]),
    el('td', { class: 'num' }, [formatTempsCourse(l.equivalence_s)]),
    el('td', { class: 'num' }, [`${formatAllure(l.allure_skm)}/km`]),
    el('td', { class: 'num' }, [l.record === null ? '–' : formatTempsCourse(l.record.temps_s)]),
    el('td', {}, [l.libelleDateRecord]),
    el('td', { class: 'num' }, [celluleEcart(l)]),
  ]);
}

/**
 * L'écart au record : « −2:04 » en pastille verte quand l'équivalence bat le record (D-015, comparée à la seconde).
 * Sans record, « – ». Un écart nul, « = ».
 */
function celluleEcart(l: LigneNiveau): HTMLElement | string {
  if (l.ecart_s === null) return '–';
  if (l.ecart_s === 0) return '=';
  const signe = l.ecart_s > 0 ? '+' : '−';
  const texte = `${signe}${formatTempsCourse(Math.abs(l.ecart_s))}`;
  return l.bat ? pastille(texte, 'good') : texte;
}
