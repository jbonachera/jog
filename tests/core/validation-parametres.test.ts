import { describe, expect, it } from 'vitest';
import { parametresDefaut } from '../../src/core/parametres';
import type { ModifDatee, Parametres } from '../../src/core/types';
import { validerParametres } from '../../src/core/validationParametres';

const J = '2026-10-21';

/** Paramètres par défaut, avec les modifications données. */
function avec(modifs: Partial<Parametres['globaux']> = {}, ...lignes: ModifDatee[]): Parametres {
  return { globaux: { ...parametresDefaut().globaux, ...modifs }, modifs: lignes };
}

function modif(cle: ModifDatee['cle'], valeur: number, dateEffet = '2026-09-01', id = `${cle}-${dateEffet}`): ModifDatee {
  return { id, cle, valeur, dateEffet, enregistreLe: `${dateEffet}T09:00:00Z` };
}

describe('validation des paramètres proposés (06, « Validation, au moment d\'enregistrer »)', () => {
  it('accepte les paramètres par défaut', () => {
    expect(validerParametres(parametresDefaut(), J)).toEqual({ ok: true });
  });

  describe('règle 1 : valeur finie et strictement positive', () => {
    it('refuse une valeur nulle, et nomme le champ et son libellé', () => {
      expect(validerParametres(avec({ ctlDays: 0 }), J)).toEqual({
        ok: false,
        champ: 'ctlDays',
        message: 'Valeur manquante ou invalide : Forme de fond (CTL).',
      });
    });

    it('refuse une valeur non finie d\'un paramètre daté, avec le libellé de 06', () => {
      expect(validerParametres(avec({}, modif('hrMax', Number.NaN)), J)).toEqual({
        ok: false,
        champ: 'hrMax',
        message: 'Valeur manquante ou invalide : FC max.',
      });
    });

    it('refuse une valeur négative', () => {
      expect(validerParametres(avec({}, modif('lt2Hr', -172)), J)).toMatchObject({ ok: false, champ: 'lt2Hr' });
    });
  });

  describe('règle 2 : allure au seuil en secondes', () => {
    it('refuse une allure non entière, avec le message exact', () => {
      expect(validerParametres(avec({}, modif('lt2Pace', 238.5)), J)).toEqual({
        ok: false,
        champ: 'lt2Pace',
        message: 'Allure au seuil : utilisez le format m:ss, par exemple 4:02.',
      });
    });

    it('accepte une allure entière en secondes', () => {
      expect(validerParametres(avec({}, modif('lt2Pace', 242)), J)).toEqual({ ok: true });
    });
  });

  describe('règle 3 : coefficient allure ↔ FC entre 0,6 et 3', () => {
    it('refuse une valeur supérieure à 3, avec le message exact', () => {
      expect(validerParametres(avec({ paceHrK: 3.5 }), J)).toEqual({
        ok: false,
        champ: 'paceHrK',
        message: 'Coefficient allure ↔ FC : choisissez une valeur entre 0,6 et 3.',
      });
    });

    it('refuse une valeur inférieure à 0,6', () => {
      expect(validerParametres(avec({ paceHrK: 0.5 }), J)).toMatchObject({ ok: false, champ: 'paceHrK' });
    });

    it('accepte les bornes 0,6 et 3 incluses', () => {
      expect(validerParametres(avec({ paceHrK: 0.6 }), J)).toEqual({ ok: true });
      expect(validerParametres(avec({ paceHrK: 3 }), J)).toEqual({ ok: true });
    });
  });

  describe('règle 4 : bornes ordonnées', () => {
    const MESSAGE = 'Chaque borne basse doit être inférieure à la borne haute, et les zones doivent croître.';

    it('refuse subtPctLo = subtPctHi : l\'égalité est refusée', () => {
      expect(validerParametres(avec({ subtPctLo: 25, subtPctHi: 25 }), J)).toEqual({ ok: false, champ: 'subtPctHi', message: MESSAGE });
    });

    it('refuse subtPctLo supérieur à subtPctHi', () => {
      expect(validerParametres(avec({ subtPctLo: 30 }), J)).toEqual({ ok: false, champ: 'subtPctHi', message: MESSAGE });
    });

    it('refuse des zones qui ne croissent pas, et désigne la zone fautive', () => {
      expect(validerParametres(avec({}, modif('z2', 68)), J)).toEqual({ ok: false, champ: 'z2', message: MESSAGE });
    });

    it('refuse z4 à 100 ou plus', () => {
      expect(validerParametres(avec({}, modif('z4', 100)), J)).toEqual({ ok: false, champ: 'z4', message: MESSAGE });
    });

    it('refuse subtHrLo à 170 au 1er mars alors que subtHrHi vaut 168 à cette date (jeu en vigueur à une date passée)', () => {
      const resultat = validerParametres(avec({}, modif('subtHrLo', 170, '2026-03-01')), J);

      expect(resultat).toMatchObject({ ok: false, message: expect.stringContaining('borne basse') });
    });

    it('accepte subtHrLo à 170 au 1er mars si subtHrHi a été relevé à 175 avant cette date', () => {
      const parametres = avec({}, modif('subtHrHi', 175, '2026-01-01'), modif('subtHrLo', 170, '2026-03-01'));

      expect(validerParametres(parametres, J)).toEqual({ ok: true });
    });
  });

  describe('date d\'effet', () => {
    it('refuse une date d\'effet future, avec le message exact', () => {
      expect(validerParametres(avec({}, modif('lt2Hr', 170, '2026-10-22')), J)).toEqual({
        ok: false,
        champ: 'dateEffet',
        message: "La date d’effet ne peut pas être dans le futur.",
      });
    });

    it('accepte la date d\'aujourd\'hui', () => {
      expect(validerParametres(avec({}, modif('lt2Hr', 170, J)), J)).toEqual({ ok: true });
    });
  });

  it('applique les règles à chaque date touchée : une valeur valide en juin, invalide en septembre, est refusée', () => {
    const parametres = avec({}, modif('easyCap', 150, '2026-06-01'), modif('subtHrLo', 170, '2026-09-01'));

    expect(validerParametres(parametres, J)).toMatchObject({ ok: false, champ: 'subtHrHi' });
  });
});

