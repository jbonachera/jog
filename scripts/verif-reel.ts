// Rapport sur données réelles (tâche 6.1 ; ADR 0010, 0011, 0012 ; « À vérifier sur données réelles » de 09).
//
// Le script lit l'archive désignée par JOG_EXPORT, la passe dans le pipeline réel (lecteur d'archive, Worker
// `creerTraitement` sur fake-indexeddb, import, Vue), puis calcule une section par point de 09. Il n'écrit que dans
// tests/local/out/ (ignoré par git). Le rapport ne contient que des agrégats : comptes, moyennes, médianes,
// distributions, dates des courses détectées et formats de séance. Aucun nom d'activité, aucune coordonnée,
// aucun identifiant, aucun flux brut.
//
// Lancement : `JOG_EXPORT=/chemin/export.zip npm run verif:reel` (rapport.md). `npm run verif:reel:snapshot`
// écrit en plus la Vue complète, pour une comparaison locale entre deux versions des règles.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, dirname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { lireArchiveStrava } from '../src/adapters/strava-archive/lecteur';
import { arrondir } from '../src/core/arrondi';
import { calculerSeanceIntrinseque } from '../src/core/seance';
import { DEBUT_PIC_FC_S, FORMAT_VUE, PRECISION, REGLES_VERSION, SEUILS } from '../src/core/constantes';
import { ajouterJours, dateDepuisNumero, estDateCivile, numeroJour } from '../src/core/dates';
import { formatNombre, formatPourcentage, formatTempsCourse } from '../src/core/format';
import { niveauEstime, suggestionPaceHrK } from '../src/core/progression';
import { etatRatio, selectionProgressivite } from '../src/core/selecteurs';
import { indexerParametres, parametresDefaut } from '../src/core/parametres';
import { miseEnForme } from '../src/core/seance/miseEnForme';
import { detecterRepetitions, mediane } from '../src/core/seance/repetitions';
import { picRetenu, seancesExaminees } from '../src/core/suggestionHrMax';
import { validerParametres } from '../src/core/validationParametres';
import { calculerVueBrute, seancesIntrinseques } from '../src/core/vue';
import type { ActivitePivot, DateCivile, Flux, Parametres, Repetition, SeanceIntrinseque, SeanceVue, Signal, TypeSeance, Vue } from '../src/core/types';
import { ouvrirBase, ecrireParametres, lireParametres } from '../src/store';
import { CacheSeances } from '../src/worker/memoire';
import { calculerDepuisBase, creerTraitement, type CorpsRequete, type Reponse } from '../src/worker/traitement';
import { dateCivileAppareil, fuseauAppareil } from '../src/worker/horloge';
import { domaineAxe, PRESETS_AXES, type CleDePreset } from '../src/ui/graph/domaine';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_SORTIE = resolve(RACINE, 'tests/local/out');
const NOM_BASE = 'fjord-verif';

const MESSAGE_USAGE = [
  "JOG_EXPORT doit désigner l'archive Strava (export_*.zip). Exemple :",
  '  JOG_EXPORT=/chemin/vers/export.zip npm run verif:reel',
  'Variables facultatives : JOG_PARAMS (fichier JSON au format Parametres), JOG_J (AAAA-MM-JJ).',
].join('\n');

export interface OptionsVerif {
  /** Variables d'environnement. Par défaut : process.env. */
  env?: Record<string, string | undefined>;
  /** Dossier de sortie, à l'intérieur de tests/local/out/. Par défaut : tests/local/out/ lui-même. */
  sortie?: string;
  /** Horloge. Par défaut : l'heure réelle. */
  maintenant?: () => Date;
  /** Écrit aussi la Vue complète dans tests/local/out/vue-<REGLES_VERSION>.json. */
  snapshot?: boolean;
}

export interface ResultatVerif {
  J: DateCivile;
  cheminRapport: string;
  cheminSnapshot: string | null;
}

/** Point d'entrée appelé par scripts/lancer-ts.mjs. Le argument `--snapshot` active la Vue complète. */
export async function principal(argumentsScript: readonly string[]): Promise<number> {
  const resultat = await verifierReel({ snapshot: argumentsScript.includes('--snapshot') });
  console.log(`Rapport écrit : ${resultat.cheminRapport} (J = ${resultat.J})`);
  if (resultat.cheminSnapshot !== null) console.log(`Vue complète : ${resultat.cheminSnapshot}`);
  return 0;
}

// ── Entrées ──────────────────────────────────────────────────────────────────

function lireJ(valeur: string | undefined, maintenant: Date): DateCivile {
  if (valeur === undefined || valeur.trim() === '') return dateCivileAppareil(maintenant.getTime(), fuseauAppareil());
  const J = valeur.trim();
  if (!estDateCivile(J)) throw new Error(`JOG_J doit être une date AAAA-MM-JJ, reçu « ${J} ».`);
  return J;
}

interface EntreeParametres {
  parametres: Parametres;
  source: string;
}

async function lireParametresEntree(chemin: string | undefined, J: DateCivile): Promise<EntreeParametres> {
  if (chemin === undefined || chemin === '') {
    return { parametres: parametresDefaut(), source: 'valeurs par défaut (06)' };
  }
  const texte = await readFile(chemin, 'utf8');
  let objet: unknown;
  try {
    objet = JSON.parse(texte);
  } catch {
    throw new Error('JOG_PARAMS : le fichier n’est pas du JSON valide.');
  }
  const parametres = objet as Parametres;
  const verdict = validerParametres(parametres, J);
  if (!verdict.ok) throw new Error(`JOG_PARAMS invalide (${verdict.champ}) : ${verdict.message}`);
  return { parametres, source: `fichier JOG_PARAMS, ${parametres.modifs.length} modification(s) datée(s)` };
}

// ── Sorties : seul tests/local/out/ est accessible en écriture ──────────────

/** Un chemin reste dans tests/local/out/ (ou est ce dossier). Sinon, l'écriture est refusée. */
function estDansSortie(chemin: string): boolean {
  const relatif = relative(DOSSIER_SORTIE, chemin);
  return relatif === '' || (!relatif.startsWith('..') && !isAbsolute(relatif));
}

