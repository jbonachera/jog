// Lecteur CSV conforme à la RFC 4180, sans dépendance : guillemets, guillemets doublés,
// retours à la ligne entre guillemets, BOM initial, fins de ligne CRLF, LF ou CR seul.
// Un guillemet n'ouvre un champ cité qu'en début de champ ; ailleurs, c'est un caractère ordinaire.
// Le texte est parcouru par plages (slice), jamais caractère par caractère.
import { ErreurArchive } from './erreurs';

const BOM = 0xfeff;
const SEPARATEUR = /[,\r\n]/g;

/** Découpe un texte CSV en lignes de champs. Les lignes entièrement vides sont ignorées. */
export function lireCsv(texte: string): string[][] {
  const lignes: string[][] = [];
  const n = texte.length;
  let i = texte.charCodeAt(0) === BOM ? 1 : 0;
  let ligne: string[] = [];

  const terminerLigne = (): void => {
    if (!estVide(ligne)) lignes.push(ligne);
    ligne = [];
  };

  for (;;) {
    const { valeur, fin } = lireChamp(texte, i);
    ligne.push(valeur);
    if (fin >= n) {
      terminerLigne();
      break;
    }
    const separateur = texte.charAt(fin);
    if (separateur === ',') {
      i = fin + 1;
      continue;
    }
    i = separateur === '\r' && texte.charAt(fin + 1) === '\n' ? fin + 2 : fin + 1;
    terminerLigne();
    if (i >= n) break;
  }
  return lignes;
}

/** Lit un champ à partir de `debut` : sa valeur, et l'indice du séparateur qui le termine (ou la fin). */
function lireChamp(texte: string, debut: number): { valeur: string; fin: number } {
  if (texte.charAt(debut) !== '"') {
    const fin = indexSeparateur(texte, debut);
    return { valeur: texte.slice(debut, fin), fin };
  }

  let valeur = '';
  let plage = debut + 1;
  for (;;) {
    const guillemet = texte.indexOf('"', plage);
    if (guillemet === -1) throw new ErreurArchive('activities.csv : guillemet non fermé');
    valeur += texte.slice(plage, guillemet);
    if (texte.charAt(guillemet + 1) === '"') {
      valeur += '"';
      plage = guillemet + 2;
    } else {
      plage = guillemet + 1;
      break;
    }
  }
  // Ce qui suit le guillemet de fermeture, jusqu'au séparateur, reste dans le champ.
  const fin = indexSeparateur(texte, plage);
  return { valeur: valeur + texte.slice(plage, fin), fin };
}

function indexSeparateur(texte: string, depuis: number): number {
  SEPARATEUR.lastIndex = depuis;
  const trouve = SEPARATEUR.exec(texte);
  return trouve === null ? texte.length : trouve.index;
}

function estVide(ligne: string[]): boolean {
  return ligne.length === 1 && ligne[0] === '';
}
