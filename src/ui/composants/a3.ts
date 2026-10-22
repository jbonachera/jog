// A3 · 7 derniers jours (03) : une ligne par jour, de J−1 à J−7, la plus récente en haut.
// Les jours sans séance comptent (Repos). Plusieurs séances d'un même jour se listent sous ce jour.
import { arrondirDecimales } from '../../core/arrondi';
import { ajouterJours, decomposerDate, jourDeSemaine } from '../../core/dates';
import { formatAllure, formatDuree, formatNombre } from '../../core/format';
import type { DateCivile, Minutes, SeanceVue as Seance, Vue } from '../../core/types';
import { el, svgEl } from '../dom';

const NB_JOURS = 7;
const NOMS_JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const NOMS_JOURS_LONGS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const NOMS_MOIS_LONGS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const INTENSITES: { cle: keyof Minutes; classe: string; nom: string }[] = [
  { cle: 'easy', classe: 'z-easy', nom: 'Facile' },
  { cle: 'mp', classe: 'z-mp', nom: 'Allure marathon' },
  { cle: 'subt', classe: 'z-subt', nom: 'Sous-seuil' },
  { cle: 'hard', classe: 'z-hard', nom: 'Au-dessus du seuil' },
];

/** Rend A3 dans `conteneur`, en remplaçant son contenu. */
export function rendreA3(conteneur: HTMLElement, vue: Vue): void {
  const dates = Array.from({ length: NB_JOURS }, (_, i) => ajouterJours(vue.J, -(i + 1)));
  const parJour = new Map<DateCivile, Seance[]>(dates.map((d) => [d, []]));
  for (const seance of vue.seances) parJour.get(seance.date)?.push(seance);
  const retenues = dates.flatMap((d) => parJour.get(d) ?? []);

  const section = el('section', { class: 'a3', 'aria-labelledby': 'a3-titre' }, [
    el('div', { class: 'sec-head' }, [el('h2', { id: 'a3-titre' }, ['7 derniers jours']), el('p', { class: 'resume' }, [resumer(retenues)])]),
    el(
      'ul',
      { class: 'a3-jours', role: 'list' },
      dates.map((d) => ligneJour(d, parJour.get(d) ?? [])),
    ),
  ]);
  conteneur.replaceChildren(section);
}

function resumer(seances: Seance[]): string {
  const n = seances.length;
  const km = seances.reduce((somme, s) => somme + s.km, 0);
  const sousSeuil = seances.reduce((somme, s) => somme + s.minutes.subt, 0);
  const compte = n <= 1 ? `${n} séance` : `${n} séances`;
  return `${compte} · ${formatNombre(km, 1)} km · ${formatNombre(sousSeuil, 0)} min de sous-seuil`;
}

function ligneJour(date: DateCivile, seances: Seance[]): HTMLLIElement {
  const sansSeance = seances.length === 0;
  const contenu = sansSeance ? [ligneRepos()] : seances.map(ligneSeance);
  return el('li', { class: sansSeance ? 'a3-jour repos' : 'a3-jour', 'aria-label': libelleJourComplet(date) }, [
    el('time', { class: 'a3-date', datetime: date }, [libelleDate(date)]),
    el('div', { class: 'a3-seances' }, contenu),
  ]);
}

/** Date courte, sans zéro devant le quantième (« mar. 5 »). */
function libelleDate(date: DateCivile): string {
  return `${NOMS_JOURS[jourDeSemaine(date)] ?? ''} ${decomposerDate(date).jour}`;
}

/** Nom accessible complet du jour (« lundi 19 octobre »). */
function libelleJourComplet(date: DateCivile): string {
  const { jour, mois } = decomposerDate(date);
  return `${NOMS_JOURS_LONGS[jourDeSemaine(date)] ?? ''} ${jour} ${NOMS_MOIS_LONGS[mois - 1] ?? ''}`;
}