async function ecrireDansSortie(dossier: string, nom: string, contenu: string): Promise<string> {
  const cible = resolve(dossier, nom);
  if (!estDansSortie(cible) || cible === DOSSIER_SORTIE) {
    throw new Error(`écriture hors de tests/local/out refusée : ${nom}`);
  }
  await mkdir(dossier, { recursive: true });
  await writeFile(cible, contenu, 'utf8');
  return cible;
}

// ── Pipeline réel ────────────────────────────────────────────────────────────

/** Mesures prises pendant le passage dans le pipeline (durées en ms, et drapeaux). */
interface Mesures {
  tImport: number;
  archive: { pivots: number; ignorees: number; illisibles: number; manquants: number; octets: number };
  demarrageDepuisCache: boolean;
  tDemarrage: number;
  tPremierCalcul: number;
  tLt2Hr: number | null;
  messageLt2Hr: string | null;
  tRefHr: number | null;
  messageRefHr: string | null;
  tailleVueOctets: number;
}

function vueDe(reponses: Reponse[]): Vue {
  for (const r of reponses) {
    if (r.type === 'erreur' || r.type === 'echecRecalcul') throw new Error(`le pipeline a échoué : ${r.message}`);
  }
  const vues = reponses.filter((r): r is Extract<Reponse, { type: 'vue' }> => r.type === 'vue');
  const derniere = vues.at(-1);
  if (derniere === undefined) throw new Error('le pipeline n’a produit aucune Vue');
  return derniere.vue;
}

// ── Contexte d'analyse ───────────────────────────────────────────────────────

interface Contexte {
  J: DateCivile;
  vue: Vue;
  parametres: Parametres;
  pivots: ActivitePivot[];
  pivotParCle: Map<string, ActivitePivot>;
  intrinseques: SeanceIntrinseque[];
  intrinsequeParCle: Map<string, SeanceIntrinseque>;
  typeParCle: Map<string, TypeSeance>;
  verdicts: VerdictJour[];
}

interface VerdictJour {
  date: DateCivile;
  verdict: Vue['decision']['verdict'];
  cause: 'signal' | 'donnees' | 'autre' | null;
}

// ── Utilitaires de rendu ─────────────────────────────────────────────────────

const n = (valeur: number, decimales = 0): string => formatNombre(valeur, decimales);
const pct = (valeur: number, decimales = 1): string => formatPourcentage(valeur, decimales);
const moyenne = (valeurs: readonly number[]): number | null =>
  valeurs.length === 0 ? null : valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
const compter = <T extends string>(valeurs: readonly T[]): Map<T, number> => {
  const resultat = new Map<T, number>();
  for (const v of valeurs) resultat.set(v, (resultat.get(v) ?? 0) + 1);
  return resultat;
};
const tableau = (entetes: string[], lignes: string[][]): string[] => [
  `| ${entetes.join(' | ')} |`,
  `| ${entetes.map(() => '---').join(' | ')} |`,
  ...lignes.map((l) => `| ${l.join(' | ')} |`),
];
const mesure = (valeur: number | null, unite: string, decimales = 0): string =>
  valeur === null || !Number.isFinite(valeur) ? '–' : unite === '' ? n(valeur, decimales) : `${n(valeur, decimales)} ${unite}`;
const chevauchement = (a: number, b: number, c: number, d: number): number => Math.max(0, Math.min(b, d) - Math.max(a, c));
/** Le plus grand élément, sans étaler le tableau dans les arguments (un export réel peut compter des milliers de valeurs). */
const maximum = (valeurs: readonly number[]): number => valeurs.reduce((m, v) => Math.max(m, v), 0);

// ── Sections ─────────────────────────────────────────────────────────────────

function sectionClassification(c: Contexte): string[] {
  const seances = c.vue.seances;
  const ss = seances.filter((s) => s.type === 'sous-seuil');
  const lignesTypes = [...compter(seances.map((s) => s.type))].sort((a, b) => b[1] - a[1]);
  const formats = [...compter(ss.map((s) => s.format ?? 'sans format'))].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const avecManuels = c.pivots.filter((p) => p.tours.some((t) => t.declenchement === 'manuel'));
  const manuelsSansSS = avecManuels.filter((p) => {
    const type = c.typeParCle.get(p.cleSource);
    return type !== undefined && type !== 'sous-seuil';
  });
  const typesManuelsSansSS = [...compter(manuelsSansSS.map((p) => c.typeParCle.get(p.cleSource) ?? 'inconnu'))];

  let parTours = 0;
  let parFlux = 0;
  for (const s of ss) {
    const pivot = c.pivotParCle.get(s.cleSource);
    if (pivot === undefined) continue;
    const p = indexerParametres(c.parametres).auJour(pivot.dateLocale);
    const reps = detecterRepetitions(miseEnForme(pivot), pivot.tours, p);
    if (reps.repetitions.length > 0) parTours += 1;
    else parFlux += 1;
  }

  return [
    '## Classification et répétitions (07, D-001)',
    '',
    `Séances classées : ${n(seances.length)}. Séances sous-seuil : ${n(ss.length)}.`,
    '',
    ...tableau(['Type', 'Séances'], lignesTypes.map(([t, k]) => [t, n(k)])),
    '',
    '**Formats sous-seuil les plus fréquents** (10 au plus) :',
    '',
    ...tableau(['Format', 'Séances'], formats.map(([f, k]) => [f, n(k)])),
    '',
    `Séances avec au moins un tour manuel : ${n(avecManuels.length)}. Parmi elles, non classées sous-seuil : ${n(manuelsSansSS.length)}.`,
    ...(typesManuelsSansSS.length > 0
      ? ['', ...tableau(['Type classé', 'Séances à tours manuels'], typesManuelsSansSS.map(([t, k]) => [t, n(k)]))]
      : []),
    '',
    `Séances sous-seuil dont les répétitions viennent des tours : ${n(parTours)}. Dont le repli sur le flux : ${n(parFlux)}.`,
    '',
  ];
}

