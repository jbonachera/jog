// Oracle TypeScript de la migration iOS (docs/implementation/migration-ios.md, lot 0.1).
//
// Le moteur TypeScript de src/core sert d'oracle : ce script écrit des « cas dorés » en JSON dans
// ios/JogCore/Tests/Oracle/. Le moteur Swift (paquet ios/JogCore) doit les reproduire champ pour champ, avec une
// tolérance de 1e-9 sur les nombres.
//
// Lancement : `npm run oracle` (fuseau America/Los_Angeles imposé, comme vitest.config.ts : un calcul qui dépendrait
// du fuseau local donnerait un autre résultat). Deux exécutions donnent des fichiers identiques octet pour octet.
// Le script réutilise les constructeurs de tests/fixtures (construire, maquette, decision, progression, vues) et
// les générateurs de scripts/oracle/ (historiques synthétiques déterministes). Aucune donnée personnelle.
//
// ── Format ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Un fichier par module : {"module": "...", "cas": [ {"nom", "fn", "entree", "sortie" | "erreur"}, ... ]}, un cas par
// ligne. `nom` est une phrase française qui décrit le comportement et reste unique dans le fichier. `fn` est le nom de
// la fonction exportée de src/core (ou celle de l'aide indiquée ci-dessous). `entree` est le tableau des arguments
// positionnels, ou un objet unique quand le TypeScript en prend un. `sortie` est le résultat. Si la fonction doit lever
// une erreur, le cas porte `erreur` (le message) à la place de `sortie` : Swift doit signaler une erreur ; le texte du
// message est donné à titre indicatif, sauf pour les messages de validation, qui sont des valeurs de sortie.
//
// ── Sérialisation ───────────────────────────────────────────────────────────────────────────────────────────────
// - Float32Array et Float64Array : tableau de nombres (les valeurs float32 sont converties en double ; en Swift,
//   lire en Double puis convertir en Float pour retrouver exactement le flux d'origine).
// - NaN : null. Infinity et -Infinity : les chaînes "Infinity" et "-Infinity". -0 : 0.
//   Un null à la place d'un nombre dont le type n'est pas optionnel est donc un NaN (par exemple
//   Repetition.allure_skm quand la séance n'a pas de distance). Aucun champ typé « nombre ou null » ne porte de NaN
//   dans les cas : pour ces champs, null signifie bien « absent ».
// - undefined : la clé est absente de l'objet (null dans un tableau). Exemple : Tour.intensite, absente quand non
//   précisée. Les champs `T | null` du TypeScript sont toujours présents, avec la valeur null.
// - Map : objet. Set : tableau. Les Date sont interdites (les dates sont des chaînes « AAAA-MM-JJ », les instants des
//   millisecondes depuis l'époque ou des chaînes ISO 8601 terminées par Z).
// - Les clés des objets suivent l'ordre de construction du TypeScript : seule la valeur compte, pas l'ordre des clés.
//   L'ordre des tableaux, lui, est significatif (il est déterministe).
//
// ── Entrées qui diffèrent de la signature TypeScript ────────────────────────────────────────────────────────────
// - decider : `entree` est l'objet EntreesDecision, dont `paramsAuJour` (une fonction) est remplacé par `parametres`
//   (type Parametres) ; la fonction est parametresAuJour(parametres, date).
// - comparer et derniereSeanceSousSeuil : l'argument `paramsAuJour` est remplacé de même par un Parametres.
// - indexerParametres : entree [parametres, dates], sortie [{date, jeu}] avec jeu = index.auJour(date).
// - seance-miseEnForme / moyenneGlissante : les Float64Array sont donnés en tableaux de nombres.
// - contient : entree [periodeBornee, date], où periodeBornee est la sortie de borner.
// - PRECISIONS : entree [], sortie = la table des précisions.
// - calculerVue, calculerVueBrute : entree = EntreeVue { intrinseques, parametres, J, derniereSynchro }.
// - verdictDe(signaux, manqueProgressivite), fourchetteDe(verdict, {semaines, palier}, chronic) : chronic absent = null.
// - Les Vues passées aux fonctions de progression et de sélecteurs sont des Vues réelles de calculerVue dont les
//   colonnes inutiles au calcul testé sont vidées (seances, jours, serieCharge, ratio, semaines ou compteurs à []).
//
// ── Séances brutes ──────────────────────────────────────────────────────────────────────────────────────────────
// seance-miseEnForme et seance-intrinseque prennent des ActivitePivot complets (flux en colonnes, tours). Une dizaine
// de séances brutes couvrent le détail ; la couverture fine passe par les séances intrinsèques (classement, séries,
// décision, Vue). Sont exclus : tout ce qui est asynchrone ou SHA-256 (clesSeances, empreinteEntrees,
// seancesIntrinseques) : la mémorisation est redéfinie en Swift.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { genererArrondi, genererDates, genererFormat, genererJours, genererParametres, genererRiegel, genererValidation } from './oracle/base';
import { genererDecision } from './oracle/decision';
import { genererSelecteurs, genererProgression, genererSuggestionHrMax } from './oracle/progression';
import type { Recueil } from './oracle/recueil';
import { genererClassement, genererIntrinseque, genererMarquage, genererMiseEnForme } from './oracle/seance';
import { genererSeries } from './oracle/series';
import { genererVue } from './oracle/vue';

