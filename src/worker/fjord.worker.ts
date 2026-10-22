// Point d'entrée du Worker (ADR 0006, 0009). Il ouvre la base une seule fois et délègue à traitement.ts.
import { ouvrirBase } from '../store/schema';
import { creerTraitement, type Reponse, type Requete } from './traitement';

// Typage minimal de la portée du Worker : la lib DOM du projet ne déclare pas DedicatedWorkerGlobalScope.
interface PorteeWorker {
  postMessage(message: Reponse, transferables: Transferable[]): void;
  onmessage: ((evenement: MessageEvent<Requete>) => void) | null;
}

const portee = self as unknown as PorteeWorker;

const traiter = creerTraitement({
  ouvrir: () => ouvrirBase(),
  emettre: (reponse, transferables = []) => portee.postMessage(reponse, transferables),
});

portee.onmessage = (evenement: MessageEvent<Requete>) => {
  void traiter(evenement.data);
};