function sectionDerive(c: Contexte): string[] {
  const longues = c.vue.seances.filter((s) => s.type === 'sortie-longue');
  let minutesDernierQuart = 0;
  let sansSegmentRapide = 0;
  let avecMpDernierQuart = 0;
  const minutesParSortie: number[] = [];
  for (const s of longues) {
    const intr = c.intrinsequeParCle.get(s.cleSource);
    if (intr === undefined) continue;
    const duree = s.duree_min * 60;
    const debutQuart = duree * 0.75;
    const segmentsAvant = intr.segmentsMp.some((seg) => seg.debut_s < debutQuart);
    const minutes =
      intr.segmentsMp.reduce((somme, seg) => somme + chevauchement(seg.debut_s, seg.fin_s, debutQuart, duree), 0) / 60;
    if (minutes > 0) avecMpDernierQuart += 1;
    if (!segmentsAvant) {
      sansSegmentRapide += 1;
      minutesDernierQuart += minutes;
      minutesParSortie.push(minutes);
    }
  }
  const minutesMpTotal = longues.reduce((s, sl) => s + (c.intrinsequeParCle.get(sl.cleSource)?.mp_min ?? 0), 0);
  return [
    '## Dérive cardiaque en fin de sortie longue (D-001)',
    '',
    `Sorties longues : ${n(longues.length)}. Sans segment d'allure marathon avant le dernier quart : ${n(sansSegmentRapide)}.`,
    `Sorties avec des minutes d'allure marathon dans le dernier quart : ${n(avecMpDernierQuart)}.`,
    `Minutes d'allure marathon dans le dernier quart, sorties sans segment avant ce quart : ${mesure(minutesDernierQuart, 'min', 1)} `
      + `(médiane par sortie : ${mesure(mediane(minutesParSortie), 'min', 1)}).`,
    `Part de ces minutes dans l'ensemble des minutes d'allure marathon des sorties longues : `
      + `${minutesMpTotal > 0 ? pct((minutesDernierQuart / minutesMpTotal) * 100, 1) : '–'}.`,
    '',
  ];
}

function sectionReprise(c: Contexte): string[] {
  const jours = c.vue.jours.charge;
  const n28 = Math.min(28, jours.length);
  const ctl0 = n28 > 0 ? jours.slice(0, n28).reduce((s, v) => s + v, 0) / n28 : null;
  const j43 = c.vue.serieCharge[42];
  return [
    '## Reprise après coupure (D-002)',
    '',
    `Premier jour de l'historique : ${c.vue.premierJour ?? '–'}. Jours d'historique : ${n(jours.length)}.`,
    `CTL₀ (moyenne des charges des 28 premiers jours) : ${mesure(ctl0, '', 1)}.`,
    j43 === undefined
      ? 'CTL au jour 43 : historique plus court que 43 jours.'
      : `CTL au jour 43 : ${n(j43.ctl, 1)}, fraîcheur ${n(j43.tsb, 1)}.`,
    '',
  ];
}

function sectionProgressivite(c: Contexte): string[] {
  const semaines = c.vue.semaines.filter((s) => s.ratioDimanche !== null);
  const tsbParDate = new Map(c.vue.serieCharge.map((p) => [p.date, p.tsb] as const));
  let ok = 0;
  let okEtFraicheurBasse = 0;
  let fraicheurBasse = 0;
  for (const sem of semaines) {
    const tsbs: number[] = [];
    for (let i = 0; i < 7; i++) {
      const tsb = tsbParDate.get(ajouterJours(sem.lundi, i));
      if (tsb !== undefined) tsbs.push(tsb);
    }
    const sousSeuil = tsbs.some((t) => arrondir(t, PRECISION.fraicheur) < SEUILS.fraicheur.alerteSous);
    if (sousSeuil) fraicheurBasse += 1;
    if (etatRatio(sem.ratioDimanche ?? 0) === 'ok') {
      ok += 1;
      if (sousSeuil) okEtFraicheurBasse += 1;
    }
  }
  const selection = selectionProgressivite(c.vue, '12mois');
  const etats = compter(selection.points.map((p) => p.etat));
  return [
    '## Progressivité à volume égal (D-003)',
    '',
    `Semaines avec ratio défini : ${n(semaines.length)}. Semaines au ratio OK : ${n(ok)}.`,
    `Semaines dont la fraîcheur passe sous ${n(SEUILS.fraicheur.alerteSous)} : ${n(fraicheurBasse)}.`,
    `**Semaines où le ratio reste OK alors que la fraîcheur passe sous ${n(SEUILS.fraicheur.alerteSous)} : ${n(okEtFraicheurBasse)}.**`,
    `Jours tracés sur 12 mois (sélecteur C1) : ${n(selection.points.length)}. `
      + `OK ${n(etats.get('ok') ?? 0)}, à surveiller ${n(etats.get('surveiller') ?? 0)}, alerte ${n(etats.get('alerte') ?? 0)}.`,
    '',
  ];
}

function sectionPaceHrK(c: Contexte): string[] {
  const premier = c.vue.premierJour;
  if (premier === null) return ['## Coefficient allure ↔ FC (D-004)', '', 'Pas d\'historique.', ''];
  const mois: DateCivile[] = [];
  let [annee = 0, moisCourant = 0] = premier.split('-').map(Number);
  const [anneeJ = 0, moisJ = 0] = c.J.split('-').map(Number);
  while (annee < anneeJ || (annee === anneeJ && moisCourant <= moisJ)) {
    mois.push(`${String(annee).padStart(4, '0')}-${String(moisCourant).padStart(2, '0')}-01`);
    moisCourant += 1;
    if (moisCourant > 12) {
      moisCourant = 1;
      annee += 1;
    }
  }
  const suggestions = mois.map((m) => ({ mois: m, valeur: suggestionPaceHrK({ ...c.vue, J: m }) }));
  const definies = suggestions.flatMap((s) => (s.valeur === null ? [] : [s.valeur]));
  const variations = definies.slice(1).map((v, i) => Math.abs(v - (definies[i] ?? v)));
  const biais = moyenne(definies);
  const actuel = c.vue.parametresEnVigueur.globaux.paceHrK;
  return [
    '## Suggestion paceHrK mois par mois (D-004)',
    '',
    'Valeur suggérée au premier jour de chaque mois, sur les 12 semaines qui précèdent.',
    '',
    ...tableau(['Mois', 'Suggestion'], suggestions.map((s) => [s.mois.slice(0, 7), s.valeur === null ? '–' : n(s.valeur, 1)])),
    '',
    `Mois avec suggestion : ${n(definies.length)} sur ${n(mois.length)}. Moyenne des suggestions : ${mesure(biais, '', 2)} `
      + `(paceHrK en vigueur : ${n(actuel, 2)}). Variation moyenne d'un mois à l'autre : ${mesure(moyenne(variations), '', 2)}.`,
    '',
  ];
}

