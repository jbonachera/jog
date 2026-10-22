/** Archive Strava inexploitable dans son ensemble (index absent, en-tête obligatoire manquant). */
export class ErreurArchive extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurArchive';
  }
}
