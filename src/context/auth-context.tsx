import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { supabase } from '@/lib/supabase';

export type UserRole = 'coach' | 'client';

export type Profile = {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  phone_number: string | null;
};

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  /** True until we've checked whether a session already exists on launch. */
  initializing: boolean;
  /** True while we have a session but are still fetching its profile row. */
  loadingProfile: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    // Keyed on the user id, not the `session` object itself: Supabase hands
    // back a brand-new session object on every `TOKEN_REFRESHED` event too
    // (routinely fired the moment the app returns from the background), even
    // though it's still the same signed-in user. Re-running this fetch on
    // every one of those — and flipping `loadingProfile` while it's in
    // flight — is what used to make every role-guarded screen below think
    // the profile was loading from scratch and unmount itself, snapping
    // navigation back to that section's starting screen on every resume.
    if (!userId) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    setLoadingProfile(true);

    supabase
      .from('profiles')
      .select('id, email, role, full_name, phone_number')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load profile:', error.message);
          setProfile(null);
        } else {
          setProfile(data as Profile);
        }
        setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, profile, initializing, loadingProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return ctx;
}
