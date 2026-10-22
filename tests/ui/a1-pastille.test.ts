// Pastille d'état (08, Composants de base) : un texte, une puce décorative, et la teinte portée par la puce seule.
import { describe, expect, it } from 'vitest';
import { pastille } from '../../src/ui/composants/commun';

describe('pastille d\'état (08)', () => {
  it('une pastille a les classes de son état, le texte et une puce', () => {
    const element = pastille('À surveiller', 'warn');

    expect(element.className).toBe('pastille pastille-warn');
    expect(element.textContent).toBe('À surveiller');
    expect(element.querySelector('.puce')).not.toBeNull();
  });

  it('la puce est masquée des lecteurs d\'écran : seul le texte est annoncé', () => {
    const puce = pastille('OK', 'good').querySelector('.puce');

    expect(puce?.getAttribute('aria-hidden')).toBe('true');
  });

  it('une pastille neutre a la classe pastille-neutre', () => {
    expect(pastille('–', 'neutre').classList.contains('pastille-neutre')).toBe(true);
  });
});
