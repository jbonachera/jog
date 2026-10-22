// Briques communes des composants : la teinte d'état et la pastille (A1 à A4, H2), le nombre de km (A2, A3),
// le choix segmenté (C1, H1, H2, graphiques), et le pluriel de « semaine » (C3, H1, H2).
import { arrondirDecimales } from '../../core/arrondi';
import { formatNombre } from '../../core/format';
import { el } from '../dom';

export type Teinte = 'good' | 'warn' | 'bad' | 'neutre';

/** « 0 semaine », « 1 semaine », « 12 semaines » : le singulier vaut pour zéro et pour un (français). */
export function nombreSemaines(n: number): string {
  return `${n} ${n > 1 ? 'semaines' : 'semaine'}`;
}

/** Une pastille d'état : un texte, et une puce qui porte seule la couleur d'état (08). */
export function pastille(texte: string, teinte: Teinte): HTMLElement {
  return el('span', { class: `pastille pastille-${teinte}` }, [el('span', { class: 'puce', 'aria-hidden': 'true' }), texte]);
}

/**
 * Un nombre de km avec son unité. Un total entier n'a pas de décimale ; sous 100 km, une décimale s'il y en
 * a une (41,2 km). Au-delà de 100 km, le total est écrit au km (2 813 km).
 */
export function kmTexte(km: number): string {
  const decimales = km < 100 && !Number.isInteger(arrondirDecimales(km, 1)) ? 1 : 0;
  return `${formatNombre(km, decimales)} km`;
}

/**
 * Choix segmenté (08, « Bouton segmenté ») : une capsule par valeur, la valeur active a `aria-pressed="true"`.
 * Un clic marque la capsule choisie, sans reconstruire le groupe (le focus reste sur la capsule), puis appelle `surChoix`.
 */
export function choixSegmentes<T extends string>(
  nom: string,
  choix: readonly { valeur: T; libelle: string }[],
  actif: T,
  surChoix: (valeur: T) => void,
): HTMLElement {
  const boutons: HTMLButtonElement[] = choix.map((c) => {
    const bouton = el('button', { type: 'button', class: 'segment', 'aria-pressed': String(c.valeur === actif) }, [c.libelle]);
    bouton.addEventListener('click', () => {
      for (const autre of boutons) autre.setAttribute('aria-pressed', String(autre === bouton));
      surChoix(c.valeur);
    });
    return bouton;
  });
  return el('div', { class: 'segments', role: 'group', 'aria-label': nom }, boutons);
}
