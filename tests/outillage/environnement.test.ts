import { describe, expect, it } from 'vitest';

// Le projet de test node s'exécute avec TZ=America/Los_Angeles (vitest.config.ts) :
// un calcul qui dépendrait du fuseau local donnerait un autre résultat ici qu'à Paris.
describe('environnement de test', () => {
  it('le fuseau est America/Los_Angeles : UTC−8 en hiver, UTC−7 en été', () => {
    expect(new Date(Date.UTC(2026, 0, 15, 12)).getTimezoneOffset()).toBe(480);
    expect(new Date(Date.UTC(2026, 6, 15, 12)).getTimezoneOffset()).toBe(420);
  });
});