/** FC mesurée la plus récente à l'instant t, prolongée 10 s au plus (D-013). NaN s'il n'y en a pas. */
function fcJusquA(flux: Flux, t: number): number {
  const fc = flux.fc_bpm;
  if (fc === null) return Number.NaN;
  for (let i = flux.t_s.length - 1; i >= 0; i--) {
    const ti = flux.t_s[i] ?? Number.NaN;
    if (ti > t) continue;
    if (t - ti > 10) return Number.NaN;
    const valeur = fc[i] ?? Number.NaN;
    if (!Number.isNaN(valeur)) return valeur;
  }
  return Number.NaN;
}

/** FC moyenne des mesures entre a et b, secondes incluses. NaN sans mesure. */
function fcMoyenneEntre(flux: Flux, a: number, b: number): number {
  const fc = flux.fc_bpm;
  if (fc === null) return Number.NaN;
  let somme = 0;
  let nombre = 0;
  for (let i = 0; i < flux.t_s.length; i++) {
    const ti = flux.t_s[i] ?? Number.NaN;
    const valeur = fc[i] ?? Number.NaN;
    if (ti >= a && ti <= b && !Number.isNaN(valeur)) {
      somme += valeur;
      nombre += 1;
    }
  }
  return nombre === 0 ? Number.NaN : somme / nombre;
}

/**
 * Retour de la FC après un segment d'allure marathon (D-005) : FC moyenne du segment moins FC 5 min après sa fin.
 * Un segment qui se termine moins de 5 min avant la fin de la séance n'est pas mesuré.
 */
function retoursFc(c: Contexte): number[] {
  const retours: number[] = [];
  for (const intr of c.intrinseques) {
    const flux = c.pivotParCle.get(intr.cleSource)?.flux;
    if (flux === undefined) continue;
    const dernier = flux.t_s.at(-1) ?? 0;
    for (const seg of intr.segmentsMp) {
      if (seg.fin_s + 300 > dernier) continue;
      const retour = fcMoyenneEntre(flux, seg.debut_s, seg.fin_s) - fcJusquA(flux, seg.fin_s + 300);
      if (Number.isFinite(retour)) retours.push(retour);
    }
  }
  return retours;
}

function sectionDecouplage(c: Contexte): string[] {
  const avec = c.vue.seances.filter((s) => s.decouplage !== null && s.decouplage.valeur !== null && s.decouplage.avecMp);
  const sans = c.vue.seances.filter((s) => s.decouplage !== null && s.decouplage.valeur !== null && !s.decouplage.avecMp);
  const valeurs = (liste: SeanceVue[]): number[] => liste.flatMap((s) => (s.decouplage?.valeur == null ? [] : [s.decouplage.valeur]));
  const moyAvec = moyenne(valeurs(avec));
  const moySans = moyenne(valeurs(sans));
  const retours = retoursFc(c);
  return [
    '## Découplage avec et sans segment d\'allure marathon (D-005)',
    '',
    '| Groupe | Sorties | Découplage moyen | Médiane |',
    '| --- | --- | --- | --- |',
    `| Avec segment d'allure marathon | ${n(avec.length)} | ${moyAvec === null ? '–' : pct(moyAvec, 1)} | ${pourcentageOuTiret(mediane(valeurs(avec)))} |`,
    `| Sans segment | ${n(sans.length)} | ${moySans === null ? '–' : pct(moySans, 1)} | ${pourcentageOuTiret(mediane(valeurs(sans)))} |`,
    '',
    `Écart des moyennes (avec − sans) : ${moyAvec === null || moySans === null ? '–' : pct(moyAvec - moySans, 1)}.`,
    `Retour de FC après un segment d'allure marathon (FC moyenne du segment moins FC 5 min après sa fin) : `
      + `${n(retours.length)} segments mesurés, baisse médiane ${mesure(mediane(retours), 'bpm', 1)}, moyenne ${mesure(moyenne(retours), 'bpm', 1)}.`,
    '',
  ];
}

function pourcentageOuTiret(valeur: number | null): string {
  return valeur === null ? '–' : pct(valeur, 1);
}

function sectionRecalcul(m: Mesures): string[] {
  return [
    '## Durée des calculs (D-006, D-010)',
    '',
    '| Opération | Durée |',
    '| --- | --- |',
    `| Premier calcul complet (sans cache, flux lus dans la base) | ${mesure(m.tPremierCalcul, 'ms')} |`,
    `| Recalcul après modification datée de lt2Hr à mi-historique | ${m.tLt2Hr === null ? (m.messageLt2Hr ?? '–') : mesure(m.tLt2Hr, 'ms')} |`,
    `| Recalcul après modification de refHr | ${m.tRefHr === null ? (m.messageRefHr ?? '–') : mesure(m.tRefHr, 'ms')} |`,
    '',
    'Durées mesurées dans Node, sur la base de test : elles ne remplacent pas une mesure dans le navigateur.',
    '',
  ];
}

/** Verdict et cause de « Maintenir », jour par jour (D-007, D-008). */
function verdictsParJour(c: Contexte): VerdictJour[] {
  const premier = c.vue.premierJour;
  if (premier === null) return [];
  const veille = ajouterJours(c.J, -1);
  const resultat: VerdictJour[] = [];
  for (let k = numeroJour(premier); k <= numeroJour(veille); k++) {
    const date = dateDepuisNumero(k);
    const vue = calculerVueBrute({ intrinseques: c.intrinseques, parametres: c.parametres, J: date, derniereSynchro: null });
    const { verdict, signaux } = vue.decision;
    resultat.push({ date, verdict, cause: verdict === 'maintenir' ? causeMaintenir(signaux) : null });
  }
  return resultat;
}

function causeMaintenir(signaux: Signal[]): 'signal' | 'donnees' | 'autre' {
  if (signaux.some((s) => s.etat === 'alerte' || s.etat === 'surveiller')) return 'signal';
  if (signaux.some((s) => s.etat === 'insuffisant')) return 'donnees';
  return 'autre';
}

