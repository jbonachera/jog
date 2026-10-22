import { describe, expect, it } from 'vitest';
import {
  DELAI_APRES_SEGMENT_MP_S,
  DELAI_MAX_FC_S,
  DEMI_FENETRE_ACCELERATION_S,
  DEMI_FENETRE_VITESSE_S,
  DISTANCES_STANDARD_KM,
  DUREE_MAX_ACCELERATION_S,
  DUREE_MIN_ACCELERATION_S,
  DUREE_MIN_CANDIDAT_DECOUPLAGE_MIN,
  DUREE_MIN_RETENUE_DECOUPLAGE_S,
  DUREE_REPETITION_MIN_S,
  DUREE_SEGMENT_MP_MIN_S,
  DUREE_SORTIE_LONGUE_MIN,
  FACTEUR_ACCELERATION,
  FACTEUR_SORTIE_LONGUE_SEMAINE,
  FENETRE_FC_LISSEE_S,
  FENETRE_LIGNES_DROITES_S,
  FORMAT_SEANCE,
  FORMAT_VUE,
  FOURCHETTE,
  MARGE_ALLURE_RAPIDE_S_KM,
  MARGE_FC_FIN_SOUS_SEUIL,
  MINIMUMS,
  MOTIFS,
  NOMBRE_MIN_ACCELERATIONS,
  PAS_MAX_S,
  PAS_SIMULATEUR_KM,
  POIDS_CHARGE,
  PRECISION,
  RECUPERATION_MAX_S,
  SEUILS,
  SIMULATEUR,
  TOLERANCE_FORMAT_REPETITIONS,
  TROU_FUSIONNABLE_S,
} from '../../src/core/constantes';

// Gel : chaque constante doit rester égale à la valeur publiée dans la spécification.
// Changer une valeur exige une décision D-0xx et une nouvelle REGLES_VERSION (D-008).
describe('seuils du verdict gelés (05, « Seuils du verdict », D-008)', () => {
  it('progressivité : bande OK de 0,8 à 1,3, alerte au-delà de 1,5', () => {
    expect(SEUILS.progressivite).toEqual({ okMin: 0.8, okMax: 1.3, alerteApres: 1.5 });
  });

  it('fraîcheur : alerte sous −25, à surveiller au-delà de +5', () => {
    expect(SEUILS.fraicheur).toEqual({ alerteSous: -25, surveillerApres: 5 });
  });

  it('réponse à l\'effort : à surveiller au-delà de +1, alerte au-delà de +3 s/km', () => {
    expect(SEUILS.reponseEffort).toEqual({ surveillerApres: 1, alerteApres: 3 });
  });

  it('hors sous-seuil : à surveiller dès 1 répétition, alerte dès 3', () => {
    expect(SEUILS.horsSousSeuil).toEqual({ surveillerDes: 1, alerteDes: 3 });
  });

  it('footings : à surveiller sous 90 %, alerte sous 75 %', () => {
    expect(SEUILS.footings).toEqual({ surveillerSous: 90, alerteSous: 75 });
  });

  it('découplage : à surveiller au-delà de 5 %, alerte au-delà de 8 %', () => {
    expect(SEUILS.decouplage).toEqual({ surveillerApres: 5, alerteApres: 8 });
  });

  it('palier : tolérance de ±10 %, durée OK de 2 semaines', () => {
    expect(SEUILS.palier).toEqual({ tolerance: 10, semainesOk: 2 });
  });

  it('fourchette : Augmenter ×1,05–1,10, Maintenir ×0,95–1,05, Alléger ×0,75–0,90', () => {
    expect(FOURCHETTE).toEqual({
      augmenter: { min: 1.05, max: 1.1 },
      maintenir: { min: 0.95, max: 1.05 },
      alleger: { min: 0.75, max: 0.9 },
    });
  });

  it('simulateur : curseur de ×0,5 à ×1,6, au pas de 1 km', () => {
    expect(SIMULATEUR).toEqual({ coefMin: 0.5, coefMax: 1.6 });
    expect(PAS_SIMULATEUR_KM).toBe(1);
  });
});

