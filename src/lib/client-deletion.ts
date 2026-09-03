import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type DeleteClientResponse = { success?: boolean; error?: string };

/**
 * Permanently deletes a client — irreversible. Everything actually
 * happens server-side in the delete-client Edge Function (deployed
 * separately via the Supabase dashboard), since it needs the
 * service-role key to delete the auth account, and that key can never
 * safely live in this app. See supabase/functions/delete-client/index.ts
 * for exactly what gets deleted vs. anonymized.
 */
export async function deleteClient(clientId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<DeleteClientResponse>('delete-client', {
    body: { clientId },
  });

  if (error) {
    // FunctionsHttpError carries the real response on `.context` — our
    // own function returns a real {error: "..."} message body, which is
    // worth surfacing over supabase-js's generic "non-2xx status" text.
    const context = (error as { context?: Response }).context;
    const body = context ? await context.json().catch(() => null) : null;
    throw new Error(body?.error ?? getErrorMessage(error, 'Failed to delete this client.'));
  }

  if (!data?.success) {
    throw new Error(data?.error ?? 'Failed to delete this client.');
  }
}