function sectionDonnees(c: Contexte): string[] {
  const jours = c.verdicts;
  const maintenir = jours.filter((j) => j.verdict === 'maintenir');
  const parCause = compter(maintenir.map((j) => j.cause ?? 'autre'));
  const aucun = jours.filter((j) => j.verdict === 'aucun').length;
  return [
    '## Données insuffisantes et « Maintenir » (D-007)',
    '',
    `Jours examinés : ${n(jours.length)}. Sans verdict : ${n(aucun)}.`,
    '',
    ...tableau(['Cause de « Maintenir »', 'Jours'], [
      ['Un signal à surveiller ou en alerte', n(parCause.get('signal') ?? 0)],
      ['Données insuffisantes, sans signal', n(parCause.get('donnees') ?? 0)],
      ['Autre', n(parCause.get('autre') ?? 0)],
    ]),
    '',
  ];
}

function sectionVerdicts(c: Contexte): string[] {
  const jours = c.verdicts;
  const avecVerdict = jours.filter((j) => j.verdict !== 'aucun');
  const parVerdict = compter(avecVerdict.map((j) => j.verdict));
  const total = avecVerdict.length;
  const part = (k: string): string => (total === 0 ? '–' : pct(((parVerdict.get(k as Vue['decision']['verdict']) ?? 0) / total) * 100, 1));
  return [
    '## Répartition des verdicts (D-008)',
    '',
    `Jours avec verdict : ${n(total)} sur ${n(jours.length)}.`,
    '',
    ...tableau(['Verdict', 'Jours', 'Part'], [
      ['Augmenter', n(parVerdict.get('augmenter') ?? 0), part('augmenter')],
      ['Maintenir', n(parVerdict.get('maintenir') ?? 0), part('maintenir')],
      ['Alléger', n(parVerdict.get('alleger') ?? 0), part('alleger')],
    ]),
    '',
    'D-008 place « Maintenir » à 86 % sur l\'exemple : au-delà, les seuils des signaux 4, 5 et 6 sont à revoir.',
    '',
  ];
}

function sectionAxes(c: Contexte): string[] {
  const premier = c.vue.premierJour;
  if (premier === null) return ['## Bornes des axes (D-009)', '', 'Pas d\'historique.', ''];
  const fin = ajouterJours(premier, 84);
  const dansFenetre = (d: DateCivile): boolean => d >= premier && d < fin;
  const seances = c.vue.seances.filter((s) => dansFenetre(s.date));
  const ss = c.vue.semaines.filter((s) => dansFenetre(s.lundi));
  const indice = c.vue.serieCharge.filter((p) => dansFenetre(p.date));
  const ratio = c.vue.ratio.date.flatMap((d, i) => (dansFenetre(d) && c.vue.ratio.r[i] != null ? [c.vue.ratio.r[i] as number] : []));
  const repere = c.vue.parametresEnVigueur.datesAJm1;
  const axes: { cle: CleDePreset; nom: string; valeurs: number[]; reperes: number[] }[] = [
    { cle: 'fcFin', nom: 'FC de fin (nuage P3)', valeurs: seances.flatMap((s) => s.repetitions.map((r: Repetition) => r.fcFin)), reperes: [repere.subtHrLo, repere.subtHrHi] },
    { cle: 'allure', nom: 'Allure des répétitions (s/km)', valeurs: seances.flatMap((s) => s.repetitions.map((r) => r.allure_skm)), reperes: [] },
    { cle: 'efficacite', nom: 'Efficacité en footing (P2)', valeurs: seances.filter((s) => s.type === 'footing').flatMap((s) => (s.ef == null ? [] : [s.ef])), reperes: [] },
    { cle: 'decouplage', nom: 'Découplage (P2, %)', valeurs: seances.flatMap((s) => (s.decouplage?.valeur == null ? [] : [s.decouplage.valeur])), reperes: [] },
    { cle: 'formeFond', nom: 'Forme de fond (A4)', valeurs: indice.map((p) => p.ctl), reperes: [] },
    { cle: 'fraicheur', nom: 'Fraîcheur (A4)', valeurs: indice.map((p) => p.tsb), reperes: [0, SEUILS.fraicheur.alerteSous, SEUILS.fraicheur.surveillerApres] },
    { cle: 'ratio', nom: 'Ratio (C1)', valeurs: ratio, reperes: [SEUILS.progressivite.okMin, SEUILS.progressivite.okMax, SEUILS.progressivite.alerteApres] },
    { cle: 'partSousSeuil', nom: 'Part de sous-seuil (C3, %)', valeurs: ss.flatMap((s) => (s.partSS == null ? [] : [s.partSS * 100])), reperes: [] },
  ];
  const lignes = axes.map((axe) => {
    const preset = PRESETS_AXES[axe.cle];
    const domaine = domaineAxe({ valeurs: axe.valeurs, reperes: axe.reperes, ...preset });
    const etendue = axe.valeurs.length > 0 ? maximum(axe.valeurs) - axe.valeurs.reduce((m, v) => Math.min(m, v), Number.POSITIVE_INFINITY) : 0;
    const plage = typeof preset.plageMin === 'number' ? preset.plageMin : preset.plageMin[1] - preset.plageMin[0];
    return [axe.nom, n(axe.valeurs.length), `${n(domaine.min, 2)} à ${n(domaine.max, 2)}`, etendue < plage ? 'oui' : 'non'];
  });
  return [
    '## Bornes des axes sur les 12 premières semaines (D-009)',
    '',
    'Domaines calculés avec les plages minimales de D-009 (`PRESETS_AXES`), sur les données des 84 premiers jours de l\'historique.',
    '',
    ...tableau(['Axe', 'Valeurs', 'Domaine', 'Plage minimale active'], lignes),
    '',
  ];
}

