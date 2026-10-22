import { describe, expect, it } from 'vitest';
import { ajouterJours } from '../../src/core/dates';
import { agregerJours, type JourAgrege } from '../../src/core/jours';
import { parametresDefaut } from '../../src/core/parametres';
import { semaines } from '../../src/core/series';
import type { DateCivile, ModifDatee, Parametres, Seance } from '../../src/core/types';
import { seance } from '../fixtures/vues';

// J un lundi : la dernière semaine finie est celle du 12 au 18 octobre 2026.
const J_LUNDI: DateCivile = '2026-10-19';
// J un mardi : la semaine du lundi 19 octobre est en cours.
const J_MARDI: DateCivile = '2026-10-20';
// J un jeudi : la semaine en cours n'a que trois jours écoulés (19, 20 et 21 octobre).
const J_JEUDI: DateCivile = '2026-10-22';

function jours(seances: Seance[], du: DateCivile, au: DateCivile): JourAgrege[] {
  return agregerJours(seances, du, au);
}

// Une séance dont la charge vaut `valeur` (la fixture compte la charge comme la durée).
function charge(date: DateCivile, valeur: number): Seance {
  return { ...seance({ date, type: 'footing', duree_min: valeur }), charge: valeur };
}

// Un kilométrage par jour à partir de `debut`. Un jour à 0 km n'a pas de séance.
function kmParJour(kms: number[], debut: DateCivile): JourAgrege[] {
  const seances: Seance[] = [];
  kms.forEach((km, i) => {
    if (km > 0) seances.push(seance({ date: ajouterJours(debut, i), type: 'footing', km, duree_min: 30 }));
  });
  return agregerJours(seances, debut, ajouterJours(debut, kms.length - 1));
}

// 31 jours à partir du 19 septembre 2026 : le 18 octobre est le 30ᵉ jour, le 19 octobre le 31ᵉ.
// Jours 1 à 22 : 10 km ; jour 23 : 45 km ; jours 24 à 29 : 0 km ; jour 30 : 35 km ; jour 31 : 0 km.
const KM_RATIO = [...Array(22).fill(10), 45, 0, 0, 0, 0, 0, 0, 35, 0];
const DEBUT_RATIO: DateCivile = '2026-09-19';

function parametresAvecEasyCap(): Parametres {
  const modifs: ModifDatee[] = [
    { id: 'easycap-initial', cle: 'easyCap', valeur: 140, dateEffet: '2026-01-01', enregistreLe: '2026-01-01T08:00:00Z' },
    { id: 'easycap-145', cle: 'easyCap', valeur: 145, dateEffet: '2026-10-14', enregistreLe: '2026-10-01T08:00:00Z' },
  ];
  return { ...parametresDefaut(), modifs };
}

describe('semaines : statut (03, 04, ADR 0007)', () => {
  it('J un lundi : la semaine précédente est terminée, et il n’y a pas de semaine en cours', () => {
    const resultat = semaines(jours([], '2026-10-05', '2026-10-18'), [], J_LUNDI, parametresDefaut());

    expect(resultat.map((s) => s.lundi)).toEqual(['2026-10-05', '2026-10-12']);
    expect(resultat.map((s) => s.statut)).toEqual(['terminee', 'terminee']);
  });

  it('J un mardi : la semaine du lundi courant est en cours', () => {
    const resultat = semaines(jours([], '2026-10-05', '2026-10-19'), [], J_MARDI, parametresDefaut());

    expect(resultat.map((s) => s.statut)).toEqual(['terminee', 'terminee', 'en-cours']);
    expect(resultat[2]?.lundi).toBe('2026-10-19');
  });
});

