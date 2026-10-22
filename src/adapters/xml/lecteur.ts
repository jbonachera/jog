// Analyseur XML minimal, en une passe sur la chaîne, sans DOMParser : il est aussi
// utilisable dans un Web Worker. Il ne gère que ce que les fichiers GPX et TCX emploient :
// éléments, attributs (guillemets doubles ou simples), texte, entités prédéfinies,
// CDATA. Les commentaires, la déclaration et la doctype sont ignorés.

export interface NoeudXml {
  nom: string; // nom qualifié, préfixe compris : « gpxtpx:hr »
  attributs: Record<string, string>;
  enfants: NoeudXml[];
  texte: string; // texte directement contenu, entités décodées (CDATA comprise)
}

export class ErreurXml extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurXml';
  }
}

const NOM = /[^\s/>=]+/y;
const ATTRIBUT = /\s+([^\s/>=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
const ENTITE = /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g;
const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function lireXml(texte: string): NoeudXml {
  const pile: NoeudXml[] = [];
  let racine: NoeudXml | undefined;
  let i = 0;

  const ajouterTexte = (morceau: string, avecEntites: boolean): void => {
    const courant = pile.at(-1);
    if (courant === undefined) return; // hors racine : espaces et blancs ignorés
    courant.texte += avecEntites ? decoderEntites(morceau) : morceau;
  };

  while (i < texte.length) {
    const debut = texte.indexOf('<', i);
    if (debut === -1) {
      ajouterTexte(texte.slice(i), true);
      break;
    }
    if (debut > i) ajouterTexte(texte.slice(i, debut), true);
    i = debut;

    if (texte.startsWith('<!--', i)) {
      i = apres(texte, '-->', i + 4, 'commentaire');
    } else if (texte.startsWith('<![CDATA[', i)) {
      const fin = indexRequis(texte, ']]>', i + 9, 'section CDATA');
      ajouterTexte(texte.slice(i + 9, fin), false);
      i = fin + 3;
    } else if (texte.startsWith('<?', i)) {
      i = apres(texte, '?>', i + 2, 'déclaration XML');
    } else if (texte.startsWith('<!DOCTYPE', i)) {
      i = finDoctype(texte, i + 9); // le sous-ensemble interne est ignoré, ses entités ne sont pas lues
    } else if (texte.startsWith('<!', i)) {
      i = apres(texte, '>', i + 2, 'déclaration');
    } else if (texte.startsWith('</', i)) {
      const fin = indexRequis(texte, '>', i + 2, 'balise fermante');
      const nom = texte.slice(i + 2, fin).trim();
      const ouvert = pile.pop();
      if (ouvert === undefined || ouvert.nom !== nom) {
        throw new ErreurXml(`balise fermante </${nom}> sans ouverture correspondante`);
      }
      i = fin + 1;
    } else {
      const { noeud, suite, auto } = lireBaliseOuvrante(texte, i);
      const parent = pile.at(-1);
      if (parent !== undefined) {
        parent.enfants.push(noeud);
      } else {
        if (racine !== undefined) throw new ErreurXml('plusieurs éléments racine dans le document');
        racine = noeud;
      }
      if (!auto) pile.push(noeud);
      i = suite;
    }
  }

  const nonFerme = pile.at(-1);
  if (nonFerme !== undefined) {
    throw new ErreurXml(`document XML tronqué : élément <${nonFerme.nom}> non fermé`);
  }
  if (racine === undefined) throw new ErreurXml('document XML vide : aucun élément');
  return racine;
}

/** Texte d'un nœud, sans espaces de bord ; chaîne vide si le nœud est absent. */
export function texteDe(noeud: NoeudXml | undefined): string {
  return noeud === undefined ? '' : noeud.texte.trim();
}

/** Nom local (sans préfixe d'espace de noms) : « gpxtpx:hr » donne « hr ». */
export function nomLocal(nom: string): string {
  const deux = nom.indexOf(':');
  return deux === -1 ? nom : nom.slice(deux + 1);
}

/** Enfants directs dont le nom local est donné, tous préfixes confondus. */
export function enfants(noeud: NoeudXml, local: string): NoeudXml[] {
  return noeud.enfants.filter((e) => nomLocal(e.nom) === local);
}

/** Valeur d'un attribut, par son nom exact ; undefined s'il est absent. */
export function attribut(noeud: NoeudXml, nom: string): string | undefined {
  return Object.hasOwn(noeud.attributs, nom) ? noeud.attributs[nom] : undefined;
}

/** Premier enfant direct dont le nom local est donné. */
export function enfant(noeud: NoeudXml, local: string): NoeudXml | undefined {
  return noeud.enfants.find((e) => nomLocal(e.nom) === local);
}

/** Premier descendant, suivant les noms locaux du chemin, en descendant à chaque pas. */
export function chemin(noeud: NoeudXml, locaux: readonly string[]): NoeudXml | undefined {
  let courant: NoeudXml | undefined = noeud;
  for (const local of locaux) {
    if (courant === undefined) return undefined;
    courant = enfant(courant, local);
  }
  return courant;
}

/** Tous les descendants de nom local donné, dans l'ordre du document. */
export function descendants(noeud: NoeudXml, local: string): NoeudXml[] {
  const trouves: NoeudXml[] = [];
  const pile: NoeudXml[] = [...noeud.enfants].reverse();
  while (pile.length > 0) {
    const courant = pile.pop();
    if (courant === undefined) break;
    if (nomLocal(courant.nom) === local) trouves.push(courant);
    for (let k = courant.enfants.length - 1; k >= 0; k--) {
      const enfantCourant = courant.enfants[k];
      if (enfantCourant !== undefined) pile.push(enfantCourant);
    }
  }
  return trouves;
}

interface BaliseOuvrante {
  noeud: NoeudXml;
  suite: number;
  auto: boolean;
}

function lireBaliseOuvrante(texte: string, debut: number): BaliseOuvrante {
  NOM.lastIndex = debut + 1;
  const nom = NOM.exec(texte);
  if (nom === null) throw new ErreurXml(`balise mal formée à la position ${debut}`);

  const noeud: NoeudXml = { nom: nom[0], attributs: {}, enfants: [], texte: '' };
  let j = NOM.lastIndex;
  for (;;) {
    ATTRIBUT.lastIndex = j;
    const attribut = ATTRIBUT.exec(texte);
    if (attribut === null) break;
    const nomAttribut = attribut[1] ?? '';
    if (Object.hasOwn(noeud.attributs, nomAttribut)) {
      throw new ErreurXml(`attribut « ${nomAttribut} » donné deux fois sur <${noeud.nom}>`);
    }
    noeud.attributs[nomAttribut] = decoderEntites(attribut[2] ?? attribut[3] ?? '');
    j = ATTRIBUT.lastIndex;
  }

  while (j < texte.length && /\s/.test(texte.charAt(j))) j++;
  if (j >= texte.length) throw new ErreurXml(`document XML tronqué : balise <${noeud.nom}> non terminée`);
  if (texte.startsWith('/>', j)) return { noeud, suite: j + 2, auto: true };
  if (texte.charAt(j) === '>') return { noeud, suite: j + 1, auto: false };
  throw new ErreurXml(`balise <${noeud.nom}> mal formée`);
}

function decoderEntites(brut: string): string {
  if (brut.indexOf('&') === -1) return brut;
  return brut.replace(ENTITE, (tout: string, nom: string) => {
    if (nom.startsWith('#')) {
      const code = nom.startsWith('#x')
        ? Number.parseInt(nom.slice(2), 16)
        : Number.parseInt(nom.slice(1), 10);
      if (!estCaractereXml(code)) throw new ErreurXml(`référence de caractère interdite : ${tout}`);
      return String.fromCodePoint(code);
    }
    return ENTITES[nom] ?? tout;
  });
}

// Caractères admis par XML 1.0 : tabulation, LF, CR, plans de base et supplémentaires, sans surrogates.
function estCaractereXml(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

// Fin d'une doctype : le premier « > » hors du sous-ensemble interne « [ … ] » et hors des chaînes.
function finDoctype(texte: string, depuis: number): number {
  let dansCrochets = false;
  let guillemet = '';
  for (let k = depuis; k < texte.length; k++) {
    const c = texte.charAt(k);
    if (guillemet !== '') {
      if (c === guillemet) guillemet = '';
    } else if (c === '"' || c === "'") {
      guillemet = c;
    } else if (c === '[') {
      dansCrochets = true;
    } else if (c === ']') {
      dansCrochets = false;
    } else if (c === '>' && !dansCrochets) {
      return k + 1;
    }
  }
  throw new ErreurXml('document XML tronqué : déclaration DOCTYPE non terminée');
}

function indexRequis(texte: string, marque: string, depuis: number, quoi: string): number {
  const index = texte.indexOf(marque, depuis);
  if (index === -1) throw new ErreurXml(`document XML tronqué : ${quoi} non terminée`);
  return index;
}

function apres(texte: string, marque: string, depuis: number, quoi: string): number {
  return indexRequis(texte, marque, depuis, quoi) + marque.length;
}
