// Onglet Paramètres (02, 03, 06 ; D-006, D-010, D-012, D-018). Formulaire en cinq groupes, séparés en paramètres datés
// et globaux ; tableau des zones en bpm pendant la saisie ; valeur suggérée de paceHrK ; enregistrement et recalcul ;
// réinitialisation ; liste des modifications datées ; groupe « Données ». Le rendu reconstruit l'onglet à chaque Vue
// (ADR 0009) : l'application conserve le focus et la position de défilement autour du rendu.
import { formatDate, formatNombre } from '../../core/format';
import { historiqueModifications, parametresAuJour, parametresDefaut } from '../../core/parametres';
import type { DateCivile, Vue } from '../../core/types';
import type { ClientFjord, ResultatParametres } from '../client';
import { dateCivileAppareil, fuseauAppareil } from '../../worker/horloge';
import { el, messageErreur } from '../dom';
import { fermerInfobulle } from '../infobulle';
import {
  estDatee,
  GROUPES,
  libelleDe,
  secondesVersMmss,
  texteValeur,
  type Cle,
  type DefChamp,
  type DefGroupe,
} from './parametres-champs';
import { construireProposition, type ReferenceParametres, type SaisieParametres } from './parametres-proposition';

/** Ce dont l'onglet a besoin de l'application (02, ADR 0009). */
export interface ControleParametres {
  client: ClientFjord;
  /** La zone d'annonce `role="status"` de l'application, placée à côté des boutons. */
  annonce: HTMLElement;
  /** Le champ d'import d'archive (D-018), rendu par l'application, qui en réapplique l'état d'import. */
  champImport: () => HTMLElement;
}

export const MESSAGE_ENREGISTRE = 'Enregistré. Tableau de bord recalculé.';
export const MESSAGE_RECALCUL = 'Le recalcul a échoué : les paramètres précédents sont conservés.';
export const MESSAGE_MODIFICATION_SUPPRIMEE = 'Modification supprimée. Tableau de bord recalculé.';
export const MESSAGE_SAUVEGARDE_IMPORTEE = 'Sauvegarde importée. Tableau de bord recalculé.';
export const MESSAGE_SAUVEGARDE_TELECHARGEE = 'Sauvegarde téléchargée.';
export const QUESTION_IMPORT_SAUVEGARDE = 'Remplacer les paramètres et le journal par ceux de la sauvegarde ?';
export const RAISON_SANS_SUGGESTION = 'pas assez de données pour suggérer une valeur';

/** Ce que la Vue apporte à l'onglet, ou les défauts de 06 quand aucune Vue n'existe encore. */
function referenceDe(vue: Vue | null, J: DateCivile): ReferenceParametres & { suggestion: number | null; raison: string } {
  if (vue !== null) {
    const { globaux, datesAJm1, modifs, suggestionPaceHrK, raisonAbsenceSuggestion } = vue.parametresEnVigueur;
    return {
      globaux,
      datesAJm1,
      modifs,
      suggestion: suggestionPaceHrK,
      raison: raisonAbsenceSuggestion ?? RAISON_SANS_SUGGESTION,
    };
  }
  const defauts = parametresDefaut();
  return { globaux: defauts.globaux, datesAJm1: parametresAuJour(defauts, J), modifs: [], suggestion: null, raison: RAISON_SANS_SUGGESTION };
}

/**
 * Rend l'onglet Paramètres dans `conteneur`, en remplaçant son contenu. `J` sert de jour courant quand aucune Vue
 * n'existe. Le formulaire se remplit avec les valeurs en vigueur à J−1 et les globaux (06).
 */
