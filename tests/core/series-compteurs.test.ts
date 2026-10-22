import { describe, expect, it } from 'vitest';
import { ajouterJours, numeroJour } from '../../src/core/dates';
import { agregerJours, type JourAgrege } from '../../src/core/jours';
import { ECART_VOLUME_SIGNALE } from '../../src/core/constantes';
import { compteurs } from '../../src/core/series';
import type { DateCivile, Seance } from '../../src/core/types';
import { seance } from '../fixtures/vues';

// Une séance de 60 min par jour où le kilométrage est positif, du jour `debut` au jour `fin` inclus.
function historique(
  debut: DateCivile,
  fin: DateCivile,
  kmParJour: (date: DateCivile) => number,
): { seances: Seance[]; jours: JourAgrege[] } {
  const seances: Seance[] = [];
  const nombre = numeroJour(fin) - numeroJour(debut) + 1;
  for (let i = 0; i < nombre; i++) {
    const date = ajouterJours(debut, i);
    const km = kmParJour(date);
    if (km > 0) seances.push(seance({ date, type: 'footing', km, duree_min: 60 }));
  }
  return { seances, jours: agregerJours(seances, debut, fin) };
}

describe('compteur annuel (A2, 04, « Compteurs »)', () => {
  it('J = 1ᵉʳ janvier 2026 : l’année 2025 est complète, du 1ᵉʳ janvier au 31 décembre', () => {
    // 2 km chaque jour de 2025 : 365 jours, 730 km. Moyenne hebdomadaire 730 ÷ 365 × 7 = 14.
    const { seances, jours } = historique('2025-01-01', '2025-12-31', () => 2);

    const c = compteurs(jours, seances, '2026-01-01');

    expect(c.annee.km).toBe(730);
    expect(c.annee.duree_min).toBe(365 * 60);
    expect(c.annee.nbSeances).toBe(365);
    expect(c.annee.moyenneHebdo_km).toBeCloseTo(14, 10);
  });

  it('une barre par semaine ; les barres couvrent l’année exactement', () => {
    // 1ᵉʳ janvier 2025 : mercredi. Barres : du 1ᵉʳ au 5 janvier, puis chaque lundi, puis du 29 au 31 décembre.
    // Du 6 janvier au 28 décembre : 51 semaines. Total : 1 + 51 + 1 = 53 barres.
    const { seances, jours } = historique('2025-01-01', '2025-12-31', () => 2);

    const { serie, km } = compteurs(jours, seances, '2026-01-01').annee;

    expect(serie).toHaveLength(53);
    expect(serie[0]?.date).toBe('2025-01-01');
    expect(serie[1]?.date).toBe('2025-01-06');
    expect(serie.at(-1)?.date).toBe('2025-12-29');
    expect(serie.reduce((total, barre) => total + barre.km, 0)).toBe(km);
  });
});

describe('compteurs de 30 et 7 jours : écart (A2, 04)', () => {
  it('écart de +30 % sur 30 jours : A = 390 km, B = 300 km', () => {
    // J = 21 octobre 2026. A = J−30 … J−1 (21 sept. – 20 oct.), B = J−60 … J−31 (22 août – 20 sept.).
    // Jours de A à 13 km, les autres à 10 km : A = 30 × 13 = 390 ; B = 30 × 10 = 300 ; écart = 90 ÷ 300 = 0,3.
    const { seances, jours } = historique('2026-08-22', '2026-10-20', (date) => (date >= '2026-09-21' ? 13 : 10));

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours30.km).toBe(390);
    expect(c.jours30.historiquePrecedent).toBe(true);
    expect(c.jours30.ecart).toBeCloseTo(0.3, 10);
  });

  it('écart de −30 % sur 30 jours : A = 210 km face à B = 300 km', () => {
    const { seances, jours } = historique('2026-08-22', '2026-10-20', (date) => (date >= '2026-09-21' ? 7 : 10));

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours30.km).toBe(210);
    expect(c.jours30.ecart).toBeCloseTo(-0.3, 10);
  });

  it('écart de +40 % sur 7 jours : A = 98 km face à B = 70 km', () => {
    // A = J−7 … J−1 (14 – 20 oct.) à 14 km ; B = J−14 … J−8 (7 – 13 oct.) à 10 km.
    const { seances, jours } = historique('2026-10-07', '2026-10-20', (date) => (date >= '2026-10-14' ? 14 : 10));

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours7.km).toBe(98);
    expect(c.jours7.ecart).toBeCloseTo(0.4, 10);
  });

  it('sans historique précédent sur 30 jours : écart nul, à « pas d’historique »', () => {
    // Historique du 6 septembre au 20 octobre (45 jours) : B (22 août – 20 sept.) commence avant le jour 1.
    // Sur 7 jours, B (7 – 13 oct.) est couverte : l'écart est calculable, et vaut 0.
    const { seances, jours } = historique('2026-09-06', '2026-10-20', () => 10);

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours30.historiquePrecedent).toBe(false);
    expect(c.jours30.ecart).toBeNull();
    expect(c.jours7.historiquePrecedent).toBe(true);
    expect(c.jours7.ecart).toBe(0);
  });
});

