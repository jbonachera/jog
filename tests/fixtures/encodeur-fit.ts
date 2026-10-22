// Encodeur FIT minimal, réservé aux tests. Il ne produit que les messages que le lecteur
// de Jog doit savoir lire (reference-fit.md). Aucune donnée réelle n'entre ici (ADR 0010).
//
// Convention : les temps des échantillons, des tours et de la séance sont en secondes
// depuis `debut`. `debut` est un instant Unix en millisecondes (UTC).
import type { Declenchement, IntensiteTour } from '../../src/core/types';

export interface EchantillonFit {
  t: number;
  dist?: number; // absent : le champ `distance` n'est pas écrit (valeur invalide)
  fc?: number;
  alt?: number;
  vit?: number;
  altLegacy?: number; // valeur du champ `altitude` (2), si elle diffère de `alt`
  vitLegacy?: number; // valeur du champ `speed` (6), si elle diffère de `vit`
}

export interface TourFit {
  fin: number; // timestamp du tour : fin exclue, sauf pour le dernier tour
  debut?: number; // défaut : la fin du tour précédent, comme dans les fichiers réels (D1)
  trigger: Exclude<Declenchement, 'inconnu'>;
  intensity?: IntensiteTour;
}

export interface ActiviteFit {
  debut: number;
  decalageLocal_min: number;
  sport?: number; // absent : le champ `sport` n'est pas écrit
  subSport?: number;
  typeFichier?: number; // file_id.type, 4 (activité) par défaut
  records: EchantillonFit[];
  laps: TourFit[];
  fabricant: number;
}

export interface OptionsEncodeur {
  pasFC?: number; // la FC n'est présente que sur un record sur n
  compresserTimestamps?: boolean; // en-têtes à horodatage compressé quand l'écart est < 32 s
  champsDeveloppeur?: boolean; // champs de développeur dans les records
  tronquer?: number; // nombre d'octets conservés (le fichier annonce sa taille complète)
  grandBoutiste?: boolean;
  messagesInconnus?: number; // messages d'un type non lu, intercalés après les premiers records
  sansHeureLocale?: boolean; // pas de local_timestamp dans le message activity
  positions?: boolean; // position_lat (0) et position_long (1), sint32, dans les records
  sansChampsEnrichis?: boolean; // pas de enhanced_speed (73) ni de enhanced_altitude (78)
  sansChampsAnciens?: boolean; // pas de speed (6) ni de altitude (2)
  sansTemps?: boolean; // les records n'ont pas de timestamp (253)
  sansCrc?: boolean; // le fichier s'arrête après les données, sans CRC
  sansSeance?: boolean; // pas de message session
  sansDebutSeance?: boolean; // session sans start_time
  sansDistanceSeance?: boolean; // session sans total_distance
  dureeMinuterie_s?: number; // total_timer_time de la session (défaut : la durée des records)
  sansDureeMinuterie?: boolean; // session sans total_timer_time
}

interface Champ {
  nom: string;
  num: number;
  taille: number;
  type: number;
  echelle?: number;
  decalage?: number;
}

interface Definition {
  local: number;
  numero: number;
  champs: Champ[];
}

type Valeurs = Partial<Record<string, number>>;

const EPOQUE_FIT_S = 631065600;
const TAILLE_ENTETE = 14;
const PROFIL_FIT = 2132;
const LONGUEUR_DEV = 6;
const OCTET_DEV = 0xab;
const POSITION_LAT = 0x12345678;
const POSITION_LONG = -0x0abcdef;

const TYPE_ENUM = 0x00;
const TYPE_SINT32 = 0x85;
const TYPE_UINT8 = 0x02;
const TYPE_UINT16 = 0x84;
const TYPE_UINT32 = 0x86;

function champ(
  nom: string,
  num: number,
  taille: number,
  type: number,
  echelle?: number,
  decalage?: number,
): Champ {
  return { nom, num, taille, type, echelle, decalage };
}