export function rendreParametres(conteneur: HTMLElement, vue: Vue | null, J: DateCivile, controle: ControleParametres): void {
  const jour = vue?.J ?? J;
  const reference = referenceDe(vue, jour);

  /** Les champs par clé, et la date : c'est là que le focus se pose après une validation ou un refus (06). */
  const champs = new Map<string, HTMLInputElement>();
  const numeriques = new Map<string, HTMLInputElement>();

  const dateEffet = el('input', { type: 'date', id: 'champ-dateEffet', name: 'dateEffet', value: jour, 'aria-describedby': 'aide-dateEffet' });
  champs.set('dateEffet', dateEffet);

  const corpsZones = el('tbody');
  const tableauZones = el('table', { class: 'tableau-zones' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col' }, ['Zone']),
        el('th', { scope: 'col', class: 'num' }, ['% FC max']),
        el('th', { scope: 'col', class: 'num' }, ['bpm']),
      ]),
    ]),
    corpsZones,
  ]);

  /** Le texte d'un champ numérique, pour `value` : « 3:58 » pour l'allure, sinon le nombre tel quel. */
  const valeurInitiale = (cle: Cle): string => {
    if (cle === 'lt2Pace') return secondesVersMmss(reference.datesAJm1.lt2Pace);
    if (estDatee(cle)) return String(reference.datesAJm1[cle]);
    return String(reference.globaux[cle]);
  };

  const blocChamp = (def: DefChamp): HTMLElement => {
    const id = `champ-${def.cle}`;
    const type = def.mmss === true ? 'text' : 'number';
    const decrit = [`unite-${def.cle}`, def.aide === undefined ? '' : `aide-${def.cle}`, def.cle === 'paceHrK' ? 'suggestion-paceHrK' : '']
      .filter((x) => x !== '')
      .join(' ');
    const saisie = el('input', { type, id, name: def.cle, step: 'any', value: valeurInitiale(def.cle), 'aria-describedby': decrit });
    champs.set(def.cle, saisie);
    if (def.mmss !== true) numeriques.set(def.cle, saisie);
    const enfants: (Node | string)[] = [
      el('label', { for: id }, [def.libelle]),
      el('span', { class: 'saisie' }, [saisie, el('span', { id: `unite-${def.cle}`, class: 'unite' }, [def.unite])]),
    ];
    if (def.aide !== undefined) enfants.push(el('p', { id: `aide-${def.cle}`, class: 'aide-champ' }, [def.aide]));
    if (def.cle === 'paceHrK') enfants.push(blocSuggestion());
    return el('div', { class: 'champ' }, enfants);
  };

  const blocSuggestion = (): HTMLElement => {
    if (reference.suggestion === null) {
      return el('p', { id: 'suggestion-paceHrK', class: 'suggestion' }, [reference.raison]);
    }
    const bouton = el('button', { type: 'button', id: 'utiliser-suggestion' }, ['Utiliser la valeur suggérée']);
    bouton.addEventListener('click', () => {
      const saisie = champs.get('paceHrK');
      if (saisie !== undefined) saisie.value = String(reference.suggestion);
    });
    return el('p', { id: 'suggestion-paceHrK', class: 'suggestion' }, [
      el('span', {}, ['Valeur suggérée']),
      ' : ',
      el('span', { class: 'num' }, [formatNombre(reference.suggestion, 1)]),
      ' ',
      bouton,
    ]);
  };

  const ensemble = (titre: string, enfants: Node[]): HTMLElement =>
    el('fieldset', { class: 'sous-ensemble' }, [el('legend', { class: 'sous-titre' }, [titre]), ...enfants]);

  const groupe = (def: DefGroupe): HTMLElement => {
    const datees = def.champs.filter((c) => estDatee(c.cle)).map(blocChamp);
    const globaux = def.champs.filter((c) => !estDatee(c.cle)).map(blocChamp);
    const sousEnsembles: Node[] = [];
    if (datees.length > 0) {
      sousEnsembles.push(ensemble('Mesures datées', def.zones === true ? [...datees, tableauZones] : datees));
    }
    if (globaux.length > 0) sousEnsembles.push(ensemble('Repères globaux', globaux));
    return el('fieldset', { class: 'fset' }, [el('legend', { class: 'titre-groupe' }, [def.titre]), el('p', { class: 'aide' }, [def.aide]), ...sousEnsembles]);
  };

  const enregistrerBouton = el('button', { type: 'submit', id: 'params-enregistrer', class: 'btn primaire' }, ['Enregistrer et recalculer']);
  const defautsBouton = el('button', { type: 'button', id: 'params-defauts', class: 'btn' }, ['Revenir aux valeurs par défaut']);
  const formulaire = el('form', { class: 'parametres-formulaire', novalidate: '', 'aria-label': 'Paramètres de l’athlète' }, [
    el('div', { class: 'champ champ-date' }, [
      el('label', { for: 'champ-dateEffet' }, ['À partir du']),
      el('span', { class: 'saisie' }, [dateEffet]),
      el('p', { id: 'aide-dateEffet', class: 'aide-champ' }, ['Date d’effet des mesures datées modifiées. Aujourd’hui par défaut.']),
    ]),
    el('div', { class: 'groupes' }, GROUPES.map(groupe)),
    el('div', { class: 'actions' }, [enregistrerBouton, defautsBouton, controle.annonce]),
  ]);

  // Zones : le tableau suit les saisies de FC max et des limites (06, « Zones »).
  const lire = (cle: string): number => {
    const brut = (numeriques.get(cle)?.value ?? '').trim();
    return brut === '' ? Number.NaN : Number(brut);
  };
  const bpm = (hrMax: number, pourcent: number): string =>
    Number.isFinite(hrMax) && Number.isFinite(pourcent) ? formatNombre(Math.round((hrMax * pourcent) / 100)) : '–';
  const pourcent = (valeur: number): string => (Number.isFinite(valeur) ? formatNombre(valeur) : '–');
  const rafraichirZones = (): void => {
    const hrMax = lire('hrMax');
    const bornes = [0, lire('z1'), lire('z2'), lire('z3'), lire('z4'), 100];
    corpsZones.replaceChildren(
      ...[1, 2, 3, 4, 5].map((n) => {
        const bas = bornes[n - 1] ?? Number.NaN;
        const haut = bornes[n] ?? Number.NaN;
        return el('tr', {}, [
          el('th', { scope: 'row' }, [`Zone ${n}`]),
          el('td', { class: 'num' }, [`${pourcent(bas)}–${pourcent(haut)} %`]),
          el('td', { class: 'num' }, [`${bpm(hrMax, bas)}–${bpm(hrMax, haut)}`]),
        ]);
      }),
    );
  };
  formulaire.addEventListener('input', rafraichirZones);
  formulaire.addEventListener('change', rafraichirZones);
  rafraichirZones();

  // Enregistrement : la validation de 06 passe d'abord, puis le Worker (D-010).
  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    void enregistrer();
  });
  defautsBouton.addEventListener('click', () => {
    void reinitialiser();
  });

  const annoncer = (texte: string): void => {
    controle.annonce.textContent = texte;
  };

  const focaliser = (champ: string | undefined): void => {
    if (champ !== undefined) champs.get(champ)?.focus();
  };

  /** Le résultat d'un changement de paramètres : succès, recalcul en échec, ou refus avec son champ (06, D-010). */
  const issue = (resultat: ResultatParametres, succes: string): void => {
    if (resultat.ok) {
      fermerInfobulle();
      annoncer(succes);
      return;
    }
    if (resultat.recalculEchoue === true) {
      annoncer(MESSAGE_RECALCUL);
      return;
    }
    annoncer(resultat.message);
    focaliser(resultat.champ);
  };

  const lireSaisie = (): SaisieParametres => {
    const valeurs: Record<string, string> = {};
    for (const [cle, saisie] of numeriques) valeurs[cle] = saisie.value;
    valeurs.lt2Pace = champs.get('lt2Pace')?.value ?? '';
    return { dateEffet: dateEffet.value, valeurs };
  };

  async function enregistrer(): Promise<void> {
    annoncer('');
    // Le jour courant est relu à chaque enregistrement, avec l'horloge de l'appareil (06, ADR 0007).
    const aujourdhui = dateCivileAppareil(Date.now(), fuseauAppareil());
    const resultat = construireProposition(lireSaisie(), reference, aujourdhui, new Date().toISOString(), nouvelIdentifiant);
    if (!resultat.ok) {
      annoncer(resultat.message);
      focaliser(resultat.champ);
      return;
    }
    try {
      issue(await controle.client.enregistrerParams(resultat.proposes), MESSAGE_ENREGISTRE);
    } catch (erreur) {
      annoncer(messageErreur(erreur));
    }
  }

  async function reinitialiser(): Promise<void> {
    annoncer('');
    try {
      issue(await controle.client.reinitialiserParams(), MESSAGE_ENREGISTRE);
    } catch (erreur) {
      annoncer(messageErreur(erreur));
    }
  }

  conteneur.replaceChildren(formulaire, listeModifications(reference, issue, controle.client, annoncer), groupeDonnees(controle, annoncer));
}