describe('semaines : volume, part de sous-seuil (04, Méthode NSA)', () => {
  // Semaine du 5 au 11 octobre :
  //  - lundi 5 : sous-seuil de 60 min (30 facile, 30 sous-seuil), 10 km ;
  //  - mercredi 7 : footing de 40 min facile, 6 km ;
  //  - vendredi 9 : sous-seuil de 20 min (sous-seuil), 4 km.
  // Minutes : facile 70, sous-seuil 50, total 120. Part de sous-seuil : 50 ÷ 120 = 5/12.
  const seances = [
    seance({ date: '2026-10-05', type: 'sous-seuil', km: 10, duree_min: 60, minutes: { easy: 30, subt: 30 } }),
    seance({ date: '2026-10-07', type: 'footing', km: 6, duree_min: 40, minutes: { easy: 40 } }),
    seance({ date: '2026-10-09', type: 'sous-seuil', km: 4, duree_min: 20, minutes: { easy: 0, subt: 20 } }),
  ];

  it('additionne km, durée et minutes par intensité de la semaine', () => {
    const [premiere] = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresDefaut());

    expect(premiere?.km).toBeCloseTo(20, 10);
    expect(premiere?.min).toBe(120);
    expect(premiere?.minutes).toEqual({ easy: 70, mp: 0, subt: 50, hard: 0 });
  });

  it('calcule la part de sous-seuil et compte les séances sous-seuil', () => {
    const resultat = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresDefaut());

    expect(resultat[0]?.partSS).toBeCloseTo(5 / 12, 10);
    expect(resultat[0]?.nbSS).toBe(2);
  });

  it('rend une part de sous-seuil nulle, sans minutes, pour une semaine de repos', () => {
    const resultat = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresDefaut());

    expect(resultat[1]?.partSS).toBeNull();
    expect(resultat[1]?.nbSS).toBe(0);
  });
});

describe('semaines : monotonie et contrainte (04, Monotonie et contrainte)', () => {
  it('calcule la monotonie sur les 7 jours d’une semaine terminée, écart-type de population', () => {
    // Charges du lundi au dimanche : 0, 0, 0, 0, 0, 0, 70. Moyenne 10.
    // Écart-type = √((6 × 10² + 60²) ÷ 7) = √600 = 10√6. Monotonie = 10 ÷ (10√6) = 1/√6.
    // Contrainte = 70 × 1/√6 = 70/√6.
    const seances = [charge('2026-10-11', 70)];
    const [premiere] = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresDefaut());

    expect(premiere?.charge).toBe(70);
    expect(premiere?.monotonie).toBeCloseTo(1 / Math.sqrt(6), 10);
    expect(premiere?.contrainte).toBeCloseTo(70 / Math.sqrt(6), 9);
  });

  it('rend monotonie et contrainte nulles quand l’écart-type est nul (semaine sans charge)', () => {
    const resultat = semaines(jours([charge('2026-10-11', 70)], '2026-10-05', '2026-10-18'), [charge('2026-10-11', 70)], J_LUNDI, parametresDefaut());

    expect(resultat[1]?.monotonie).toBeNull();
    expect(resultat[1]?.contrainte).toBeNull();
  });

  it('semaine en cours : monotonie sur les 7 jours glissants J−7 à J−1, charge sur les jours écoulés de la semaine', () => {
    // J = 22 octobre : fenêtre du 15 au 21 octobre, charges nulles sauf le 21 (70).
    // Monotonie = 1/√6, comme ci-dessus. La semaine du 19 n'a que trois jours écoulés, chargés de 70 au total :
    // contrainte = 70/√6. (Sur les seuls jours écoulés, la monotonie vaudrait 1/√2.)
    const seances = [charge('2026-10-21', 70)];
    const courante = semaines(jours(seances, '2026-10-15', '2026-10-21'), seances, J_JEUDI, parametresDefaut()).at(-1);

    expect(courante?.statut).toBe('en-cours');
    expect(courante?.lundi).toBe('2026-10-19');
    expect(courante?.charge).toBe(70);
    expect(courante?.monotonie).toBeCloseTo(1 / Math.sqrt(6), 10);
    expect(courante?.contrainte).toBeCloseTo(70 / Math.sqrt(6), 9);
  });

  it('semaine en cours : monotonie nulle si l’un des 7 jours glissants manque à l’historique', () => {
    // Historique du 16 au 21 octobre : le 15 (J−7) n'est pas dans la série.
    const seances = [charge('2026-10-21', 70)];
    const courante = semaines(jours(seances, '2026-10-16', '2026-10-21'), seances, J_JEUDI, parametresDefaut()).at(-1);

    expect(courante?.statut).toBe('en-cours');
    expect(courante?.monotonie).toBeNull();
    expect(courante?.contrainte).toBeNull();
  });

  it('semaine en cours : monotonie nulle avec moins de 7 jours d’historique, la charge restant calculée', () => {
    // J = 20 octobre : fenêtre du 13 au 19 octobre. Seul le 19 est dans l'historique.
    const seances = [charge('2026-10-19', 70)];
    const courante = semaines(jours(seances, '2026-10-19', '2026-10-19'), seances, J_MARDI, parametresDefaut()).at(-1);

    expect(courante?.statut).toBe('en-cours');
    expect(courante?.charge).toBe(70);
    expect(courante?.monotonie).toBeNull();
  });

  it('première semaine partielle : monotonie et contrainte nulles, même si la semaine est terminée', () => {
    // Historique du mercredi 14 au dimanche 25 octobre. La semaine du 12 n'a que 5 jours : elle est terminée,
    // mais ses 7 jours ne sont pas tous dans l'historique. La semaine du 19 est complète : 1/√6 (70 le 19 seul).
    const seances = [charge('2026-10-14', 10), charge('2026-10-16', 20), charge('2026-10-19', 70)];
    const resultat = semaines(jours(seances, '2026-10-14', '2026-10-25'), seances, '2026-10-26', parametresDefaut());

    expect(resultat[0]).toMatchObject({ statut: 'terminee', monotonie: null, contrainte: null });
    expect(resultat[1]?.monotonie).toBeCloseTo(1 / Math.sqrt(6), 10);
  });

  it('une série qui commence un dimanche : la semaine du lundi précédent n’a que ce dimanche, sans monotonie', () => {
    // Historique du dimanche 18 octobre au 25. La semaine du 12 ne compte que le 18 (9 km, charge 45).
    const seances = [seance({ date: '2026-10-18', type: 'footing', km: 9, duree_min: 45 })];
    const resultat = semaines(jours(seances, '2026-10-18', '2026-10-25'), seances, '2026-10-26', parametresDefaut());

    expect(resultat.map((s) => s.lundi)).toEqual(['2026-10-12', '2026-10-19']);
    expect(resultat[0]).toMatchObject({ statut: 'terminee', km: 9, charge: 45, monotonie: null, ratioDimanche: null });
  });
});