describe('compteurs : séances et séries (A2)', () => {
  it('ne compte pas une séance de durée nulle dans le nombre de séances', () => {
    // Les 7 derniers jours : une séance de 60 min chaque jour, plus une séance de durée nulle le 18 octobre.
    const { seances } = historique('2026-10-14', '2026-10-20', () => 10);
    seances.push(seance({ date: '2026-10-18', type: 'footing', km: 0, duree_min: 0 }));
    const jours = agregerJours(seances, '2026-10-14', '2026-10-20');

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours7.nbSeances).toBe(7);
    expect(c.jours7.duree_min).toBe(7 * 60);
  });

  it('une barre par jour sur 7 jours, de type sous-seuil si une séance est sous-seuil ce jour-là', () => {
    const seances = [
      seance({ date: '2026-10-14', type: 'footing', km: 8, duree_min: 45 }),
      seance({ date: '2026-10-16', type: 'footing', km: 6, duree_min: 40 }),
      seance({ date: '2026-10-18', type: 'footing', km: 5, duree_min: 30 }),
      seance({ date: '2026-10-18', type: 'sous-seuil', km: 10, duree_min: 60 }),
      seance({ date: '2026-10-20', type: 'footing', km: 7, duree_min: 45 }),
    ];
    const jours = agregerJours(seances, '2026-10-14', '2026-10-20');

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours7.serie).toEqual([
      { date: '2026-10-14', km: 8, type: 'footing' },
      { date: '2026-10-15', km: 0, type: null },
      { date: '2026-10-16', km: 6, type: 'footing' },
      { date: '2026-10-17', km: 0, type: null },
      { date: '2026-10-18', km: 15, type: 'sous-seuil' },
      { date: '2026-10-19', km: 0, type: null },
      { date: '2026-10-20', km: 7, type: 'footing' },
    ]);
  });
});

describe('compteurs : premier jour de la comparaison (A2, 04)', () => {
  it('30 jours : si le jour 1 tombe à J−60, la période B a un historique et l’écart se calcule', () => {
    // Jour 1 = 22 août = J−60 ; B = 22 août – 20 sept. est complète. A = 390, B = 300, écart 0,3.
    const { seances, jours } = historique('2026-08-22', '2026-10-20', (date) => (date >= '2026-09-21' ? 13 : 10));

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours30.historiquePrecedent).toBe(true);
    expect(c.jours30.ecart).toBeCloseTo(0.3, 10);
  });

  it('30 jours : si le jour 1 tombe à J−59, la période B n’a pas d’historique complet : pas d’écart', () => {
    const { seances, jours } = historique('2026-08-23', '2026-10-20', () => 10);

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours30.historiquePrecedent).toBe(false);
    expect(c.jours30.ecart).toBeNull();
  });

  it('7 jours : si le jour 1 tombe à J−14, la période B a un historique et l’écart se calcule', () => {
    const { seances, jours } = historique('2026-10-07', '2026-10-20', (date) => (date >= '2026-10-14' ? 14 : 10));

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours7.historiquePrecedent).toBe(true);
    expect(c.jours7.ecart).toBeCloseTo(0.4, 10);
  });

  it('7 jours : si le jour 1 tombe à J−13, la période B n’a pas d’historique complet : pas d’écart', () => {
    const { seances, jours } = historique('2026-10-08', '2026-10-20', () => 10);

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours7.historiquePrecedent).toBe(false);
    expect(c.jours7.ecart).toBeNull();
  });

  it('avec un historique précédent mais 0 km sur la période B, l’écart est nul (non calculable)', () => {
    // B (22 août – 20 sept.) n'a aucune séance ; A = 390 km. Division par zéro évitée.
    const { seances, jours } = historique('2026-08-22', '2026-10-20', (date) => (date >= '2026-09-21' ? 13 : 0));

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.jours30.historiquePrecedent).toBe(true);
    expect(c.jours30.km).toBe(390);
    expect(c.jours30.ecart).toBeNull();
  });
});

