# Primal Physique

A coaching app built with [Expo](https://expo.dev) (React Native) and [Supabase](https://supabase.com). Right now it does one thing: let someone create an account as either a **coach** or a **client**, log in, and land on a home screen that shows which role they're logged in as. Everything else gets built on top of this.

## How it fits together

- **Expo Router** (`src/app/`) handles navigation using folders as routes:
  - `src/app/index.tsx` — checks if you're logged in and sends you to `/login` or `/home`.
  - `src/app/(auth)/` — the `login` and `signup` screens (only reachable when logged out).
  - `src/app/(app)/` — the `home` screen (only reachable when logged in).
- **`src/lib/supabase.ts`** — the Supabase client the whole app talks through.
- **`src/context/auth-context.tsx`** — tracks whether you're logged in and fetches your role from the database.
- **`supabase/schema.sql`** — the database setup: a `profiles` table (id, email, role) plus a trigger that creates a profile row automatically whenever someone signs up.

## One-time setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a free account, then create a new project. Wait for it to finish provisioning (a couple of minutes).

### 2. Run the database setup

In the Supabase dashboard: **SQL Editor** → **New query** → paste the entire contents of `supabase/schema.sql` → **Run**.

Verify it worked: go to **Table Editor** and confirm you see a `profiles` table with columns `id`, `email`, `role`, `created_at`.

### 3. Turn off email confirmation (for now)

By default, Supabase makes new users confirm their email before they can log in. That's the right setting for production, but it slows down testing. To switch it off while you're building: **Authentication** → **Sign In / Providers** → **Email** → turn off **"Confirm email"** → **Save**.

(You can turn this back on later before real users sign up.)

### 4. Get your project's API keys

**Project Settings** → **API**. You need two values:
- **Project URL**
- **anon / public key**

### 5. Configure the app

In the project folder, copy the example env file:

```bash
cp .env.example .env
```

Open `.env` and paste in your Project URL and anon key:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

`.env` is gitignored — it won't get committed.

### 6. Install dependencies (if you haven't already)

```bash
npm install
```

### 7. Start the app

```bash
npx expo start
```

This prints a QR code and a menu. Press `w` to open it in a web browser (fastest way to test), or scan the QR code with the [Expo Go](https://expo.dev/go) app on your phone.

## Verifying it works

1. **Sign up as a client.** On the signup screen, leave the toggle on "Client", enter an email and a password (6+ characters), and submit. You should land straight on the home screen (no email confirmation needed, since we turned that off) reading **"You're logged in as Client."**
2. **Check the database.** In Supabase's Table Editor, open `profiles` — you should see a new row with that email and `role = client`.
3. **Sign out and sign up again as a coach.** Use a different email, switch the toggle to "Coach" before submitting. The home screen should now say **"You're logged in as Coach."**, and a second row should appear in `profiles` with `role = coach`.
4. **Log out and log back in.** Confirm the sign-out button on the home screen returns you to the login screen, and that logging back in with either account takes you straight to home showing the correct role.

If any of those don't match, that's the thing to fix before building further — everything downstream (coach dashboards, client views, etc.) depends on this working correctly.

## Project structure reference

```
src/
  app/
    index.tsx          # routes to /login or /home based on session
    (auth)/
      login.tsx
      signup.tsx
    (app)/
      home.tsx          # shows the logged-in user's role
  context/
    auth-context.tsx    # session + profile state, available anywhere via useAuth()
  lib/
    supabase.ts          # Supabase client, reads from .env
supabase/
  schema.sql              # paste into Supabase SQL Editor once
```
