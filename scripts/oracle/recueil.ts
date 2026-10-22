// Recueil de cas dorés et sérialisation JSON de l'oracle (voir les conventions en tête de scripts/oracle.ts).
// Aucune règle métier ici : ce fichier ne fait que normaliser les valeurs et ranger les cas.

/** Un cas doré : l'entrée et la sortie (ou l'erreur attendue) d'une fonction exportée de src/core. */
export interface Cas {
  nom: string;
  fn: string;
  entree: unknown;
  sortie?: unknown;
  erreur?: string;
}

const ENTIERS_TYPES = [Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array];

/**
 * Normalise une valeur TypeScript en valeur JSON (conventions de scripts/oracle.ts) :
 * NaN en null, ±Infinity en chaîne, -0 en 0, tableaux typés en tableaux, Map en objet, Set en tableau,
 * undefined absent d'un objet (null dans un tableau). Les dates, fonctions et instances de classe sont refusées.
 */
export function aPlat(valeur: unknown): unknown {
  if (valeur === undefined || valeur === null) return valeur;
  switch (typeof valeur) {
    case 'number':
      if (Number.isNaN(valeur)) return null;
      if (valeur === Number.POSITIVE_INFINITY) return 'Infinity';
      if (valeur === Number.NEGATIVE_INFINITY) return '-Infinity';
      return Object.is(valeur, -0) ? 0 : valeur;
    case 'string':
    case 'boolean':
      return valeur;
    case 'object':
      break;
    default:
      throw new TypeError(`valeur non sérialisable (${typeof valeur})`);
  }
  if (valeur instanceof Date) throw new TypeError('les dates sont interdites dans l’oracle');
  if (ENTIERS_TYPES.some((type) => valeur instanceof type)) {
    return Array.from(valeur as ArrayLike<number>, (x) => aPlat(x));
  }
  if (Array.isArray(valeur)) return valeur.map((x: unknown) => aPlat(x) ?? null);
  if (valeur instanceof Set) return [...valeur].map((x: unknown) => aPlat(x) ?? null);
  if (valeur instanceof Map) {
    const sortie: Record<string, unknown> = {};
    for (const [cle, x] of valeur as Map<unknown, unknown>) {
      if (typeof cle !== 'string') throw new TypeError('clé de Map non textuelle');
      const v = aPlat(x);
      if (v !== undefined) sortie[cle] = v;
    }
    return sortie;
  }
  // Objet simple : prototype nul, ou Object.prototype d'un contexte quelconque (la maquette est chargée dans un contexte vm).
  const proto: unknown = Object.getPrototypeOf(valeur);
  if (proto !== null && Object.getPrototypeOf(proto) !== null) throw new TypeError('instance de classe non sérialisable');
  const sortie: Record<string, unknown> = {};
  for (const [cle, x] of Object.entries(valeur)) {
    const v = aPlat(x);
    if (v !== undefined) sortie[cle] = v;
  }
  return sortie;
}

/** Les cas d'un module, dans l'ordre où ils sont ajoutés. */
export class Recueil {
  readonly cas: Cas[] = [];
  private readonly noms = new Set<string>();

  constructor(readonly module: string) {}

  /** Cas qui doit réussir : `entree` est capturée avant l'appel, la sortie est celle de `calcul`. */
  ajouter(nom: string, fn: string, entree: unknown, calcul: () => unknown, controle?: (sortie: unknown) => void): void {
    const cas = this.creer(nom, fn, entree);
    const resultat = calcul();
    const sortie = this.plat(nom, resultat);
    if (controle !== undefined) controle(resultat);
    if (sortie !== undefined) cas.sortie = sortie;
    this.cas.push(cas);
  }

  /** Cas qui doit échouer : on enregistre le message de l'erreur. Une réussite inattendue est une faute du script. */
  ajouterErreur(nom: string, fn: string, entree: unknown, calcul: () => unknown): void {
    const cas = this.creer(nom, fn, entree);
    try {
      calcul();
    } catch (e) {
      cas.erreur = e instanceof Error ? e.message : String(e);
      this.cas.push(cas);
      return;
    }
    throw new Error(`${this.module} : « ${nom} » devait lever une erreur`);
  }

  /** Raccourci : `entree` est le tableau des arguments positionnels et `f` la fonction appelée. */
  appel<A extends unknown[]>(nom: string, fn: string, f: (...args: A) => unknown, ...args: A): void {
    this.ajouter(nom, fn, args, () => f(...args));
  }

  /** Raccourci pour une erreur attendue, arguments positionnels. */
  appelErreur<A extends unknown[]>(nom: string, fn: string, f: (...args: A) => unknown, ...args: A): void {
    this.ajouterErreur(nom, fn, args, () => f(...args));
  }

  private creer(nom: string, fn: string, entree: unknown): Cas {
    if (this.noms.has(nom)) throw new Error(`${this.module} : nom de cas en double : ${nom}`);
    this.noms.add(nom);
    return { nom, fn, entree: this.plat(nom, entree) };
  }

  private plat(nom: string, valeur: unknown): unknown {
    try {
      return aPlat(valeur);
    } catch (e) {
      throw new Error(`${this.module} : « ${nom} » : ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  }

  /** Fichier JSON : un cas par ligne (compact), pour des différences lisibles et des fichiers petits. */
  versTexte(): string {
    const lignes = this.cas.map((c) => `  ${JSON.stringify(c)}`);
    return `{"module":${JSON.stringify(this.module)},"cas":[\n${lignes.join(',\n')}\n]}\n`;
  }
}