describe('semaines : conformité des footings (D-006, 04)', () => {
  // easyCap vaut 140 jusqu’au 13 octobre, puis 145 à partir du 14 (paramètre daté, D-006).
  // Footings de la semaine du 12 au 18 :
  //  - lundi 12 : 138 bpm, conforme ;
  //  - mardi 13 : 142 bpm, non conforme (140) ;
  //  - mercredi 14 : 142 bpm, conforme (145) ;
  //  - jeudi 15 : 146 bpm, non conforme ;
  //  - vendredi 16 (footing lignes droites) : 144 bpm, conforme (145).
  // Sous-seuil du samedi 17 à 150 bpm : ce n'est pas un footing, il est ignoré.
  // Part des footings conformes : 3 ÷ 5 = 0,6.
  const seances = [
    seance({ date: '2026-10-12', type: 'footing', fcMoy: 138 }),
    seance({ date: '2026-10-13', type: 'footing', fcMoy: 142 }),
    seance({ date: '2026-10-14', type: 'footing', fcMoy: 142 }),
    seance({ date: '2026-10-15', type: 'footing', fcMoy: 146 }),
    seance({ date: '2026-10-16', type: 'footing-lignes-droites', fcMoy: 144 }),
    seance({ date: '2026-10-17', type: 'sous-seuil', fcMoy: 150 }),
  ];

  it('prend pour chaque footing le plafond en vigueur à sa date', () => {
    const resultat = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresAvecEasyCap());

    expect(resultat[1]?.conformiteFootings).toBeCloseTo(0.6, 10);
  });

  it('compte les footings de la semaine et ceux qui sont conformes, à côté de la part', () => {
    const resultat = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresAvecEasyCap());

    expect(resultat[1]).toMatchObject({ nbFootings: 5, nbFootingsConformes: 3 });
    expect(resultat[0]).toMatchObject({ nbFootings: 0, nbFootingsConformes: 0 });
  });

  it('rend une conformité nulle pour une semaine sans footing', () => {
    const resultat = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresAvecEasyCap());

    expect(resultat[0]?.conformiteFootings).toBeNull();
  });
});

