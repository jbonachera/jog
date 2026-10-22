// P1 · Comparer deux périodes (03, P1 ; 04, « Comparateur de périodes » ; 02, persistance `fjord-cmp-p`).
// Préréglages, deux couples de dates bornés à l'historique, tableau en 5 colonnes, écarts formatés selon le type de
// mesure. Une période invalide affiche un message et ne recalcule pas.
import { ajouterJours, estDateCivile } from '../../core/dates';
import { formatAllure, formatDateAnnee, formatDuree, formatEcart, formatEcartPoints, formatNombre, formatPourcentage, formatTempsCourse } from '../../core/format';
import { indexerParametres } from '../../core/parametres';
import {
  comparer,
  ErreurPeriodeInvalide,
  prereglage,
  type Comparaison,
  type Mesure,
  type ParamsAuJour,
  type Prereglage,
} from '../../core/progression';
import type { Vue } from '../../core/types';
import { el } from '../dom';
import { pastille, type Teinte } from './commun';

/** Le stockage minimal que P1 utilise (localStorage en production). Toute opération peut lever (02). */
export interface StockageProgression {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
}

const CLE_COMPARATEUR = 'fjord-cmp-p';
const PERSONNALISEES = 'personnalisees';

type Choix = Prereglage | typeof PERSONNALISEES;

const CHOIX: readonly { valeur: Choix; libelle: string }[] = [
  { valeur: 'douze-semaines-precedentes', libelle: '12 dernières semaines / 12 précédentes' },
  { valeur: 'douze-semaines-annee-precedente', libelle: '12 dernières semaines / même période il y a un an' },
  { valeur: PERSONNALISEES, libelle: 'Dates personnalisées' },
];

/** Les quatre dates du comparateur : début et fin de A, début et fin de B. */
type Dates = [string, string, string, string];

interface Etat {
  preset: Choix;
  dates: Dates;
}

/**
 * Les dates courantes du comparateur, ou nulles si elles sont invalides. Le préréglage vaut le défaut s'il est absent,
 * inconnu ou illisible. Les dates d'un préréglage se recalculent toujours à partir de J.
 */
function lireEtat(vue: Vue, stockage: StockageProgression | null): Etat {
  const defaut = etatDePrereglage(vue, 'douze-semaines-precedentes');
  try {
    const brut = stockage?.getItem(CLE_COMPARATEUR);
    if (brut === null || brut === undefined) return defaut;
    const lu = JSON.parse(brut) as unknown;
    if (!estObjet(lu)) return defaut;
    const preset = CHOIX.find((c) => c.valeur === lu['preset'])?.valeur;
    if (preset === undefined) return defaut;
    if (preset !== PERSONNALISEES) return etatDePrereglage(vue, preset);
    const dates = lu['dates'];
    if (Array.isArray(dates) && dates.length === 4 && dates.every((d) => typeof d === 'string')) {
      const valeurs = [dates[0], dates[1], dates[2], dates[3]] as Dates;
      // Une mémoire illisible (dates inexistantes, ou période à l'envers) ne sert pas : retour au défaut.
      return dateValides(valeurs) ? { preset, dates: valeurs } : defaut;
    }
    return defaut;
  } catch {
    return defaut;
  }
}

function etatDePrereglage(vue: Vue, nom: Prereglage): Etat {
  const { a, b } = prereglage(vue, nom);
  return { preset: nom, dates: [a[0], a[1], b[0], b[1]] };
}

