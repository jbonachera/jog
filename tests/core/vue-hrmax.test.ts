import { describe, expect, it } from 'vitest';
import { parametresDefaut } from '../../src/core/parametres';
import { calculerVue } from '../../src/core/vue';
import type { DateCivile, ModifDatee, Parametres, SeanceIntrinseque, Vue } from '../../src/core/types';
import { seance } from '../fixtures/vues';

// Suggestion de FC max observée (D-019, ADR 0013) : lue dans la Vue, calculée par calculerVue.
// hrMax en vigueur à J−1 vaut 188 bpm (défaut de 06) sauf modification datée : la marge est de 3 bpm, l'écart
// suspect au-delà de 15 bpm, soit une suggestion dès 191 bpm et un écart suspect dès 204 bpm.
const J = '2026-10-21';

function parametres(modifs: ModifDatee[] = []): Parametres {
  return { globaux: parametresDefaut().globaux, modifs };
}

function modifHrMax(valeur: number, dateEffet: DateCivile): ModifDatee {
  return { id: `hrmax-${dateEffet}-${valeur}`, cle: 'hrMax', valeur, dateEffet, enregistreLe: '2026-01-01T10:00:00Z' };
}

/** Une séance datée, avec un pic soutenu donné (null par défaut). */
function avecPic(date: DateCivile, fcPic: number | null, surcharge: Partial<SeanceIntrinseque> = {}): SeanceIntrinseque {
  return { ...seance({ date, type: 'footing', fcPic }), ...surcharge };
}

function vueAvec(seances: SeanceIntrinseque[], modifs: ModifDatee[] = [], jour: DateCivile = J): Vue {
  return calculerVue({ intrinseques: seances, parametres: parametres(modifs), J: jour, derniereSynchro: null });
}

function suggestionDe(seances: SeanceIntrinseque[], modifs: ModifDatee[] = []) {
  return vueAvec(seances, modifs).parametresEnVigueur.suggestionHrMax;
}

describe('suggestion de FC max observée : seuil de proposition (D-019)', () => {
  it('à hrMax + 2 bpm, aucune suggestion', () => {
    expect(suggestionDe([avecPic('2026-09-01', 190)])).toBeNull();
  });

  it('à hrMax + 3 bpm, la suggestion est faite', () => {
    expect(suggestionDe([avecPic('2026-09-01', 191)])).toMatchObject({ bpm: 191, date: '2026-09-01' });
  });

  it('le pic est arrondi à l’entier, à mi-chemin loin de zéro : 192,5 devient 193 (D-015)', () => {
    expect(suggestionDe([avecPic('2026-09-01', 192.5)])).toMatchObject({ bpm: 193 });
  });

  it('à 190,5 arrondi à 191, la suggestion est faite ; à 190,4 arrondi à 190, elle ne l’est pas (D-015)', () => {
    expect(suggestionDe([avecPic('2026-09-01', 190.5)])).toMatchObject({ bpm: 191 });
    expect(suggestionDe([avecPic('2026-09-01', 190.4)])).toBeNull();
  });

  it('le pic n’est arrondi qu’une fois : 190,49996 reste 190, sous le seuil (double arrondi évité, D-015)', () => {
    // Un arrondi à 4 décimales (190,5) puis au bpm (191) ferait proposer 191.
    expect(suggestionDe([avecPic('2026-09-01', 190.49996)])).toBeNull();
  });

  it('sans séance, aucune suggestion', () => {
    expect(suggestionDe([])).toBeNull();
  });

  it('une séance sans pic soutenu (fcPic nul) ne propose rien', () => {
    expect(suggestionDe([avecPic('2026-09-01', null)])).toBeNull();
  });
});

