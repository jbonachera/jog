// A4 · Forme et fatigue (03, 08) : graphique forme / fatigue (CTL en aire accent, ATL), graphique de
// fraîcheur (TSB, bande de −25 à −10, ligne zéro), puis une note en quatre paragraphes. Un jour sur deux.
import { arrondirDecimales } from '../../core/arrondi';
import { formatDate, formatEcart, formatNombre } from '../../core/format';
import type { DateCivile, Vue } from '../../core/types';
import { el } from '../dom';
import { rendreGraphique, type OptionsGraphique } from '../graph';

const MOINS = '−';
type Point = Vue['serieCharge'][number];

/** Rend A4 dans `conteneur`, en remplaçant son contenu. */
export function rendreA4(conteneur: HTMLElement, vue: Vue): void {
  const echantillon = echantillonner(vue.serieCharge);
  const formeBloc = el('div', { class: 'a4-forme' });
  const fraicheurBloc = el('div', { class: 'a4-fraicheur' });
  rendreGraphique(formeBloc, optionsForme(echantillon));
  rendreGraphique(fraicheurBloc, optionsFraicheur(echantillon));

  conteneur.replaceChildren(
    el('section', { class: 'a4', 'aria-labelledby': 'a4-titre' }, [
      el('div', { class: 'sec-head' }, [el('h2', { id: 'a4-titre' }, ['Forme et fatigue'])]),
      formeBloc,
      fraicheurBloc,
      el('div', { class: 'note' }, notes(vue)),
    ]),
  );
}

/** Un point sur deux, en comptant depuis J−1 : le dernier jour est toujours tracé. */
function echantillonner(serie: Point[]): Point[] {
  return serie.filter((_, i) => (serie.length - 1 - i) % 2 === 0);
}

function optionsForme(serie: Point[]): OptionsGraphique {
  return {
    id: 'a4-forme',
    titreAccessible: 'Forme de fond et fatigue, un point sur deux',
    largeur: 600,
    hauteur: 200,
    x: { type: 'date', format: (d: DateCivile) => formatDate(d) },
    y: { preset: 'formeFond', format: (v) => formatNombre(v, 0) },
    series: [
      { nom: 'Forme de fond (CTL)', type: 'ligne', classe: 'couleur-accent', aire: true, donnees: serie.map((p) => ({ x: p.date, y: p.ctl })) },
      { nom: 'Fatigue (ATL)', type: 'ligne', classe: 'couleur-ink-2', donnees: serie.map((p) => ({ x: p.date, y: p.atl })) },
    ],
    tableau: {
      titreX: 'Date',
      colonnes: [
        { titre: 'Forme de fond (CTL)', valeur: (p) => formatNombre(p.y, 0) },
        { titre: 'Fatigue (ATL)', valeur: (p) => formatNombre(p.y, 0) },
      ],
    },
  };
}

function optionsFraicheur(serie: Point[]): OptionsGraphique {
  return {
    id: 'a4-fraicheur',
    titreAccessible: 'Fraîcheur, différence entre forme et fatigue',
    largeur: 600,
    hauteur: 130,
    x: { type: 'date', format: (d: DateCivile) => formatDate(d) },
    y: { preset: 'fraicheur', format: (v) => formatEcart(v, 0) },
    series: [{ nom: 'Fraîcheur (TSB)', type: 'ligne', classe: 'couleur-ink-2', donnees: serie.map((p) => ({ x: p.date, y: p.tsb })) }],
    bandes: [{ de: -25, a: -10, libelle: 'productif' }],
    zero: true,
    tableau: {
      titreX: 'Date',
      colonnes: [{ titre: 'Fraîcheur (TSB)', valeur: (p) => formatEcart(p.y, 0) }],
    },
  };
}

/** La note : définitions avec les constantes des paramètres, repères, et lecture du jour (03, A4). */
function notes(vue: Vue): HTMLElement[] {
  const { ctlDays, atlDays } = vue.parametresEnVigueur.globaux;
  const paragraphes = [
    `Forme de fond (CTL) : moyenne de la charge quotidienne sur ${ctlDays} jours. Elle monte lentement quand on s’entraîne avec régularité, et c’est elle qui reflète la condition construite.`,
    `Fatigue (ATL) : même calcul sur ${atlDays} jours. Elle réagit vite aux grosses séances et retombe vite au repos.`,
    `Fraîcheur (TSB) = forme de fond − fatigue, à la veille. De ${MOINS}10 à ${MOINS}25 (zone teintée), on charge et on progresse. Sous ${MOINS}25, la fatigue dépasse nettement ce que la forme absorbe : surcharge, en alerte. Au-dessus de +5, on est frais, mais si ça dure, le stimulus baisse.`,
  ];
  const dernier = dernierJour(vue.serieCharge);
  if (dernier !== null) {
    const etat = etatFraicheur(dernier.tsb);
    paragraphes.push(
      `Aujourd’hui : forme de fond ${formatNombre(dernier.ctl, 0)}, fatigue ${formatNombre(dernier.atl, 0)}, fraîcheur ${formatEcart(dernier.tsb, 0)}, soit ${etat}. La charge est calculée à partir de la durée et de l’intensité de chaque séance ; seule la tendance compte, pas la valeur absolue.`,
    );
  }
  return paragraphes.map((texte) => el('p', {}, [texte]));
}

function dernierJour(serie: Point[]): Point | null {
  let dernier: Point | null = null;
  for (const point of serie) if (dernier === null || point.date > dernier.date) dernier = point;
  return dernier;
}

/** L'état de la fraîcheur, sur la valeur arrondie au point (D-015) : celle que l'athlète lit. */
function etatFraicheur(tsb: number): string {
  const v = arrondirDecimales(tsb, 0);
  if (v < -25) return 'surcharge, en alerte';
  if (v <= -10) return 'charge productive';
  if (v <= 5) return 'équilibre';
  return 'frais, à surveiller';
}