const CHAMP = {
  typeFichier: champ('typeFichier', 0, 1, TYPE_ENUM),
  fabricantFichier: champ('fabricantFichier', 1, 2, TYPE_UINT16),
  produitFichier: champ('produitFichier', 2, 2, TYPE_UINT16),
  creation: champ('creation', 4, 4, TYPE_UINT32),
  indexAppareil: champ('indexAppareil', 0, 1, TYPE_UINT8),
  fabricantAppareil: champ('fabricantAppareil', 2, 2, TYPE_UINT16),
  produitAppareil: champ('produitAppareil', 4, 2, TYPE_UINT16),
  temps: champ('temps', 253, 4, TYPE_UINT32),
  fc: champ('fc', 3, 1, TYPE_UINT8),
  distance: champ('distance', 5, 4, TYPE_UINT32, 100),
  altitude: champ('altitude', 2, 2, TYPE_UINT16, 5, 500),
  altitudeEnrichie: champ('altitudeEnrichie', 78, 4, TYPE_UINT32, 5, 500),
  vitesse: champ('vitesse', 6, 2, TYPE_UINT16, 1000),
  vitesseEnrichie: champ('vitesseEnrichie', 73, 4, TYPE_UINT32, 1000),
  positionLat: champ('positionLat', 0, 4, TYPE_SINT32),
  positionLong: champ('positionLong', 1, 4, TYPE_SINT32),
  debut: champ('debut', 2, 4, TYPE_UINT32),
  sport: champ('sport', 5, 1, TYPE_ENUM),
  sousSport: champ('sousSport', 6, 1, TYPE_ENUM),
  duree: champ('duree', 7, 4, TYPE_UINT32, 1000),
  dureeMinuterie: champ('dureeMinuterie', 8, 4, TYPE_UINT32, 1000),
  distanceTotale: champ('distanceTotale', 9, 4, TYPE_UINT32, 100),
  intensite: champ('intensite', 23, 1, TYPE_ENUM),
  declenchement: champ('declenchement', 24, 1, TYPE_ENUM),
  heureLocale: champ('heureLocale', 5, 4, TYPE_UINT32),
  indexInconnu: champ('indexInconnu', 0, 1, TYPE_UINT8),
  valeurInconnue: champ('valeurInconnue', 1, 2, TYPE_UINT16),
};

const LOCAL = {
  fichier: 0,
  enregistrementCompresse: 1,
  enregistrement: 2,
  tour: 3,
  seance: 4,
  activite: 5,
  inconnu: 6,
  appareil: 7,
} as const;

const CODE_INTENSITE: Record<IntensiteTour, number> = {
  actif: 0,
  repos: 1,
  echauffement: 2,
  retour: 3,
  recuperation: 4,
};

const CODE_DECLENCHEMENT: Record<Exclude<Declenchement, 'inconnu'>, number> = {
  manuel: 0,
  temps: 1,
  distance: 2,
  position: 3,
  fin: 7,
};

function definitionEnregistrement(options: OptionsEncodeur, compresse: boolean): Definition {
  const champs: Champ[] = [];
  if (!compresse && options.sansTemps !== true) champs.push(CHAMP.temps);
  champs.push(CHAMP.fc, CHAMP.distance);
  if (options.sansChampsAnciens !== true) champs.push(CHAMP.altitude, CHAMP.vitesse);
  if (options.sansChampsEnrichis !== true) champs.push(CHAMP.vitesseEnrichie, CHAMP.altitudeEnrichie);
  if (options.positions === true) champs.push(CHAMP.positionLat, CHAMP.positionLong);
  return {
    local: compresse ? LOCAL.enregistrementCompresse : LOCAL.enregistrement,
    numero: 20,
    champs,
  };
}

