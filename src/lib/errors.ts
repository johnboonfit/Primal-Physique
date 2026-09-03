/**
 * Supabase's query builder, in its default (non-throwing) mode -- the
 * only mode this app uses -- returns a plain `{message, details, hint,
 * code}` object on failure, NOT a real `PostgrestError`/`Error` instance
 * (that class is only ever constructed when `.throwOnError()` is used,
 * which nothing here does). So `err instanceof Error` is always false for
 * a database error, and `err.message` -- while it exists right there on
 * the object -- never gets read if code only checks for real Error
 * instances first. This reads it either way, so the real reason a query
 * failed (missing column, RLS denial, etc.) actually reaches the screen
 * instead of a generic fallback.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && err.message) {
    return err.message;
  }
  return fallback;
}
