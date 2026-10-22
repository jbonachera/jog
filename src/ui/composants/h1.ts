// H1 · Saisons et volume hebdomadaire (03, H1 ; D-011). Une barre empilée par semaine, en km répartis par intensité au
// prorata des minutes. Graduation tous les 20 km, résultats de course en repères, ligne « aujourd’hui » dans la semaine
// en cours, mois sur l’axe X, légende des quatre intensités. Aucune semaine future (la sélection ne sort pas de J−1).
import { decomposerDate, numeroJour } from '../../core/dates';
import { formatDate, formatDateAnnee, formatDuree, formatNombre, formatPourcentage } from '../../core/format';
import {
  selectionHistorique,
  type CourseHistorique,
  type PeriodeHistorique,
  type SelectionHistorique,
  type SemaineHistorique,
} from '../../core/selecteurs';
import type { DateCivile, Vue } from '../../core/types';
import { el } from '../dom';
import { rendreGraphique, type OptionsGraphique, type Serie } from '../graph';
import { nombreSemaines } from './commun';
import type { RepereX } from '../graph/types';

/** Le nom de la période, dans le titre accessible du graphique. */
const LIBELLES_PERIODE: Record<PeriodeHistorique, string> = {
  '12': 'les 12 dernières semaines',
  '26': 'les 26 dernières semaines',
  toutes: 'toutes les saisons',
};

/** Rend H1 dans `conteneur`, en remplaçant son contenu. */
export function rendreH1(conteneur: HTMLElement, vue: Vue, periode: PeriodeHistorique): void {
  const selection = selectionHistorique(vue, periode);
  const graphe = el('div');
  rendreGraphique(graphe, optionsH1(selection, vue.J, periode));
  conteneur.replaceChildren(
    el('section', { class: 'h1', 'aria-labelledby': 'h1-titre' }, [
      el('div', { class: 'sec-head' }, [
        el('h2', { id: 'h1-titre' }, ['Saisons et volume hebdomadaire']),
        el('p', { class: 'resume' }, [nombreSemaines(selection.semaines.length)]),
      ]),
      graphe,
    ]),
  );
}

function optionsH1(selection: SelectionHistorique, J: DateCivile, periode: PeriodeHistorique): OptionsGraphique {
  const { semaines } = selection;
  const parLundi = new Map(semaines.map((s) => [s.lundi, s] as const));
  const serie = (nom: string, classe: string, valeur: (s: SemaineHistorique) => number): Serie => ({
    nom,
    type: 'barres-empilees',
    classe,
    donnees: semaines.map((s) => ({ x: s.lundi, y: valeur(s) })),
  });
  return {
    id: 'h1-saisons',
    titreAccessible: `Km par semaine, répartis par intensité, ${LIBELLES_PERIODE[periode]}`,
    largeur: 1200,
    hauteur: 270,
    x: {
      type: 'date',
      // Le libellé est la date du lundi. Sur l’axe, seule la première semaine de chaque mois est étiquetée : celle dont
      // le lundi tombe entre le 1er et le 7. En janvier, l’année s’ajoute (« 5 janv. 26 »).
      format: libelleAxe,
      etiquettes: semaines.filter((s) => decomposerDate(s.lundi).jour <= 7).map((s) => s.lundi),
    },
    y: { pas: 20, format: (v) => formatNombre(v), unite: 'km' },
    series: [
      serie('Facile', 'couleur-facile', (s) => s.kmParIntensite.easy),
      serie('Allure marathon', 'couleur-mp', (s) => s.kmParIntensite.mp),
      serie('Sous-seuil', 'couleur-sous-seuil', (s) => s.kmParIntensite.subt),
      serie('Au-dessus du seuil', 'couleur-au-dessus', (s) => s.kmParIntensite.hard),
    ],
    reperesX: reperes(selection, J),
    detail: (x) => {
      const semaine = typeof x === 'string' ? parLundi.get(x) : undefined;
      return semaine === undefined ? [] : lignesSemaine(semaine);
    },
    nomAffichage: 'Affichage des saisons',
    tableau: {
      titreX: 'Semaine',
      libelleLigne: (x) => (typeof x === 'string' ? formatDateAnnee(x) : String(x)),
      colonnes: [
        { titre: 'Facile', valeur: (p) => formatNombre(p.y, 1) },
        { titre: 'Allure marathon', valeur: (p) => formatNombre(p.y, 1) },
        { titre: 'Sous-seuil', valeur: (p) => formatNombre(p.y, 1) },
        { titre: 'Au-dessus du seuil', valeur: (p) => formatNombre(p.y, 1) },
      ],
    },
  };
}

/**
 * Libellé de l’axe X de H1 : la date du lundi, avec l’année pour janvier seulement (« 5 janv. 26 », « 2 févr. »).
 */
function libelleAxe(d: DateCivile): string {
  return decomposerDate(d).mois === 1 ? formatDateAnnee(d) : formatDate(d);
}

/**
 * Les repères de H1 : « aujourd’hui » à la position de J (03 : ligne « aujourd’hui » dans la semaine en cours) (absent si
 * J est un lundi), et les courses de la période. Une semaine est centrée sur son lundi, et couvre sept jours : le jour
 * d’une date est à `numeroJour − 3`. La semaine en cours est celle de J−1 (voir la sélection), donc J−1 y tombe.
 */
function reperes(selection: SelectionHistorique, J: DateCivile): RepereX[] {
  const abscisseDuJour = (d: DateCivile): number => numeroJour(d) - 3;
  const reperesX: RepereX[] = [];
  if (selection.aujourdhui.indiceSemaine !== null) {
    reperesX.push({ abscisse: abscisseDuJour(J), libelle: "aujourd’hui", accent: true });
  }
  for (const semaine of selection.semaines) {
    for (const course of semaine.courses) {
      reperesX.push({ abscisse: abscisseDuJour(course.date), libelle: libelleCourse(course) });
    }
  }
  return reperesX;
}

/** Libellé d’une course : « 5 km · 19:51 ». Sans distance de référence, le seul temps ; sans rien, « Course ». */
function libelleCourse(course: CourseHistorique): string {
  const morceaux = [course.distance, course.temps].filter((m): m is string => m !== null);
  return morceaux.length === 0 ? 'Course' : morceaux.join(' · ');
}

/** L’infobulle d’une semaine : durée, km, minutes de sous-seuil et part, ratio 7 j / 30 j (03, H1). */
function lignesSemaine(semaine: SemaineHistorique): string[] {
  return [
    `Semaine du ${formatDateAnnee(semaine.lundi)}`,
    `Durée : ${formatDuree(semaine.min)}`,
    `Km : ${formatNombre(semaine.km, 1)} km`,
    `Sous-seuil : ${formatNombre(semaine.minutes.subt)} min, ${semaine.partSSPct === null ? '–' : formatPourcentage(semaine.partSSPct)}`,
    `Ratio 7 j / 30 j : ${semaine.ratioDimanche === null ? '–' : formatNombre(semaine.ratioDimanche, 2)}`,
  ];
}
