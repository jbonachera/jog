// A1 · Décision volume (03, 05) : verdict, phrase, fourchette et sa référence, données insuffisantes.
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { decider } from '../../src/core/decision';
import type { Vue } from '../../src/core/types';
import { rendreA1 } from '../../src/ui/composants/a1';
import { entrees } from '../fixtures/decision';
import { vueDecision } from '../fixtures/vues';

afterEach(() => document.body.replaceChildren());

function rendre(v: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreA1(conteneur, v);
  return conteneur;
}

describe('A1 · verdict (05, « Règle du verdict »)', () => {
  const cas: [Parameters<typeof vueDecision>[0], string, string][] = [
    [{ verdict: 'augmenter' }, 'Augmenter', 'etat-good'],
    [{ verdict: 'maintenir' }, 'Maintenir', 'etat-warn'],
    [{ verdict: 'alleger' }, 'Alléger', 'etat-bad'],
    [{ verdict: 'aucun', phrase: 'Il faut 30 jours d’historique pour comparer la semaine au mois (encore 9 jours).', fourchette: null, simulateur: null }, 'Pas encore de verdict', 'etat-neutre'],
  ];

  for (const [decision, libelle, classe] of cas) {
    it(`le verdict « ${libelle} » est le grand titre, avec la classe d'état ${classe}`, () => {
      const conteneur = rendre(vueDecision(decision));

      const titre = within(conteneur).getByRole('heading', { name: libelle, level: 2 });
      expect(titre.classList.contains(classe)).toBe(true);
    });
  }

  it('sans verdict, il n\'y a ni fourchette ni simulateur', () => {
    const conteneur = rendre(vueDecision({ verdict: 'aucun', fourchette: null, simulateur: null }));

    expect(within(conteneur).queryByRole('slider')).toBeNull();
    expect(within(conteneur).queryByText(/Fourchette raisonnable/)).toBeNull();
  });

  it('affiche la phrase d\'explication de la décision, apostrophes typographiques', () => {
    const conteneur = rendre(vueDecision({ verdict: 'aucun', phrase: 'Il faut 30 jours d\'historique (encore 9 jours).', fourchette: null, simulateur: null }));

    expect(within(conteneur).getByText('Il faut 30 jours d’historique (encore 9 jours).')).toBeDefined();
  });

  it('le surtitre donne la date d\'arrêt des données : J−1, au format de 08', () => {
    const conteneur = rendre(vueDecision({}, '2026-10-21'));

    expect(within(conteneur).getByText('Décision volume · données arrêtées au 20 oct. au soir')).toBeDefined();
  });

  it('au 1er janvier, les données s\'arrêtent au 31 déc. : le surtitre donne l\'année précédente', () => {
    const conteneur = rendre(vueDecision({}, '2026-01-01'));

    expect(within(conteneur).getByText('Décision volume · données arrêtées au 31 déc. au soir')).toBeDefined();
  });

  it('la fourchette est en grand, avec sa référence en petit et la mention de 05 (sans « plan », interdit par 08)', () => {
    const conteneur = rendre(vueDecision());

    expect(within(conteneur).getByText('100–105 km')).toBeDefined();
    expect(within(conteneur).getByText('Référence : 95 km, la dernière semaine terminée.')).toBeDefined();
    expect(within(conteneur).getByText('C’est une borne calculée sur le réalisé, pas un programme d’entraînement.')).toBeDefined();
  });

  it('la référence dit d\'où vient la moyenne quand elle n\'est pas le palier', () => {
    const conteneur = rendre(vueDecision({ fourchette: { min: 96, max: 101, reference: 91, sourceReference: 'moyenne30j' } }));

    expect(within(conteneur).getByText('Référence : 91 km, moyenne des 30 derniers jours par semaine.')).toBeDefined();
  });

  it('la fourchette s\'affiche sans simulateur : elle ne dépend pas du simulateur', () => {
    const conteneur = rendre(vueDecision({ simulateur: null }));

    expect(within(conteneur).getByText('100–105 km')).toBeDefined();
    expect(within(conteneur).queryByRole('slider')).toBeNull();
  });

  it('le surtitre et le verdict nomment la section : aria-labelledby pointe sur le surtitre puis le verdict', () => {
    const conteneur = rendre(vueDecision({}, '2026-10-21'));

    const section = conteneur.querySelector('section.decision') as HTMLElement;
    expect(section.getAttribute('aria-labelledby')).toBe('a1-surtitre a1-verdict');
    const nom = section
      .getAttribute('aria-labelledby')
      ?.split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(nom).toBe('Décision volume · données arrêtées au 20 oct. au soir Augmenter');
  });

  it('aucun mot interdit par 08 dans le texte rendu, avec de vraies phrases du cœur', () => {
    const avecVerdict = decider(entrees());
    const sansVerdict = decider(entrees({ premierJour: '2026-10-15' }));
    for (const decision of [avecVerdict, sansVerdict]) {
      const conteneur = rendre(vueDecision(decision));

      expect(conteneur.textContent).not.toMatch(/\b(plan|plans|cycle|cycles|bloc|blocs|prévu|prévue|objectifs?|préparation|lactate)\b|compte à rebours|semaine allégée/i);
    }
  });
});
