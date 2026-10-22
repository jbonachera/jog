import type { DateCivile, ParamsDates } from '../types';

/** Les paramètres datés en vigueur à un jour donné (D-006). L'appelant les fournit à partir des `Parametres`. */
export type ParamsAuJour = (date: DateCivile) => ParamsDates;