describe('semaines : ratio du dimanche (03, 04)', () => {
  const historique = KM_RATIO.slice(0, 30);

  it('reprend le ratio du dimanche d’une semaine terminée', () => {
    // Le 18 octobre (30ᵉ jour) : r = 0,5, comme dans series-ratio.
    const seances: Seance[] = [];
    const jourRatio = kmParJour(historique, DEBUT_RATIO);
    const resultat = semaines(jourRatio, seances, J_LUNDI, parametresDefaut());

    expect(resultat.at(-1)?.lundi).toBe('2026-10-12');
    expect(resultat.at(-1)?.ratioDimanche).toBeCloseTo(0.5, 10);
  });

  it('rend le ratio indéfini pour une semaine dont le dimanche est avant le 30ᵉ jour', () => {
    const resultat = semaines(kmParJour(historique, DEBUT_RATIO), [], J_LUNDI, parametresDefaut());

    expect(resultat[0]?.ratioDimanche).toBeNull();
  });

  it('reprend pour la semaine en cours le ratio de J−1', () => {
    // J = 20 octobre : J−1 = 19 octobre (31ᵉ jour). s7 = 35 ; Σ(2…31) = 290 ; chronic = 290 × 7 ÷ 30 ; r = 105/203.
    const resultat = semaines(kmParJour(KM_RATIO, DEBUT_RATIO), [], J_MARDI, parametresDefaut());

    expect(resultat.at(-1)?.statut).toBe('en-cours');
    expect(resultat.at(-1)?.ratioDimanche).toBeCloseTo(105 / 203, 10);
  });
});

describe('semaines : statut quand J tombe un dimanche (ADR 0007)', () => {
  it('J un dimanche : la semaine de J est en cours, son dimanche n’étant pas encore fini', () => {
    const resultat = semaines(jours([], '2026-10-05', '2026-10-24'), [], '2026-10-25', parametresDefaut());

    expect(resultat.map((s) => s.lundi)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(resultat.map((s) => s.statut)).toEqual(['terminee', 'terminee', 'en-cours']);
  });

  it('J − 1 un dimanche : la semaine qui finit ce dimanche est terminée', () => {
    const resultat = semaines(jours([], '2026-10-05', '2026-10-25'), [], '2026-10-26', parametresDefaut());

    expect(resultat.map((s) => s.statut)).toEqual(['terminee', 'terminee', 'terminee']);
    expect(resultat.at(-1)?.lundi).toBe('2026-10-19');
  });
});

describe('semaines : conformité des footings aux bornes du plafond (D-006, 04)', () => {
  // Plafond par défaut : easyCap 140. Une FC moyenne égale au plafond est conforme.
  it('un footing dont la FC moyenne égale le plafond est conforme', () => {
    const seances = [seance({ date: '2026-10-12', type: 'footing', fcMoy: 140 })];
    const resultat = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresDefaut());

    expect(resultat[1]?.conformiteFootings).toBe(1);
  });

  it('un footing dont la FC moyenne dépasse le plafond de 1 bpm n’est pas conforme', () => {
    const seances = [seance({ date: '2026-10-12', type: 'footing', fcMoy: 141 })];
    const resultat = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresDefaut());

    expect(resultat[1]?.conformiteFootings).toBe(0);
  });

  it('un footing sans FC moyenne n’est pas conforme, mais il reste au dénominateur', () => {
    // Un footing conforme (140) et un footing sans FC (null) : 1 ÷ 2 = 0,5.
    const seances = [
      seance({ date: '2026-10-12', type: 'footing', fcMoy: 140 }),
      seance({ date: '2026-10-13', type: 'footing', fcMoy: null }),
    ];
    const resultat = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresDefaut());

    expect(resultat[1]?.conformiteFootings).toBeCloseTo(0.5, 10);
  });
});

describe('semaines : part de sous-seuil sur les minutes totales (04, Méthode NSA)', () => {
  it('le dénominateur est la somme des minutes par intensité, mp et hard compris, et non la durée', () => {
    // Durées 50 et 60 min, mais minutes classées : 10 + 20 + 0 + 10 = 40 (séance 1) et 20 + 40 = 60 (séance 2).
    // Par intensité : easy 30, mp 20, subt 40, hard 10 ; total 100. Part = 40 ÷ 100 = 0,4 (et non 40 ÷ 110).
    const seances = [
      seance({ date: '2026-10-05', type: 'footing', km: 8, duree_min: 50, minutes: { easy: 10, mp: 20, subt: 0, hard: 10 } }),
      seance({ date: '2026-10-07', type: 'footing', km: 10, duree_min: 60, minutes: { easy: 20, mp: 0, subt: 40, hard: 0 } }),
    ];
    const resultat = semaines(jours(seances, '2026-10-05', '2026-10-18'), seances, J_LUNDI, parametresDefaut());

    expect(resultat[0]?.minutes).toEqual({ easy: 30, mp: 20, subt: 40, hard: 10 });
    expect(resultat[0]?.partSS).toBeCloseTo(0.4, 10);
  });
});
