// A2 · Volume réalisé (03, 04 « Compteurs », D-011) : trois compteurs (année, 30 jours, 7 jours). Chacun
// donne sa plage, ses km, sa durée et son nombre de séances, sa comparaison, et un mini-graphique en barres.
import { arrondirDecimales } from '../../core/arrondi';
import { ajouterJours } from '../../core/dates';
import { ECART_VOLUME_SIGNALE } from '../../core/constantes';
import { formatDate, formatDuree, formatNombre, formatPourcentage } from '../../core/format';
import type { BarreVolume, Volume, VolumeAnnee } from '../../core/series';
import type { TypeSeance, Vue } from '../../core/types';
import { el, type Enfant } from '../dom';
import { rendreGraphique, type Donnee, type OptionsGraphique, type Serie } from '../graph';
import { kmTexte, pastille, type Teinte } from './commun';

/** Le nom de chaque type de séance, dans l'infobulle d'une barre. Un jour sans séance est un repos. */
const LIBELLES: Record<TypeSeance | 'repos', string> = {
  'sous-seuil': 'Sous-seuil',
  'sortie-longue': 'Sortie longue',
  'footing-lignes-droites': 'Footing + lignes droites',
  footing: 'Footing',
  course: 'Course',
  test: 'Test',
  repos: 'Repos',
};

/** Les deux séries des barres : le sous-seuil, et tout le reste (repos compris). */
const SOUS_SEUIL = 'Sous-seuil';
const AUTRES = 'Autres séances';

/** Rend A2 dans `conteneur`, en remplaçant son contenu. */
export function rendreA2(conteneur: HTMLElement, vue: Vue): void {
  const { J, compteurs } = vue;
  const veille = ajouterJours(J, -1);
  const annee = veille.slice(0, 4);

  const compteursHtml = el('div', { class: 'compteurs' }, [
    compteur({
      titre: `Année ${annee}`,
      plage: `du ${formatDate(`${annee}-01-01`)} au ${formatDate(veille)}`,
      volume: compteurs.annee,
      comparaison: [pastille(`${formatNombre(compteurs.annee.moyenneHebdo_km, 1)} km par semaine`, 'neutre')],
      graphique: { id: 'a2-annee', titre: `Volume par semaine, année ${annee}`, barres: compteurs.annee.serie, hebdo: true },
    }),
    compteur({
      titre: '30 derniers jours',
      plage: `du ${formatDate(ajouterJours(J, -30))} au ${formatDate(veille)}`,
      volume: compteurs.jours30,
      comparaison: comparaison(compteurs.jours30, '30 jours d’avant'),
      graphique: { id: 'a2-30-jours', titre: 'Volume par jour, 30 derniers jours', barres: compteurs.jours30.serie, hebdo: false },
    }),
    compteur({
      titre: '7 derniers jours',
      plage: `du ${formatDate(ajouterJours(J, -7))} au ${formatDate(veille)}`,
      volume: compteurs.jours7,
      comparaison: comparaison(compteurs.jours7, '7 jours d’avant'),
      graphique: { id: 'a2-7-jours', titre: 'Volume par jour, 7 derniers jours', barres: compteurs.jours7.serie, hebdo: false },
    }),
  ]);

  conteneur.replaceChildren(
    el('section', { class: 'a2', 'aria-labelledby': 'a2-titre' }, [
      el('div', { class: 'sec-head' }, [el('h2', { id: 'a2-titre' }, ['Volume réalisé']), el('p', { class: 'resume' }, ['Fenêtres arrêtées à hier soir'])]),
      compteursHtml,
    ]),
  );
}

interface DescriptionCompteur {
  titre: string;
  plage: string;
  volume: Volume | VolumeAnnee;
  comparaison: Enfant[];
  graphique: { id: string; titre: string; barres: BarreVolume[]; hebdo: boolean };
}

function compteur(d: DescriptionCompteur): HTMLElement {
  const { volume } = d;
  const graphe = el('div', { class: 'compteur-graphe' });
  rendreGraphique(graphe, optionsBarres(d.graphique));
  const idTitre = `${d.graphique.id}-titre`;
  return el('article', { class: 'compteur', 'aria-labelledby': idTitre }, [
    el('p', { id: idTitre, class: 'compteur-titre' }, [d.titre]),
    el('p', { class: 'compteur-plage' }, [d.plage]),
    el('p', { class: 'compteur-km' }, [kmTexte(volume.km)]),
    el('p', { class: 'compteur-ligne num' }, [`${formatDuree(volume.duree_min)} · ${libelleSeances(volume.nbSeances)}`]),
    el('p', { class: 'compteur-comparaison' }, d.comparaison),
    graphe,
  ]);
}

