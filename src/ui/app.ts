// Coque de l'application (02) : barre fixe, cinq onglets ARIA, un seul panneau visible,
// rendu à la demande (ADR 0009). L'onglet actif est mémorisé sous `jog-view`.
// L'état de l'import vit ici, et est réappliqué à chaque rendu du champ.
import { formatDate } from '../core/format';
import type { FenetreProgressivite, PeriodeHistorique } from '../core/selecteurs';
import type { DateCivile, Vue } from '../core/types';
import { rendreA1 } from './composants/a1';
import { rendreA2 } from './composants/a2';
import { rendreA3 } from './composants/a3';
import { rendreA4 } from './composants/a4';
import { rendreC1 } from './composants/c1';
import { rendreC2 } from './composants/c2';
import { rendreC3 } from './composants/c3';
import { choixSegmentes } from './composants/commun';
import { rendreH1 } from './composants/h1';
import { rendreH2 } from './composants/h2';
import { type EtatImport, rendreImport, resumeImport } from './composants/importer';
import { rendreP1 } from './composants/p1';
import { rendreP2 } from './composants/p2';
import { rendreP3 } from './composants/p3';
import { rendreP4 } from './composants/p4';
import { rendreP5 } from './composants/p5';
import { rendreParametres } from './composants/parametres';
import type { ClientJog } from './client';
import { el, messageErreur } from './dom';
import { fermerInfobulle } from './infobulle';

/** Stockage local minimal (localStorage en production). Toute opération peut lever (02). */
export interface StockageJog {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
}

const CLE_ONGLET = 'jog-view';
/** Période de l'historique (H1 et H2), mémorisée (02). */
const CLE_PERIODE = 'jog-range';

const PERIODES: readonly { valeur: PeriodeHistorique; libelle: string }[] = [
  { valeur: '12', libelle: '12 semaines' },
  { valeur: '26', libelle: '26 semaines' },
  { valeur: 'toutes', libelle: 'Toutes les saisons' },
];

const ONGLETS = [
  { id: 'apercu', titre: 'Aperçu' },
  { id: 'charge', titre: 'Charge' },
  { id: 'progression', titre: 'Progression' },
  { id: 'historique', titre: 'Historique' },
  { id: 'reglages', titre: 'Paramètres' },
] as const;

type Onglet = (typeof ONGLETS)[number]['id'];

function estOnglet(valeur: string): valeur is Onglet {
  return ONGLETS.some((o) => o.id === valeur);
}

/** localStorage si le navigateur l'autorise, sinon rien : l'application marche sans. */
function stockageParDefaut(): StockageJog | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Monte l'application dans `racine`. Rend l'onglet mémorisé. La Vue arrive par `client.surVue`
 * (démarrage comme import) : c'est le seul chemin. La promesse se résout une fois `demarrer` terminé.
 */