const FUSEAU = 'America/Los_Angeles';
const RACINE = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOSSIER = resolve(RACINE, 'ios/JogCore/Tests/Oracle');

/** Les recueils, dans l'ordre des fichiers. */
function recueils(): Recueil[] {
  return [
    genererDates(), genererArrondi(), genererFormat(), genererParametres(), genererValidation(), genererRiegel(), genererJours(),
    genererMiseEnForme(), genererIntrinseque(), genererMarquage(), genererClassement(), genererSeries(), genererDecision(),
    genererProgression(), genererSelecteurs(), genererSuggestionHrMax(), genererVue(),
  ];
}

function lisezMoi(liste: readonly Recueil[]): string {
  const fichiers = liste.map((r) => `${r.module} (${r.cas.length})`).join(', ');
  return [
    '# Cas dorés de l’oracle TypeScript',
    'Fichiers générés par `npm run oracle` (scripts/oracle.ts) à partir de src/core ; ne pas les modifier à la main. Conventions complètes : en-tête de scripts/oracle.ts.',
    'Format : {"module": "...", "cas": [{"nom", "fn", "entree", "sortie" | "erreur"}]}, un cas par ligne. `entree` : arguments (tableau) ou objet unique ; `erreur` : message d’une erreur attendue.',
    'Sérialisation : Float32Array en tableau de doubles (float32 converties) ; NaN en null ; ±Infinity en "Infinity" / "-Infinity" ; undefined = clé absente ; Map en objet ; aucune Date.',
    'Un null à la place d’un nombre non optionnel est un NaN. Les champs `T | null` sont toujours présents (null), jamais absents ; seuls les champs optionnels (Tour.intensite) sont absents.',
    'Comparaison : tolérance de 1e-9 sur les nombres, égalité exacte du reste (textes, booléens, ordre des tableaux). Les textes de format utilisent l’espace insécable U+00A0 et le moins U+2212.',
    'Entrées adaptées : decider, comparer et derniereSeanceSousSeuil reçoivent `parametres` (type Parametres) à la place de la fonction `paramsAuJour`.',
    'Régénération : `npm run oracle` (fuseau America/Los_Angeles) ; deux exécutions produisent des fichiers identiques octet pour octet.',
    'Le moteur Swift doit reproduire 100 % des cas ; la mémorisation (clés SHA-256) est hors oracle.',
    `Fichiers (nombre de cas) : ${fichiers}.`,
  ].join('\n') + '\n';
}

export async function principal(): Promise<number> {
  process.env.TZ = FUSEAU;
  if (new Date(2026, 0, 15, 12).getTimezoneOffset() !== 480) {
    throw new Error(`le fuseau doit être ${FUSEAU} : lancer l’oracle avec « npm run oracle »`);
  }

  const liste = recueils();
  await mkdir(DOSSIER, { recursive: true });
  const attendus = new Set(liste.map((r) => `${r.module}.json`));
  for (const existant of await readdir(DOSSIER)) {
    if (existant.endsWith('.json') && !attendus.has(existant)) await rm(resolve(DOSSIER, existant));
  }

  const empreinte = createHash('sha256');
  let total = 0;
  let nombreDeCas = 0;
  for (const r of liste) {
    const texte = r.versTexte();
    await writeFile(resolve(DOSSIER, `${r.module}.json`), texte);
    empreinte.update(`${r.module}.json\n${texte}`);
    total += Buffer.byteLength(texte);
    nombreDeCas += r.cas.length;
    console.log(`${r.module.padEnd(26)} ${String(r.cas.length).padStart(5)} cas ${String(Math.round(Buffer.byteLength(texte) / 1024)).padStart(7)} Kio`);
  }
  const lisez = lisezMoi(liste);
  await writeFile(resolve(DOSSIER, 'LISEZMOI.md'), lisez);
  empreinte.update(`LISEZMOI.md\n${lisez}`);
  console.log(`total : ${nombreDeCas} cas, ${(total / 1024 / 1024).toFixed(2)} Mio`);
  console.log(`empreinte : ${empreinte.digest('hex')}`);
  // Relecture : chaque fichier doit être un JSON valide.
  for (const r of liste) JSON.parse(await readFile(resolve(DOSSIER, `${r.module}.json`), 'utf8'));
  return 0;
}