describe('validation : ordre des règles et structure (06, « Validation », ajouts de la correction)', () => {
  it('la règle 1 passe avant la règle 3 : hrMax = NaN avec paceHrK = 5 donne le message de la règle 1', () => {
    expect(validerParametres(avec({ paceHrK: 5 }, modif('hrMax', Number.NaN)), J)).toEqual({
      ok: false,
      champ: 'hrMax',
      message: 'Valeur manquante ou invalide : FC max.',
    });
  });

  it('la règle 1 passe avant la règle 2 : une allure non entière et une FC max nulle donnent la règle 1', () => {
    const resultat = validerParametres(avec({}, modif('lt2Pace', 238.5), modif('hrMax', 0, '2026-09-02')), J);
    expect(resultat).toMatchObject({ ok: false, champ: 'hrMax' });
  });

  it('refuse une subtHrLo égale à subtHrHi (06, règle 4)', () => {
    expect(validerParametres(avec({}, modif('subtHrLo', 168)), J)).toEqual({
      ok: false,
      champ: 'subtHrHi',
      message: 'Chaque borne basse doit être inférieure à la borne haute, et les zones doivent croître.',
    });
  });

  it('refuse une clé inconnue, avec un message qui la nomme, sans exception', () => {
    const proposes = { globaux: parametresDefaut().globaux, modifs: [{ ...modif('hrMax', 190), cle: 'zz' }] } as unknown as Parametres;
    const resultat = validerParametres(proposes, J);
    expect(resultat.ok).toBe(false);
    expect(resultat).toMatchObject({ ok: false, champ: 'zz' });
    expect((resultat as { message: string }).message).toContain('zz');
  });

  it('refuse un identifiant en double, sans exception', () => {
    const proposes = avec({}, modif('hrMax', 190, '2026-09-01', 'meme'), modif('lt2Hr', 170, '2026-09-02', 'meme'));
    expect(validerParametres(proposes, J)).toMatchObject({ ok: false, message: expect.stringContaining('en double') });
  });

  it('refuse une valeur non numérique, avec le champ, sans exception', () => {
    const proposes = avec({}, { ...modif('hrMax', 190), valeur: 'abc' as unknown as number });
    expect(validerParametres(proposes, J)).toMatchObject({ ok: false, champ: 'hrMax', message: expect.stringContaining('FC max') });
  });

  it('refuse un enregistreLe qui n\'est pas un instant UTC, sans exception', () => {
    const proposes = avec({}, { ...modif('hrMax', 190), enregistreLe: 'hier' });
    expect(validerParametres(proposes, J)).toMatchObject({ ok: false, message: expect.stringContaining('enregistrement') });
  });

  it('refuse une date d\'effet qui n\'existe pas, avec le message de format (ajout à 06 : voir le compte rendu)', () => {
    expect(validerParametres(avec({}, modif('hrMax', 190, '2026-02-30')), J)).toEqual({
      ok: false,
      champ: 'dateEffet',
      message: "La date d’effet n’est pas une date valide.",
    });
  });
});

describe('validation : jeux en vigueur à chaque date touchée (06, Portée d\'une modification)', () => {
  it('refuse un jeu invalide au milieu de l\'historique, même si le dernier jeu est valide', () => {
    // Août : z3 = 85 (valide). Septembre : z4 = 80, donc z3 > z4 (invalide). Octobre : z4 = 90 (valide).
    const proposes = avec({}, modif('z3', 85, '2026-08-01'), modif('z4', 80, '2026-09-01'), modif('z4', 90, '2026-10-01'));
    expect(validerParametres(proposes, J)).toMatchObject({ ok: false, champ: 'z4' });
  });

  it('refuse un jeu invalide avant la première modification : la première valeur enregistrée s\'y applique', () => {
    // z3 = 95 est la première modification. Avant elle, z3 vaut 95 et z4 vaut son défaut 92 : invalide.
    const proposes = avec({}, modif('z3', 95, '2026-09-01'));
    expect(validerParametres(proposes, J)).toMatchObject({ ok: false, champ: 'z4' });
  });
});