describe('suggestion de FC max observée : fenêtre de dates (D-019)', () => {
  it('une séance à J−366 est ignorée, une séance à J−365 est retenue', () => {
    expect(suggestionDe([avecPic('2025-10-20', 200)])).toBeNull();
    expect(suggestionDe([avecPic('2025-10-21', 200)])).toMatchObject({ bpm: 200, date: '2025-10-21' });
  });

  it('la séance de J (aujourd’hui) n’est pas retenue, celle de J−1 l’est', () => {
    expect(suggestionDe([avecPic(J, 200)])).toBeNull();
    expect(suggestionDe([avecPic('2026-10-20', 200)])).toMatchObject({ bpm: 200, date: '2026-10-20' });
  });

  it('sans modification de hrMax, tout l’historique de J−365 à J−1 compte : le pic le plus haut gagne', () => {
    const suggestion = suggestionDe([avecPic('2026-01-15', 200), avecPic('2026-10-15', 195)]);

    expect(suggestion).toMatchObject({ bpm: 200, date: '2026-01-15' });
  });

  it('une séance antérieure à la dernière modification de hrMax est ignorée, celle du même jour est retenue', () => {
    const modifs = [modifHrMax(185, '2026-06-01')];

    const suggestion = suggestionDe([avecPic('2026-05-31', 230), avecPic('2026-06-01', 200)], modifs);

    expect(suggestion).toMatchObject({ bpm: 200, date: '2026-06-01' });
  });

  it('deux modifications de hrMax saisies à l’envers : la séance du 1er juin compte, celles d’avant le 1er juin non', () => {
    // hrMax passe de 185 (1er mars) à 190 (1er juin) : seuil à J−1 de 190, donc 193. Les séances du 31 mai et du
    // 15 mars sont plus hautes mais antérieures à la dernière modification.
    const modifs = [modifHrMax(190, '2026-06-01'), modifHrMax(185, '2026-03-01')];
    const seances = [
      avecPic('2026-06-01', 194, { cleSource: 'strava:juin' }),
      avecPic('2026-05-31', 230, { cleSource: 'strava:mai' }),
      avecPic('2026-03-15', 220, { cleSource: 'strava:mars' }),
    ];

    expect(suggestionDe(seances, modifs)).toMatchObject({ bpm: 194, date: '2026-06-01', cleSource: 'strava:juin' });
  });

  it('deux modifications saisies à l’envers : après le 1er juin, la séance la plus haute l’emporte', () => {
    const modifs = [modifHrMax(190, '2026-06-01'), modifHrMax(185, '2026-03-01')];
    const seances = [
      avecPic('2026-09-01', 196, { cleSource: 'strava:septembre' }),
      avecPic('2026-06-01', 194, { cleSource: 'strava:juin' }),
      avecPic('2026-05-31', 230, { cleSource: 'strava:mai' }),
    ];

    expect(suggestionDe(seances, modifs)).toMatchObject({ bpm: 196, date: '2026-09-01' });
  });

  it('une modification postérieure à la séance la rend hors fenêtre, même au-dessus du seuil', () => {
    // hrMax(J−1) vaut 190 : le seuil de 193 serait franchi par 200, mais la séance est antérieure au 1er juillet.
    expect(suggestionDe([avecPic('2026-06-10', 200)], [modifHrMax(190, '2026-07-01')])).toBeNull();
  });

  it('une modification d’un autre paramètre ne borne pas l’historique', () => {
    const modifs: ModifDatee[] = [{ id: 'lt2', cle: 'lt2Hr', valeur: 170, dateEffet: '2026-09-01', enregistreLe: '2026-01-01T10:00:00Z' }];

    expect(suggestionDe([avecPic('2026-08-01', 200)], modifs)).toMatchObject({ bpm: 200, date: '2026-08-01' });
  });

  it('une modification datée après J−1 vide la fenêtre, même pour une séance antérieure à J (ADR 0013, « au plus tôt »)', () => {
    expect(suggestionDe([avecPic('2026-10-20', 210)], [modifHrMax(190, '2026-10-22')])).toBeNull();
  });
});

describe('suggestion de FC max observée : seuil lu à J−1 (D-006, D-019)', () => {
  it('hrMax(J−1) tient compte des modifications datées : un pic à 195 ne suffit pas au-dessus de 200', () => {
    const modifs = [modifHrMax(200, '2026-06-01')];

    expect(suggestionDe([avecPic('2026-07-01', 195)], modifs)).toBeNull();
    expect(suggestionDe([avecPic('2026-07-01', 195)])).toMatchObject({ bpm: 195 });
  });

  it('une modification datée de J vide la fenêtre : la suggestion est absente, même pour une séance de J−1 (D-019, « au plus tôt »)', () => {
    // La fenêtre commence à J, et ne contient donc aucune séance de J−1.
    expect(suggestionDe([avecPic('2026-10-20', 200)], [modifHrMax(200, J)])).toBeNull();
  });

  it('une modification datée de J−1 s’applique à J−1 : le seuil est celui de la nouvelle valeur', () => {
    // 202 passerait le seuil de 188 (191) ; il ne passe pas celui de 200 (203).
    const modifs = [modifHrMax(200, '2026-10-20')];

    expect(suggestionDe([avecPic('2026-10-20', 202)], modifs)).toBeNull();
    expect(suggestionDe([avecPic('2026-10-20', 203)], modifs)).toMatchObject({ bpm: 203, date: '2026-10-20' });
  });

  it('une modification antérieure à J−1 : hrMax(J−1) en tient compte pour une séance de J−1', () => {
    const modifs = [modifHrMax(200, '2026-09-01')];

    expect(suggestionDe([avecPic('2026-10-20', 202)], modifs)).toBeNull();
    expect(suggestionDe([avecPic('2026-10-20', 203)], modifs)).toMatchObject({ bpm: 203, date: '2026-10-20' });
  });
});