/** Les quatre dates sont des dates civiles valides, et chaque période va du début à la fin (ou à l'égal). */
function dateValides([aDebut, aFin, bDebut, bFin]: Dates): boolean {
  if (![aDebut, aFin, bDebut, bFin].every(estDateCivile)) return false;
  return aDebut <= aFin && bDebut <= bFin;
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

function ecrireEtat(stockage: StockageProgression | null, etat: Etat): void {
  try {
    stockage?.setItem(CLE_COMPARATEUR, JSON.stringify(etat));
  } catch {
    // Stockage indisponible : le choix n'est simplement pas mémorisé.
  }
}

/**
 * Les paramètres datés à une date donnée (D-006), construits dans le fil principal à partir de la Vue. Tant que la Vue
 * ne porte pas les modifications datées, les valeurs par défaut s'appliquent (aucune modification).
 */
export function paramsAuJourDe(vue: Vue): ParamsAuJour {
  const index = indexerParametres({
    globaux: vue.parametresEnVigueur.globaux,
    modifs: vue.parametresEnVigueur.modifs ?? [],
  });
  return (date) => index.auJour(date);
}

/** Rend P1 dans `conteneur`, en remplaçant son contenu. Le choix est mémorisé sous `fjord-cmp-p` (02). */
export function rendreP1(conteneur: HTMLElement, vue: Vue, stockage: StockageProgression | null = null): void {
  const etat = lireEtat(vue, stockage);
  const paramsAuJour = paramsAuJourDe(vue);

  const selecteur = el('select', { id: 'p1-preset' }, CHOIX.map((c) => el('option', { value: c.valeur }, [c.libelle])));
  selecteur.value = etat.preset;
  const aDebut = champDate('p1-a-debut', 'Début de la période A', etat.dates[0], vue);
  const aFin = champDate('p1-a-fin', 'Fin de la période A', etat.dates[1], vue);
  const bDebut = champDate('p1-b-debut', 'Début de la période B', etat.dates[2], vue);
  const bFin = champDate('p1-b-fin', 'Fin de la période B', etat.dates[3], vue);
  const champs = [aDebut, aFin, bDebut, bFin];
  const statut = el('p', { class: 'muted p1-statut', role: 'status' });
  const tableau = el('div', { class: 'tablebox p1-tableau', tabindex: '0', role: 'region', 'aria-label': 'Comparaison des deux périodes' });

  /** Recalcule le tableau à partir des dates saisies. Une période invalide garde le tableau précédent. */
  const recalculer = (): void => {
    const dates = dateValeurs();
    champs.forEach((champ) => champ.input.removeAttribute('aria-invalid'));
    try {
      const comparaison = comparer(vue, [dates[0], dates[1]], [dates[2], dates[3]], paramsAuJour);
      tableau.replaceChildren(tableauComparaison(comparaison));
      statut.textContent = '';
      ecrireEtat(stockage, { preset: selecteur.value as Choix, dates });
    } catch (erreur) {
      if (!(erreur instanceof ErreurPeriodeInvalide)) throw erreur;
      statut.textContent = messageInvalide(erreur);
      marquerInvalides(erreur, champs);
    }
  };

  function dateValeurs(): Dates {
    return [aDebut.input.value, aFin.input.value, bDebut.input.value, bFin.input.value];
  }

  selecteur.addEventListener('change', () => {
    const choix = selecteur.value as Choix;
    if (choix !== PERSONNALISEES) {
      // Un préréglage remplit les quatre dates ; la saisie reste ensuite libre.
      const { dates } = etatDePrereglage(vue, choix as Prereglage);
      champs.forEach((champ, i) => {
        champ.input.value = dates[i] ?? '';
      });
    }
    recalculer();
  });

  for (const champ of champs) {
    champ.input.addEventListener('change', () => {
      // Modifier une date bascule sur « Dates personnalisées ».
      selecteur.value = PERSONNALISEES;
      recalculer();
    });
  }

  conteneur.replaceChildren(
    el('section', { class: 'p1', 'aria-labelledby': 'p1-titre' }, [
      el('div', { class: 'sec-head' }, [
        el('h2', { id: 'p1-titre' }, ['Comparer deux périodes']),
        el('div', { class: 'cmp-ctl' }, [el('label', { for: 'p1-preset', class: 'muted' }, ['Comparer']), selecteur]),
      ]),
      el('div', { class: 'cmp-dates' }, [
        el('fieldset', {}, [el('legend', {}, ['Période A (référence)']), ...enfantsChamp(aDebut), el('span', {}, ['→']), ...enfantsChamp(aFin)]),
        el('fieldset', {}, [el('legend', {}, ['Période B (comparée)']), ...enfantsChamp(bDebut), el('span', {}, ['→']), ...enfantsChamp(bFin)]),
      ]),
      statut,
      tableau,
      el('p', { class: 'aide' }, ['Valeurs ramenées à la semaine pour comparer des périodes de durées différentes. Vert : meilleur sur la période B ; orange : moins bon.']),
    ]),
  );
  recalculer();
}

interface ChampDate {
  libelle: HTMLLabelElement;
  input: HTMLInputElement;
}

function enfantsChamp(champ: ChampDate): HTMLElement[] {
  return [champ.libelle, champ.input];
}

function champDate(id: string, libelle: string, valeur: string, vue: Vue): ChampDate {
  const input = el('input', { type: 'date', id, max: ajouterJours(vue.J, -1) }) as HTMLInputElement;
  if (vue.premierJour !== null) input.min = vue.premierJour;
  input.value = valeur;
  return { libelle: el('label', { for: id }, [libelle]) as HTMLLabelElement, input };
}

/**
 * Marque le champ fautif (`aria-invalid`) : la fin de la période en cas d'ordre inversé, et les dates inexistantes de la
 * période sinon. Le champ n'est marqué que s'il est en cause.
 */
function marquerInvalides(erreur: ErreurPeriodeInvalide, champs: ChampDate[]): void {
  const [debut, fin] = erreur.periode === 'A' ? [champs[0], champs[1]] : [champs[2], champs[3]];
  const fautifs = erreur.raison === 'ordre' ? [fin] : [debut, fin].filter((c) => c !== undefined && !estDateCivile(c.input.value));
  for (const champ of fautifs) champ?.input.setAttribute('aria-invalid', 'true');
}

function messageInvalide(erreur: ErreurPeriodeInvalide): string {
  const raison = erreur.raison === 'ordre' ? 'la fin précède le début.' : 'date inexistante.';
  return `Période ${erreur.periode} invalide : ${raison}`;
}

// Un groupe commence par une ligne classée `grp` : le filet entre les groupes (03, P1).
function tableauComparaison(c: Comparaison): HTMLElement {
  const enTete = el('thead', {}, [
    el('tr', {}, [
      el('th', { scope: 'col' }, ['Groupe']),
      el('th', { scope: 'col' }, ['Mesure']),
      el('th', { scope: 'col', class: 'num' }, [enteteP('Période A', c.a.debut, c.a.fin, c.a.jours, c.historiquePartiel)]),
      el('th', { scope: 'col', class: 'num' }, [enteteP('Période B', c.b.debut, c.b.fin, c.b.jours, false)]),
      el('th', { scope: 'col', class: 'num' }, ['Écart']),
    ]),
  ]);
  let groupePrecedent: string | null = null;
  const lignes = c.mesures.map((m) => {
    const debutGroupe = m.groupe !== groupePrecedent;
    groupePrecedent = m.groupe;
    return el('tr', { class: debutGroupe ? 'grp' : '' }, [
      el('td', {}, [debutGroupe ? m.groupe : '']),
      el('td', {}, [m.nom]),
      el('td', { class: 'num' }, [valeurTexte(m, m.a)]),
      el('td', { class: 'num' }, [valeurTexte(m, m.b)]),
      el('td', { class: 'num' }, [celluleEcart(m)]),
    ]);
  });
  return el('table', { class: 'p1-table' }, [
    el('caption', { class: 'visuellement-masque' }, ['Comparaison des deux périodes']),
    enTete,
    el('tbody', {}, lignes),
  ]);
}

function enteteP(nom: string, debut: string | null, fin: string | null, jours: number, partiel: boolean): HTMLElement {
  const plage = debut === null || fin === null ? '–' : `${formatDateAnnee(debut)} – ${formatDateAnnee(fin)}`;
  const enfants: (string | HTMLElement)[] = [nom, el('span', { class: 'muted p1-plage' }, [`${plage} · ${jours} j`])];
  if (partiel) enfants.push(el('span', { class: 'pastille pastille-neutre p1-partiel' }, ['historique partiel']));
  return el('span', { class: 'p1-entete' }, enfants);
}

/** La valeur d'une mesure, écrite selon son type ; « – » si elle est absente. */
function valeurTexte(m: Mesure, v: number | null): string {
  if (v === null) return '–';
  switch (m.cle) {
    case 'km':
      return `${formatNombre(v, 1)} km`;
    case 'heures':
      return formatDuree(v * 60);
    case 'seances':
      return formatNombre(v, 1);
    case 'minutesSS':
      return `${formatNombre(v)} min`;
    case 'partSS':
    case 'footings':
      return formatPourcentage(v);
    case 'allure':
      return `${formatAllure(v)}/km`;
    case 'fcFin':
      return `${formatNombre(v)} bpm`;
    case 'ef':
    case 'picRatio':
      return formatNombre(v, 2);
    case 'decouplage':
      return formatPourcentage(v, 1);
    case 'formeMoy':
    case 'formeMax':
      return formatNombre(v);
    case 'test5':
      return formatTempsCourse(v);
  }
}

/** L'écart affiché, avec sa pastille : verte si B fait mieux, orange si moins bien, neutre sans sens. */
function celluleEcart(m: Mesure): HTMLElement | string {
  const affiche = m.ecartAffiche;
  if (affiche === null) return '–';
  if (affiche === 0) return pastille('=', 'neutre');
  const teinte: Record<Mesure['etat'], Teinte> = { mieux: 'good', 'moins-bien': 'warn', neutre: 'neutre', egal: 'neutre' };
  return pastille(ecartTexte(m, affiche), teinte[m.etat]);
}

/** Un écart selon le type de la mesure (03, P1) : s/km, points, h:mm, km, ou temps de test. */
function ecartTexte(m: Mesure, v: number): string {
  const signe = v > 0 ? '+' : '−';
  switch (m.cle) {
    case 'km':
      return `${formatEcart(v, 1)} km`;
    case 'heures':
      return `${signe}${formatDuree(Math.abs(v) * 60)}`;
    case 'seances':
      return formatEcart(v, 1);
    case 'minutesSS':
      return `${formatEcart(v)} min`;
    case 'partSS':
    case 'footings':
      return formatEcartPoints(v);
    case 'decouplage':
      return formatEcartPoints(v, 1);
    case 'allure':
      return `${formatEcart(v)} s/km`;
    case 'fcFin':
      return `${formatEcart(v)} bpm`;
    case 'ef':
    case 'picRatio':
      return formatEcart(v, 2);
    case 'formeMoy':
    case 'formeMax':
      return formatEcart(v);
    case 'test5':
      return `${signe}${formatTempsCourse(Math.abs(v))}`;
  }
}
