// Interaction des graphiques (03, 08 « Survol obligatoire » et « Accessibilité ») : survol, clavier,
// infobulle unique dans le document (décision de l'orchestrateur : infobulle SVG dans le graphique survolé).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { formatPourcentage } from '../../../src/core/format';
import { rendreGraphique } from '../../../src/ui/graph';
import { fermerInfobulle, ouvrirInfobulle } from '../../../src/ui/infobulle';
import { optionsBarres, optionsCourbes } from './fixture';

// Feuille de style lue comme texte : happy-dom n'applique pas les règles CSS (voir tests/ui/styles.test.ts).
const CSS = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8');

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

function rendre(options = optionsCourbes()): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

/** Les infobulles visibles du document : SVG dans un graphique, ou HTML non masquée. */
function infobullesVisibles(): Element[] {
  return [...document.querySelectorAll('.infobulle'), ...document.querySelectorAll('#infobulle:not([hidden])')];
}

describe('courbes : survol et réticule (08, règle 5)', () => {
  it('un survol (pointermove) ouvre une infobulle multi-séries avec les valeurs exactes formatées', () => {
    const conteneur = rendre();

    fireEvent.pointerMove(within(conteneur).getByLabelText('lun. 19 oct.'));

    const infobulle = conteneur.querySelector('.infobulle') as Element;
    expect(infobulle.textContent).toContain('lun. 19 oct.');
    expect(infobulle.textContent).toContain(`Cette semaine : ${formatPourcentage(22)}`);
    expect(infobulle.textContent).toContain(`Semaine précédente : ${formatPourcentage(20)}`);
  });

  it('le réticule vertical suit le survol', () => {
    const conteneur = rendre();

    fireEvent.pointerMove(within(conteneur).getByLabelText('lun. 19 oct.'));

    expect(conteneur.querySelector('.reticule')?.hasAttribute('hidden')).toBe(false);
  });

  it('une seule infobulle à la fois : survoler un autre point remplace la précédente', () => {
    const conteneur = rendre();

    fireEvent.pointerMove(within(conteneur).getByLabelText('dim. 18 oct.'));
    fireEvent.pointerMove(within(conteneur).getByLabelText('mar. 20 oct.'));

    expect(infobullesVisibles()).toHaveLength(1);
    expect(infobullesVisibles()[0]?.textContent).toContain('mar. 20 oct.');
  });

  it('une infobulle SVG d\'un graphique remplace l\'infobulle HTML ouverte ailleurs', () => {
    ouvrirInfobulle('Repère du 19 oct.', 120, 80);

    fireEvent.pointerMove(within(rendre()).getByLabelText('lun. 19 oct.'));

    expect(infobullesVisibles()).toHaveLength(1);
    expect(document.getElementById('infobulle')?.hidden).toBe(true);
  });

  it('un clavier qui fait le focus sur la zone des courbes ouvre l\'infobulle au dernier point', () => {
    const conteneur = rendre();

    fireEvent.focus(within(conteneur).getByLabelText('Parcourir les points'));

    expect(conteneur.querySelector('.infobulle')?.textContent).toContain('mar. 20 oct.');
  });

  it('les flèches du clavier déplacent le point, et Échap ferme l\'infobulle', () => {
    const conteneur = rendre();
    const zone = within(conteneur).getByLabelText('Parcourir les points');

    fireEvent.focus(zone);
    fireEvent.keyDown(zone, { key: 'ArrowLeft' });

    expect(conteneur.querySelector('.infobulle')?.textContent).toContain('lun. 19 oct.');

    fireEvent.keyDown(zone, { key: 'Escape' });

    expect(infobullesVisibles()).toHaveLength(0);
  });
});

describe('barres : infobulle par marque (08, règle 5)', () => {
  it('une barre hors de la tabulation reste focalisable, et son infobulle s\'ouvre au focus', () => {
    const conteneur = rendre(optionsBarres());

    const marque = within(conteneur).getByLabelText('lun. 19 oct. · Sous-seuil : 35 min');
    // Tabulation itinérante (point 5) : seule la dernière marque a tabindex 0.
    expect(marque.getAttribute('tabindex')).not.toBe('0');

    fireEvent.focus(marque);

    expect(conteneur.querySelector('.infobulle')?.textContent).toContain('35 min');
  });

  it('un survol de la barre ouvre aussi son infobulle, et le départ du pointeur la ferme', () => {
    const conteneur = rendre(optionsBarres());

    fireEvent.pointerMove(within(conteneur).getByLabelText('dim. 18 oct. · Sous-seuil : 20 min'));
    expect(conteneur.querySelector('.infobulle')?.textContent).toContain('20 min');

    fireEvent.pointerLeave(within(conteneur).getByLabelText('dim. 18 oct. · Sous-seuil : 20 min'));
    expect(infobullesVisibles()).toHaveLength(0);
  });
});

describe('fermeture et unicité (02, 08)', () => {
  it('fermerInfobulle() ferme l\'infobulle ouverte par un survol', () => {
    const conteneur = rendre();
    fireEvent.pointerMove(within(conteneur).getByLabelText('lun. 19 oct.'));

    fermerInfobulle();

    expect(infobullesVisibles()).toHaveLength(0);
  });

  it('il n\'y a jamais plus d\'une infobulle visible dans le document, même avec deux graphiques', () => {
    const premier = rendre();
    const second = rendre(optionsBarres());

    fireEvent.pointerMove(within(premier).getByLabelText('lun. 19 oct.'));
    fireEvent.focus(within(second).getByLabelText('lun. 19 oct. · Sous-seuil : 35 min'));

    expect(infobullesVisibles()).toHaveLength(1);
    expect(second.querySelector('.infobulle')).not.toBeNull();
  });

  it('l\'infobulle SVG ne pose aucun attribut style (ADR 0010)', () => {
    const conteneur = rendre();
    fireEvent.pointerMove(within(conteneur).getByLabelText('lun. 19 oct.'));

    expect(conteneur.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('l\'infobulle ne capte pas le pointeur : la règle CSS .infobulle porte pointer-events: none (08)', () => {
    const regle = /\.graphique \.infobulle\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';

    expect(regle).toMatch(/pointer-events:\s*none/);
  });
});