describe('précisions d\'arrondi gelées (D-015, 05)', () => {
  it('ratio 0,01 ; fraîcheur 1 ; réponse à l\'effort 1 s/km ; hors sous-seuil et palier entiers', () => {
    expect(PRECISION.progressivite).toBe(0.01);
    expect(PRECISION.fraicheur).toBe(1);
    expect(PRECISION.reponseEffort).toBe(1);
    expect(PRECISION.horsSousSeuil).toBe(1);
    expect(PRECISION.palier).toBe(1);
  });

  it('footings 1 % ; découplage 0,1 % ; écart du palier 0,1 point de %', () => {
    expect(PRECISION.footings).toBe(1);
    expect(PRECISION.decouplage).toBe(0.1);
    expect(PRECISION.ecartPalier).toBe(0.1);
  });
});

describe('poids de charge gelés (04, « Charge de séance »)', () => {
  it('easy 1 · mp 1,7 · subt 2,3 · hard 3,6', () => {
    expect(POIDS_CHARGE).toEqual({ easy: 1, mp: 1.7, subt: 2.3, hard: 3.6 });
  });
});

describe('minimums de données gelés (D-007, 05 « Données insuffisantes »)', () => {
  it('chaque signal a le minimum de D-007', () => {
    expect(MINIMUMS).toEqual({
      progressiviteJours: 30,
      fraicheurJours: 28,
      reponseSeancesSousSeuil: 9,
      reponseSeancesRecentes: 3,
      reponseFenetreJours: 21,
      horsSousSeuilSeances: 3,
      horsSousSeuilFenetreJours: 21,
      footingsNombre: 3,
      footingsFenetreJours: 14,
      decouplageSorties: 1,
      decouplageFenetreJours: 14,
      palierSemaines: 2,
    });
  });
});

describe('délai de prolongement de la FC gelé (D-013)', () => {
  it('une mesure de FC se prolonge au plus 10 s', () => {
    expect(DELAI_MAX_FC_S).toBe(10);
  });
});

// Comportement des motifs de D-014, sur les noms qu'exporte la plateforme.
describe('motifs de reconnaissance des courses et des tests (D-014)', () => {
  it('« Semi De Porto Vecchio » est une course', () => {
    const nom = 'Semi De Porto Vecchio';
    expect(MOTIFS.course.test(nom)).toBe(true);
    expect(MOTIFS.test.test(nom)).toBe(false);
  });

  it('« Paris / Pantin • 11km endurance » ne correspond ni à une course ni à un test', () => {
    const nom = 'Paris / Pantin • 11km endurance';
    expect(MOTIFS.course.test(nom)).toBe(false);
    expect(MOTIFS.test.test(nom)).toBe(false);
  });

  it('« Course à pied le midi » est un nom par défaut de la plateforme, qui ne décide pas seul', () => {
    const nom = 'Course à pied le midi';
    expect(MOTIFS.nomsParDefautStravaFr.test(nom)).toBe(true);
    expect(MOTIFS.test.test(nom)).toBe(false);
  });

  it('« Test 5 km » est un test', () => {
    expect(MOTIFS.test.test('Test 5 km')).toBe(true);
  });
});