function ligneRepos(): HTMLDivElement {
  return el('div', { class: 'a3-seance' }, [el('span', { class: 'a3-libelle' }, ['Repos'])]);
}

function ligneSeance(seance: Seance): HTMLDivElement {
  const lignes: Node[] = [
    el('span', { class: 'a3-libelle' }, [libelleSeance(seance)]),
    el('span', { class: 'a3-detail' }, [detailsSeance(seance)]),
  ];
  const barre = barreIntensite(seance);
  if (barre !== null) lignes.push(barre);
  return el('div', { class: 'a3-seance' }, lignes);
}

/** Libellé de séance (03, A3) : « Footing », « Sous-seuil 6×6′ », « Sortie longue dont 40′ allure marathon »… */
export function libelleSeance(seance: Seance): string {
  switch (seance.type) {
    case 'footing':
      return 'Footing';
    case 'footing-lignes-droites':
      return 'Footing + lignes droites';
    case 'sous-seuil':
      return seance.format === null ? 'Sous-seuil' : `Sous-seuil ${seance.format}`;
    case 'sortie-longue': {
      if (seance.mp_min < 1) return 'Sortie longue';
      return `Sortie longue dont ${arrondirDecimales(seance.mp_min, 0)}′ allure marathon`;
    }
    case 'course':
      return seance.distanceRef_km === null ? 'Course' : `Course · ${distanceKm(seance.distanceRef_km)}`;
    case 'test':
      return seance.distanceRef_km === null ? 'Test' : `Test · ${distanceKm(seance.distanceRef_km)}`;
  }
}

function distanceKm(km: number): string {
  return `${formatNombre(km, Number.isInteger(km) ? 0 : 1)} km`;
}

/** Détails en chasse fixe : « 1h05 · 12,3 km · 142 bpm », plus l'allure des répétitions pour un sous-seuil. */
function detailsSeance(seance: Seance): string {
  const morceaux = [formatDuree(seance.duree_min)];
  if (seance.km > 0) morceaux.push(`${formatNombre(seance.km, 1)} km`);
  if (seance.fcMoy !== null) morceaux.push(`${formatNombre(seance.fcMoy, 0)} bpm`);
  const allure = allureRepetitions(seance);
  if (seance.type === 'sous-seuil' && allure !== null) morceaux.push(`rép. ${allure}/km`);
  return morceaux.join(' · ');
}

/** Allure moyenne des répétitions (moyenne arithmétique des allures finies), ou null. */
function allureRepetitions(seance: Seance): string | null {
  const allures = seance.repetitions.map((r) => r.allure_skm).filter((a) => Number.isFinite(a));
  if (allures.length === 0) return null;
  return formatAllure(allures.reduce((somme, a) => somme + a, 0) / allures.length);
}

/**
 * Barre de répartition par intensité (SVG, couleurs --z-*), ou null sans minutes. Les segments se
 * suivent sans trou ; l'espace de 1 px entre eux vient de la feuille de style (08).
 */
function barreIntensite(seance: Seance): SVGSVGElement | null {
  const total = INTENSITES.reduce((somme, i) => somme + seance.minutes[i.cle], 0);
  if (total <= 0) return null;
  const legende = INTENSITES.filter((i) => arrondirDecimales(seance.minutes[i.cle], 0) > 0)
    .map((i) => `${i.nom} ${formatNombre(seance.minutes[i.cle], 0)} min`)
    .join(', ');
  const svg = svgEl('svg', {
    class: 'a3-barre',
    viewBox: '0 0 100 4',
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': `Répartition : ${legende}`,
    focusable: 'false',
  }) as SVGSVGElement;
  let x = 0;
  for (const intensite of INTENSITES) {
    const minutes = seance.minutes[intensite.cle];
    if (minutes <= 0) continue;
    const largeur = (minutes / total) * 100;
    svg.append(svgEl('rect', { class: intensite.classe, x, y: 0, width: largeur, height: 4 }));
    x += largeur;
  }
  return svg;
}
