// Messages et libellés de l'onglet Paramètres (06, « Validation » ; 08, « Rédaction »). Décision de l'orchestrateur :
// l'apostrophe est typographique (’) partout, jamais l'apostrophe droite (').
import { describe, expect, it } from 'vitest';
import { GROUPES, tousLesChamps } from '../../src/ui/composants/parametres-champs';
import {
  MESSAGE_ENREGISTRE,
  MESSAGE_MODIFICATION_SUPPRIMEE,
  MESSAGE_RECALCUL,
  MESSAGE_SAUVEGARDE_IMPORTEE,
  MESSAGE_SAUVEGARDE_TELECHARGEE,
  QUESTION_IMPORT_SAUVEGARDE,
  RAISON_SANS_SUGGESTION,
} from '../../src/ui/composants/parametres';
import { MESSAGE_ALLURE, MESSAGE_DATE_INVALIDE } from '../../src/ui/composants/parametres-proposition';
import {
  LIBELLES,
  MESSAGE_BORNES,
  MESSAGE_ENREGISTREMENT,
  MESSAGE_FORMAT_ALLURE,
  MESSAGE_FORMAT_DATE,
  MESSAGE_FUTUR,
  MESSAGE_ID_ABSENT,
  MESSAGE_PACE_HR_K,
} from '../../src/core/validationParametres';
import { MESSAGE_STOCKAGE_BLOQUE } from '../../src/worker/traitement';

/** Tous les messages exportés par l'onglet, la validation et le Worker, avec le nom qui les désigne. */
function tousLesMessages(): [string, string][] {
  const constantes: [string, string][] = [
    ['MESSAGE_ENREGISTRE', MESSAGE_ENREGISTRE],
    ['MESSAGE_RECALCUL', MESSAGE_RECALCUL],
    ['MESSAGE_MODIFICATION_SUPPRIMEE', MESSAGE_MODIFICATION_SUPPRIMEE],
    ['MESSAGE_SAUVEGARDE_IMPORTEE', MESSAGE_SAUVEGARDE_IMPORTEE],
    ['MESSAGE_SAUVEGARDE_TELECHARGEE', MESSAGE_SAUVEGARDE_TELECHARGEE],
    ['QUESTION_IMPORT_SAUVEGARDE', QUESTION_IMPORT_SAUVEGARDE],
    ['RAISON_SANS_SUGGESTION', RAISON_SANS_SUGGESTION],
    ['MESSAGE_ALLURE', MESSAGE_ALLURE],
    ['MESSAGE_DATE_INVALIDE', MESSAGE_DATE_INVALIDE],
    ['MESSAGE_FUTUR', MESSAGE_FUTUR],
    ['MESSAGE_FORMAT_DATE', MESSAGE_FORMAT_DATE],
    ['MESSAGE_FORMAT_ALLURE', MESSAGE_FORMAT_ALLURE],
    ['MESSAGE_PACE_HR_K', MESSAGE_PACE_HR_K],
    ['MESSAGE_BORNES', MESSAGE_BORNES],
    ['MESSAGE_ENREGISTREMENT', MESSAGE_ENREGISTREMENT],
    ['MESSAGE_ID_ABSENT', MESSAGE_ID_ABSENT],
    ['MESSAGE_STOCKAGE_BLOQUE', MESSAGE_STOCKAGE_BLOQUE],
  ];
  // Les messages de la règle 1 se construisent avec le libellé de chaque paramètre (06, « Champs »).
  const libelles = Object.entries(LIBELLES).map(([cle, libelle]): [string, string] => [`LIBELLES.${cle}`, libelle]);
  const regle1 = Object.values(LIBELLES).map((libelle): [string, string] => [`règle 1 · ${libelle}`, `Valeur manquante ou invalide : ${libelle}.`]);
  // Libellés, unités, aides et titres du formulaire (06, « Champs »).
  const formulaire = tousLesChamps().flatMap((champ): [string, string][] => [
    [`champ ${champ.cle} · libellé`, champ.libelle],
    [`champ ${champ.cle} · unité`, champ.unite],
    ...(champ.aide === undefined ? [] : [[`champ ${champ.cle} · aide`, champ.aide] as [string, string]]),
  ]);
  const groupes = GROUPES.flatMap((groupe): [string, string][] => [
    [`groupe « ${groupe.titre} » · titre`, groupe.titre],
    [`groupe « ${groupe.titre} » · aide`, groupe.aide],
  ]);
  return [...constantes, ...libelles, ...regle1, ...formulaire, ...groupes];
}

describe('messages de l’onglet Paramètres (06, 08)', () => {
  it('aucun message ni libellé exporté ne contient d’apostrophe droite, seulement l’apostrophe typographique', () => {
    const messages = tousLesMessages();
    expect(messages.length).toBeGreaterThan(50);

    const fautifs = messages.filter(([, texte]) => texte.includes("'")).map(([nom]) => nom);
    expect(fautifs).toEqual([]);
  });
});
