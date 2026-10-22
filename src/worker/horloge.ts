// Heure de l'appareil (ADR 0007) : date civile de J et décalage de secours, par Intl. Sans DOM.
import type { DateCivile } from '../core/types';

/** Fuseau courant de l'appareil, tel que le navigateur le connaît. */
export function fuseauAppareil(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Champs de date et d'heure d'un instant, dans un fuseau donné. */
interface PartiesLocales {
  annee: number;
  mois: number;
  jour: number;
  heure: number;
  minute: number;
  seconde: number;
}

function partiesLocales(instant_ms: number, fuseau: string): PartiesLocales {
  const formateur = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const champs = new Map(formateur.formatToParts(new Date(instant_ms)).map((p) => [p.type, p.value] as const));
  const nombre = (type: Intl.DateTimeFormatPartTypes): number => Number(champs.get(type));
  return {
    annee: nombre('year'),
    mois: nombre('month'),
    jour: nombre('day'),
    heure: nombre('hour'),
    minute: nombre('minute'),
    seconde: nombre('second'),
  };
}

/** Date civile « AAAA-MM-JJ » d'un instant, dans le fuseau donné : c'est J de l'application (ADR 0007). */
export function dateCivileAppareil(maintenant_ms: number, fuseau: string): DateCivile {
  const { annee, mois, jour } = partiesLocales(maintenant_ms, fuseau);
  return `${String(annee).padStart(4, '0')}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/**
 * Décalage de secours (ADR 0007) : écart, en minutes, entre l'heure locale du fuseau et UTC, à l'instant
 * donné. Il sert à un fichier qui ne donne pas son fuseau.
 */
export function decalageSecoursIntl(fuseau: string): (debutUtc_ms: number) => number {
  return (debutUtc_ms: number): number => {
    const { annee, mois, jour, heure, minute, seconde } = partiesLocales(debutUtc_ms, fuseau);
    const localEnUtc = Date.UTC(annee, mois - 1, jour, heure, minute, seconde);
    const instantSeconde = Math.floor(debutUtc_ms / 1000) * 1000;
    return Math.round((localEnUtc - instantSeconde) / 60_000);
  };
}