// Constantes de l'étape ②a (src/core/seance/) : gelées ici, avec leur valeur publiée (lots.md, 1.4 et 2.3).
// Changer l'une de ces valeurs impose d'augmenter `REGLES_VERSION`, sans quoi les séances mémorisées resteraient valides à tort.
describe('constantes de ②a gelées (changer une valeur impose d\'augmenter REGLES_VERSION)', () => {
  it('séance : segment à allure marathon de 10 min, FC de fin à subtHrLo − 5, marge d\'allure rapide de 40 s/km, format à ±15 %', () => {
    expect(DUREE_SEGMENT_MP_MIN_S).toBe(600);
    expect(MARGE_FC_FIN_SOUS_SEUIL).toBe(5);
    expect(MARGE_ALLURE_RAPIDE_S_KM).toBe(40);
    expect(TOLERANCE_FORMAT_REPETITIONS).toBe(0.15);
  });

  it('répétitions : tour de travail d\'au moins 2 min, récupération d\'au plus 2 min, trou fusionnable de 10 s', () => {
    expect(DUREE_REPETITION_MIN_S).toBe(120);
    expect(RECUPERATION_MAX_S).toBe(120);
    expect(TROU_FUSIONNABLE_S).toBe(10);
    expect(DEMI_FENETRE_VITESSE_S).toBe(5);
  });

  it('FC : prolongement de 10 s, lissage sur 30 s, pas maximal de 10 s', () => {
    expect(FENETRE_FC_LISSEE_S).toBe(30);
    expect(PAS_MAX_S).toBe(10);
    expect(DELAI_MAX_FC_S).toBe(10);
  });

  it('découplage : candidat dès 60 min, retenu dès 3 600 s, 300 s après chaque segment à allure marathon', () => {
    expect(DUREE_MIN_CANDIDAT_DECOUPLAGE_MIN).toBe(60);
    expect(DUREE_MIN_RETENUE_DECOUPLAGE_S).toBe(3600);
    expect(DELAI_APRES_SEGMENT_MP_S).toBe(300);
  });

  it('lignes droites : fenêtre de 900 s, accélération de 10 à 30 s, facteur 1,3, au moins 3 accélérations, lissage de 3 s', () => {
    expect(FENETRE_LIGNES_DROITES_S).toBe(900);
    expect(FACTEUR_ACCELERATION).toBe(1.3);
    expect(DUREE_MIN_ACCELERATION_S).toBe(10);
    expect(DUREE_MAX_ACCELERATION_S).toBe(30);
    expect(NOMBRE_MIN_ACCELERATIONS).toBe(3);
    expect(DEMI_FENETRE_ACCELERATION_S).toBe(1);
  });

  it('charge et intensité : poids (POIDS_CHARGE) et segment à allure marathon de 10 min (DUREE_SEGMENT_MP_MIN_S)', () => {
    expect(POIDS_CHARGE).toEqual({ easy: 1, mp: 1.7, subt: 2.3, hard: 3.6 });
    expect(DUREE_SEGMENT_MP_MIN_S).toBe(600);
  });

  it('distances standard : 5 km, 10 km, semi et marathon', () => {
    expect(DISTANCES_STANDARD_KM).toEqual([5, 10, 21.0975, 42.195]);
  });

  it('sortie longue : durée de 90 min, ou 1,5 fois la durée moyenne de la semaine', () => {
    expect(DUREE_SORTIE_LONGUE_MIN).toBe(90);
    expect(FACTEUR_SORTIE_LONGUE_SEMAINE).toBe(1.5);
  });

  it('marquage : les motifs de D-014 (courses, tests, noms par défaut) sont figés', () => {
    expect(MOTIFS.course).toEqual(/(semi|marathon|\d+ ?k\b|10 ?000|corrida|cross|trail|course)/i);
    expect(MOTIFS.test).toEqual(/\b(test|tt|chrono)\b/i);
    expect(MOTIFS.nomsParDefautStravaFr).toEqual(/^Course à pied (le matin|le midi|dans l'après-midi|en soirée|de nuit)$/);
  });
});

describe('formats mémorisés (ADR 0006, 0009)', () => {
  it('format de la séance mémorisée : 1, dans la clé de mémorisation', () => {
    expect(FORMAT_SEANCE).toBe(1);
  });

  it('format de la Vue : 4, depuis l\'ajout des modifications et de la suggestion paceHrK à parametresEnVigueur ; partagé par le calcul et le Worker', () => {
    expect(FORMAT_VUE).toBe(4);
  });
});