describe('compteur annuel : historique précédent et moyenne (A2, 04)', () => {
  // J en milieu d'année : l'année comptée est 2026, la comparaison porte sur 2025 (à partir de son 1ᵉʳ janvier).
  it('historiquePrecedent vaut vrai quand l’année précédente est couverte depuis son 1ᵉʳ janvier', () => {
    const { seances, jours } = historique('2025-01-01', '2026-10-20', () => 2);

    expect(compteurs(jours, seances, '2026-10-21').annee.historiquePrecedent).toBe(true);
  });

  it('historiquePrecedent vaut faux quand l’année précédente commence après son 1ᵉʳ janvier', () => {
    const { seances, jours } = historique('2025-06-01', '2026-10-20', () => 2);

    expect(compteurs(jours, seances, '2026-10-21').annee.historiquePrecedent).toBe(false);
  });

  it('l’année bissextile 2024 se moyenne sur 366 jours : 732 km donnent 14 km par semaine', () => {
    const { seances, jours } = historique('2024-01-01', '2024-12-31', () => 2);

    const c = compteurs(jours, seances, '2025-01-01');

    expect(c.annee.km).toBe(732);
    expect(c.annee.moyenneHebdo_km).toBeCloseTo(14, 10);
  });

  it('la moyenne hebdomadaire se fait sur le 1ᵉʳ janvier → J−1 (04), même si l’historique commence plus tard', () => {
    // Historique du 1ᵉʳ mars au 20 octobre 2026 : 234 jours à 10 km, soit 2 340 km.
    // Littéralement : jours du 1ᵉʳ janvier au 20 octobre = 293. Moyenne = 2 340 ÷ 293 × 7 = 16 380/293 (≈ 55,9).
    const { seances, jours } = historique('2026-03-01', '2026-10-20', () => 10);

    const c = compteurs(jours, seances, '2026-10-21');

    expect(c.annee.km).toBe(2340);
    expect(c.annee.moyenneHebdo_km).toBeCloseTo(16380 / 293, 10);
  });
});

describe('compteur de 30 jours : fenêtre qui traverse le 29 février 2024 (A2, 04)', () => {
  it('A = 30 jours du 4 février au 4 mars, 29 février compris ; B = 30 jours du 5 janvier au 3 février', () => {
    // J = 5 mars 2024. A : 29 jours à 10 km et le 29 février à 30 km = 320 km. B : 30 jours à 5 km = 150 km.
    // Écart = (320 − 150) ÷ 150 = 17/15.
    const { seances, jours } = historique('2024-01-05', '2024-03-04', (date) => {
      if (date === '2024-02-29') return 30;
      return date >= '2024-02-04' ? 10 : 5;
    });

    const c = compteurs(jours, seances, '2024-03-05');

    expect(c.jours30.historiquePrecedent).toBe(true);
    expect(c.jours30.km).toBe(320);
    expect(c.jours30.ecart).toBeCloseTo(17 / 15, 10);
  });
});

describe('compteurs : type dominant d’une barre (A2)', () => {
  // Barres du 14 au 20 octobre 2026. Le 18 octobre est le seul jour testé.
  const seancesDuJour = (...seances: ReturnType<typeof seance>[]) => {
    const jour = agregerJours(seances, '2026-10-14', '2026-10-20');
    return compteurs(jour, seances, '2026-10-21').jours7.serie.find((b) => b.date === '2026-10-18')?.type;
  };

  it('une séance sous-seuil de 20 min l’emporte sur un footing de 60 min le même jour', () => {
    const type = seancesDuJour(
      seance({ date: '2026-10-18', type: 'footing', km: 10, duree_min: 60 }),
      seance({ date: '2026-10-18', type: 'sous-seuil', km: 4, duree_min: 20 }),
    );

    expect(type).toBe('sous-seuil');
  });

  it('sans sous-seuil, le type de la séance la plus longue, même quand elle vient en premier', () => {
    const type = seancesDuJour(
      seance({ date: '2026-10-18', type: 'footing', km: 10, duree_min: 60 }),
      seance({ date: '2026-10-18', type: 'footing-lignes-droites', km: 4, duree_min: 30 }),
    );

    expect(type).toBe('footing');
  });

  it('sans sous-seuil, le type de la séance la plus longue, même quand elle vient en dernier', () => {
    const type = seancesDuJour(
      seance({ date: '2026-10-18', type: 'footing', km: 4, duree_min: 30 }),
      seance({ date: '2026-10-18', type: 'footing-lignes-droites', km: 10, duree_min: 60 }),
    );

    expect(type).toBe('footing-lignes-droites');
  });

  it('en cas d’égalité de durée, c’est la première séance qui donne le type', () => {
    const type = seancesDuJour(
      seance({ date: '2026-10-18', type: 'footing', km: 8, duree_min: 45 }),
      seance({ date: '2026-10-18', type: 'footing-lignes-droites', km: 8, duree_min: 45 }),
    );

    expect(type).toBe('footing');
  });
});

describe('seuil d’écart signalé (A2, 04, « Compteurs »)', () => {
  it('l’écart est signalé au-delà de ±30 % : fraction 0,30, comparaison stricte (|écart| > 0,30)', () => {
    expect(ECART_VOLUME_SIGNALE).toBe(0.3);
  });
});