/** Ramène un pivot à 1 s à un pas de 5 s : on garde les échantillons à 0, 5, 10… s, tours compris (D-013). */
function ramenerA5s(pivot: ActivitePivot): ActivitePivot {
  const flux = pivot.flux;
  const t0 = flux.t_s[0] ?? 0;
  const gardes: number[] = [];
  for (let i = 0; i < flux.t_s.length; i++) {
    if (Math.round((flux.t_s[i] ?? 0) - t0) % 5 === 0) gardes.push(i);
  }
  const prendre = (v: Float32Array | null): Float32Array | null =>
    v === null ? null : Float32Array.from(gardes, (i) => v[i] ?? Number.NaN);
  const fluxCinq: Flux = {
    t_s: Float32Array.from(gardes, (i) => flux.t_s[i] ?? 0),
    dist_m: prendre(flux.dist_m) ?? new Float32Array(gardes.length),
    fc_bpm: prendre(flux.fc_bpm),
    alt_m: prendre(flux.alt_m),
    vitesse_ms: prendre(flux.vitesse_ms),
  };
  const tours = pivot.tours.flatMap((tour) => {
    const premier = gardes.findIndex((i) => i >= tour.iDebut);
    let dernier = -1;
    gardes.forEach((i, k) => {
      if (i <= tour.iFin) dernier = k;
    });
    if (premier < 0 || dernier < premier) return [];
    return [{ ...tour, iDebut: premier, iFin: dernier }];
  });
  return { ...pivot, flux: fluxCinq, tours, pasFC_s: 5 };
}

function sectionFcPas(c: Contexte): string[] {
  const fit1s = c.pivots.filter((p) => p.pasFC_s === 1 && p.flux.fc_bpm !== null);
  const ecartsMin = { easy: [] as number[], mp: [] as number[], subt: [] as number[], hard: [] as number[] };
  const ecartsFcFin: number[] = [];
  let seancesChangees = 0;
  let mp1s = 0;
  let hard1s = 0;
  let dMp = 0;
  let dHard = 0;
  let comparees = 0;
  for (const pivot of fit1s) {
    const p = indexerParametres(c.parametres).auJour(pivot.dateLocale);
    const a = calculerSeanceIntrinseque(pivot, p);
    const b = calculerSeanceIntrinseque(ramenerA5s(pivot), p);
    comparees += 1;
    ecartsMin.easy.push(Math.abs(a.minutes.easy - b.minutes.easy));
    ecartsMin.mp.push(Math.abs(a.minutes.mp - b.minutes.mp));
    ecartsMin.subt.push(Math.abs(a.minutes.subt - b.minutes.subt));
    ecartsMin.hard.push(Math.abs(a.minutes.hard - b.minutes.hard));
    mp1s += a.minutes.mp;
    hard1s += a.minutes.hard;
    dMp += Math.abs(a.minutes.mp - b.minutes.mp);
    dHard += Math.abs(a.minutes.hard - b.minutes.hard);
    if (a.repetitions.length !== b.repetitions.length) seancesChangees += 1;
    a.repetitions.forEach((r, k) => {
      const autre = b.repetitions[k];
      if (autre !== undefined && Number.isFinite(r.fcFin) && Number.isFinite(autre.fcFin)) {
        ecartsFcFin.push(Math.abs(r.fcFin - autre.fcFin));
      }
    });
  }
  return [
    '## FC à 1 s face à 5 s (D-013)',
    '',
    `Archives à 1 s comparées : ${n(comparees)}. Les autres restent à 5 s et ne sont pas comparées.`,
    '',
    ...tableau(['Intensité', 'Écart moyen par séance', 'Écart maximal'], [
      ['Facile', mesure(moyenne(ecartsMin.easy), 'min', 2), mesure(maximum(ecartsMin.easy), 'min', 2)],
      ['Allure marathon', mesure(moyenne(ecartsMin.mp), 'min', 2), mesure(maximum(ecartsMin.mp), 'min', 2)],
      ['Sous-seuil', mesure(moyenne(ecartsMin.subt), 'min', 2), mesure(maximum(ecartsMin.subt), 'min', 2)],
      ['Au-dessus du seuil', mesure(moyenne(ecartsMin.hard), 'min', 2), mesure(maximum(ecartsMin.hard), 'min', 2)],
    ]),
    '',
    `Part des minutes d'allure marathon qui changent : ${mp1s > 0 ? pct((dMp / mp1s) * 100, 1) : '–'}. `
      + `Part des minutes au-dessus du seuil qui changent : ${hard1s > 0 ? pct((dHard / hard1s) * 100, 1) : '–'}.`,
    `Écart moyen de FC de fin de répétition : ${mesure(moyenne(ecartsFcFin), 'bpm', 2)} (maximum ${mesure(maximum(ecartsFcFin), 'bpm', 1)}). `
      + `Séances dont le nombre de répétitions change : ${n(seancesChangees)}.`,
    '',
  ];
}

function sectionCourses(c: Contexte): string[] {
  const courses = c.vue.seances.filter((s) => s.type === 'course' || s.type === 'test');
  const tests5 = c.vue.seances.filter((s) => s.type === 'test' && s.distanceRef_km === 5).length;
  const niveau = niveauEstime(c.vue);
  return [
    '## Courses et tests détectés (D-014)',
    '',
    `Courses et tests détectés : ${n(courses.length)}.`,
    '',
    ...(courses.length > 0
      ? tableau(['Date', 'Type', 'Distance de référence', 'Temps'], courses.map((s) => [
          s.date,
          s.type,
          s.distanceRef_km === null ? '–' : mesure(s.distanceRef_km, 'km', 2),
          s.temps_s === null ? '–' : formatTempsCourse(s.temps_s),
        ]))
      : ['Aucune course détectée.']),
    '',
    `Test de 5 km présent : ${tests5 > 0 ? 'oui' : 'non'}.`,
    niveau.source === null ? `Niveau estimé : ${niveau.raison}` : 'Niveau estimé : une source est disponible.',
    '',
    'Les courses gardées sous un nom par défaut ne se détectent pas automatiquement : elles relèvent d\'une revue de l\'athlète.',
    '',
  ];
}

/**
 * Une passe sur le flux brut (D-019) : vrai si la FC existe, et si son maximum brut n'est atteint qu'avant 5 min
 * (pointe de début de séance : aucune mesure après DEBUT_PIC_FC_S n'atteint ce maximum).
 */
