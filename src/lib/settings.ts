import { supabase } from '@/lib/supabase';

/** Name + phone save immediately through the normal profiles row — both
 * are already granted self-editable columns (see settings-profile.sql).
 * Email is deliberately NOT handled here — see requestEmailChange(). */
export async function updateProfileDetails(userId: string, fullName: string, phoneNumber: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName.trim() || null, phone_number: phoneNumber.trim() || null })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Changing a login email isn't a plain column write — it goes through
 * Supabase Auth's own account-email-change flow, which (with this
 * project's default "Secure email change" setting) sends a
 * confirmation link to the new address rather than switching over
 * immediately. auth.users.email only actually changes once that link is
 * clicked -- at which point handle_user_email_change() (see
 * settings-profile.sql) copies the new address into profiles.email.
 * Until then, the account keeps signing in with the OLD email, so the
 * caller should keep showing that, not this newly-requested one.
 */
export async function requestEmailChange(newEmail: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
  if (error) throw error;
}

/** The four notification-preference columns (see
 * notification-preferences.sql) -- preference STORAGE only. Nothing in
 * this app reads these yet; real notification delivery is Phase 14.
 * Each toggle saves immediately on flip (see settings.tsx), same as
 * every other simple on/off preference elsewhere in the app (e.g.
 * Community's own hide toggle) -- no separate Save button for these. */
export type NotificationPreferenceKey =
  | 'push_notifications_enabled'
  | 'workout_reminders_enabled'
  | 'habit_reminders_enabled'
  | 'community_updates_enabled';

export async function setNotificationPreference(
  userId: string,
  key: NotificationPreferenceKey,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase.from('profiles').update({ [key]: enabled }).eq('id', userId);
  if (error) throw error;
}