describe('suggestion de FC max observée : choix du pic (D-019, D-015)', () => {
  it('à égalité après arrondi, la séance la plus récente est retenue, quel que soit l’ordre de saisie', () => {
    const suggestion = suggestionDe([
      avecPic('2026-09-01', 200, { nom: 'récente', cleSource: 'strava:recente' }),
      avecPic('2026-03-01', 200, { nom: 'ancienne', cleSource: 'strava:ancienne' }),
    ]);

    expect(suggestion).toMatchObject({ bpm: 200, date: '2026-09-01', nom: 'récente', cleSource: 'strava:recente' });
  });

  it('le même jour, à égalité, la séance au début le plus tardif est retenue, quel que soit l’ordre de saisie', () => {
    const debut = Date.parse('2026-09-01T08:00:00Z');
    const suggestion = suggestionDe([
      avecPic('2026-09-01', 200, { cleSource: 'strava:soir', debutUtc: debut + 6 * 3_600_000 }),
      avecPic('2026-09-01', 200, { cleSource: 'strava:matin', debutUtc: debut }),
    ]);

    expect(suggestion).toMatchObject({ cleSource: 'strava:soir' });
  });

  it('même date et même début, à égalité : le cleSource le plus grand l’emporte, quel que soit l’ordre de saisie', () => {
    // La Vue range les séances par (date, debutUtc, cleSource) : la dernière retenue, donc la plus grande, gagne.
    const debut = Date.parse('2026-09-01T08:00:00Z');
    const suggestion = suggestionDe([
      avecPic('2026-09-01', 200, { cleSource: 'strava:b', debutUtc: debut }),
      avecPic('2026-09-01', 200, { cleSource: 'strava:a', debutUtc: debut }),
    ]);

    expect(suggestion).toMatchObject({ cleSource: 'strava:b' });
  });

  it('le pic se compare après arrondi : 200,6 (201) l’emporte sur 200,4 (200), même plus ancien', () => {
    const suggestion = suggestionDe([
      avecPic('2026-09-01', 200.4, { cleSource: 'strava:recente' }),
      avecPic('2026-03-01', 200.6, { cleSource: 'strava:ancienne' }),
    ]);

    expect(suggestion).toMatchObject({ bpm: 201, cleSource: 'strava:ancienne' });
  });
});

describe('suggestion de FC max observée : écart suspect (D-019)', () => {
  it('à hrMax + 15 bpm, l’écart n’est pas suspect', () => {
    expect(suggestionDe([avecPic('2026-09-01', 203)])).toMatchObject({ bpm: 203, ecartSuspect: false });
  });

  it('à hrMax + 16 bpm, l’écart est suspect', () => {
    expect(suggestionDe([avecPic('2026-09-01', 204)])).toMatchObject({ bpm: 204, ecartSuspect: true });
  });
});

describe('suggestion de FC max observée : contenu de la proposition (D-019)', () => {
  it('porte la date, la clé de la séance et son nom', () => {
    const suggestion = suggestionDe([avecPic('2026-09-01', 200, { nom: 'Semi de Porto', cleSource: 'strava:42' })]);

    expect(suggestion).toEqual({ bpm: 200, date: '2026-09-01', cleSource: 'strava:42', nom: 'Semi de Porto', km: 5, ecartSuspect: false });
  });

  it('sans nom, le nom est null', () => {
    expect(suggestionDe([avecPic('2026-09-01', 200, { nom: null })])).toMatchObject({ nom: null });
  });

  it('la distance est donnée en kilomètres, arrondie au dixième comme à l’affichage (D-015)', () => {
    expect(suggestionDe([avecPic('2026-09-01', 200, { km: 10.26 })])).toMatchObject({ km: 10.3 });
  });

  it('la distance à 10,25 km est arrondie à 10,3, mi-chemin loin de zéro (D-015)', () => {
    expect(suggestionDe([avecPic('2026-09-01', 200, { km: 10.25 })])).toMatchObject({ km: 10.3 });
  });
});