function pointeFcDebut(flux: Flux): { avecFc: boolean; debut: boolean } {
  const fc = flux.fc_bpm;
  if (fc === null) return { avecFc: false, debut: false };
  let maxTout = Number.NEGATIVE_INFINITY;
  let maxApres = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < fc.length; i++) {
    const valeur = fc[i] ?? Number.NaN;
    if (Number.isNaN(valeur)) continue;
    if (valeur > maxTout) maxTout = valeur;
    if ((flux.t_s[i] ?? 0) >= DEBUT_PIC_FC_S && valeur > maxApres) maxApres = valeur;
  }
  if (maxTout === Number.NEGATIVE_INFINITY) return { avecFc: false, debut: false };
  return { avecFc: true, debut: maxApres < maxTout };
}

function sectionFcMaxObservee(c: Contexte): string[] {
  // La Vue brute (pics non arrondis) : la même que celle de la suggestion de l'application (D-019).
  const brute = calculerVueBrute({ intrinseques: c.intrinseques, parametres: c.parametres, J: c.J, derniereSynchro: null });
  const reglage = c.vue.parametresEnVigueur.datesAJm1.hrMax;
  const retenu = picRetenu(brute);
  const examinees = seancesExaminees(brute);
  const avecPic = examinees.filter((s) => s.fcPic !== null).length;
  const proposition = c.vue.parametresEnVigueur.suggestionHrMax;

  let avecFc = 0;
  let debutSeance = 0;
  for (const pivot of c.pivots) {
    const pointe = pointeFcDebut(pivot.flux);
    if (pointe.avecFc) avecFc += 1;
    if (pointe.debut) debutSeance += 1;
  }

  const ecart = retenu === null ? null : retenu.bpm - reglage;
  return [
    `## FC max observée (D-019, ADR 0013)${retenu === null ? '' : ` : pic le ${retenu.seance.date}`}`,
    '',
    `Pic retenu : ${retenu === null ? '–' : `${n(retenu.bpm)} bpm, le ${retenu.seance.date}`}. `
      + `Écart au réglage en vigueur (${n(reglage)} bpm à J−1) : ${ecart === null ? '–' : `${ecart >= 0 ? '+' : ''}${n(ecart)} bpm`}.`,
    `Séances examinées : ${n(examinees.length)}, dont ${n(avecPic)} avec un pic soutenu (fcPic).`,
    `Proposition : ${proposition === null
      ? 'aucune'
      : `${n(proposition.bpm)} bpm à partir du ${proposition.date}${proposition.ecartSuspect ? ', écart suspect (plus de 15 bpm)' : ''}`}.`,
    `Séances avec FC (toutes les activités importées, pas seulement les 365 derniers jours) : ${n(avecFc)}. `
      + `Dont le maximum brut de FC se situe dans les 5 premières minutes : ${n(debutSeance)}`
      + `${avecFc === 0 ? '' : ` (${pct((debutSeance / avecFc) * 100, 1)} des séances avec FC)`}.`,
    '',
  ];
}

function sectionBudgets(m: Mesures): string[] {
  const ko = (octets: number): string => mesure(octets / 1024, 'Ko');
  return [
    '## Budgets de performance mesurés en Node (ADR 0012)',
    '',
    ...tableau(['Mesure', 'Mesuré', 'Budget'], [
      [`Import de l'archive (${n(m.archive.pivots)} activités, ${mesure(m.archive.octets / (1024 * 1024), 'Mo', 1)})`, mesure(m.tImport, 'ms'), '< 15 s sur ordinateur'],
      ['Affichage de la dernière Vue au lancement', `${mesure(m.tDemarrage, 'ms')}${m.demarrageDepuisCache ? ' (cache)' : ' (recalcul)'}`, '< 300 ms'],
      ['Recalcul après un paramètre global (refHr)', m.tRefHr === null ? (m.messageRefHr ?? '–') : mesure(m.tRefHr, 'ms'), '< 1 s sur ordinateur'],
      ['Taille de la Vue (JSON)', ko(m.tailleVueOctets), 'budget de 2 Mo à 10 ans (ADR 0009)'],
      ['Rendu d\'un onglet, curseur du simulateur, JS initial', 'non mesuré en Node', '< 50 ms, < 16 ms, < 100 Ko'],
    ]),
    '',
    `Import : ${n(m.archive.ignorees)} activités ignorées (non-courses), ${n(m.archive.illisibles)} lignes ou fichiers illisibles, ${n(m.archive.manquants)} fichiers manquants.`,
    '',
  ];
}

function enTete(c: Contexte, paramsSource: string, m: Mesures): string[] {
  const premier = c.vue.premierJour;
  return [
    '# Rapport sur données réelles',
    '',
    'Généré par `npm run verif:reel`. Agrégats seulement : aucun nom d\'activité, aucune coordonnée, aucun identifiant, aucun flux (ADR 0010).',
    '',
    `- J : ${c.J}. Historique : ${premier ?? '–'} à ${ajouterJours(c.J, -1)}.`,
    `- Règles : ${REGLES_VERSION}, format de Vue ${FORMAT_VUE}.`,
    `- Paramètres : ${paramsSource}.`,
    `- Activités retenues : ${n(c.pivots.length)} ; séances classées : ${n(c.vue.seances.length)}.`,
    `- Import : ${n(m.archive.pivots)} activités lues, ${n(m.archive.ignorees)} ignorées, ${n(m.archive.illisibles)} illisibles.`,
    '',
  ];
}

// ── Pipeline et assemblage ───────────────────────────────────────────────────