export function encoderFit(activite: ActiviteFit, options: OptionsEncodeur = {}): Uint8Array {
  const grand = options.grandBoutiste === true;
  const dev = options.champsDeveloppeur === true;
  const tampon = new Tampon(4096 + activite.records.length * 48, grand);
  const definitionsEmises = new Set<number>();
  const debutFit = Math.round(activite.debut / 1000) - EPOQUE_FIT_S;
  const dureeS = activite.records.at(-1)?.t ?? 0;
  const distanceTotale = derniereDistance(activite.records);

  const message = (def: Definition, entete: number, valeurs: Valeurs, avecDev = false): void => {
    if (!definitionsEmises.has(def.local)) {
      definitionsEmises.add(def.local);
      ecrireDefinition(tampon, def, avecDev);
    }
    tampon.octet(entete);
    for (const champ of def.champs) ecrireValeur(tampon, champ, valeurs[champ.nom]);
    if (avecDev) {
      for (let k = 0; k < LONGUEUR_DEV; k++) tampon.octet(OCTET_DEV);
    }
  };

  message(
    {
      local: LOCAL.fichier,
      numero: 0,
      champs: [CHAMP.typeFichier, CHAMP.fabricantFichier, CHAMP.produitFichier, CHAMP.creation],
    },
    LOCAL.fichier,
    { typeFichier: activite.typeFichier ?? 4, fabricantFichier: activite.fabricant, produitFichier: 1, creation: debutFit },
  );
  message(
    {
      local: LOCAL.appareil,
      numero: 23,
      champs: [CHAMP.indexAppareil, CHAMP.fabricantAppareil, CHAMP.produitAppareil],
    },
    LOCAL.appareil,
    { indexAppareil: 0, fabricantAppareil: activite.fabricant, produitAppareil: 1 },
  );

  let dernierTemps: number | null = null;
  for (const [i, r] of activite.records.entries()) {
    const tAbs = debutFit + r.t;
    const sansMesureFc = options.pasFC !== undefined && i % options.pasFC !== 0;
    const ecart = dernierTemps === null ? -1 : tAbs - dernierTemps;
    const compresse =
      options.compresserTimestamps === true && options.sansTemps !== true && ecart >= 0 && ecart < 32;
    const valeurs: Valeurs = {
      temps: tAbs,
      fc: sansMesureFc ? undefined : r.fc,
      distance: r.dist,
      altitude: r.altLegacy ?? r.alt,
      vitesse: r.vitLegacy ?? r.vit,
      vitesseEnrichie: r.vit,
      altitudeEnrichie: r.alt,
      positionLat: POSITION_LAT,
      positionLong: POSITION_LONG,
    };
    if (compresse) {
      // En-tête compressé : le temps est dans l'en-tête, le champ `timestamp` est absent de la définition.
      const def = definitionEnregistrement(options, true);
      message(def, 0x80 | (def.local << 5) | (tAbs & 0x1f), valeurs, dev);
    } else {
      message(definitionEnregistrement(options, false), LOCAL.enregistrement, valeurs, dev);
    }
    dernierTemps = tAbs;
    if (i < (options.messagesInconnus ?? 0)) {
      message(
        { local: LOCAL.inconnu, numero: 4242, champs: [CHAMP.indexInconnu, CHAMP.valeurInconnue] },
        LOCAL.inconnu,
        { indexInconnu: i, valeurInconnue: i * 7 },
      );
    }
  }

  // Les tours sont contigus : le début d'un tour est la fin du précédent (D1).
  let finPrecedente = 0;
  for (const tour of activite.laps) {
    const debut = tour.debut ?? finPrecedente;
    finPrecedente = tour.fin;
    message(
      {
        local: LOCAL.tour,
        numero: 19,
        champs: [
          CHAMP.temps,
          CHAMP.debut,
          CHAMP.duree,
          CHAMP.dureeMinuterie,
          CHAMP.distanceTotale,
          CHAMP.intensite,
          CHAMP.declenchement,
        ],
      },
      LOCAL.tour,
      {
        temps: debutFit + tour.fin,
        debut: debutFit + debut,
        duree: tour.fin - debut,
        dureeMinuterie: tour.fin - debut,
        distanceTotale: distanceA(activite.records, tour.fin) - distanceA(activite.records, debut),
        intensite: tour.intensity === undefined ? undefined : CODE_INTENSITE[tour.intensity],
        declenchement: CODE_DECLENCHEMENT[tour.trigger],
      },
    );
  }

  if (options.sansSeance !== true) {
    const champsSeance: Champ[] = [CHAMP.debut, CHAMP.sport, CHAMP.sousSport, CHAMP.duree];
    if (options.sansDureeMinuterie !== true) champsSeance.push(CHAMP.dureeMinuterie);
    if (options.sansDistanceSeance !== true) champsSeance.push(CHAMP.distanceTotale);
    message(
      { local: LOCAL.seance, numero: 18, champs: champsSeance },
      LOCAL.seance,
      {
        debut: options.sansDebutSeance === true ? undefined : debutFit,
        sport: activite.sport,
        sousSport: activite.subSport,
        duree: dureeS,
        dureeMinuterie: options.dureeMinuterie_s ?? dureeS,
        distanceTotale: options.sansDistanceSeance === true ? undefined : distanceTotale,
      },
    );
  }

  message(
    { local: LOCAL.activite, numero: 34, champs: [CHAMP.temps, CHAMP.heureLocale] },
    LOCAL.activite,
    {
      temps: debutFit + dureeS,
      heureLocale:
        options.sansHeureLocale === true
          ? undefined
          : Math.round(debutFit + dureeS + activite.decalageLocal_min * 60),
    },
  );

  const donnees = tampon.contenu();
  const finDonnees = TAILLE_ENTETE + donnees.length;
  const corps = new Uint8Array(finDonnees + (options.sansCrc === true ? 0 : 2));
  const vue = new DataView(corps.buffer);
  corps[0] = TAILLE_ENTETE;
  corps[1] = 0x20;
  vue.setUint16(2, PROFIL_FIT, true);
  vue.setUint32(4, donnees.length, true);
  corps.set([0x2e, 0x46, 0x49, 0x54], 8);
  vue.setUint16(12, crc16(corps, 0, 12), true);
  corps.set(donnees, TAILLE_ENTETE);
  if (options.sansCrc !== true) vue.setUint16(finDonnees, crc16(corps, 0, finDonnees), true);

  return options.tronquer === undefined ? corps : corps.slice(0, options.tronquer);
}