/** Identifiant d'une modification nouvelle. `randomUUID` n'existe que dans les contextes sécurisés : sinon, un repli unique. */
function nouvelIdentifiant(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** La liste des modifications datées, avec « ancienne → nouvelle valeur » et un bouton Supprimer par ligne (06). */
function listeModifications(
  reference: ReferenceParametres,
  issue: (resultat: ResultatParametres, succes: string) => void,
  client: ClientFjord,
  annoncer: (texte: string) => void,
): HTMLElement {
  const modifs = historiqueModifications({ globaux: reference.globaux, modifs: reference.modifs });
  const section = el('section', { class: 'modifications', 'aria-labelledby': 'modifications-titre' }, [
    el('h3', { id: 'modifications-titre', tabindex: '-1' }, ['Modifications datées']),
    el('p', { class: 'aide' }, ['Une séance utilise la valeur en vigueur à sa date.']),
  ]);
  if (modifs.length === 0) {
    section.append(el('p', { class: 'aide' }, ['Aucune modification datée.']));
    return section;
  }
  const lignes = modifs.map((modification, index) => {
    const avant = modification.ancienne === null ? '–' : texteValeur(modification.cle, modification.ancienne);
    const apres = texteValeur(modification.cle, modification.nouvelle);
    const nom = `Supprimer la modification de ${libelleDe(modification.cle)} du ${formatDate(modification.dateEffet)}`;
    const bouton = el('button', { type: 'button', id: `supprimer-${modification.id}`, class: 'btn', 'aria-label': nom }, ['Supprimer']);
    bouton.addEventListener('click', () => {
      annoncer('');
      // Après la suppression, le focus va sur le bouton Supprimer suivant (le précédent en fin de liste), ou sur le titre.
      const voisine = modifs[index + 1] ?? modifs[index - 1];
      const cible = voisine === undefined ? 'modifications-titre' : `supprimer-${voisine.id}`;
      client
        .supprimerModification(modification.id)
        .then((resultat) => {
          issue(resultat, MESSAGE_MODIFICATION_SUPPRIMEE);
          if (resultat.ok) document.getElementById(cible)?.focus();
        })
        .catch((erreur: unknown) => annoncer(messageErreur(erreur)));
    });
    return el('tr', {}, [
      el('td', {}, [formatDate(modification.dateEffet)]),
      el('td', {}, [libelleDe(modification.cle)]),
      el('td', { class: 'num' }, [`${avant} → ${apres}`]),
      el('td', {}, [bouton]),
    ]);
  });
  section.append(
    el('div', { class: 'defilement' }, [
      el('table', { class: 'tableau-modifs' }, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', { scope: 'col' }, ['Date d’effet']),
            el('th', { scope: 'col' }, ['Paramètre']),
            el('th', { scope: 'col' }, ['Modification']),
            el('th', { scope: 'col' }, [el('span', { class: 'visuellement-masque' }, ['Action'])]),
          ]),
        ]),
        el('tbody', {}, lignes),
      ]),
    ]),
  );
  return section;
}

