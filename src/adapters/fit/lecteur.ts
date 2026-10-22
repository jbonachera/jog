// Lecteur FIT générique (profil FIT, reference-fit.md). Il décode les définitions et les données,
// en petit-boutiste et en grand-boutiste, avec l'en-tête à horodatage compressé. Seuls les
// messages et les champs de la liste blanche sont décodés ; les autres octets sont sautés sans être
// interprétés (ADR 0010 : la position n'est jamais lue). Les champs de développeur sont sautés. Le
// CRC n'est pas vérifié, et son absence est tolérée.

export class ErreurFit extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurFit';
  }
}

export interface MessageFit {
  readonly numero: number;
  // numéro de champ -> valeur ; les valeurs invalides et les champs absents n'y figurent pas
  readonly champs: ReadonlyMap<number, number>;
}

export interface MessagesFit {
  readonly fileId: readonly MessageFit[];
  readonly deviceInfo: readonly MessageFit[];
  readonly records: readonly MessageFit[];
  readonly laps: readonly MessageFit[];
  readonly sessions: readonly MessageFit[];
  readonly activites: readonly MessageFit[];
}

type Categorie = keyof MessagesFit;

const CATEGORIE_PAR_NUMERO = new Map<number, Categorie>([
  [0, 'fileId'],
  [23, 'deviceInfo'],
  [20, 'records'],
  [19, 'laps'],
  [18, 'sessions'],
  [34, 'activites'],
]);

// Liste blanche : numéro de message -> numéros des champs lus (reference-fit.md).
// Position (0, 1) absente du record, donc jamais décodée (ADR 0010).
const CHAMPS_LUS = new Map<number, ReadonlySet<number>>([
  [0, new Set([0, 1, 2])], // file_id : type, manufacturer, product
  [23, new Set([2, 4])], // device_info : manufacturer, product
  [20, new Set([2, 3, 5, 6, 73, 78])], // record : altitude, heart_rate, distance, speed, enhanced
  [19, new Set([2, 7, 8, 9, 23, 24])], // lap : start_time, durées, distance, intensity, trigger
  [18, new Set([2, 5, 6, 7, 8, 9])], // session : start_time, sport, sub_sport, durées, distance
  [34, new Set([5])], // activity : local_timestamp
]);

const CHAMP_TEMPS = 253; // timestamp : lu dans tous les messages, pour l'en-tête compressé
const SIGNATURE = [0x2e, 0x46, 0x49, 0x54]; // ".FIT"

interface TypeBase {
  taille: number;
  lire: (vue: DataView, offset: number, petitBoutiste: boolean) => number;
  estInvalide: (valeur: number) => boolean;
}

const egalA = (sentinelle: number) => (valeur: number): boolean => valeur === sentinelle;

const TYPES_BASE = new Map<number, TypeBase>([
  [0x00, { taille: 1, lire: (v, o) => v.getUint8(o), estInvalide: egalA(0xff) }],
  [0x01, { taille: 1, lire: (v, o) => v.getInt8(o), estInvalide: egalA(0x7f) }],
  [0x02, { taille: 1, lire: (v, o) => v.getUint8(o), estInvalide: egalA(0xff) }],
  [0x83, { taille: 2, lire: (v, o, p) => v.getInt16(o, p), estInvalide: egalA(0x7fff) }],
  [0x84, { taille: 2, lire: (v, o, p) => v.getUint16(o, p), estInvalide: egalA(0xffff) }],
  [0x85, { taille: 4, lire: (v, o, p) => v.getInt32(o, p), estInvalide: egalA(0x7fffffff) }],
  [0x86, { taille: 4, lire: (v, o, p) => v.getUint32(o, p), estInvalide: egalA(0xffffffff) }],
  [0x88, { taille: 4, lire: (v, o, p) => v.getFloat32(o, p), estInvalide: Number.isNaN }],
  [0x0a, { taille: 1, lire: (v, o) => v.getUint8(o), estInvalide: egalA(0) }],
  [0x8b, { taille: 2, lire: (v, o, p) => v.getUint16(o, p), estInvalide: egalA(0) }],
  [0x8c, { taille: 4, lire: (v, o, p) => v.getUint32(o, p), estInvalide: egalA(0) }],
]);

interface ChampDef {
  numero: number;
  taille: number;
  base: TypeBase | undefined; // undefined : type inconnu, octets sautés
  lire: boolean; // vrai : champ de la liste blanche, de type connu et de taille cohérente
}

interface DefinitionFit {
  numero: number;
  petitBoutiste: boolean;
  champs: ChampDef[];
  tailleDev: number;
}