export async function monterApplication(
  racine: HTMLElement,
  client: ClientJog,
  stockage: StockageJog | null = stockageParDefaut(),
  J: DateCivile,
): Promise<void> {
  let vue: Vue | null = null;
  let ongletCourant: Onglet = lireOnglet(stockage);
  let etatImport: EtatImport = { enCours: false, progression: null };
  /** Le conteneur du champ d'import affiché dans le panneau courant, s'il y en a un. */
  let conteneurImport: HTMLElement | null = null;
  /** Fenêtre de C1 : elle vit dans l'état de l'onglet, sans être mémorisée (02). */
  let fenetreC1: FenetreProgressivite = '16sem';
  let periodeHistorique: PeriodeHistorique = lirePeriode(stockage);

  const boutons = new Map<Onglet, HTMLButtonElement>();
  const panneaux = new Map<Onglet, HTMLDivElement>();
  const mention = el('span', { class: 'etat' }, [mentionSynchro(null)]);
  // Une seule zone d'annonce `role="status"` : elle reste dans la zone du haut, sauf sur Paramètres où elle se place
  // à côté des boutons (06).
  const statut = el('p', { class: 'statut', role: 'status' });
  const zoneStatut = el('div', { class: 'zone-statut' });
  const actionsImport = { choisir: (fichier: File): void => choisirFichier(fichier) };

  for (const [index, onglet] of ONGLETS.entries()) {
    const bouton = el('button', {
      type: 'button',
      role: 'tab',
      id: `t-${onglet.id}`,
      'aria-controls': `v-${onglet.id}`,
    }, [onglet.titre]);
    bouton.addEventListener('click', () => activer(onglet.id));
    bouton.addEventListener('keydown', (evenement) => {
      if (evenement.altKey || evenement.ctrlKey || evenement.metaKey || evenement.shiftKey) return;
      const pas = { ArrowRight: 1, ArrowLeft: -1 }[evenement.key];
      if (pas === undefined) return;
      evenement.preventDefault();
      const suivant = ONGLETS[(index + pas + ONGLETS.length) % ONGLETS.length];
      if (suivant !== undefined) activer(suivant.id, true);
    });
    boutons.set(onglet.id, bouton);

    const panneau = el('div', {
      role: 'tabpanel',
      id: `v-${onglet.id}`,
      'aria-labelledby': `t-${onglet.id}`,
      tabindex: '0',
    });
    panneau.hidden = true;
    panneaux.set(onglet.id, panneau);
  }

  const titre = el('h1', { class: 'visuellement-masque' }, ['Jog · Tableau de bord']);
  const tetiere = el('header', { class: 'top' }, [
    titre,
    el('div', { class: 'brand' }, [el('b', {}, ['Jog']), el('span', {}, ['Athlète · NSA'])]),
    el('div', { class: 'views', role: 'tablist', 'aria-label': 'Vues' }, ONGLETS.map((o) => boutons.get(o.id) as HTMLButtonElement)),
    el('div', { class: 'top-r' }, [mention]),
  ]);
  zoneStatut.append(statut);
  const corps = el('main', { class: 'corps' }, [zoneStatut, ...ONGLETS.map((o) => panneaux.get(o.id) as HTMLDivElement)]);
  racine.replaceChildren(el('div', { class: 'wrap' }, [tetiere, corps]));

  /** Change d'onglet. Cliquer sur l'onglet actif ne rend rien (il ne fait que reprendre le focus). */
  function activer(id: Onglet, avecFocus = false): void {
    if (id === ongletCourant) {
      if (avecFocus) boutons.get(id)?.focus();
      return;
    }
    // Un panneau quitté est vidé : il sera rendu à nouveau à son ouverture (ADR 0009). La zone d'annonce aussi : son
    // message concernait l'onglet quitté.
    panneaux.get(ongletCourant)?.replaceChildren();
    statut.textContent = '';
    ongletCourant = id;
    marquerOnglets(id);
    ecrireOnglet(stockage, id);
    fermerInfobulle();
    if (avecFocus) boutons.get(id)?.focus();
    rendrePanneau(id);
  }

  function marquerOnglets(id: Onglet): void {
    for (const onglet of ONGLETS) {
      const actif = onglet.id === id;
      const bouton = boutons.get(onglet.id);
      bouton?.setAttribute('aria-selected', String(actif));
      if (bouton) bouton.tabIndex = actif ? 0 : -1;
      const panneau = panneaux.get(onglet.id);
      if (panneau) panneau.hidden = !actif;
    }
  }

  /**
   * Une Vue nouvelle reconstruit le panneau courant. Le focus et la position de défilement sont conservés autour de ce
   * rendu (ADR 0009, D-010) : sur Paramètres, l'athlète reste à l'endroit où il était.
   */
  function appliquerVue(nouvelle: Vue): void {
    if (nouvelle === vue) return;
    vue = nouvelle;
    mention.textContent = mentionSynchro(nouvelle.derniereSynchro);
    const panneau = panneaux.get(ongletCourant);
    const restaurer = memoriserPosition(panneau);
    rendrePanneau(ongletCourant);
    restaurer();
  }

  function rendrePanneau(id: Onglet): void {
    const panneau = panneaux.get(id);
    if (panneau === undefined) return;
    panneau.replaceChildren();
    conteneurImport = null;
    if (id !== 'reglages') zoneStatut.append(statut);
    if (id === 'reglages') {
      panneau.append(el('h2', {}, ['Paramètres']));
      const conteneur = el('div', { class: 'parametres' });
      panneau.append(conteneur);
      rendreParametres(conteneur, vue, J, { client, annonce: statut, champImport, stockage });
      return;
    }
    if (id === 'apercu') {
      if (vue === null || vue.seances.length === 0) {
        panneau.append(encartImport());
      } else {
        panneau.append(apercu(vue));
      }
      return;
    }
    if (id === 'charge') {
      panneau.append(el('h2', {}, ['Charge']), ongletCharge(vue));
      return;
    }
    if (id === 'progression') {
      panneau.append(el('h2', {}, ['Progression']), ongletProgression(vue));
      return;
    }
    if (id === 'historique') {
      panneau.append(el('h2', {}, ['Historique']), ongletHistorique(vue));
      return;
    }
    const titreOnglet = ONGLETS.find((o) => o.id === id)?.titre ?? '';
    panneau.append(el('h2', {}, [titreOnglet]));
  }

  /** L'Aperçu (02) : A1, puis A2, puis A3 et A4 en deux colonnes. Chaque composant rend son propre conteneur. */
  function apercu(v: Vue): HTMLElement {
    const a1 = el('div');
    const a2 = el('div');
    const a3 = el('div');
    const a4 = el('div');
    rendreA1(a1, v);
    rendreA2(a2, v);
    rendreA3(a3, v);
    rendreA4(a4, v);
    return el('div', { class: 'apercu' }, [a1, a2, el('div', { class: 'g2' }, [a3, a4])]);
  }

  /** L'onglet Charge (03) : C1 et C2 côte à côte, puis C3 (discipline NSA). Sans donnée, on le dit. */
  function ongletCharge(v: Vue | null): HTMLElement {
    if (v === null || v.seances.length === 0) return sansDonnees();
    const c1 = el('div');
    const c2 = el('div');
    const c3 = el('div');
    rendreC1(c1, v, {
      fenetre: fenetreC1,
      surFenetre: (fenetre) => {
        fenetreC1 = fenetre;
      },
    });
    rendreC2(c2, v);
    rendreC3(c3, v);
    return el('div', { class: 'onglet' }, [el('div', { class: 'g2' }, [c1, c2]), c3]);
  }

  /**
   * L'onglet Progression (03, P1 à P5) : P1 et P2 en pleine largeur, P3 et P4 côte à côte, P5 en dernier. Le comparateur
   * et le nuage mémorisent leur choix sous `jog-cmp-p` et `jog-cmp`, par le stockage de l'application.
   */
  function ongletProgression(v: Vue | null): HTMLElement {
    if (v === null || v.seances.length === 0) return sansDonnees();
    const p1 = el('div');
    const p2 = el('div');
    const p3 = el('div');
    const p4 = el('div');
    const p5 = el('div');
    rendreP1(p1, v, stockage);
    rendreP2(p2, v);
    rendreP3(p3, v, stockage);
    rendreP4(p4, v);
    rendreP5(p5, v);
    return el('div', { class: 'onglet' }, [p1, p2, el('div', { class: 'g2' }, [p3, p4]), p5]);
  }

  /**
   * L'onglet Historique (03) : un seul sélecteur de période pilote H1 et H2. Le choix est mémorisé sous `jog-range`.
   * Le changement redessine seulement H1 et H2, pour que le focus reste sur le bouton choisi.
   */
  function ongletHistorique(v: Vue | null): HTMLElement {
    if (v === null || v.seances.length === 0) return sansDonnees();
    const h1 = el('div');
    const h2 = el('div');
    const dessiner = (): void => {
      rendreH1(h1, v, periodeHistorique);
      rendreH2(h2, v, periodeHistorique);
    };
    const selecteur = choixSegmentes('Période', PERIODES, periodeHistorique, (periode) => {
      periodeHistorique = periode;
      ecrirePeriode(stockage, periode);
      dessiner();
    });
    dessiner();
    // Le libellé « Période » est écrit à l'écran, à côté des choix : il n'est pas seulement lu par les lecteurs d'écran.
    return el('div', { class: 'onglet' }, [el('div', { class: 'periode' }, [el('span', { class: 'periode-libelle' }, ['Période']), selecteur]), h1, h2]);
  }

  function encartImport(): HTMLElement {
    return el('section', { class: 'encart', 'aria-labelledby': 'import-titre' }, [
      el('h2', { id: 'import-titre' }, ['Importer une archive Strava']),
      el('p', { class: 'aide' }, ['Jog lit l’archive exportée depuis Strava. Le fichier reste sur cet appareil.']),
      champImport(),
    ]);
  }

  /** Crée le conteneur du champ d'import, rendu selon l'état courant de l'import. */
  function champImport(): HTMLElement {
    const conteneur = el('div');
    conteneurImport = conteneur;
    rendreImport(conteneur, etatImport, actionsImport);
    return conteneur;
  }

  /** Redessine le champ d'import affiché, s'il y en a un, avec l'état courant. */
  function rafraichirImport(): void {
    if (conteneurImport?.isConnected) rendreImport(conteneurImport, etatImport, actionsImport);
  }

  function choisirFichier(fichier: File): void {
    // Un seul import à la fois : un second fichier pendant qu'un import tourne est ignoré.
    if (etatImport.enCours) return;
    etatImport = { enCours: true, progression: { fait: 0, total: 1, etape: 'Lecture de l’archive' } };
    rafraichirImport();
    client.importerArchive(fichier, (progression) => {
      if (!etatImport.enCours) return;
      etatImport = { enCours: true, progression };
      rafraichirImport();
    }).then(
      (resultat) => {
        etatImport = { enCours: false, progression: null };
        rafraichirImport();
        statut.textContent =
          resultat.erreurRecalcul === undefined
            ? `Import terminé : ${resumeImport(resultat.journal)}`
            : `Import réussi (${resumeImport(resultat.journal)}), mais le recalcul a échoué : ${resultat.erreurRecalcul}`;
      },
      (erreur: unknown) => {
        etatImport = { enCours: false, progression: null };
        rafraichirImport();
        statut.textContent = `L’import a échoué : ${messageErreur(erreur)}`;
      },
    );
  }

  marquerOnglets(ongletCourant);
  rendrePanneau(ongletCourant);
  client.surVue(appliquerVue);
  try {
    await client.demarrer(J);
  } catch (erreur) {
    statut.textContent = `Le chargement a échoué : ${messageErreur(erreur)}`;
  }
}

