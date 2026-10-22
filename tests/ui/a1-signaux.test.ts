// A1 · Les 7 cartes de signaux (03, 05) : pastille à texte, valeur, explication, données insuffisantes.
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { rendreA1 } from '../../src/ui/composants/a1';
import type { Vue } from '../../src/core/types';
import { signal, signaux, vueDecision } from '../fixtures/vues';

afterEach(() => document.body.replaceChildren());

function rendre(v: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreA1(conteneur, v);
  return conteneur;
}

/** La carte d'un signal, par son nom accessible (son titre). */
function carte(conteneur: HTMLElement, nom: string): HTMLElement {
  const titre = within(conteneur).getByRole('heading', { name: nom, level: 3 });
  const element = titre.closest('li');
  if (element === null) throw new Error(`carte absente : ${nom}`);
  return element;
}

describe('A1 · cartes de signaux (03, « Disposition »)', () => {
  it('affiche sept cartes, dans l\'ordre de 05', () => {
    const conteneur = rendre(vueDecision());

    const liste = within(conteneur).getByRole('list', { name: 'Signaux de la décision' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(7);
    expect(within(liste).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Progressivité',
      'Fraîcheur',
      'Réponse à l’effort',
      'Répétitions hors sous-seuil',
      'Footings sous le plafond',
      'Découplage de la dernière sortie longue',
      'Palier de volume',
    ]);
  });

  it('chaque carte a une pastille à texte, sa valeur en chasse fixe et son explication', () => {
    const conteneur = rendre(
      vueDecision({
        signaux: [
          signal('progressivite', 'ok', { valeurTexte: '1,04', explication: 'Volume récent cohérent avec le mois écoulé.' }),
          signal('fraicheur', 'surveiller', { valeurTexte: '+8', explication: 'Très frais : il y a de la marge pour charger.' }),
          signal('reponse', 'alerte', { valeurTexte: '4 s/km plus lent à FC égale' }),
          ...signaux().slice(3),
        ],
      }),
    );

    const progressivite = carte(conteneur, 'Progressivité');
    expect(within(progressivite).getByText('OK')).toBeDefined();
    expect(within(progressivite).getByText('1,04').classList.contains('num')).toBe(true);
    expect(within(progressivite).getByText('Volume récent cohérent avec le mois écoulé.')).toBeDefined();
    expect(within(carte(conteneur, 'Fraîcheur')).getByText('À surveiller')).toBeDefined();
    expect(within(carte(conteneur, 'Réponse à l’effort')).getByText('Alerte')).toBeDefined();
  });

  it('une carte à surveiller ou en alerte a une bordure teintée, les autres non', () => {
    const conteneur = rendre(vueDecision({ signaux: signaux({ fraicheur: 'surveiller', reponse: 'alerte' }) }));

    expect(carte(conteneur, 'Fraîcheur').classList.contains('signal-teinte')).toBe(true);
    expect(carte(conteneur, 'Réponse à l’effort').classList.contains('signal-teinte')).toBe(true);
    expect(carte(conteneur, 'Progressivité').classList.contains('signal-teinte')).toBe(false);
  });

  it('la classe de teinte est posée sur la bonne carte : signal-surveiller pour À surveiller, signal-alerte pour Alerte', () => {
    const conteneur = rendre(vueDecision({ signaux: signaux({ fraicheur: 'surveiller', reponse: 'alerte' }) }));

    expect(carte(conteneur, 'Fraîcheur').classList.contains('signal-surveiller')).toBe(true);
    expect(carte(conteneur, 'Fraîcheur').classList.contains('signal-alerte')).toBe(false);
    expect(carte(conteneur, 'Réponse à l’effort').classList.contains('signal-alerte')).toBe(true);
    expect(carte(conteneur, 'Réponse à l’effort').classList.contains('signal-surveiller')).toBe(false);
    expect(carte(conteneur, 'Progressivité').classList.contains('signal-surveiller')).toBe(false);
    expect(carte(conteneur, 'Progressivité').classList.contains('signal-alerte')).toBe(false);
  });

  it('une carte insuffisante a une pastille neutre, la valeur « – » et la phrase de ce qui manque', () => {
    const conteneur = rendre(
      vueDecision({
        signaux: [
          signal('progressivite', 'insuffisant', { explication: 'Il faut 30 jours d\'historique (encore 9 jours).' }),
          ...signaux().slice(1),
        ],
      }),
    );

    const carteInsuffisante = carte(conteneur, 'Progressivité');
    const pastille = within(carteInsuffisante).getByText('Données insuffisantes');
    expect(pastille.closest('.pastille')?.classList.contains('pastille-neutre')).toBe(true);
    expect(within(carteInsuffisante).getByText('–')).toBeDefined();
    expect(within(carteInsuffisante).getByText('Il faut 30 jours d’historique (encore 9 jours).')).toBeDefined();
    expect(carteInsuffisante.classList.contains('signal-teinte')).toBe(false);
  });

  it('chaque signal cité dans la phrase de décision a sa carte', () => {
    const conteneur = rendre(
      vueDecision({
        verdict: 'maintenir',
        phrase: 'Rien d\'alarmant, mais mieux vaut consolider avant de monter. Points à surveiller : Réponse à l\'effort et Palier de volume.',
        signaux: signaux({ reponse: 'surveiller', palier: 'surveiller' }),
      }),
    );

    expect(within(conteneur).getByText(/Réponse à l’effort et Palier de volume/)).toBeDefined();
    expect(carte(conteneur, 'Réponse à l’effort')).toBeDefined();
    expect(carte(conteneur, 'Palier de volume')).toBeDefined();
  });
});