function derniereDistance(records: readonly EchantillonFit[]): number {
  let d = 0;
  for (const r of records) if (r.dist !== undefined) d = r.dist;
  return d;
}

// Dernière distance écrite à un instant donné (ou avant), 0 au départ.
function distanceA(records: readonly EchantillonFit[], t: number): number {
  let d = 0;
  for (const r of records) {
    if (r.t > t) break;
    if (r.dist !== undefined) d = r.dist;
  }
  return d;
}

function ecrireDefinition(tampon: Tampon, def: Definition, dev: boolean): void {
  tampon.octet((dev ? 0x60 : 0x40) | def.local);
  tampon.octet(0);
  tampon.octet(tampon.estGrand() ? 1 : 0);
  tampon.entier(2, def.numero);
  tampon.octet(def.champs.length);
  for (const champ of def.champs) {
    tampon.octet(champ.num);
    tampon.octet(champ.taille);
    tampon.octet(champ.type);
  }
  if (dev) {
    tampon.octet(2);
    tampon.octet(0);
    tampon.octet(2);
    tampon.octet(0);
    tampon.octet(1);
    tampon.octet(4);
    tampon.octet(0);
  }
}

function ecrireValeur(tampon: Tampon, champ: Champ, valeur: number | undefined): void {
  const invalide = champ.taille === 1 ? 0xff : champ.taille === 2 ? 0xffff : 0xffffffff;
  const brut =
    valeur === undefined
      ? invalide
      : Math.round((valeur + (champ.decalage ?? 0)) * (champ.echelle ?? 1));
  tampon.entier(champ.taille, brut);
}

class Tampon {
  private octets: Uint8Array;
  private vue: DataView;
  private longueur = 0;
  private readonly grand: boolean;

  constructor(capacite: number, grand: boolean) {
    this.octets = new Uint8Array(capacite);
    this.vue = new DataView(this.octets.buffer);
    this.grand = grand;
  }

  estGrand(): boolean {
    return this.grand;
  }

  octet(valeur: number): void {
    this.reserver(1);
    this.vue.setUint8(this.longueur, valeur);
    this.longueur += 1;
  }

  entier(taille: number, valeur: number): void {
    this.reserver(taille);
    const little = !this.grand;
    if (taille === 1) this.vue.setUint8(this.longueur, valeur);
    else if (taille === 2) this.vue.setUint16(this.longueur, valeur, little);
    else this.vue.setUint32(this.longueur, valeur, little);
    this.longueur += taille;
  }

  contenu(): Uint8Array {
    return this.octets.subarray(0, this.longueur);
  }

  private reserver(n: number): void {
    if (this.longueur + n <= this.octets.length) return;
    const nouveau = new Uint8Array(Math.max(this.octets.length * 2, this.longueur + n));
    nouveau.set(this.octets.subarray(0, this.longueur));
    this.octets = nouveau;
    this.vue = new DataView(nouveau.buffer);
  }
}

const TABLE_CRC = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401,
  0x5000, 0x9c01, 0x8801, 0x4400,
];

function crc16(octets: Uint8Array, debut: number, fin: number): number {
  let crc = 0;
  for (let i = debut; i < fin; i++) {
    const octet = octets[i] ?? 0;
    let tmp = TABLE_CRC[crc & 0xf] ?? 0;
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ (TABLE_CRC[octet & 0xf] ?? 0);
    tmp = TABLE_CRC[crc & 0xf] ?? 0;
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ (TABLE_CRC[(octet >> 4) & 0xf] ?? 0);
  }
  return crc;
}
