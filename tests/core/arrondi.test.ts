import { describe, expect, it } from 'vitest';
import { arrondir, arrondirDecimales } from '../../src/core/arrondi';

// Ces valeurs ne s'arrondissent pas bien avec x * f naïf : x * f vaut 100,49999999999999
// pour 1,005. Le test échoue si la mise à l'échelle laisse le bruit binaire décider (D-015).
describe('arrondi au pas 0,01 : le bruit binaire ne décide pas (D-015)', () => {
  it.each([
    [1.005, 1.01],
    [0.285, 0.29],
    [1.255, 1.26],
    [5.015, 5.02],
  ])('arrondit %s à %s, mi-chemin compris', (x, attendu) => {
    expect(arrondir(x, 0.01)).toBe(attendu);
  });

  it('arrondit au plus proche : 1,305 donne 1,31', () => {
    expect(arrondir(1.305, 0.01)).toBe(1.31);
  });

  it('arrondit un négatif à mi-chemin en s\'éloignant de zéro : −1,005 donne −1,01', () => {
    expect(arrondir(-1.005, 0.01)).toBe(-1.01);
    expect(arrondir(-0.285, 0.01)).toBe(-0.29);
  });
});

// Au pas 0,1, x / pas donne 1,4999999999999998 pour 0,15, 3,4999999999999996 pour 0,35 et
// 50,49999999999999 pour 5,05 : une division naïve arrondirait tous ces cas à la baisse.
describe('arrondi au pas 0,1 : mi-chemin et bruit binaire (D-015)', () => {
  it.each([
    [0.15, 0.2],
    [0.35, 0.4],
    [2.35, 2.4],
    [4.15, 4.2],
    [5.05, 5.1],
    [5.06, 5.1],
  ])('arrondit %s à %s', (x, attendu) => {
    expect(arrondir(x, 0.1)).toBe(attendu);
  });

  it('arrondit un négatif à mi-chemin en s\'éloignant de zéro : −5,05 donne −5,1', () => {
    expect(arrondir(-5.05, 0.1)).toBe(-5.1);
  });

  it('arrondit 5,04 vers le bas : 5,04 donne 5', () => {
    expect(arrondir(5.04, 0.1)).toBe(5);
  });
});

describe('arrondi au pas entier (D-015)', () => {
  it('arrondit une valeur à mi-chemin en s\'éloignant de zéro : −25,5 donne −26 au pas 1', () => {
    expect(arrondir(-25.5, 1)).toBe(-26);
  });

  it('un négatif qui s\'arrondit à zéro donne +0 et non −0 (toBe le détecte)', () => {
    expect(arrondir(-0.4, 1)).toBe(0);
    expect(Object.is(arrondir(-0.4, 1), 0)).toBe(true);
  });
});

describe('pas invalides', () => {
  it('refuse un pas nul ou négatif avec RangeError', () => {
    expect(() => arrondir(1, 0)).toThrow(RangeError);
    expect(() => arrondir(1, -1)).toThrow(RangeError);
  });
});

describe('arrondi à un nombre de décimales (format)', () => {
  it('arrondit 1,5 à 2 au pas entier', () => {
    expect(arrondirDecimales(1.5, 0)).toBe(2);
  });

  it('arrondit −1,5 à −2 au pas entier, à mi-chemin en s\'éloignant de zéro', () => {
    expect(arrondirDecimales(-1.5, 0)).toBe(-2);
  });

  it('refuse un nombre de décimales hors table avec RangeError', () => {
    expect(() => arrondirDecimales(1, -1)).toThrow(RangeError);
  });
});