/** Le groupe « Données » (D-012, D-018) : import d'archive, export et import de la sauvegarde. */
function groupeDonnees(controle: ControleParametres, annoncer: (texte: string) => void): HTMLElement {
  const exporterBouton = el('button', { type: 'button', id: 'exporter-donnees', class: 'btn' }, ['Exporter mes données']);
  exporterBouton.addEventListener('click', () => {
    annoncer('');
    controle.client
      .exporterSauvegarde()
      .then(({ contenu, nomFichier }) => {
        telecharger(contenu, nomFichier);
        annoncer(MESSAGE_SAUVEGARDE_TELECHARGEE);
      })
      .catch((erreur: unknown) => annoncer(messageErreur(erreur)));
  });

  const champSauvegarde = el('input', { type: 'file', accept: '.json', id: 'champ-sauvegarde' });
  champSauvegarde.addEventListener('change', () => {
    const fichier = champSauvegarde.files?.[0];
    champSauvegarde.value = '';
    if (fichier === undefined || !confirmer(QUESTION_IMPORT_SAUVEGARDE)) return;
    annoncer('');
    fichier
      .text()
      .then((contenu) => controle.client.importerSauvegarde(contenu))
      .then(() => annoncer(MESSAGE_SAUVEGARDE_IMPORTEE))
      .catch((erreur: unknown) => annoncer(messageErreur(erreur)));
  });

  return el('section', { class: 'donnees', 'aria-labelledby': 'donnees-titre' }, [
    el('h3', { id: 'donnees-titre' }, ['Données']),
    el('p', { class: 'aide' }, ['Les données restent sur cet appareil.']),
    el('div', { class: 'donnees-action' }, [el('h4', {}, ['Importer une archive Strava']), controle.champImport()]),
    el('div', { class: 'donnees-action' }, [exporterBouton]),
    el('div', { class: 'donnees-action' }, [el('label', { class: 'fichier' }, ['Importer une sauvegarde', champSauvegarde])]),
  ]);
}

/** Demande la confirmation d'un remplacement ; sans fenêtre de confirmation, on refuse. */
function confirmer(question: string): boolean {
  return typeof window.confirm === 'function' && window.confirm(question);
}

/** Télécharge le contenu par un lien `a[download]`, sans nouvelle fenêtre (D-012). */
function telecharger(contenu: string, nomFichier: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  const lien = el('a', { href: url, download: nomFichier });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