export async function verifierReel(options: OptionsVerif = {}): Promise<ResultatVerif> {
  const env = options.env ?? process.env;
  const maintenant = options.maintenant ?? (() => new Date());
  const dossier = resolve(options.sortie ?? DOSSIER_SORTIE);
  if (!estDansSortie(dossier)) throw new Error('la sortie doit se trouver dans tests/local/out/');
  const exportChemin = env['JOG_EXPORT']?.trim();
  if (exportChemin === undefined || exportChemin === '') throw new Error(MESSAGE_USAGE);

  const J = lireJ(env['JOG_J'], maintenant());
  const entreeParams = await lireParametresEntree(env['JOG_PARAMS']?.trim(), J);
  const parametres = entreeParams.parametres;

  // L'archive est lue une fois pour les analyses (pivots avec flux) ; l'import passe par le Worker, comme l'application.
  const octets = new Uint8Array(await readFile(exportChemin));
  const archive = await lireArchiveStrava(octets);
  const fluxParCle = new Map(archive.pivots.map((p) => [p.cleSource, p.flux] as const));

  const base = await ouvrirBase(NOM_BASE, new IDBFactory());
  try {
    await ecrireParametres(base, parametres);
    const reponses: Reponse[] = [];
    const horloge = maintenant();
    const nouveauTraitement = (): ((corps: CorpsRequete & { id?: number }) => Promise<void>) =>
      creerTraitement({
        ouvrir: async () => base,
        emettre: (reponse) => {
          reponses.push(reponse);
        },
        stockage: {},
        maintenant: () => horloge,
      });
    const requeter = async (traitement: (c: CorpsRequete & { id?: number }) => Promise<void>, corps: CorpsRequete, id: number): Promise<Reponse[]> => {
      await traitement({ ...corps, id });
      return reponses.splice(0);
    };

    // Import (budget « import »), puis démarrage depuis le cache de la Vue (budget « lancement »).
    const traitement = nouveauTraitement();
    const t0 = performance.now();
    const recusImport = await requeter(traitement, { type: 'importer', fichier: new Blob([new Uint8Array(octets)]), J }, 1);
    const tImport = performance.now() - t0;
    const vueImport = vueDe(recusImport);

    const t1 = performance.now();
    const recusDemarrage = await requeter(nouveauTraitement(), { type: 'demarrer', J }, 2);
    const tDemarrage = performance.now() - t1;
    const reponseDemarrage = recusDemarrage[0];
    const demarrageDepuisCache = recusDemarrage.length === 1 && reponseDemarrage?.type === 'vue' && reponseDemarrage.perimee !== true;

    // Premier calcul complet : sans cache de séances, avec la lecture des flux dans la base.
    const t2 = performance.now();
    await calculerDepuisBase(base, J, new CacheSeances());
    const tPremierCalcul = performance.now() - t2;

    // Analyses : séances ②a calculées à partir des pivots de l'archive, puis les mêmes entrées que la Vue.
    const intrinseques = await seancesIntrinseques(archive.pivots, async (cle) => fluxParCle.get(cle) ?? null, parametres, J, new Map());
    const pivotParCle = new Map(archive.pivots.map((p) => [p.cleSource, p] as const));
    const intrinsequeParCle = new Map(intrinseques.map((s) => [s.cleSource, s] as const));
    const typeParCle = new Map(vueImport.seances.map((s) => [s.cleSource, s.type] as const));
    const contexte: Contexte = {
      J,
      vue: vueImport,
      parametres,
      pivots: archive.pivots,
      pivotParCle,
      intrinseques,
      intrinsequeParCle,
      typeParCle,
      verdicts: [],
    };
    contexte.verdicts = verdictsParJour(contexte);

    const tailleVueOctets = new TextEncoder().encode(JSON.stringify(vueImport)).length;

    // Recalculs après modification (D-006, D-010), sur la base de données de test uniquement.
    const mesures: Mesures = {
      tImport,
      archive: {
        pivots: archive.pivots.length,
        ignorees: archive.ignorees.length,
        illisibles: archive.illisibles.length,
        manquants: archive.manquants.length,
        octets: octets.length,
      },
      demarrageDepuisCache,
      tDemarrage,
      tPremierCalcul,
      tLt2Hr: null,
      messageLt2Hr: null,
      tRefHr: null,
      messageRefHr: null,
      tailleVueOctets,
    };
    const traitementRecalcul = nouveauTraitement();
    const stock = await lireParametres(base);
    const premier = vueImport.premierJour;
    const veille = ajouterJours(J, -1);
    const milieu = premier === null ? J : dateDepuisNumero(Math.floor((numeroJour(premier) + numeroJour(veille)) / 2));
    const lt2Hr = indexerParametres(stock).auJour(milieu).lt2Hr;
    const proposesLt2 = { globaux: stock.globaux, modifs: [...stock.modifs, { id: 'verif-lt2hr', cle: 'lt2Hr' as const, valeur: lt2Hr + 2, dateEffet: milieu, enregistreLe: maintenant().toISOString() }] };
    const t3 = performance.now();
    const recusLt2 = await requeter(traitementRecalcul, { type: 'enregistrerParams', proposes: proposesLt2, J }, 3);
    if (recusLt2.some((r) => r.type === 'erreurValidation')) {
      mesures.messageLt2Hr = 'validation refusée';
    } else {
      mesures.tLt2Hr = performance.now() - t3;
    }

    const stock2 = await lireParametres(base);
    const proposesRef = { globaux: { ...stock2.globaux, refHr: stock2.globaux.refHr + 2 }, modifs: stock2.modifs };
    const t4 = performance.now();
    const recusRef = await requeter(traitementRecalcul, { type: 'enregistrerParams', proposes: proposesRef, J }, 4);
    if (recusRef.some((r) => r.type === 'erreurValidation')) {
      mesures.messageRefHr = 'validation refusée';
    } else {
      mesures.tRefHr = performance.now() - t4;
    }

    const sourceParams = entreeParams.source;
    const rapport = [
      ...enTete(contexte, sourceParams, mesures),
      ...sectionClassification(contexte),
      ...sectionDerive(contexte),
      ...sectionReprise(contexte),
      ...sectionProgressivite(contexte),
      ...sectionPaceHrK(contexte),
      ...sectionDecouplage(contexte),
      ...sectionRecalcul(mesures),
      ...sectionDonnees(contexte),
      ...sectionVerdicts(contexte),
      ...sectionAxes(contexte),
      ...sectionFcPas(contexte),
      ...sectionCourses(contexte),
      ...sectionFcMaxObservee(contexte),
      ...sectionBudgets(mesures),
    ].join('\n');

    const cheminRapport = await ecrireDansSortie(dossier, 'rapport.md', `${rapport}\n`);
    const cheminSnapshot = options.snapshot
      ? await ecrireDansSortie(dossier, `vue-${REGLES_VERSION}.json`, `${JSON.stringify(vueImport, null, 1)}\n`)
      : null;
    return { J, cheminRapport, cheminSnapshot };
  } finally {
    base.close();
  }
}