/**
 * Mémorise le focus (s'il est dans le panneau et a un identifiant) et la position de défilement de la fenêtre et des
 * conteneurs défilants parents. Rend la fonction qui les restaure après le rendu. Aucun style n'est posé (ADR 0010).
 */
function memoriserPosition(panneau: HTMLElement | undefined): () => void {
  const actif = document.activeElement;
  const idActif = actif instanceof HTMLElement && panneau?.contains(actif) === true && actif.id !== '' ? actif.id : null;
  const yFenetre = window.scrollY;
  const defilements: [Element, number][] = [];
  for (let noeud = panneau?.parentElement ?? null; noeud !== null; noeud = noeud.parentElement) {
    if (noeud.scrollTop > 0) defilements.push([noeud, noeud.scrollTop]);
  }
  return () => {
    if (idActif !== null) document.getElementById(idActif)?.focus();
    if (window.scrollY !== yFenetre) window.scrollTo(0, yFenetre);
    for (const [noeud, haut] of defilements) {
      if (noeud.scrollTop !== haut) noeud.scrollTop = haut;
    }
  };
}

/** Un message quand l'onglet n'a pas encore de données (02 : rien n'est dessiné sans donnée). */
function sansDonnees(): HTMLElement {
  return el('p', { class: 'aide' }, ['Aucune donnée importée. Importez une archive Strava dans l’onglet Paramètres.']);
}

