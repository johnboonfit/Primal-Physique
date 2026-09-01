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

## Coach: creating workouts

Run `supabase/workouts.sql` in the SQL Editor (same way as `schema.sql`) to add the `workouts` and `workout_exercises` tables. This is additive — run it after `schema.sql`, not instead of it.

Log in as a coach account and the home screen now shows a **"My Workouts"** link (client accounts don't see it — the workouts screens are coach-only, enforced both by the app's routing and by the database's row-level security). From there:

- **+ New** opens a form: a workout name field, one or more exercise rows (each just a name and a sets/reps string like `3x10`), a way to add more rows, and **Save workout**.
- Saving takes you back to the list, which now shows the new workout with its exercise count.

**Verify it works:**

1. Log in as your coach account, tap **My Workouts**, tap **+ New**.
2. Name it "Push Day", add two exercises (e.g. "Bench Press" / "3x10" and "Overhead Press" / "3x12"), tap **Save workout**.
3. You should land back on the list and see "Push Day — 2 exercises".
4. In Supabase's Table Editor, open `workouts` — confirm a row with that name and your coach account's id in `coach_id`. Open `workout_exercises` — confirm two rows pointing at that workout's id.
5. Log in as a client account and confirm there's no "My Workouts" link on home, and that typing `/workouts` into the URL bar (if testing on web) redirects back to home instead of showing the list.

## Coach: assigning a workout to a client

Run `supabase/assignments.sql` in the SQL Editor after `schema.sql` and `workouts.sql`. This adds an `assignments` table (workout + client + date) and one extra rule that lets a coach see the list of client accounts — before this, a coach could only see their own profile row.

Log in as a coach and the home screen now also shows an **Assignments** link. From there:

- **+ New** shows your saved workouts as a tappable list, all client accounts as a tappable list, and a date field (pre-filled with today, editable as `YYYY-MM-DD`). Pick one of each and tap **Save assignment**.
- Saving takes you back to the list, which now shows the assignment as "workout name — client email · date".

Note: there's no coach/client roster yet, so every coach currently sees every client account in the picker. Fine for testing; this is the same simplification flagged when workouts shipped, and needs tightening before multiple coaches are using this for real.

**Verify it works:**

1. Make sure you have at least one saved workout (e.g. "Push Day" from the previous step) and at least one client account signed up.
2. Log in as your coach account, tap **Assignments**, tap **+ New**.
3. Pick "Push Day", pick your client's email, leave today's date (or change it), tap **Save assignment**.
4. You should land back on the list and see "Push Day — [client email] · [date]".
5. In Supabase's Table Editor, open `assignments` — confirm one row with the right `coach_id`, `client_id`, `workout_id`, and `assigned_date`.
6. Log in as the client account and confirm there's no "Assignments" link, and that typing `/assignments` into the URL bar redirects back to home.

## Client: seeing assigned workouts

Run `supabase/client-access.sql` in the SQL Editor after `schema.sql`, `workouts.sql`, and `assignments.sql`. This adds read-only rules letting a client see their own assignments and the workout + exercises linked to each one — before this, a client could only see their own profile row.

Log in as a client and the home screen now shows a **"Your assigned workouts"** section directly (no extra link to tap — it's right there), listing each assignment as "workout name / date". Tapping one opens a detail screen showing every exercise in that workout (name + sets/reps), read-only — no logging sets or marking anything done yet, that's a later chunk.

**Verify it works:**

1. Make sure a workout is already assigned to your client account (from the previous step).
2. Log in as that client account. On home, confirm **"Your assigned workouts"** shows "Push Day / [date]".
3. Tap it — confirm the detail screen shows "Push Day" and both exercises ("Bench Press — 3x10", "Overhead Press — 3x12").
4. Tap **Back**, confirm it returns to home.
5. Log in as a *different* client account (one nothing has been assigned to) and confirm it shows "Nothing assigned yet." instead of someone else's workout.

## Client: logging actual performance

Run `supabase/workout-logs.sql` in the SQL Editor after `client-access.sql`. This adds a `status` column to `assignments` (`pending` or `completed`, defaulting to `pending`), a new `workout_logs` table (one row per exercise actually logged — weight + reps), and permission for a client to flip their own assignment to `completed`.

On the assigned-workout detail screen, each exercise now shows two number inputs (Weight, Reps) instead of nothing — both start empty, and either can be left blank. A **Mark Complete** button at the bottom saves whatever was entered and flips the assignment to completed. Once completed, reopening that screen replaces the inputs with the logged numbers, read-only, and the button disappears — there's no editing a log after it's submitted (a later chunk if you want it).

**Verify it works:**

1. Log in as the client account with "Push Day" assigned (should still show "Pending" if you haven't completed it yet).
2. Open it, enter weight/reps for one exercise (e.g. "135" / "10") and leave the other blank, tap **Mark Complete**.
3. The screen should now show "Completed" next to the date, "Logged: 135 weight · 10 reps" for the one you filled in, and "Logged: — weight · — reps" for the one you left blank. No inputs, no button.
4. Tap Back, tap the same assignment again from home — confirm it still shows the same logged values (not blank inputs), proving it saved rather than just updating on-screen.
5. In Supabase's Table Editor: open `assignments`, confirm that row's `status` is now `completed`. Open `workout_logs`, confirm exactly one row (for the exercise you filled in — the blank one shouldn't have created a row), with the right `assignment_id`, `client_id`, `exercise_id`, `weight`, and `reps`.

## Project structure reference

```
src/
  app/
    index.tsx          # routes to /login or /home based on session
    (auth)/
      login.tsx
      signup.tsx
    (app)/
      home.tsx          # shows role; client's assigned-workouts list lives here
      workouts/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of the coach's workouts
        new.tsx          # create-workout form
      assignments/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of assignments the coach has made
        new.tsx          # pick workout + client + date, save
      assigned/
        [id].tsx          # client's workout view — logs performance, or shows it once completed
  context/
    auth-context.tsx    # session + profile state, available anywhere via useAuth()
  lib/
    supabase.ts          # Supabase client, reads from .env
    workouts.ts           # createWorkout() / listWorkouts() database calls
    assignments.ts         # coach + client assignment + workout-log database calls
supabase/
  schema.sql              # paste into Supabase SQL Editor once
  workouts.sql             # paste in after schema.sql, adds workouts + workout_exercises
  assignments.sql           # paste in after workouts.sql, adds assignments + client visibility
  client-access.sql          # paste in after assignments.sql, lets clients read their own data
  workout-logs.sql            # paste in after client-access.sql, adds logging + completed status
```
