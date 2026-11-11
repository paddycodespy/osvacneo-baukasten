/**
 * Fehler, die die Oberfläche zeigen darf. Alles andere (WebAssembly-Ausnahmen von OpenCascade, Programmfehler)
 * wird in der Konsole protokolliert und in der Oberfläche durch einen allgemeinen, verständlichen Satz ersetzt.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

/**
 * Hinweise eines Körpers, der trotzdem gebaut wurde (z. B. weggelassene Klemmrippen). Der Worker leert die Liste vor
 * jedem Körper, liest sie danach aus und gibt sie mit dem Ergebnis (und im Browser-Speicher) weiter.
 */
export const partNotes: string[] = [];

export const GENERIC_ERROR =
  'Mit diesen Maßen lässt sich der Adapter nicht berechnen. Bitte einen Wert etwas ändern. Hilft das nicht, die Seite neu laden.';

/** Text für die Oberfläche: eigene Meldungen unverändert, technische Fehler als allgemeiner Hinweis. */
export function userMessage(e: unknown): string {
  if (e instanceof UserError) return e.message;
  console.error('[osVAC neo Konfigurator]', e);
  return GENERIC_ERROR;
}

/** Teilname für Meldungen: „Formstück 2 · Übergang“ heißt in der Oberfläche „Baustein 2 (Übergang)“. */
export function partLabel(name: string): string {
  const m = /^Formstück (\d+) · (.+)$/.exec(name);
  if (m) return `Baustein ${m[1]} (${m[2]})`;
  if (name.startsWith('Geräteanschluss') || name.startsWith('Übergang zum Gerät') || name === 'Anschlagring') return 'Der Geräteanschluss';
  if (name.startsWith('Übergang zu Ende B')) return 'Der Übergang zu Ende B';
  return 'Ein Teil des Adapters';
}
