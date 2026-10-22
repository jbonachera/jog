// Vue tableau (D-011) : des en-têtes réels (`th scope`), des tirets pour une valeur absente, et les formats des colonnes.
// Par défaut, une ligne par abscisse : deux points d'une série « points » à la même abscisse ont chacun leur ligne, à
// cette abscisse. Avec `tableau.parPoint`, une ligne par point de chaque série (P3, P4 : une ligne par répétition).
import { el } from '../dom';
import { AUCUNE_DONNEE, groupesParAbscisse, parAbscisse, type Modele, type PointGraphique } from './modele';
import type { ColonneTableau, Donnee } from './types';

const SANS_VALEUR = '–';

/** Tableau des séries de `modele`, dans un conteneur qui défile. Les formats viennent des colonnes. */
export function construireTableau(modele: Modele): HTMLElement {
  if (modele.vide) return el('p', { class: 'graphique-vide' }, [AUCUNE_DONNEE]);
  const { options, series } = modele;
  // Les colonnes déclarées remplacent celles des séries ; sans déclaration, une colonne par série (titre et format de la série).
  const colonnes: ColonneTableau[] =
    options.tableau.colonnes.length > 0
      ? options.tableau.colonnes.map((c, i) => ({ ...c, serie: c.serie ?? i }))
      : series.map((s, i) => ({ titre: s.serie.nom, valeur: (p: Donnee) => options.y.format(p.y), serie: i }));

  if (options.tableau.parPoint === true) {
    const lignes = series.flatMap((s) => [...s.points].sort((p, q) => p.ordre - q.ordre)).map((p) => ligneDePoint(p, colonnes));
    const enTete = el('tr', {}, colonnes.map((c) => el('th', { scope: 'col' }, [c.titre])));
    return tableau(options.titreAccessible, enTete, lignes);
  }

  const titreX = options.tableau.titreX ?? (options.x.type === 'date' ? 'Date' : 'Valeur');
  const enTete = el('tr', {}, [el('th', { scope: 'col' }, [titreX]), ...colonnes.map((c) => el('th', { scope: 'col' }, [c.titre]))]);
  return tableau(options.titreAccessible, enTete, lignesParAbscisse(modele, colonnes));
}

function tableau(titre: string, enTete: HTMLElement, lignes: HTMLElement[]): HTMLElement {
  const table = el('table', { class: 'tableau-graphique' }, [
    el('caption', { class: 'tableau-titre' }, [titre]),
    el('thead', {}, [enTete]),
    el('tbody', {}, lignes),
  ]);
  // Le conteneur défile : il est focalisable au clavier (08) et nommé comme le graphique (D-011).
  return el('div', { class: 'graphique-tableau', tabindex: '0', role: 'region', 'aria-label': titre }, [table]);
}

/** Une ligne par abscisse, et une ligne de plus par point supplémentaire à cette abscisse, dans une série. */
function lignesParAbscisse(modele: Modele, colonnes: ColonneTableau[]): HTMLElement[] {
  // Seule une série « points » garde tous ses points à une abscisse ; une courbe ou une barre garde le premier (D-011).
  const groupes = modele.series.map((s) =>
    s.serie.type === 'points' ? groupesParAbscisse(s) : new Map([...parAbscisse(s)].map(([abscisse, point]) => [abscisse, [point]])),
  );
  return modele.abscisses.flatMap((a) => {
    const hauteur = Math.max(1, ...groupes.map((g) => g.get(a.abscisse)?.length ?? 0));
    return Array.from({ length: hauteur }, (_, rang) =>
      el('tr', {}, [
        el('th', { scope: 'row' }, [a.libelleLigne]),
        ...colonnes.map((colonne) => {
          const point = groupes[colonne.serie ?? -1]?.get(a.abscisse)?.[rang];
          return el('td', { class: 'num' }, [point === undefined ? SANS_VALEUR : colonne.valeur(point.donnee)]);
        }),
      ]),
    );
  });
}

function ligneDePoint(point: PointGraphique, colonnes: ColonneTableau[]): HTMLElement {
  return el('tr', {}, colonnes.map((colonne) => el('td', {}, [colonne.valeur(point.donnee)])));
}