/** La période mémorisée, ou « Toutes les saisons » si elle est absente, inconnue ou illisible (02). */
function lirePeriode(stockage: StockageJog | null): PeriodeHistorique {
  try {
    const valeur = stockage?.getItem(CLE_PERIODE);
    if (valeur === '12' || valeur === '26' || valeur === 'toutes') return valeur;
  } catch {
    // Stockage indisponible : la période par défaut.
  }
  return 'toutes';
}

function ecrirePeriode(stockage: StockageJog | null, periode: PeriodeHistorique): void {
  try {
    stockage?.setItem(CLE_PERIODE, periode);
  } catch {
    // Stockage indisponible : la période n'est simplement pas mémorisée.
  }
}

function lireOnglet(stockage: StockageJog | null): Onglet {
  try {
    const valeur = stockage?.getItem(CLE_ONGLET);
    if (valeur !== null && valeur !== undefined && estOnglet(valeur)) return valeur;
  } catch {
    // Stockage indisponible : on ouvre l'Aperçu.
  }
  return 'apercu';
}

function ecrireOnglet(stockage: StockageJog | null, id: Onglet): void {
  try {
    stockage?.setItem(CLE_ONGLET, id);
  } catch {
    // Stockage indisponible : l'onglet n'est simplement pas mémorisé.
  }
}

/** Mention d'état de la barre (02) : date locale de la dernière synchronisation, ou son absence. */
export function mentionSynchro(iso: string | null): string {
  const instant = iso === null ? Number.NaN : Date.parse(iso);
  if (Number.isNaN(instant)) return 'Aucune donnée importée';
  const date = new Date(instant);
  const jour = `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}`;
  return `Dernière synchronisation : ${formatDate(jour)}, ${deuxChiffres(date.getHours())}:${deuxChiffres(date.getMinutes())}`;
}

function deuxChiffres(valeur: number): string {
  return String(valeur).padStart(2, '0');
}
