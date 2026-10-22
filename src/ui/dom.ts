// Petites fabriques de DOM. Aucun attribut style n'est jamais posé (ADR 0010, CSP style-src 'self').

export type Enfant = Node | string;

/** Crée un élément HTML avec ses attributs et ses enfants. */
export function el<K extends keyof HTMLElementTagNameMap>(
  balise: K,
  attributs: Record<string, string> = {},
  enfants: Enfant[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(balise);
  for (const [nom, valeur] of Object.entries(attributs)) element.setAttribute(nom, valeur);
  element.append(...enfants);
  return element;
}

/** Crée un élément SVG (les attributs de présentation sont posés en attributs, jamais en style). */
export function svgEl(balise: string, attributs: Record<string, string | number> = {}): SVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', balise);
  for (const [nom, valeur] of Object.entries(attributs)) element.setAttribute(nom, String(valeur));
  return element;
}

/** Message lisible d'une erreur inconnue. */
export function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}