/**
 * Comparaison à la période précédente (04). Un écart se signale en pastille orange au-delà de ±30 %, sur la
 * valeur affichée (l'arrondi au point se fait avant la comparaison, D-015). Sans historique : « pas d’historique ».
 * Historique mais période B à 0 km : l'écart n'est pas défini, il s'écrit « – ».
 */
function comparaison(volume: Volume, periodePrecedente: string): Enfant[] {
  if (!volume.historiquePrecedent) return [pastille('pas d’historique', 'neutre')];
  if (volume.ecart === null) return [pastille('–', 'neutre'), ` face aux ${periodePrecedente}`];
  const pourcent = arrondirDecimales(volume.ecart * 100, 0);
  const signe = pourcent > 0 ? '+' : '';
  const seuil = Math.round(ECART_VOLUME_SIGNALE * 100);
  const teinte: Teinte = Math.abs(pourcent) > seuil ? 'warn' : 'neutre';
  return [pastille(`${signe}${formatPourcentage(pourcent)}`, teinte), ` face aux ${periodePrecedente}`];
}

/**
 * Options d'un mini-graphique : deux séries au plus, « Sous-seuil » et « Autres séances ». Chaque marque
 * porte son type (étiquette) ; son infobulle donne « date · type · km », ou « semaine du … » pour l'année.
 */
function optionsBarres(d: DescriptionCompteur['graphique']): OptionsGraphique {
  const series = seriesDeBarres(d.barres, d.hebdo);
  return {
    id: d.id,
    titreAccessible: d.titre,
    largeur: 400,
    hauteur: 120,
    x: { type: 'date', format: (date) => formatDate(date) },
    y: { format: (v) => kmTexte(v) },
    series,
    infobulle: (donnee) => `${d.hebdo ? 'semaine du ' : ''}${libelleAbscisse(donnee)} · ${donnee.etiquette ?? ''} · ${kmTexte(donnee.y)}`,
    tableau: {
      titreX: d.hebdo ? 'Semaine' : 'Date',
      colonnes: series.map((serie) => ({ titre: `${serie.nom} (km)`, valeur: (p) => kmTexte(p.y) })),
    },
  };
}

/**
 * Une série par catégorie présente, dans l'ordre : le sous-seuil d'abord (en bas de la pile), puis les autres.
 * Chaque jour, ou chaque semaine, n'a de marque que dans la série de sa catégorie. Un repos a une barre de
 * hauteur nulle, qui existe : il est dans « Autres séances ».
 */
function seriesDeBarres(barres: BarreVolume[], hebdo: boolean): Serie[] {
  const sousSeuil = barres.filter((b) => b.type === 'sous-seuil');
  const autres = barres.filter((b) => b.type !== 'sous-seuil');
  const series: Serie[] = [];
  if (sousSeuil.length > 0) {
    const etiquette = hebdo ? 'Semaine avec sous-seuil' : LIBELLES['sous-seuil'];
    series.push({
      nom: SOUS_SEUIL,
      type: 'barres-empilees',
      classe: 'couleur-sous-seuil',
      donnees: sousSeuil.map((b) => ({ x: b.date, y: b.km, etiquette })),
    });
  }
  if (autres.length > 0) {
    series.push({
      nom: AUTRES,
      type: 'barres-empilees',
      classe: 'couleur-facile',
      donnees: autres.map((b) => ({ x: b.date, y: b.km, etiquette: hebdo ? 'Semaine sans sous-seuil' : LIBELLES[b.type ?? 'repos'] })),
    });
  }
  return series;
}

/** La date d'une marque, en texte court (19 oct.). Une abscisse numérique n'existe pas pour ces barres. */
function libelleAbscisse(donnee: Donnee): string {
  return typeof donnee.x === 'string' ? formatDate(donnee.x) : String(donnee.x);
}

function libelleSeances(n: number): string {
  return n <= 1 ? `${n} séance` : `${n} séances`;
}