export function lireFit(octets: Uint8Array): MessagesFit {
  if (octets.byteLength === 0) {
    throw new ErreurFit('fichier FIT vide');
  }
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const tailleEntete = vue.getUint8(0);
  if (tailleEntete !== 12 && tailleEntete !== 14) {
    throw new ErreurFit(
      `en-tête FIT invalide : taille de ${tailleEntete} octets (12 ou 14 attendus)`,
    );
  }
  if (octets.byteLength < tailleEntete) {
    throw new ErreurFit(`fichier FIT tronqué : en-tête de ${tailleEntete} octets incomplet`);
  }
  if (!SIGNATURE.every((octet, i) => vue.getUint8(8 + i) === octet)) {
    throw new ErreurFit('en-tête FIT invalide : signature « .FIT » absente');
  }

  // Le CRC final (2 octets) est facultatif : seules les données doivent être complètes.
  const fin = tailleEntete + vue.getUint32(4, true);
  if (fin > octets.byteLength) {
    throw new ErreurFit(
      `fichier FIT tronqué : ${fin} octets attendus, ${octets.byteLength} présents`,
    );
  }

  const resultat: Record<Categorie, MessageFit[]> = {
    fileId: [],
    deviceInfo: [],
    records: [],
    laps: [],
    sessions: [],
    activites: [],
  };
  const definitions: (DefinitionFit | undefined)[] = new Array<DefinitionFit | undefined>(16);
  let pos = tailleEntete;
  let dernierTemps: number | null = null;

  while (pos < fin) {
    const entete = vue.getUint8(pos);
    pos += 1;
    const compresse = (entete & 0x80) !== 0;

    if (!compresse && (entete & 0x40) !== 0) {
      const lue = lireDefinition(vue, pos, fin, (entete & 0x20) !== 0);
      definitions[entete & 0x0f] = lue.def;
      pos = lue.pos;
      continue;
    }

    const local = compresse ? (entete >> 5) & 0x03 : entete & 0x0f;
    const def = definitions[local];
    if (def === undefined) {
      throw new ErreurFit(
        `message de données sans définition préalable (type local ${local}, octet ${pos - 1})`,
      );
    }

    const tempsCompresse: number | undefined = compresse
      ? tempsDepuisEntete(dernierTemps, entete & 0x1f)
      : undefined;
    const champs = new Map<number, number>();
    pos = lireChamps(vue, def, pos, fin, champs);

    if (tempsCompresse !== undefined) {
      champs.set(CHAMP_TEMPS, tempsCompresse);
    }
    const temps = champs.get(CHAMP_TEMPS);
    if (temps !== undefined) dernierTemps = temps;

    const categorie = CATEGORIE_PAR_NUMERO.get(def.numero);
    if (categorie !== undefined) {
      resultat[categorie].push({ numero: def.numero, champs });
    }
  }

  return resultat;
}

function lireDefinition(
  vue: DataView,
  pos: number,
  fin: number,
  avecDev: boolean,
): { def: DefinitionFit; pos: number } {
  verifier(pos + 5, fin);
  const petitBoutiste = vue.getUint8(pos + 1) === 0;
  const numero = vue.getUint16(pos + 2, petitBoutiste);
  const nombre = vue.getUint8(pos + 4);
  let p = pos + 5;

  const lus = CHAMPS_LUS.get(numero);
  verifier(p + 3 * nombre, fin);
  const champs: ChampDef[] = [];
  for (let k = 0; k < nombre; k++) {
    const numeroChamp = vue.getUint8(p);
    const taille = vue.getUint8(p + 1);
    const base = TYPES_BASE.get(vue.getUint8(p + 2));
    const voulu = numeroChamp === CHAMP_TEMPS || lus?.has(numeroChamp) === true;
    const coherent =
      base !== undefined && taille >= base.taille && taille % base.taille === 0;
    champs.push({ numero: numeroChamp, taille, base, lire: voulu && coherent });
    p += 3;
  }

  let tailleDev = 0;
  if (avecDev) {
    verifier(p + 1, fin);
    const nombreDev = vue.getUint8(p);
    p += 1;
    verifier(p + 3 * nombreDev, fin);
    for (let k = 0; k < nombreDev; k++) {
      tailleDev += vue.getUint8(p + 1);
      p += 3;
    }
  }

  return { def: { numero, petitBoutiste, champs, tailleDev }, pos: p };
}

function lireChamps(
  vue: DataView,
  def: DefinitionFit,
  pos: number,
  fin: number,
  champs: Map<number, number>,
): number {
  let p = pos;
  for (const champ of def.champs) {
    verifier(p + champ.taille, fin);
    const base = champ.base;
    if (champ.lire && base !== undefined) {
      const valeur = base.lire(vue, p, def.petitBoutiste);
      if (!base.estInvalide(valeur)) champs.set(champ.numero, valeur);
    }
    p += champ.taille;
  }
  verifier(p + def.tailleDev, fin);
  return p + def.tailleDev;
}

// En-tête compressé : le temps vaut la base du dernier temps, plus le décalage, plus 32 s
// si le décalage est inférieur aux 5 bits de poids faible du dernier temps (reference-fit.md).
function tempsDepuisEntete(dernierTemps: number | null, decalage: number): number {
  if (dernierTemps === null) {
    throw new ErreurFit('en-tête à horodatage compressé sans horodatage précédent');
  }
  const reste = dernierTemps % 32;
  return dernierTemps - reste + decalage + (decalage < reste ? 32 : 0);
}

function verifier(besoin: number, fin: number): void {
  if (besoin > fin) {
    throw new ErreurFit('fichier FIT tronqué : message incomplet à la fin des données');
  }
}
