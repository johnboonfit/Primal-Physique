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

> Superseded by "Coach role is locked down" further below — signup no longer has a role toggle, every new account is a client, and coach accounts are granted by hand in Supabase. The steps below describe the original bootstrap flow; keep them in mind as history, not as today's actual signup screen.

1. **Sign up.** On the signup screen, enter a name, email, and password (6+ characters), and submit. You should land straight on the client experience (no email confirmation needed, since we turned that off).
2. **Check the database.** In Supabase's Table Editor, open `profiles` — you should see a new row with that email and `role = client`.
3. **Log out and log back in.** Confirm the sign-out link returns you to the login screen, and that logging back in takes you straight back to where you left off.

If any of those don't match, that's the thing to fix before building further — everything downstream depends on this working correctly.

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

## Coach: seeing completed workouts

Run `supabase/coach-log-visibility.sql` in the SQL Editor after `workout-logs.sql`. This adds one read-only rule letting a coach see the `workout_logs` rows tied to their own assignments — before this, only the client who logged them could see them.

The coach's Assignments list now shows each row's status ("Pending" or "Completed"), and every row is tappable — it opens a detail screen showing, per exercise, what was **Prescribed** (the sets/reps set when the workout was built) next to what was **Actual** (what the client logged). For a still-pending assignment, it shows a note that the client hasn't logged it yet instead of actual numbers.

**Verify it works:**

1. Log in as your coach account, tap **Assignments**. Confirm the "Push Day" row you completed as the client earlier now shows **Completed**, and any other assignment still shows **Pending**.
2. Tap the completed one — confirm the detail screen shows the client's email, the date, "Completed", and for each exercise both "Prescribed: 3x10" (or whatever it was set to) and "Actual: 135 weight · 10 reps" (matching what the client logged) — plus "Actual: — weight · — reps" for the one left blank.
3. Tap **Back**, tap a **Pending** assignment instead — confirm it shows "The client hasn't logged this workout yet." and no actual numbers.

## Client: main navigation and home dashboard

Run `supabase/client-name.sql` in the SQL Editor after `coach-log-visibility.sql`. This adds a `full_name` column to `profiles` and updates the signup trigger to save it — needed so the dashboard can greet a client by name.

**This changes where things live.** The client no longer shares the coach's `/home` screen — logging in as a client now goes straight to a 5-tab layout:

- **Home** — a real dashboard: "Good morning/afternoon/evening, [name]" (based on the time on your device), and an **Up Next** section listing pending assignments, each with a **Start** button that opens the same workout-logging screen from Chunk 4/5.
- **Training** — the client's full assignment history, pending and completed, with a status badge on each row (this is what used to be the whole client home screen, moved here).
- **Nutrition**, **Progress**, **Calendar** — placeholders that just say "Coming soon."

Sign-out moved too — it's now a small link at the top of the Home tab, since there's no shared screen to put it on anymore.

Note: **signup now asks for a name**, required for new accounts going forward. Any account created *before* this change has a blank name in the database — the dashboard falls back to using their email in that case, so nothing breaks, but their greeting will read like "Good morning, jane" instead of "Good morning, Jane." Nothing to do about that except having them (or you, in Supabase's Table Editor) fill in `full_name` on `profiles` by hand if it bothers you.

**Verify it works:**

1. Sign up a **brand new** client account so you can test the name field — fill in a full name this time.
2. Confirm it lands straight on a screen with 5 tabs at the bottom: Home, Training, Nutrition, Progress, Calendar.
3. On Home, confirm the greeting matches the current time of day and shows the name you typed.
4. Have your coach account assign a workout to this new client (same flow as before), then pull-to-refresh isn't needed — just leave and come back to the Home tab, and confirm it now appears under **Up Next**.
5. Tap **Start** on it — confirm it opens the same logging screen as before, log some numbers, tap **Mark Complete**.
6. Go to the **Training** tab — confirm that same workout now shows there marked **Completed**, alongside any others still **Pending**.
7. Tap **Nutrition**, **Progress**, and **Calendar** — confirm each just shows its name and "Coming soon."
8. Tap **Sign out** on the Home tab — confirm it returns to the login screen.
9. Log in as your **coach** account and confirm nothing changed there — still the plain Home screen with My Workouts and Assignments links, no tabs.

## Brand theme

This was a purely visual pass — no database changes, no new SQL file, no data or logic changed. One color/spacing/typography system now drives every screen from a single file, `src/constants/theme.ts`:

- **Carbon black** (`#0A0A0A`) background everywhere.
- **Bone white** (`#F5F3EF`) body text everywhere.
- **Oxblood** (`#6B0F1A`) — buttons and active/selected states only (Log in, Create account, Save, Mark Complete, Start, +New, the selected Client/Coach toggle, the active tab). Never used for plain status text.
- **Deep teal** (`#0F3D3E`) — the surface color behind every oversized "hero number" stat card.
- **Bright teal** (`#2E8B8B`) — small accents only: the thin stripe across the top of each stat card, and "Completed" status labels (moved off oxblood, since a status label is data, not an action).
- A soft **teal glow** sits behind every hero-number card; a soft **oxblood glow** sits behind every primary button and the active tab.

New "hero number" stat cards appear at the top of every list-style screen — the coach's My Workouts and Assignments lists, and the client's Home and Training tabs — each showing an oversized count (workouts created, assignments made, workouts up next, workouts assigned) in a glowing teal card, so that number reads as the dominant thing on the screen rather than competing equally with the list below it.

One structural note: **the app no longer follows your device's light/dark setting.** It always renders this one dark brand theme now, regardless of system preference — that's what "one theme file" + a fixed color list means in practice. If you ever want the option to follow system light/dark again later, that's a separate, larger piece of work; flag it if you want it.

**Verify it applied consistently — check every screen, not just one:**

1. **Login and signup** — carbon black background, bone white "Primal Physique" / "Create account" heading, oxblood **Log in** / **Create account** buttons with a visible soft red glow, oxblood "Sign up" / "Log in" links. On signup, tap between Client/Coach — the selected pill should be oxblood-filled with a glow, the unselected one plain dark grey.
2. **Coach home** — unchanged layout, but confirm the "Coach" role highlight and the Sign out button's outline now read oxblood, and body text is bone white.
3. **My Workouts (coach)** — a hero number at the top ("workouts created" count) in a glowing teal card, the **+ New** button oxblood with a glow, workout rows in plain quiet dark cards (not teal — only the hero card is teal).
4. **New workout screen** — same input/button styling as signup; **Save workout** button oxblood with glow.
5. **Assignments (coach)** — hero number card ("assignments made"), **+ New** oxblood/glow, and each row's status label: **Pending** in muted grey, **Completed** in bright teal (not oxblood).
6. **Assignment detail (coach)** — status label same teal-for-completed rule; Prescribed/Actual text in plain bone white (no stray colors).
7. **Client Home tab** — greeting in bone white, a hero number card ("Workouts Up Next"), each Up Next row's **Start** button oxblood with glow.
8. **Client Training tab** — hero number card ("Workouts Assigned"), same Pending-grey / Completed-teal status rule as the coach's list.
9. **Client Nutrition / Progress / Calendar tabs** — plain carbon black background, bone white text, nothing else (these are still just placeholders).
10. **Workout logging screen** (`Start` or tapping any assignment) — inputs styled consistently with every other form in the app; **Mark Complete** oxblood with glow; once completed, the status label reads teal, not oxblood.
11. **Bottom tab bar** (client only) — inactive tabs in muted grey, the active tab in oxblood text with a faint oxblood-tinted pill behind it.

If any screen still shows a plain grey/white button, a hardcoded blue link, or a status label in red instead of teal, that's the one screen that got missed — tell me which one and I'll fix just that spot rather than re-touching everything.

## Brand logo

The logo (`assets/images/logo.jpg`) is mounted once, in the root layout, as a fixed overlay — not something added to each screen individually, which is what guarantees it's on literally every screen without exception. It's small (26×26), sits just inside the top-left safe-area corner, and is rendered with no tint or recolor — exactly the file as provided.

**Verify it works:**

1. On any screen, confirm the logo appears top-left, in its original red/black colors (not shifted teal or any other app color).
2. Navigate through several different screens (login → signup → coach home → workouts → assignments → client tabs) and confirm it's in the exact same spot every time — it shouldn't shift, resize, or disappear anywhere.
3. **Specifically check the screens whose content starts right at the top-left** — My Workouts, Assignments, the client's Home and Training tabs, and the New Workout/New Assignment forms. I verified the login and signup screens render cleanly myself (their content is centered, so there was no risk there), but I couldn't check these top-anchored screens without a live login session. If the logo visually touches or overlaps any heading/text on those, tell me which screen and I'll add clearance there.

## Client: basic food logging

Run `supabase/food-logs.sql` in the SQL Editor after `client-name.sql`. This adds a `food_logs` table — one row per food entry, tied to a client, a date, and a meal (`breakfast`, `lunch`, `dinner`, or `snacks`). Locked down so a client can only see and add their own entries; nobody else's, including their coach.

The **Nutrition** tab is no longer a placeholder. It shows today's date, a hero number for total calories logged today, and four sections (Breakfast, Lunch, Dinner, Snacks). Tapping **+ Add** under any section opens a small popup — food name and calories, both required — and saving adds it to that section's list and updates the running total immediately.

Note: entries are tied to **today's date only** — there's no way yet to view or add to a past day, and no way to edit or delete an entry once saved. Both are natural next steps if you want them; flagging rather than assuming.

**Verify it works:**

1. Log in as a client, tap the **Nutrition** tab. Confirm today's date shows, the hero number reads **0**, and all four sections say "Nothing logged yet."
2. Tap **+ Add** under **Breakfast**, enter "Oatmeal" and "350", tap **Save**. Confirm the popup closes, "Oatmeal — 350 cal" appears under Breakfast, Breakfast's subtotal shows "350 cal", and the hero number at the top updates to **350**.
3. Add a second entry under **Lunch** (e.g. "Chicken Salad" / "450"). Confirm the hero number updates to **800**, and Lunch shows its own entry and subtotal separately from Breakfast.
4. In Supabase's Table Editor, open `food_logs` — confirm two rows, both with today's date, the right `client_id`, correct `meal` values (`breakfast`/`lunch`), and matching `food_name`/`calories`.
5. Leave the Nutrition tab (tap another tab) and come back — confirm both entries and the running total are still there (proving it's reading from the database, not just local state).
6. Log in as a different client account and confirm their Nutrition tab starts empty — these entries don't leak between clients.

## Client: basic weight logging

Run `supabase/weight-logs.sql` in the SQL Editor after `food-logs.sql`. This adds a `weight_logs` table with a rule that only allows **one row per client per day** — that's what makes "log again today" update the existing entry instead of creating a duplicate, rather than needing extra app logic to check first.

The **Progress** tab is no longer a placeholder. It shows a weight input and a button (labeled **Save** normally, or **Update** if you've already logged today), then a plain chronological history below — every entry with its date, most recent first.

**Verify it works:**

1. Log in as a client, tap the **Progress** tab. Confirm the input is empty, the button says **Save**, and history says "No weight logged yet."
2. Enter "180", tap **Save**. Confirm a row appears in History showing today's date and "180", and the button now says **Update**.
3. Change the input to "179" and tap **Update**. Confirm the history still shows only **one row** for today (now reading "179", not a second row) — proving it updated rather than duplicated.
4. In Supabase's Table Editor, open `weight_logs` — confirm exactly one row for this client and today's date, with `weight = 179`.
5. Leave the Progress tab and come back — confirm the input is pre-filled with "179" (not blank), and History still shows it.
6. Log in as a different client account and confirm their Progress tab starts empty — weight history doesn't leak between clients.

## Coach role is locked down

Run `supabase/lock-coach-role.sql` in the SQL Editor after `weight-logs.sql`. This is a security fix, not a feature — read it before running it.

**What was wrong:** the signup screen had a Client/Coach toggle, and the database trusted whatever role value arrived with the signup request. That's fine as long as the only thing calling signup is your app's UI — but it means anyone who called Supabase's signup API directly (skipping your app entirely) could set `role: 'coach'` themselves and get coach-level access to every client's data. The toggle wasn't just an inconvenience to remove later; it was an open door.

**What changed:**
- The signup screen no longer has a role toggle at all — just name, email, password.
- The database trigger that creates a profile row on signup now **always** sets `role = 'client'`, regardless of what any signup request sends. Even someone bypassing the app entirely can no longer self-grant coach access.
- **The only way to create a coach account now:** have them sign up normally (they'll get a client account), then you open Supabase's Table Editor → `profiles` → find their row → change `role` from `client` to `coach` by hand.

This does **not** change any account that already exists — your existing coach account keeps its `role = coach` untouched. It only changes what happens on new signups from here on.

Still open, deliberately not addressed in this pass: every coach can still see and assign to *every* client account — there's no per-coach roster yet. Fine with one coach; worth a real fix before a second coach ever uses this.

**Verify it works:**

1. Sign up a **brand new** test account (any email you haven't used before).
2. Confirm it lands on the client experience — 5 tabs, no way to reach coach screens.
3. In Supabase's Table Editor, open `profiles`, find that new row — confirm `role` shows `client`.
4. To prove the lockdown actually works (not just the UI): change that row's `role` to `coach` by hand, save, then log out and back in with that account in the app. Confirm it now lands on the coach's Home screen with My Workouts and Assignments — this proves promotion via the Table Editor is the real, working path.
5. Confirm your **original** coach account still logs in as coach exactly as before — this change shouldn't have touched it.

## Basic habit tracking

Run `supabase/habits.sql` in the SQL Editor after `lock-coach-role.sql`. This adds two tables: `habits` (one row per habit a coach defines for a client — just a name) and `habit_logs` (one row per day a client checks a habit off). A habit can only be logged once per day at the database level, so a checked-off habit stays checked rather than a second tap creating a duplicate.

**Coach side:** a new **Habits** link on the coach's home screen, leading to a list (with a hero count, same pattern as Workouts and Assignments) and a **+ New** form — pick a client, type a habit name (e.g. "10k steps"), save.

**Client side:** the Home tab now has a **Today's Habits** section below Up Next, showing every habit as a row with a **○** (not done) or **✓** (done, in teal) on the right, plus a "**X/Y today**" count next to the section heading. Tapping an unchecked habit marks it done for today immediately.

Two deliberate limits, same spirit as earlier chunks: there's **no un-checking** a habit once marked done today (matches how workout logging also can't be undone), and **the coach can't yet see whether a client is actually keeping up with their habits** — that data exists in the database now, but there's no coach-facing view of it yet. Both are natural next steps if you want them.

**Verify it works:**

1. Log in as coach, tap **Habits** — confirm the list is empty with a hero count of **0**.
2. Tap **+ New**, pick your client, name it "10k steps", save. Confirm it appears in the list as "10k steps" with the client's email underneath, and the hero count is now **1**.
3. Add a second habit for the same client, e.g. "Drink 3L water". Hero count should read **2**.
4. Log in as that client. On the Home tab, confirm **Today's Habits** shows both habits, unchecked (○), with "**0/2 today**" next to the heading.
5. Tap "10k steps" — confirm it flips to a teal ✓ immediately, and the count updates to "**1/2 today**".
6. Leave the Home tab (switch to another tab) and come back — confirm "10k steps" is still checked and the count still reads 1/2 (proving it saved, not just an on-screen toggle).
7. In Supabase's Table Editor, open `habit_logs` — confirm one row for "10k steps" with today's date and the right `client_id`.
8. Log in as a different client account (one with no habits assigned) and confirm their Today's Habits section says "No habits set yet."

## Real Momentum Score

No new database tables for this one — it's pure calculation over data that already exists (`assignments`, `food_logs`, `habit_logs`), computed fresh every time the Home tab loads. The Home tab's hero card is now the **Momentum Score** (was "Workouts Up Next" before) — the score itself, plus a progress bar showing it against the 1–10 scale. The old Up Next count moved to a small "**X pending**" label next to the Up Next heading instead.

**The formula**, for the current Monday–Sunday week:

- Workout rate = workouts completed ÷ workouts scheduled that week (if none scheduled, this counts as 1 — nothing to miss)
- Nutrition rate = distinct days with at least one meal logged ÷ 7
- Habit rate = distinct days with at least one habit checked off ÷ 7
- Active-days rate = distinct days with *any* of the above ÷ 7
- Average the four rates, then **Score = 1 + (9 × average)**

Because every rate divides by the full 7-day week (not days-elapsed-so-far), the score reads low early in the week even with a perfect record so far — that's expected, not a bug.

**Verify the number is actually correct** — not just that something displays. This means computing it by hand from the raw data and comparing, since a wrong formula can still "look" like it's working.

1. In Supabase, find your test client's id: **Table Editor** → `profiles` → their row → copy the `id` (a long UUID).
2. Find this week's boundaries — **SQL Editor**, run:
   ```sql
   select
     (current_date - ((extract(dow from current_date)::int + 6) % 7)) as week_monday,
     (current_date - ((extract(dow from current_date)::int + 6) % 7) + 6) as week_sunday;
   ```
   Note both dates.
3. Run these four queries one at a time, swapping in that client's id and the two dates from step 2 each time, and write down each result:
   ```sql
   -- scheduled vs completed
   select status, count(*) from assignments
   where client_id = 'PASTE_CLIENT_ID' and assigned_date between 'WEEK_MONDAY' and 'WEEK_SUNDAY'
   group by status;

   -- nutrition days
   select count(distinct log_date) from food_logs
   where client_id = 'PASTE_CLIENT_ID' and log_date between 'WEEK_MONDAY' and 'WEEK_SUNDAY';

   -- habit days
   select count(distinct log_date) from habit_logs
   where client_id = 'PASTE_CLIENT_ID' and log_date between 'WEEK_MONDAY' and 'WEEK_SUNDAY';

   -- active days (union of completed-workout days, food days, habit days)
   select count(distinct log_date) from (
     select assigned_date as log_date from assignments
       where client_id = 'PASTE_CLIENT_ID' and status = 'completed' and assigned_date between 'WEEK_MONDAY' and 'WEEK_SUNDAY'
     union
     select log_date from food_logs
       where client_id = 'PASTE_CLIENT_ID' and log_date between 'WEEK_MONDAY' and 'WEEK_SUNDAY'
     union
     select log_date from habit_logs
       where client_id = 'PASTE_CLIENT_ID' and log_date between 'WEEK_MONDAY' and 'WEEK_SUNDAY'
   ) all_active_days;
   ```
4. Do the arithmetic by hand using the numbers you just wrote down (same formula as the worked example earlier in this project): workout rate = completed ÷ scheduled (or 1 if scheduled is 0), nutrition rate = nutrition days ÷ 7, habit rate = habit days ÷ 7, active rate = active days ÷ 7. Average the four, then `1 + 9 × average`.
5. Log in as that client on the app, look at the Momentum Score card, and confirm it matches your hand-calculated number (to two decimal places).
6. Log a new workout completion, meal, or habit for that client, refresh the Home tab, and confirm the score changes in the direction you'd expect (up, generally) — then re-run the queries and re-check the math to confirm it still matches exactly.

## XP and levels

Run `supabase/xp.sql` in the SQL Editor after `habits.sql`. **Read this one before running it** — it includes a security fix, not just the new feature.

**The security fix, first:** the very first setup script gave every logged-in user permission to update *any* column on their own `profiles` row — not just their name. That means, until now, a client could have called Supabase's update API directly (skipping the app entirely) and set their own `role` to `coach`, completely undoing the signup lockdown from a few chunks ago. This script closes that — a user can now only ever change their own `full_name` column, nothing else. This is unrelated to XP by itself, but it had to be fixed as part of this chunk, because otherwise a client could also just set `total_xp` to any number directly, making the whole ledger pointless.

**The XP system:** four ways to earn it — workout completed (50 XP, once per workout, however many times you look at it), first meal logged each day (10 XP, logging a second or third meal the same day earns nothing more), each habit completed (5 XP per habit per day — two habits done means two separate 5 XP awards), and an active-day bonus (15 XP, once per day, awarded automatically the moment all three of the above have happened on the same day). Every award is recorded as its own row in a new `xp_events` table — a permanent ledger, not just a number that changes — and a database trigger keeps a running `total_xp` on the client's profile in sync automatically. The Home dashboard now shows "Level X" and total XP with its own small progress bar, sitting between the greeting and the Momentum Score card. Level = total XP ÷ 500, rounded down, plus 1 (so 0–499 XP is level 1, 500–999 is level 2, and so on).

The database — not just the app — refuses to award XP that doesn't check out: wrong amount for the reason, a workout that isn't actually marked complete, a habit that isn't actually yours, or an active-day bonus claimed before all three categories are actually logged that day. Same standard as the coach-role lockdown: even someone bypassing the app entirely and calling the API directly can't cheat this.

**Verify a specific day's XP by hand:**

1. Pick a client, open Supabase's Table Editor → `profiles` → note their current `total_xp`. Call this **before**.
2. As that client in the app: complete one pending workout (any numbers, Mark Complete).
3. Log one meal under any section (any name/calories).
4. Immediately log a **second** meal, same day, different name — this is the key test: it should **not** add any more nutrition XP.
5. Complete one habit. If they have a second habit, complete that too — habits are per-habit, so this should award XP twice.
6. In Supabase's SQL Editor, run:
   ```sql
   select reason, amount, event_date from xp_events
   where client_id = 'PASTE_CLIENT_ID' and event_date = current_date
   order by created_at;
   ```
7. Check the rows by hand: exactly one `workout_completed` (50), exactly one `meal_logged` (10, not two — confirming step 4 didn't double-award), one `habit_completed` row per habit you completed (5 each), and — since all three categories now have at least one row today — exactly one `active_day_bonus` (15).
8. Add up the `amount` column yourself. Example: 1 workout + 1 meal + 2 habits + the bonus = 50 + 10 + 5 + 5 + 15 = **85**.
9. Back in `profiles`, check `total_xp` again — confirm it now reads exactly **before + 85** (or whatever your own sum came to).
10. On the client's Home tab, confirm the Level/XP display shows that same total, and the level shown equals `floor(total_xp ÷ 500) + 1`.
11. Log a third meal, same day — confirm `total_xp` does **not** change again, proving the duplicate-prevention holds even after everything else already fired.

## Streak, and missed-workout auto-reschedule

No new database table for either of these — both are built on data the app already has.

**Streak.** Uses the exact same "active day" definition as the Momentum Score: a day counts if the client completed a workout, logged a meal, or completed a habit on it. The streak is just how many of those days in a row, counting backwards from today, have no gap. If today has nothing logged yet, that's not treated as a broken streak — the day isn't over — but if *yesterday* also has nothing, it resets to 0. It shows as "🔥 N — day streak" right under the greeting on the Home tab.

**Missed-workout auto-reschedule.** Every time the client opens the app (not on every tab switch — just once, when the Home screen first mounts), it checks for any assignment still marked "pending" with a scheduled date already in the past. For each one it finds, it looks at the rest of this week (today through Sunday) and moves it to the earliest day that doesn't already have something else scheduled. If it moved anything, a dismissible banner lists what got moved and where. If every remaining day this week is already booked, it doesn't guess — that workout is left alone and shows up in a "Pick a new date" card instead, with a date field the client fills in themselves.

**Why "on app open" instead of a background job:** a real background job (something like a nightly Supabase Edge Function on a schedule) would mean actual infrastructure to write, deploy, and monitor — a moving part that can silently fail with nobody watching it. Checking when the client opens the app costs nothing to run or maintain, and it catches a missed workout at exactly the moment the client would want to know about it anyway — the point they're looking at the app. It's a reasonable simplification for where the app is right now (one coach, a handful of clients); it's worth revisiting once reminders need to go out even on days the client never opens the app at all.

**One security fix bundled in:** moving `assigned_date` around is the first legitimate reason a client's account has ever needed to update that column, and checking made clear the existing rule allowing "Clients can update their own assignment status" never actually restricted *which* columns — only which row. That meant a client calling Supabase's API directly (skipping the app) could already have changed `workout_id` or `coach_id` on their own assignment, not just `status`. `supabase/reschedule.sql` closes that the same way the profiles and XP fixes did: a client can now only ever change `status` and `assigned_date` on their own assignment rows.

**Verify the streak:**

1. In Supabase's SQL Editor, check what days you already have logged for a test client — the app can only show a multi-day streak if there's multi-day history, and everything logged through the app today is dated today.
2. Backdate some history so there's an actual streak to check. For example, to simulate 3 days in a row ending yesterday:
   ```sql
   insert into habit_logs (client_id, habit_id, log_date)
   values
     ('PASTE_CLIENT_ID', 'PASTE_HABIT_ID', current_date - 1),
     ('PASTE_CLIENT_ID', 'PASTE_HABIT_ID', current_date - 2),
     ('PASTE_CLIENT_ID', 'PASTE_HABIT_ID', current_date - 3);
   ```
3. Open the Home tab as that client with nothing logged yet today — it should show "🔥 3" (today doesn't break it yet, since the day isn't over).
4. Complete a habit, log a meal, or complete a workout today — refresh the Home tab — it should now show "🔥 4".
5. Now test the reset: insert a row for `current_date - 5` only (skip `-4` entirely) and reload — the gap at `-4` should cut the streak down to whatever's continuous after it, proving a single empty day actually breaks it rather than just counting total active days.

**Verify the auto-reschedule:**

1. Pick a client with at least one other workout already assigned for later this week (so there's something to collide with), and one you'll deliberately make overdue.
2. In the SQL Editor, backdate that second one:
   ```sql
   update assignments set assigned_date = current_date - 2
   where id = 'PASTE_ASSIGNMENT_ID' and status = 'pending';
   ```
3. Open the Home tab as that client. You should see the "Rescheduled for you" banner naming the workout and its old → new date, and the assignment should now appear in "Up Next" on its new date instead of the old one.
4. To test the fallback: first assign that same client a workout for *every remaining day this week* (today through Sunday), then backdate one more pending assignment the same way as step 2, and reload the Home tab. This time there's nowhere open to move it to, so instead of the banner you should see the "Pick a new date" card with that workout listed. Type a date (`YYYY-MM-DD`) and hit Save — it should disappear from that card and show up in "Up Next" on the date you chose.

## Multi-week programmes

Run `supabase/programmes.sql` in the SQL Editor after `reschedule.sql`.

Up to now a coach could only assign one standalone workout at a time. This chunk adds a layer on top for building a whole multi-week programme — a cut, a bulk, a strength block — without touching how standalone workouts already work.

**The structure:** a **programme** (name, description, cover image, goal type — Cutting/Bulking/Recomp/Strength — how many weeks it runs, and which days of the week it's meant to train, e.g. Mon/Wed/Fri) contains **weeks** (just a week number), and each week contains **sessions** — which are exactly the same `workouts` you've always been able to build, just now optionally linked to a specific week. That link is the only change to the existing `workouts` table, and it's optional: the standalone "My Workouts" flow from before is completely untouched and still works exactly as it did.

**One deliberate shortcut:** since the coach already states the programme's duration up front, the app creates all of that programme's weeks automatically the moment the programme is saved — Week 1 through Week N — rather than making the coach add each week by hand. They can still tap "+ Add week" on the programme screen afterwards (e.g. to tack on an extra deload week beyond the original duration).

**Cover image is a URL, not an upload.** Adding real photo uploads means Supabase Storage — a new bucket, its own access policies, and an in-app image picker — which is real infrastructure this app doesn't have yet for anything else either (the brand logo is a bundled file, not something uploaded through the app). For now, paste a link to an already-hosted image (e.g. from Canva's share/export, or any image URL) into the "Cover image URL" field and it displays the same way. Worth revisiting once there's an actual need to upload images from a phone.

**How to build one, as the coach:** Home → Template Library → + New. Fill in name, goal type, duration, and (optionally) description, cover image URL, and training days, then Create. You land on the programme screen showing Week 1 through N as cards. Tap a week to open it, then "+ New session" to build a workout inside that week — this opens the exact same workout builder used for standalone workouts, just labeled with which week it's for and saving into that week instead of your general workout list.

**One security tightening bundled in, following the same standard as every other table:** the "Coaches can create workouts" and "Coaches can update their own workouts" rules now also confirm that, if a workout does point at a programme week, that week's programme actually belongs to the same coach — otherwise a coach could, via a direct API call, link a workout they own into another coach's programme structure.

**This chunk is creation only** — a coach can build out a full programme, but nothing here assigns it to a client yet. That's next.

**Verify the structure saved correctly:**

1. In the app, create a programme: name it, pick a goal type, set duration to something small like 3 weeks, tick a couple of training days, and save.
2. In Supabase's Table Editor, open `programme_blocks` — confirm one new row with your name, goal type, and `duration_weeks = 3`, and `scheduled_days` holding the days you ticked (e.g. `{mon,wed,fri}`).
3. Open `programme_weeks`, filtered to that programme's id — confirm exactly 3 rows exist already, with `week_number` 1, 2, and 3, even though you never manually added a single one.
4. Back in the app, open the programme and tap "+ Add week" once — confirm a 4th row now exists in `programme_weeks` with `week_number = 4`.
5. Open Week 2 and add a session (e.g. "Upper Body", one exercise). In `workouts`, find that row and confirm its `programme_week_id` matches Week 2's id from `programme_weeks` — not null, and pointing at the right week.
6. Go to My Workouts (the original standalone list) and create an unrelated workout there as before — in `workouts`, confirm that row's `programme_week_id` is `null`, proving the two flows coexist without interfering.
7. Back on the programme screen, confirm Week 2's card now reads "1 session" and the others still read "0 sessions."

## Template library and duplicate

No new database tables — this reuses the programme structure from last chunk and just adds one new operation on top of it.

**The template library is the same programme list from before, reframed.** Since programmes aren't tied to any client yet, every one you've built already IS a template — so rather than build a second, separate "templates" screen showing the same data, the coach's "My Programmes" screen is now called Template Library, and each card shows name, goal type, duration, and how many weeks have actually been built into it (which can be more than the original duration, if you've tapped "+ Add week" since).

**Duplicate makes a real, independent copy — not a shortcut to the same rows.** Tapping "Duplicate" on a template walks the whole structure underneath it — the programme itself, every week, every session (workout) inside each week, and every exercise inside each session — and inserts a brand new row for each one. The copy doesn't reference a single row from the original; it just happens to start out with the same values. That's the whole point: this is the exact copying logic that assigning a programme to a client will reuse next chunk — giving a client "their own" programme has always meant giving them a genuine copy, not a shared pointer back to your master template, so proving this mechanism is clean now means assignment can just call the same function.

The new copy is named "`<original name>` (Copy)" and you're taken straight to it — tap the title there to rename it (this is also the first place you can rename a programme at all, added specifically so you can carry out the verification below).

If copying fails partway through (a network hiccup mid-copy, say), the half-made copy is deleted rather than left behind as a broken, incomplete duplicate — the original is never touched either way, since duplicating only ever reads from it, never writes to it.

**Verify the duplicate is a genuine independent copy:**

1. Open a template in the Template Library that already has at least one week with a session in it (if you don't have one, build one first — a 2-week programme with one session in Week 1 is enough).
2. Note the original's exact name, and its Week 1 session's name and exercise(s).
3. Back in Template Library, tap "Duplicate" on it. You're taken to the copy — its name should read "`<original>` (Copy)".
4. Tap the copy's title, rename it to something clearly different (e.g. "TEST COPY"), and Save.
5. In Supabase's Table Editor, open `programme_blocks` — confirm there are now **two** separate rows: the original still showing its original, unrenamed name, and a second row with the id from the copy's URL showing "TEST COPY". Two different ids, two different names — not one row that got edited.
6. Open `programme_weeks`, filtered to the copy's programme id — confirm it has its own week rows with their own ids, distinct from the original's week ids (check the original's weeks are still there too, under the original's id).
7. Open `workouts`, filtered to the copy's Week 1 id — confirm a session row exists there with its own id (not the original session's id) and the same name you saw in step 2.
8. Go back into the app and open the **original** template again — confirm its name is still exactly what it was in step 2, and its Week 1 session is still there, unchanged, with its exercises intact.
9. For the strongest proof: in Supabase's Table Editor, edit the copy's session name (or one of its exercises) directly — there's no in-app rename for sessions yet — then reload the original template in the app. It should show no trace of that change, since the copy's session row and the original's session row have always been two separate rows.

## Assigning a programme to a client

Run `supabase/assign-programme.sql` in the SQL Editor after `programmes.sql`.

This is the payoff for the last two chunks: a coach can now take a template and actually put it to work for a real client, with real dates.

**No new "schedule" system was built.** Every feature that already reads a client's schedule — Home's Up Next, the missed-workout auto-reschedule, Momentum Score's workout-completion rate, and streaks — reads from the same `assignments` table it always has, and none of them care whether a `workouts` row came from a standalone workout or a programme session. So assigning a programme does exactly two things: it duplicates the template (the exact same independent-copy logic proven last chunk) into a copy owned by that client, and it inserts one ordinary `assignments` row per session, with a calculated date. That's it — no other file changed. The moment those rows exist, Up Next shows them, the reschedule check picks up any that go overdue, Momentum Score counts them toward the week's workout rate, and completing one counts toward the streak, all automatically.

**One column was added:** `programme_blocks.client_id`, nullable. `NULL` means template (shows in the Template Library); set means "this is one client's own copy." The Template Library now only lists templates — a client's assigned copy is hidden from it, so it can't accidentally get duplicated or reassigned as if it were reusable.

**How the dates are calculated:** the coach picks a start date. Week 1 is the 7-day span starting exactly on that date — not the calendar Monday, whatever weekday the start date happens to be. Within that 7-day span, each of the programme's scheduled training days gets mapped to its actual calendar date, and the week's sessions (in the order they were built) are handed out to those dates in chronological order. Week 2 is the next 7-day span, and so on. A day that's scheduled but has no session that week is simply skipped — nothing forces every training day to have a session.

**Two things block an assignment outright, before anything is written:** the template must have at least one training day set (there's no way to add one after the fact yet — a known gap, flagged rather than silently worked around), and no single week may have more sessions than there are training days to put them on. Either failure means nothing gets written at all — no half-assigned programme.

**Verify the dates calculated correctly** (a worked example you can reproduce exactly):

1. Build (or duplicate) a template with training days set to Mon/Wed/Fri, and put exactly one session in each of Week 1, 2, and 3 (three sessions total, one per week — keeps this test simple).
2. From the Template Library, tap Assign. Pick a client, and set the start date to `2026-09-03` (a Thursday) — or, if you're reading this after that date, pick any Thursday and adjust the expected dates below by the same offset.
3. Confirm. You should land on Assignments, showing three new rows for that client.
4. Check the exact dates against this table (Week 1 starts the moment the plan begins, so its session lands the very next scheduled day — not before, and not on the start date itself unless the start date happens to be a scheduled day):

   | Week | Expected date |
   |------|---------------|
   | 1    | 2026-09-04 (Fri) |
   | 2    | 2026-09-11 (Fri) |
   | 3    | 2026-09-18 (Fri) |

   (With only one session per week, it always lands on the *earliest* scheduled day inside that week's 7-day span — here, Friday comes before the following Monday and Wednesday once you count forward from a Thursday start.)
5. For the multi-session case: put all three training days' worth of sessions into Week 1 alone (3 sessions, Mon/Wed/Fri all used), assign again with the same Thursday start date, and confirm the three resulting dates are exactly `2026-09-04`, `2026-09-07`, `2026-09-09` — in that order, matching the order you built the sessions in.
6. Try assigning a template with an empty week (a week with zero sessions in the middle of the programme) — confirm no `assignments` row gets created for that week, but the other weeks' dates are still correct.
7. Try assigning a template that has 4 sessions crammed into one week but only 2 training days set — confirm the app refuses with a clear error naming that week, and check in Supabase that no `programme_blocks`, `programme_weeks`, `workouts`, or `assignments` rows were created for that attempt at all.

**Verify the client's copy is genuinely independent** (same method as last chunk's duplicate check, now applied to an assigned instance):

1. After assigning, open `programme_blocks` in Supabase and find the new row — confirm its `client_id` matches the client you picked, and its `id` is different from the template's `id`.
2. Edit one of the copy's session names or exercises directly in Supabase, then reopen the original template in the Template Library — confirm it shows no trace of that change.
3. Confirm the copy does **not** appear in the Template Library list (only the original does) — proving assigned instances stay out of the reusable-template pool.

**Verify it plugs into the existing systems, not a separate one:**

1. As that client, open the Home tab — the assigned sessions should appear under Up Next, sorted by date, indistinguishable from a standalone assignment.
2. Backdate one of the assigned sessions via SQL (same technique as the auto-reschedule verification) and reopen Home — confirm it gets picked up and moved by the missed-workout reschedule exactly like before.
3. Complete one of the assigned sessions and check Momentum Score and the streak both move — proving neither needed to know the workout came from a programme.

## Client's Training tab: Your Programme

Run `supabase/client-programme-view.sql` in the SQL Editor after `assign-programme.sql`.

**The Home dashboard needed no changes at all — and that's the point.** Up Next, the missed-workout auto-reschedule, Momentum Score's workout rate, and streaks were all built, from the very first chunk that touched them, to read from the `assignments` table without caring where a `workouts` row came from. A programme-assigned session is just another row in `assignments` with a `workout_id`, a date, and a status — indistinguishable to any of those four from a standalone one. So "pull from programme-based session data" already happened automatically, the moment last chunk started inserting real `assignments` rows for programme sessions. There is nothing to regress, because there's no second code path that could have drifted out of sync with the first. The verification steps below prove this rather than just asserting it.

**What's actually new this chunk** is a read-only view of that same data, framed as a programme: a "Your Programme" card at the top of the client's Training tab, built from `programme_blocks` + `programme_weeks` (which a client couldn't read at all before this — this chunk adds that access, read-only) plus the exact same `assignments` rows Home already uses.

**The week counter** works out how many whole 7-day periods have passed since the programme's start date and adds 1 — the same "Week 1 starts exactly on the start date" math used to calculate the session dates when assigning. It's clamped between 1 and the programme's declared duration, so it never reads "Week 9/6" once a plan runs long, and it shows "Starts `<date>`" instead of a week number if the start date hasn't arrived yet.

**A real interaction worth knowing about, not a bug:** if a programme session's date passes while it's still pending, the missed-workout auto-reschedule (from several chunks ago) will move it forward the next time the client opens the app — exactly like a standalone assignment, because as far as that feature is concerned, it *is* a standalone assignment. That's correct, but it does mean a programme session you leave incomplete past its date won't sit there forever for you to inspect — it'll relocate. Keep that in mind when setting up the verification below: use a start date that doesn't leave anything overdue if you want the programme card's numbers to hold still while you check them.

**Verify the card's current-week display, cleanly (no overdue interactions):**

1. Build a template: 6-week duration, training days Mon + Thu, with one session in Week 1, two sessions in Week 2 (one for Monday, one for Thursday), and one session in Week 3.
2. Assign it to a test client with **today's date** as the start date. Since nothing is dated before today yet, nothing can go overdue during this check.
3. Log in as that client, open the Training tab. Confirm: the card shows "Week 1/6", the goal type and description match the template, and the 7-day row shows 7 dots (no checkmarks yet).
4. Confirm "Next Workout" shows the Week 1 session, and tapping Start opens the same logging screen used everywhere else (`/assigned/[id]`).
5. Mark that session complete. Reload Training — confirm its day in the row now shows a checkmark, "0/1" became "1/1 sessions completed this week" (Week 1 only has one session), and "Last completed" now shows that session's name and today's date.
6. In Supabase, check `assignments` for this client — confirm the row you just completed has `status = 'completed'` and its `assigned_date` is unchanged (completing a session never moves its date).

**Verify the week counter's math specifically** (isolated from the rest of the card, since genuinely waiting a week isn't practical):

1. Using the same assigned programme, find its `programme_blocks` row in Supabase and note its `id`.
2. Run: `update programme_blocks set start_date = start_date - interval '7 days' where id = 'PASTE_ID';` — this only moves the display's reference point, not any session's actual `assigned_date`, so the day-progress row will look temporarily out of step with reality. That's expected for this one check.
3. Reload Training — confirm the badge now reads "Week 2/6" (one full week further along than before).
4. Run it again (`- interval '7 days'` a second time) — confirm it advances to "Week 3/6".
5. Set it forward by 42+ days total (`interval '50 days'`, say) — confirm it clamps at "Week 6/6" rather than reading "Week 8/6" or similar.
6. Restore it: `update programme_blocks set start_date = start_date + interval '<however many days you subtracted>' where id = 'PASTE_ID';` so the card goes back to matching its real session dates before you continue testing anything else with it.

**Verify Home's numbers are still correct with programme data flowing through them:**

1. Using the client from the steps above (who's already completed one programme session today), open their Home tab.
2. Up Next: confirm the session you completed is gone from the pending list, and the Week 2 sessions (still pending) appear there instead.
3. Momentum Score: by hand, using the same recipe as the "Real Momentum Score" section above — count this week's scheduled assignments and completed ones (the one you just finished counts), and confirm the score matches your hand calculation. It should, because Momentum Score has never distinguished a programme session from a standalone one.
4. Streak: confirm today shows as an active day (🔥 shows at least 1), since a completed assignment is a completed assignment regardless of source.
5. As a final cross-check, add one unrelated **standalone** assignment (via the coach's old Assignments → New flow, not a programme) for the same client, dated today, and mark it complete too — confirm Momentum Score and the streak both still read correctly with a mix of standalone and programme-sourced completions in the same day. That's the real proof there's no separate, parallel accounting happening anywhere.

## Exercise Library (one-time data import)

Run `supabase/exercise-library.sql` in the SQL Editor after `client-programme-view.sql`. **Read this whole section before running it** — it behaves differently from every other file in this folder, and there's a real gap in the source data worth knowing about before you look for something that isn't there.

**What "one-time import" actually means here.** Every other `.sql` file in this project only ever contains schema and security rules — `create table`, `create policy`. This one *also* contains the actual exercise data, baked in as one big `insert` statement: 872 rows, generated once from a real dataset and pasted directly into the file. There's no code in the app that talks to GitHub, and no live connection to anything external — once you run this file, the data lives in your database exactly like anything else, and the app just reads it with a normal query. If the upstream dataset gets better data later, refreshing it would mean regenerating this file and running it again (safe to re-run — see below) — it would never involve the app fetching anything live.

**Where the data came from.** The [exercemus/exercises](https://github.com/exercemus/exercises) project on GitHub aggregates two open exercise datasets: wger.de's (Creative Commons Attribution-ShareAlike — reuse requires crediting the source and sharing under the same license) and wrkout/exercises.json (public domain, no restrictions). I pulled the current snapshot (872 exercises), transformed it into SQL with a one-off script, and it's baked into this file. Every row carries an `attribution` value — the specific submitter/license when the dataset actually recorded one (rare — only 1 of 872 rows has that level of detail), and a general "aggregated by exercemus/exercises, combining wger.de (CC BY-SA) and wrkout (public domain)" credit otherwise. Given how CC-BY-SA works, crediting every row this way rather than guessing which license applies per-exercise is the safe default.

**The real gap: no images.** The dataset's schema has an `images` field, and the exercemus project's own website does show exercise images — but the actual data file in the repository has that field empty for all 872 exercises; the images are generated separately for their site, not included in this data. So `image_url` is `NULL` on every row. The column exists and is ready for a URL the moment you have one (per exercise, added by hand, or a future proper image source) — but there was nothing genuine to import here, and I'd rather leave it honestly empty than put in a placeholder that looks like real data. `video_url` fared a little better — 24 of 872 exercises have a YouTube link — those did import.

**What actually got imported, per exercise:** name, category (strength/stretching/plyometrics/etc.), a `muscle_group` (arms/back/calves/chest/core/legs/shoulders — derived at import time from the exercise's primary muscle, since the raw data only lists specific muscles like "lats" or "quads", not a coarse group), the full primary/secondary muscle lists, equipment needed, step-by-step instructions, and a description where the source had one (only 42 of 872 do — most don't, and that's fine, it's shown only when present).

**The browse screen — Home → Exercise Library (coach only for now).** Search by name, filter by muscle group with the chip row, tap any result to expand it in place and see the full instructions and attribution without leaving the list. All 872 lightweight rows (name/group/category/equipment) are fetched once when the screen opens rather than re-queried per keystroke — instructions and the rest are only fetched the moment you actually expand a card, so the initial load stays small. This is a browsing tool only: nothing here assigns an exercise to a workout yet, and no app code ever writes to this table — that's next chunk.

**Verify the import is correct and complete:**

1. In Supabase's Table Editor, open `exercise_library` and check the row count reads **872**.
2. Run `select muscle_group, count(*) from exercise_library group by muscle_group order by 2 desc;` — confirm it returns exactly these seven groups with these counts: legs 270, arms 147, shoulders 127, back 122, core 93, chest 85, calves 28. No `NULL` or "other" group should appear — every exercise in this dataset maps cleanly onto one of the seven.
3. Run `select count(*) from exercise_library where image_url is not null;` — confirm this returns **0**, matching the "no images in this dataset" note above. If it ever returns non-zero after you add real images by hand later, that's expected and correct.
4. Run `select count(*) from exercise_library where video_url is not null;` — confirm this returns **24**.
5. Pick a specific exercise you recognize (e.g. "Farmer's Walk" or "3/4 Sit-Up") and confirm in the Table Editor that its `instructions` array actually contains real step text, not placeholders, and that `attribution` is populated (never blank or null).
6. In the app, open Exercise Library as a coach: search "curl" and confirm only curl variations show; clear the search and tap "Legs" and confirm every result's badge reads "Legs"; tap one result to expand it and confirm the instructions shown match what you saw in Supabase for that same exercise in step 5.
7. Re-run `exercise-library.sql` a second time (paste and run again) — confirm the row count in `exercise_library` is still exactly 872 afterward, not 1744. The `on conflict (name) do nothing` at the end of the insert is what makes this safe to re-run without creating duplicates.

## Workout builder: real exercise selection

Run `supabase/link-exercise-library.sql` in the SQL Editor after `exercise-library.sql`.

Up to now, adding an exercise to a workout meant typing its name freehand — no connection to anything, just text. This chunk replaces that with search-and-select against the Exercise Library imported last chunk. Since `/workouts/new` is the one shared screen for both standalone workouts and programme-week sessions, this one change covers both places a coach builds a session.

**How it works now:** typing in the exercise field searches the ~870-exercise library (fetched once when the screen opens, filtered locally as you type — same approach as the library's own browse screen) and shows up to 8 matches with their muscle group. Tapping one locks it in — the field switches to showing the picked name with a "Change" link instead of an open text box. Sets/reps stays exactly the free-text field it always was.

**What actually gets saved:** a new column, `workout_exercises.exercise_library_id`, is set to the picked exercise's real id — but `name` also gets that exercise's name copied into it at save time, exactly as if it had been typed. That second part is the whole reason nothing else needed to change.

**Why old workouts need zero migration, and you can verify this yourself:** every screen that ever displays an exercise — the coach's own workout list, `assigned/[id]` where a client logs a session, the coach's assignment detail view, the programme week screen — reads `workout_exercises.name` and nothing else. That column is completely untouched by this chunk. An exercise typed in before today has `name` set to whatever was typed and `exercise_library_id` as `NULL` forever; an exercise picked from the library today has `name` set to the library's name and `exercise_library_id` pointing at a real row. Both look and behave identically everywhere that isn't the builder itself, because the one thing every display query actually reads was never touched.

**Verify new workout creation:**

1. Open My Workouts → + New (or add a session inside a programme week — same screen either way). Type part of an exercise name, e.g. "curl" — confirm a dropdown of matches appears, each showing a muscle group.
2. Pick one. Confirm the field switches to a locked-in display of that exact name with a "Change" link, and typing is no longer possible there.
3. Tap "Change" — confirm it reopens the search box, clearing the previous pick.
4. Re-select the same exercise, fill in sets/reps, save the workout.
5. In Supabase's Table Editor, find the new row in `workout_exercises` — confirm `exercise_library_id` is a real (non-null) uuid, and that it matches the `id` of that same exercise's row in `exercise_library`.
6. Try to save a workout with zero exercises selected (search but never pick one) — confirm it's blocked with "Add at least one exercise from the library," and that no row gets left behind in `workouts` for that attempt.

**Verify old workouts are unaffected** (exercise names only actually render on an assignment detail screen — not on My Workouts, which just shows a count — so this check goes through assigning):

1. Pick a workout you built before this chunk (free-text exercises, predating today) — if you don't have one handy, any workout used in earlier verification steps qualifies.
2. In Supabase, confirm its `workout_exercises` rows have `exercise_library_id = NULL` and their original `name` values untouched.
3. Assign that workout to a test client (Assignments → New, or it may already be assigned from earlier testing), then view it as the coach (Assignments → tap it) or as that client (`assigned/[id]`) — confirm every exercise name shows exactly as it always did, with no error, blank field, or "unknown exercise" placeholder.
4. As a final cross-check, assign a newly-built (library-linked) workout too, and compare the two assignment detail views side by side — both should render exercise names identically, even though only the new one has a real `exercise_library_id` behind it.

## Real nutrition data: Open Food Facts (superseded for typed search — see next section)

Run `supabase/food-log-macros.sql` in the SQL Editor after `link-exercise-library.sql`.

**Update, two chunks later:** Open Food Facts turned out to be weak on generic whole foods ("chicken breast," "rice") since it's built for barcoded packaged products. Typed search now goes through USDA FoodData Central instead — see "Typed food search: USDA FoodData Central" below. Open Food Facts is back in active use, though — barcode scanning (see "Barcode scanning" further below) calls `src/lib/open-food-facts.ts`'s barcode-lookup function directly, which is exactly what this source is actually good at. Everything below describes what was true when Open Food Facts also handled typed search — the general concepts (live query, snapshot storage, per-100g, old-entry handling) still apply identically to both the USDA search integration and the barcode lookup that both replaced and reused this file.

This replaced the old "type a food name, type a calorie number" flow with a live search against [Open Food Facts](https://world.openfoodfacts.org) — a public, open food database. No API key, no account, no setup: `src/lib/open-food-facts.ts` just calls their search endpoint directly from the app.

**Live query, snapshot storage — the important distinction.** Every search is a real, live network call, made fresh each time — nothing from Open Food Facts is ever cached or stored ahead of time (unlike the Exercise Library, which really was a one-time import). But the moment a client taps a result to log it, its calories/protein/carbs/fat get copied as plain numbers into that `food_logs` row and saved. From that point on, the app never looks the food up again — if Open Food Facts later corrects that product's data, or the product listing disappears entirely, the log entry a client already saved stays exactly as it was the day they logged it. That's what "snapshot, not a live reference" means in practice: one network call at the moment of logging, and zero afterward.

**Why everything is "per 100g."** Open Food Facts records nutrition per 100g for virtually every product; per-serving data exists but is inconsistent (serving sizes are free text like "30g (1 slice)" and not reliably parseable across brands). Rather than build a serving-size/quantity picker — real scope beyond what was asked, and its own source of bugs given how messy that data is — search results are simply labeled "per 100g" throughout, and a client logging "1 chicken breast" was really logging "100g of chicken breast" under the hood. **Update, a few chunks later:** a plain grams-quantity field was added — see "Logging a real quantity, not just '100g'" further below — so saved entries now scale from this per-100g reference to whatever amount was actually eaten, rather than always assuming 100g.

**What happens to entries logged before this chunk:** their `protein`/`carbs`/`fat` columns are `NULL`, not `0` — they genuinely have no macro data on record, and showing "0g protein" would incorrectly claim the food had none. The daily macro totals only add up entries that actually have a number for that macro; an old calorie-only entry still counts toward the calorie total (unchanged), just contributes nothing to the protein/carbs/fat totals, which is the honest answer.

**How the search actually works:** typing in the "Add to [meal]" search box debounces for 400ms before firing (so it's one request per pause in typing, not one per keystroke), calls Open Food Facts' `cgi/search.pl` endpoint, and shows up to 20 matches with their calories per 100g. Tapping one shows its full macro breakdown and locks it in with a "Log this" button; "← Search again" backs out without losing your place.

**Verify the search actually works:**

1. Open Nutrition → tap "+ Add" on any meal. Search "banana" — confirm real results appear within about a second (after the debounce), each showing a plausible calories-per-100g figure (bananas should land somewhere around 90 cal/100g, not 0 or an absurd number).
2. Search something with no realistic matches, e.g. "zzzxqq123" — confirm "No matches found." appears rather than an error or a frozen spinner.
3. Turn off your device/Codespace's network mid-search (or search something while offline) — confirm a clear error message appears rather than a silent failure.
4. Tap a result — confirm its full per-100g breakdown (calories, protein, carbs, fat) displays before you save anything, so you can sanity-check it against what you'd expect for that food.

**Verify the macros are captured correctly, as a permanent snapshot:**

1. Pick a search result, note its exact displayed macros (e.g. "165 cal · 31g protein · 3.6g carbs · 3.6g fat" for raw chicken breast), and tap "Log this."
2. In Supabase's Table Editor, find that new row in `food_logs` — confirm `calories`, `protein`, `carbs`, and `fat` match what you saw on screen (protein/carbs/fat may be rounded to one decimal in the app; the stored values should match to that precision), and `source` reads `open_food_facts` with a `source_id` populated.
3. Back in the app, confirm the entry now shows under its meal with the same macro breakdown in the summary line (e.g. "165 cal · 31g protein · 3.6g carbs · 3.6g fat").
4. Confirm the day's macro totals (Protein/Carbs/Fat, under the calorie hero number) increased by exactly that entry's numbers.
5. The permanence check: note the `source_id` you just saved, then in the app search for and log a *different* food entirely — confirm the first entry's numbers in Supabase are completely unchanged. There's no live link back to Open Food Facts to accidentally refresh or overwrite it.
6. Check an entry logged before this chunk (if you have one) — confirm `protein`/`carbs`/`fat` show as `NULL` in Supabase, and that the day's macro totals still correctly exclude it from protein/carbs/fat while still including its calories.

## Typed food search: USDA FoodData Central

No new SQL — `food_logs.source`/`source_id` already existed from the previous chunk; this just writes `usda_fdc` into them instead of `open_food_facts`.

**Why this exists:** Open Food Facts is crowdsourced from packaged product labels — great for "Kellogg's Corn Flakes," weak on "chicken breast" or "rice," because nobody scans a raw chicken breast's barcode. USDA FoodData Central is the opposite: U.S. government lab-analyzed and dietary-survey data, built specifically to answer "what's in a plain, generic food" — exactly the gap Open Food Facts had. Typed search (the only kind of food search this app has ever had) now goes there instead. Open Food Facts itself is untouched, just no longer wired into the search box — it's the right tool for a barcode-scan feature if one gets built later, since barcode is its whole reason for being.

**Getting the free key, one time:** sign up at [fdc.nal.usda.gov/api-key-signup](https://fdc.nal.usda.gov/api-key-signup) (name + email, no payment) — the key arrives by email within a few minutes. Add it to `.env` as `EXPO_PUBLIC_USDA_FDC_API_KEY=...` (see `.env.example`) and restart the dev server. Same "safe to embed" reasoning as the Supabase keys: this isn't a secret, it just lifts USDA's shared-anonymous rate limit from 30 requests/hour to 1,000/hour.

**Which USDA data gets searched, and why:** USDA FoodData Central has several data types. This app searches only `Foundation`, `SR Legacy`, and `Survey (FNDDS)` — lab-analyzed reference foods and the "as eaten" everyday items people actually search for (e.g. "chicken, breast, meat only, cooked, roasted"). It deliberately excludes `Branded` (USDA's own packaged-product data) — that's exactly what Open Food Facts already covers, and mixing it in would bring back the same noisy, incomplete-entry problem this change exists to avoid.

**Same snapshot rules as before, same "per 100g" convention.** Nothing about how the data gets saved changed — a search result's calories/protein/carbs/fat are copied into `food_logs` the moment it's picked, never re-fetched afterward, and USDA's `foodNutrients` values are per-100g just like Open Food Facts', so the two sources stay directly comparable and no serving-size math had to change.

**A note on the two "Energy" entries USDA returns.** Most USDA foods list separate energy figures in kcal and kJ as two different entries in the same food's nutrient list. The search code specifically matches the one with `unitName` of `kcal` — picking the wrong one would silently save a calorie count roughly 4× too high (1 kcal ≈ 4.18 kJ).

**Verify chicken breast, rice, and other generic foods now return real results:**

1. Search "chicken breast" — confirm real entries appear (e.g. "Chicken, broilers or fryers, breast, meat only, cooked, roasted"), each with a calories-per-100g figure in a sensible range (roughly 150–170 cal/100g for cooked, skinless chicken breast — not 0, not four digits).
2. Search "rice" — confirm real entries appear (e.g. "Rice, white, long-grain, cooked"), roughly 120–150 cal/100g for cooked white rice.
3. Search "apple" and "egg" — confirm both return sensible, real results too (apple: roughly 50–55 cal/100g; whole egg: roughly 140–150 cal/100g).
4. Pick one result, confirm its protein/carbs/fat all show non-zero, plausible values for that food (a cooked chicken breast should show high protein, near-zero carbs).
5. Log it, then check that row in `food_logs` — confirm `source` reads `usda_fdc` and `source_id` holds a numeric FDC id, and that the saved macros match what was shown on screen.
6. As a sanity check against the old source: search the same food (e.g. "chicken breast") and compare mentally to what Open Food Facts used to return for it — USDA's results should be visibly more relevant and complete for these generic terms.
7. Remove or misspell the API key in `.env` temporarily, restart the dev server, and search anything — confirm a clear "USDA FoodData Central rejected the API key" message appears rather than a silent failure or crash, then restore the real key.

## Barcode scanning

No new SQL, no new environment variable — this reuses `food_logs.source`/`source_id` from two chunks ago (now able to record `open_food_facts` again) and Open Food Facts' existing `searchFoods`-adjacent module, just calling a different endpoint on it.

**This is the app's first use of the device camera**, via `expo-camera` (added as a dependency this chunk, with its config plugin registered in `app.json`). One real environment quirk worth knowing: passing a custom permission-message option to that plugin (e.g. `{ cameraPermission: "..." }`) triggers a bug in this Expo SDK 57 setup's plugin-resolution step that breaks `expo export` entirely with an unrelated-looking "package.json does not exist" error. The fix was to list the plugin bare (`"expo-camera"`, no options object) — which means the camera permission prompt uses Expo's default wording ("Allow Primal-Physique to access your camera") instead of custom copy mentioning barcodes specifically. Functionally identical, just a slightly more generic permission prompt; not worth chasing further since it works correctly.

**How scanning connects to everything already built:** tapping "📷 Scan a barcode instead" inside the same "Add to [meal]" modal used for search asks for camera permission (only if not already granted), then shows a live camera preview. The moment a barcode is decoded, the preview stops and the app calls Open Food Facts' actual barcode-lookup endpoint (`/api/v2/product/{barcode}.json`) — a single direct lookup, not a search, which is the thing Open Food Facts has always been strong at (every product there is keyed by barcode; that was never the part that was broken). From there, it's the exact same flow as a typed search result: macros shown, "Log this" saves the same kind of snapshot to `food_logs`, just with `source = open_food_facts` instead of `usda_fdc` — the two sources sit side by side in the same table, distinguished only by that column.

**If the barcode isn't found:** the app doesn't dead-end — it drops back to the search screen (not another camera prompt) with a plain message: "Barcode `<code>` wasn't found in Open Food Facts — try searching instead," and the USDA search box is right there to use immediately.

**Why this needs a real device, not just the web preview:** barcode scanning works through a real camera pointed at a real physical barcode — the Codespace web preview can technically request webcam access, but there's nothing to physically scan through a laptop webcam pointed at a screen or across a room. Test this on your phone via Expo Go (scan the QR code from `npx expo start`) for it to mean anything.

**Verify it against real packaged products:**

1. On your phone, open the app in Expo Go, go to Nutrition → "+ Add" on any meal → "📷 Scan a barcode instead." Grant camera access when prompted (first time only).
2. Pick a real packaged food from your kitchen with a barcode — a cereal box, a can, a protein bar wrapper. Point the camera steadily at the barcode until it's decoded (should take a second or two).
3. Confirm the app shows that exact product's name and a full per-100g macro breakdown, not a different product and not blank fields.
4. Tap "Log this," then check `food_logs` in Supabase — confirm `source` reads `open_food_facts`, `source_id` matches the barcode printed on the package (check the numbers under the actual barcode lines on the box), and the macros match what's on the product's own nutrition label (per-100g row, not per-serving — compare against the "per 100g" column if the label has one, since US labels are often per-serving only and won't match directly).
5. Try a second, different product the same way — confirm it doesn't reuse the first product's data (a real, independent lookup each time).
6. Try scanning something with no barcode data in Open Food Facts — an unusual or very new product is most likely to actually miss; a generic pantry staple usually won't, since OFF's whole strength is barcoded packaged goods. Confirm you get the "wasn't found... try searching instead" message, not a crash or a dead end, and that the search box is immediately usable right there.
7. Deny camera permission (or check in your phone's Settings after denying once) and confirm the app shows a clear message about needing camera access rather than a blank camera view or a crash.

## Logging a real quantity, not just "100g"

Run `supabase/food-log-quantity.sql` (order relative to the barcode-scanning migration doesn't matter — it only touches `food_logs`).

Up to now, every logged food was silently treated as exactly 100g, because that's the unit both USDA and Open Food Facts report nutrition in. This chunk adds an actual quantity — a plain grams field, not an attempt to parse serving-size label text — and scales the macros to match.

**What changed semantically:** before this chunk, `food_logs.calories/protein/carbs/fat` were really per-100g reference figures that happened to double as the logged amount. From now on, those columns hold the *actual* amount for whatever quantity was entered — a real food log, not a nutrition-label lookup. The per-100g numbers a search result or barcode scan shows are still just the source data; the math (`per_100g × quantity ÷ 100`) happens once, at the moment of saving, and the result is what's stored. Nothing about "snapshot, not a live reference" changes — this is still one calculation at save time, never redone later.

**Why grams typed by hand, not a serving-size picker.** Serving sizes on real packaging are inconsistent free text ("30g (1 slice)," "1 cup (240mL)," "2 cookies") that doesn't parse reliably across products or sources — building a picker around that data would be a source of bugs, not a solution to one. A plain "how many grams" field is simple, always available regardless of source, and accurate as long as the client actually knows (or estimates) the weight — which is realistically how any careful macro-tracking already works anyway.

**Old entries:** `quantity_grams` was backfilled to `100` for every row that existed before this chunk — not a guess, since every one of those entries genuinely was logged assuming exactly 100g at the time. Their calorie/macro numbers don't change; they're now correctly labeled as "100g" instead of being unlabeled.

**Verify the math is correct:**

1. Search or scan any food, note its exact "Per 100g" figures shown (e.g. "165 cal · 31g protein · 0g carbs · 3.6g fat" for cooked chicken breast).
2. Change the quantity field to something other than 100 — say `150` — and confirm the "For 150g: ..." line updates live, before you save anything, to `165 × 1.5 = 247.5` → rounds to 248 cal, `31 × 1.5 = 46.5g` protein, and so on for carbs/fat, each scaled by the same 1.5×.
3. Try a non-round quantity like `73` grams — confirm the math still scales correctly (`165 × 0.73 ≈ 120` cal), not just for tidy multiples.
4. Enter `0`, a negative number, or leave it blank — confirm "Log this" is disabled and/or a clear "Enter the quantity as a number of grams greater than 0" message appears, rather than silently saving garbage.
5. Save the 150g entry, then check that row in `food_logs` — confirm `quantity_grams = 150` and the calorie/macro columns match the scaled figures from step 2 exactly (to rounding), not the raw per-100g source values.
6. In the app, confirm that entry's line under its meal now reads like "150g · 248 cal · 46.5g protein · ...", and that the day's calorie/macro totals reflect the scaled amount, not 100g's worth.
7. Check an entry logged before this chunk — confirm it now shows "100g" in front of its existing numbers, and that nothing about those numbers changed.

## Macro rings on the Nutrition tab

Adds `react-native-svg` as a dependency. No SQL, no schema change — purely a display change on top of the same daily totals that were already being computed.

**What changed:** the plain "127g / Protein" text row under the Calories Today hero is now three small ring/donut graphics — one each for Protein, Carbs, and Fat — matching a reference design the user shared. The calorie hero itself is untouched, still the same big teal card with a plain number.

**What the rings actually represent — a deliberate reinterpretation, not a literal copy of the reference.** The reference image's rings show progress toward a personal macro *target* (e.g. "229/230g protein," "+29g over"). This app has no macro-target feature — there's nowhere a client or coach sets a daily protein/carb/fat goal. Rather than fabricate a fake target just to make the ring fill to something, each ring instead fills to show that macro's **share of today's total calories**: its grams converted to calories (protein and carbs at 4 cal/g, fat at 9 cal/g) divided by the day's actual total calories. A protein ring at roughly a third full means protein accounted for about a third of today's calories — a real, honest number from what's actually logged, just a different question than "vs. your goal." Worth a real follow-up if you want true target-based rings — that would mean building an actual macro-goals feature first (something to set and store a daily target), which is a bigger, separate piece of work.

**Why one accent color for all three rings, not the reference image's yellow/red/cyan.** The brand rules for this app reserve oxblood for buttons and active states only, and teal-bright for small accents only, never a large fill — a rainbow of arbitrary ring colors would break both rules at once. All three rings use the same thin teal-bright arc on a dark track — the exact same color pairing `HeroStat`'s own linear progress bar already uses elsewhere in the app — so this reads as the same visual language, not a new one. The three macros are told apart by their label and number, not by color.

**Verify it renders correctly:**

1. Open the Nutrition tab as a client with at least one food entry logged today. Confirm the Calories Today hero card still looks exactly as it did before (big number, teal card, no ring around it).
2. Below it, confirm three small rings appear side by side, each showing a gram number in the center and a label (Protein/Carbs/Fat) underneath.
3. Hand-check one ring's fill: note the day's total calories and one macro's grams, compute `(grams × 4, or × 9 for fat) ÷ total calories`, and confirm that ring's arc is filled to roughly that fraction of the full circle (e.g. ~33% filled ≈ a third of the way around).
4. Log a food that's almost pure fat (e.g. plain oil or butter, if available in a search) and confirm the Fat ring visibly fills up more than before, while Protein/Carbs shrink proportionally — the three rings should visibly respond to real changes in what's logged.
5. With zero entries logged today, confirm the ring row doesn't render at all (same "nothing to show yet" behavior the old text row had), rather than showing three empty or broken rings.

## Smoothed weight trend (the foundation for Adaptive TDEE)

Run `supabase/weight-trend.sql` in the SQL Editor after `food-log-quantity.sql` (order relative to the other food_logs files doesn't matter — this one only touches `weight_logs`).

**The problem this solves:** a single day's scale weight is noisy — water, sodium, food volume, hormones all move it several pounds in either direction with zero relation to actual fat loss or gain. `weight_trend` is a smoothed line that reacts slowly to any one reading, so it tracks real change instead of daily noise. This is the exact foundation Adaptive TDEE will read from later — nothing about that is built yet, this chunk is purely the trend calculation itself.

**The formula, exactly as specified:** `trend_today = (0.15 × raw_weight_today) + (0.85 × trend_yesterday)`. Two rules fill the gaps the formula alone doesn't cover, both confirmed by hand before any code was written:

- **The very first weigh-in a client ever logs seeds the trend** — `trend = raw weight`, since there's no prior trend to blend with yet.
- **A day with no weigh-in doesn't get a trend value computed for it at all** — there's no row in `weight_logs` for that day (same as it's always worked), so there's nothing to store. The client's next real weigh-in just uses whatever trend was last computed, however many days ago that was. A 1-day gap and a 5-day gap behave identically — the gap length itself never enters the math.

**Where it's computed:** `saveWeightLog()` looks up the most recent `weight_trend` from strictly before the date being logged (not today's own row, so re-saving today's weight twice doesn't chain off itself), applies the formula, and saves both `weight` and `weight_trend` together. Existing history got a one-time backfill in the same migration, using a recursive SQL query that walks each client's log history in date order applying the identical rule.

**The chart:** the Progress tab now shows actual weight (teal) and the smoothed trend (oxblood/red) on the same line chart, once at least 2 entries exist. Points are spaced by real elapsed time — a week-long gap between weigh-ins visibly takes up more horizontal space than two weigh-ins a day apart, rather than pretending every gap is equal. Each history row below the chart also now shows both numbers side by side.

**Verify the stored values match the hand calculation:**

1. Pick a test client and, via Supabase's SQL Editor, insert a clean run of backdated weight_logs rows matching the hand-worked example from the design step (adjust dates to whatever's recent, skip one date in the middle to simulate the gap):
   ```sql
   insert into weight_logs (client_id, log_date, weight) values
     ('PASTE_CLIENT_ID', current_date - 9, 200.0),
     ('PASTE_CLIENT_ID', current_date - 8, 199.2),
     ('PASTE_CLIENT_ID', current_date - 7, 200.5),
     ('PASTE_CLIENT_ID', current_date - 6, 198.8),
     ('PASTE_CLIENT_ID', current_date - 5, 199.5),
     -- current_date - 4 deliberately skipped
     ('PASTE_CLIENT_ID', current_date - 3, 198.0),
     ('PASTE_CLIENT_ID', current_date - 2, 197.6),
     ('PASTE_CLIENT_ID', current_date - 1, 198.9)
   on conflict (client_id, log_date) do nothing;
   ```
2. Re-run `weight-trend.sql`'s backfill portion (or just the whole file again — it's idempotent) so these new rows get their `weight_trend` computed.
3. Query them back in order: `select log_date, weight, weight_trend from weight_logs where client_id = 'PASTE_CLIENT_ID' order by log_date;`
4. Compare against the hand-worked table: 200.00, 199.88, 199.97, 199.80, 199.75, *(gap)*, 199.49, 199.21, 199.16 — each stored `weight_trend` should match to the second decimal place.
5. Now log **today's** weight through the app itself (as that client, e.g. 197.2) — confirm the new row's `weight_trend` continues the sequence correctly (≈198.87, picking up from 199.16 exactly as if the gap had never been there).
6. Update today's weight a second time through the app (change the number, save again) — confirm `weight_trend` recomputes from yesterday's trend again, not from the first save's already-updated value (i.e. it doesn't drift further each time you re-save the same day).
7. Open the Progress tab as that client — confirm the chart shows both lines, the teal one visibly noisier than the smooth red one, and that the gap day doesn't break the line or show as a flat plateau — it should just connect straight across.

## Estimated TDEE

Run `supabase/tdee-estimates.sql` in the SQL Editor after `weight-trend.sql`.

**The problem this solves:** "how many calories does this client actually burn a day?" can't be looked up — it has to be inferred from what actually happened to their weight while eating a known amount. This chunk calculates that inference (Adaptive TDEE) and stores it. (A later chunk — see "Data quality gate, confidence, and daily logging nudges" below — added the check for whether there's enough logged data to trust a given calculation.)

**Units:** `weight_logs`/`weight_trend` are tracked in **kilograms**. The formula's `7700` constant is the kcal-per-kg-of-bodyweight figure, so no conversion is needed — `weight_change_kg` is read directly from the stored trend values.

**The formula, over a trailing 14-day window ending on the day it's calculated:**

- `avg_daily_intake` — average of `food_logs.calories`, summed per day and divided only by the number of *days that actually have a food log entry* in the window (a day with nothing logged doesn't count as a 0-calorie day and doesn't count toward the denominator).
- `weight_change_kg` — the smoothed `weight_trend` on the **last** day of the window minus the smoothed `weight_trend` on the **first** day of the window (raw `weight` is never used here — only the trend).
- `implied_daily_balance` — `(weight_change_kg × 7700) ÷ 14`. Negative means the client was in a deficit (lost weight); positive means a surplus.
- `estimated_TDEE` — `avg_daily_intake − implied_daily_balance`. Losing weight while eating X kcal means TDEE must be *above* X (a deficit only happens if you burn more than you eat), which is exactly what subtracting a negative balance produces.

**Hand-worked example (confirmed correct before writing any code):** a client's smoothed trend goes from 95.30 kg down to 93.95 kg over 14 days (a real 1.35 kg loss, not a single noisy reading), while logging food on 12 of the 14 days averaging exactly 2000 kcal/day.

- `weight_change_kg` = 93.95 − 95.30 = **−1.35**
- `implied_daily_balance` = (−1.35 × 7700) ÷ 14 = **−742.5** (a real deficit)
- `estimated_TDEE` = 2000 − (−742.5) = **2742.5 kcal/day**

That passes the sanity check the formula has to pass: losing weight on ~2000 kcal/day means this client burns well above 2000 kcal/day, not below it — 2742.5 is exactly that.

**Where it's computed:** `calculateAndSaveTdee()` in `src/lib/tdee.ts` runs automatically right after `saveWeightLog()` succeeds on the Progress tab — the same moment `weight_trend` itself gets refreshed, since a fresh trend value is exactly what a fresh TDEE estimate needs. It pulls the trailing 14 calendar days of `food_logs` and `weight_logs` for that client, and upserts one row per `(client_id, calculated_date)` into `tdee_estimates` — saving today's weight a second time recalculates and overwrites today's estimate rather than creating a duplicate. There's no new screen for this yet; the number is stored, not yet displayed anywhere.

**Verify the stored value matches the hand calculation:**

1. Pick a test client and insert a 14-day run of backdated `weight_logs` and `food_logs` rows reproducing the hand-worked example above (adjust dates to whatever's recent):
   ```sql
   insert into weight_logs (client_id, log_date, weight) values
     ('PASTE_CLIENT_ID', current_date - 13, 95.3),
     ('PASTE_CLIENT_ID', current_date - 12, 95.0),
     ('PASTE_CLIENT_ID', current_date - 11, 95.3),
     ('PASTE_CLIENT_ID', current_date - 10, 94.7),
     ('PASTE_CLIENT_ID', current_date - 9, 94.8),
     ('PASTE_CLIENT_ID', current_date - 8, 94.3),
     ('PASTE_CLIENT_ID', current_date - 7, 94.1),
     ('PASTE_CLIENT_ID', current_date - 6, 94.4),
     ('PASTE_CLIENT_ID', current_date - 5, 93.9),
     ('PASTE_CLIENT_ID', current_date - 4, 93.7),
     ('PASTE_CLIENT_ID', current_date - 3, 94.0),
     ('PASTE_CLIENT_ID', current_date - 2, 93.4),
     ('PASTE_CLIENT_ID', current_date - 1, 93.2),
     ('PASTE_CLIENT_ID', current_date, 93.0)
   on conflict (client_id, log_date) do nothing;

   insert into food_logs (client_id, log_date, meal, food_name, calories) values
     ('PASTE_CLIENT_ID', current_date - 13, 'breakfast', 'Test meal', 1980),
     ('PASTE_CLIENT_ID', current_date - 12, 'breakfast', 'Test meal', 2020),
     ('PASTE_CLIENT_ID', current_date - 11, 'breakfast', 'Test meal', 1950),
     ('PASTE_CLIENT_ID', current_date - 10, 'breakfast', 'Test meal', 2050),
     -- current_date - 9 deliberately skipped (no food logged that day)
     ('PASTE_CLIENT_ID', current_date - 8, 'breakfast', 'Test meal', 2000),
     ('PASTE_CLIENT_ID', current_date - 7, 'breakfast', 'Test meal', 1990),
     ('PASTE_CLIENT_ID', current_date - 6, 'breakfast', 'Test meal', 2010),
     ('PASTE_CLIENT_ID', current_date - 5, 'breakfast', 'Test meal', 1970),
     -- current_date - 4 deliberately skipped (no food logged that day)
     ('PASTE_CLIENT_ID', current_date - 3, 'breakfast', 'Test meal', 2030),
     ('PASTE_CLIENT_ID', current_date - 2, 'breakfast', 'Test meal', 1960),
     ('PASTE_CLIENT_ID', current_date - 1, 'breakfast', 'Test meal', 2040),
     ('PASTE_CLIENT_ID', current_date, 'breakfast', 'Test meal', 2000);
   ```
2. Re-run `weight-trend.sql`'s backfill so these new rows get a `weight_trend` computed (it's idempotent, safe to re-run).
3. Log in as that client, open the Progress tab, and save today's weight as **93.0** again (same value — this just re-triggers the calculation without changing the trend history you just inserted).
4. In the SQL Editor: `select * from tdee_estimates where client_id = 'PASTE_CLIENT_ID' order by calculated_date desc limit 1;`
5. Confirm `avg_daily_intake` = **2000**, `weight_change_kg` ≈ **-1.35**, `implied_daily_balance` ≈ **-742.5**, and `estimated_tdee` ≈ **2742.5** — matching the hand-worked numbers above.

## Data quality gate, confidence, and daily logging nudges

No new SQL this chunk — `src/lib/tdee.ts` and two screens changed. Three pieces, all reading the same underlying "how many days out of the last 14 actually got logged" count:

**1. Data quality gate.** `calculateAndSaveTdee()` now counts, before doing anything else, how many distinct days in the trailing 14-day window have a food log and how many have a weight log. If either count is below **7**, it stops immediately — no query, no math, no write. Whatever `estimated_tdee` was last successfully calculated (however many days ago that was) stays exactly as it was. This matters because the alternative — recalculating on 2 or 3 real data points and quietly presenting the result as if it were as reliable as a full window — would actively mislead a client into eating at the wrong number.

**2. Confidence indicator.** `getTdeeConfidence()` runs the same 14-day count independently of the gate (so it's always reporting on *right now*, not on whatever day the currently-shown number happened to be calculated) and classifies it:
   - **Low** — the limiting count (whichever of food/weight is worse) is below 7. This is deliberately the exact same threshold as the gate: if it's too thin to trust a fresh calculation, it's too thin to call the number you're looking at trustworthy either, fresh or not.
   - **Medium** — 7 to 11 days logged.
   - **High** — 12 or more days logged.

   When confidence is Low, the reason names exactly what's missing — "3 missed weigh-ins in the last 14 days", "5 missed food logs in the last 14 days", or both if both are short — rather than a bare "Low confidence" badge with no explanation. This shows on the Progress tab directly under the Estimated TDEE number, along with "As of [date]" so it's obvious when a number is stale versus fresh.

**3. Daily logging nudge.** The Home tab now checks, every time it's opened, whether *today's* weight and food have been logged yet (two lightweight queries — not the 14-day window). If either is missing, a card appears near the top naming exactly what's missing and why: "Log today's weight for more accurate calorie targets," "Log today's meals for more accurate calorie targets," or both at once if neither is logged yet. Tapping it jumps straight to the Progress or Nutrition tab. Once both are logged for the day, the card disappears on the next visit.

**Verify all three — specifically, force a low-data scenario and confirm the gate holds the old number:**

1. Pick a test client with an existing `tdee_estimates` row (e.g. from the previous chunk's verification, or insert one manually first — see the previous section). Note its `estimated_tdee` and `calculated_date`.
2. Now simulate the client going quiet on weigh-ins: insert **only 3** backdated `weight_logs` rows scattered across the last 14 days (any 3 dates), but keep food logging normal (8+ days), e.g.:
   ```sql
   insert into weight_logs (client_id, log_date, weight) values
     ('PASTE_CLIENT_ID', current_date - 12, 93.5),
     ('PASTE_CLIENT_ID', current_date - 6, 93.2),
     ('PASTE_CLIENT_ID', current_date, 93.0)
   on conflict (client_id, log_date) do update set weight = excluded.weight;
   ```
   (If this client already has 14 days of weight logged from the previous chunk's test, delete the rest first: `delete from weight_logs where client_id = 'PASTE_CLIENT_ID' and log_date not in (current_date - 12, current_date - 6, current_date);` — then re-run `weight-trend.sql` so `weight_trend` recomputes for what's left.)
3. Log in as that client, open the Progress tab, and save today's weight again (this re-triggers `calculateAndSaveTdee`).
4. Query `select calculated_date, estimated_tdee from tdee_estimates where client_id = 'PASTE_CLIENT_ID';` — confirm `calculated_date` and `estimated_tdee` are **unchanged from step 1**. Only 3 of 14 weight days are logged (below the threshold of 7), so the gate held even though you just logged today's weight through the app.
5. On the Progress tab itself, confirm it now shows **"Low confidence — 11 missed weigh-ins in the last 14 days"** under the TDEE number (14 − 3 = 11), and that the TDEE number and "As of" date shown are the same stale ones from step 1, not today's.
6. Open the Home tab as a client who hasn't logged weight or food yet today — confirm the nudge card appears with the correct specific wording (both missing / weight only / food only), and that it disappears once both are logged and you revisit the tab.
7. As a sanity check on the "recovers cleanly" side: log at least 4 more backdated weight days (bringing the trailing-14 count back to 7+) and re-save today's weight — confirm `tdee_estimates` now updates to a fresh `calculated_date` and a recalculated `estimated_tdee`, and the Progress tab's confidence badge moves out of Low.

## Calorie targets: the final piece of Adaptive TDEE

Run `supabase/calorie-target.sql` in the SQL Editor after `tdee-estimates.sql`. This closes the loop: TDEE (calculated) → a goal-based adjustment → an actual number the client eats to, shown against what they've logged.

**1. Target setting.** A client's real calorie target is their latest stored `estimated_tdee`, adjusted by whatever goal type their **current phase** is (the same assigned programme `getClientProgramme` already treats as "current" — whichever has the most recent start date):

- **Cutting** → TDEE − 15% to − 20%
- **Bulking** → TDEE + 10% to + 15%
- **Recomp** → TDEE ± 0% (fixed, not adjustable — Recomp means maintenance by definition)
- **Strength** wasn't part of the three goal types you specified for this — it defaults to the same fixed 0% as Recomp until you tell me otherwise, since it's not a bulk/cut phase either.

The exact percentage within the Cutting/Bulking range is coach-adjustable per client, not a hardcoded single number — it lives on `programme_blocks.calorie_target_percent` (nullable; `null` means "use this goal's default," which is the middle of its range: −17.5% for Cutting, +12.5% for Bulking). A coach adjusts it from the programme detail screen (tap **Calorie target** on a client's assigned programme) — typing a value outside the valid range clamps to the nearest bound rather than rejecting it (e.g. typing −25 for a Cutting phase saves as −20, since that's already "as aggressive as this range allows").

A client with no assigned programme yet still gets a target — at a 0% (maintenance) modifier, since "no active phase" isn't a reason to show nothing.

**2. Weekly cadence, simplified.** TDEE used to recalculate every time a client saved their weight (from the last chunk). That's too often for a *target* a client eats against day to day — it should hold steady for a stretch, not shift underneath them every time they step on the scale. So instead: every time the Home tab opens, `checkAndRecalculateTdeeIfDue()` checks whether **7 or more days** have passed since the last successful calculation. If yes, it hands off to the existing `calculateAndSaveTdee()` — which still runs its own data-quality gate from the last chunk, so a due-for-recalculation window that's too thin still doesn't overwrite anything. If either check fails (too soon, or not enough data), nothing happens and the client keeps seeing last week's number.

This is the exact same simplification the missed-workout auto-reschedule already uses, and for the same underlying reason: a true scheduled job (a server-side cron hitting every client nightly) is real infrastructure to build, deploy, and monitor, and with one coach and a handful of clients it buys nothing a check-on-open doesn't already cover. The two cases differ only in how much a delay costs: a missed *workout* needs a same-day decision (the client is standing there wondering what to do right now), so auto-reschedule's on-open check matters immediately. A calorie *target* that's a day or two late to refresh because the client didn't happen to open the app costs nothing — they just keep eating at last week's number a little longer, which is harmless since it was a trustworthy number when it was calculated. A real background job would only start earning its keep if targets needed to update even when nobody opens the app at all.

**3. Wired into the Nutrition tab.** The hero calorie number is now real progress, not a bare count: **calories logged today**, a progress bar filling toward the **real calculated target**, and a line underneath naming the goal ("Cutting (−17.5% of TDEE) · TDEE 2717 kcal"). A client with no TDEE estimate yet (not enough history) sees the old plain count with a note explaining why there's no target yet, instead of a broken or fake number.

**Verify all three:**

1. **Target math** — using a client with an existing `estimated_tdee` (e.g. 2717 from an earlier chunk's verification) assigned to a Cutting programme with no `calorie_target_percent` override: open that client's Nutrition tab and confirm the target shown is `2717 × (1 − 0.175) ≈ 2242` and the meta line reads "Cutting (−17.5% of TDEE) · TDEE 2717 kcal".
2. **Coach adjustment** — as that client's coach, open the assigned programme, tap **Calorie target**, enter `-20`, save. Reload the client's Nutrition tab and confirm the target recalculates to `2717 × 0.80 ≈ 2174` immediately (no need to wait for any recalculation — the modifier applies live to whatever TDEE is already stored). Try entering `-30` and confirm it saves as `-20` (clamped), not rejected or silently ignored.
3. **Weekly cadence** — check `select calculated_date from tdee_estimates where client_id = 'PASTE_CLIENT_ID';`, note the date. Open the app as that client (Home tab) the same day — confirm the date is unchanged (fewer than 7 days have passed). Manually backdate it to force the check: `update tdee_estimates set calculated_date = current_date - 8 where client_id = 'PASTE_CLIENT_ID';`, then reopen the Home tab (a fresh app load, not just switching tabs — the check runs once per app open) — confirm `calculated_date` is now today's date (assuming the data-quality gate still passes; if you've also let that client's logging go thin, confirm it correctly does NOT update instead).
4. **Progress bar** — on the Nutrition tab, log enough food to exceed the target and confirm the progress bar caps out at a full bar rather than erroring or overflowing its container (HeroStat clamps the fill to 100% — going over target is a real, expected state, just not one the bar can show as "more than full").

## Coach Nutrition panel, and deleting logged food

Run `supabase/coach-nutrition-and-delete.sql` in the SQL Editor after `calorie-target.sql`.

**The gap this closes:** up to now, a coach had literally zero visibility into what a client actually ate — `food_logs` and `tdee_estimates` only had policies letting a client see their own rows, nobody else's, not even their coach. And nobody — client or coach — could delete a logged entry once saved; a mis-scanned barcode or a duplicate tap was permanent. Both are plain gaps, not intentional design, so this chunk just fills them in.

**What changed at the database level** (this app has one coach, and any coach can already see/assign to any client — see `assignments.sql`'s `is_coach()`-based "Coaches can view client profiles" policy — so these follow the same "any coach, any client" shape rather than inventing a coach-client pairing that doesn't exist anywhere else):

- `food_logs` gets a **coach SELECT** policy (previously none at all), plus **DELETE** for both the client who logged an entry and any coach.
- `tdee_estimates` gets a **coach SELECT** policy, needed so the coach panel can show the same "actual vs. target" comparison the client's own Nutrition tab already shows.

**1. Coach's Clients section (new).** Coach's home now has a **Clients** link → a list of every client account → tapping one opens their detail page. For now that page has one section, **Nutrition**: the client's current calorie target (same number their own Nutrition tab shows, with the goal type and modifier spelled out), and their last 14 days of food logs grouped by day — each day's total calories, macro totals, and how that day compares to the *current* target (e.g. "312 over target"). That comparison is against today's target, not a historically-accurate one for that specific past day, since this app only ever stores the latest target, not a day-by-day history of what the target used to be — worth knowing so a coach doesn't read more precision into it than it has.

**2. Deleting a logged food entry.** Both the client's own Nutrition tab and the coach's new Nutrition panel now show a **Delete** link next to every logged entry. One shared function (`deleteFoodLog()` in `src/lib/food-logs.ts`) handles both — it doesn't check who's asking itself; the database's RLS policies above decide that, so the exact same function call is safe to expose from either screen.

**Verify the coach panel:**

1. As the coach, open Home → **Clients** — confirm every client account shows up (name if set, otherwise email).
2. Tap a client who has some food logged and (from the previous chunks' testing) a stored TDEE estimate — confirm the Nutrition section shows their current target line matching exactly what that client's own Nutrition tab shows, and that recent days list with correct totals and a sensible over/under-target comparison.
3. Tap a client with no food logged in the last 14 days — confirm it says so plainly instead of showing an empty broken-looking list.

**Verify delete, and that it's properly locked down:**

1. As a client, log a test food entry, then tap **Delete** next to it on the Nutrition tab — confirm it disappears and the day's calorie/macro totals update immediately.
2. As the coach, open that same client's Clients detail page, log another test entry as the client first, then delete it from the **coach's** side — confirm it's gone from both the coach panel and the client's own Nutrition tab on next load.
3. This is enforced at the database level, not just hidden in the UI — already confirmed against a real local Postgres instance running the exact policies above: an unrelated client's delete attempt on someone else's `food_logs` row affects 0 rows (blocked), while the owning client and any coach both succeed. The Supabase SQL Editor runs as an admin role that bypasses RLS entirely, so it can't usefully re-test this itself — the real guarantee is that no client-facing screen in this app ever shows another client's `food_logs` row in the first place (every client-side list is scoped to `client_id = auth.uid()`; the coach's view is gated behind the coach-only `/clients` route).

## Metrics sub-tab on Progress

Run `supabase/body-metrics.sql` in the SQL Editor after `coach-nutrition-and-delete.sql`.

**What's new:** Progress now has a **Metrics** sub-tab header at the top (the first of what can grow into several — right now it's the only one, so it's shown as a fixed label rather than a switcher with nothing else to switch to). Under it:

- **Body fat % and muscle %** — two new optional fields alongside the existing weight input, logged the same way (same daily check-in, same Save/Update button). Both are plain manual entries on the same `weight_logs` row as that day's weight — nothing is calculated or smoothed for them the way `weight_trend` is; leaving one blank just stores null for that day.
- **A time-range toggle** (1W / 1M / 6M / 1Y / All Time) above the weight chart, defaulting to 1M. Picking a range filters the *same* weight history the chart and list always used — it doesn't run a new query or recompute anything, it just narrows which already-loaded rows get drawn and listed.
- **The weight graph is unchanged under the hood.** It's still the exact `WeightTrendChart` component from the Adaptive TDEE work, fed whichever rows survive the time-range filter — the smoothed trend line it draws is still reading `weight_logs.weight_trend` straight out of the database, the same column `calculateAndSaveTdee()` reads for the TDEE formula. This chunk didn't touch the EWMA calculation at all.
- **The chronological history list** below the graph now reflects the same filtered range too, and each row shows body fat %/muscle % under the weight+trend line whenever they were logged.

**Verify the new fields:**

1. Log today's weight along with a body fat % and muscle % — confirm they save and reappear pre-filled if you reopen the app.
2. Try entering `150` for body fat % — confirm it's rejected before saving (client-side check) and that the database itself would also reject it (the migration adds a `check (... between 0 and 100)` constraint — try inserting an out-of-range value directly in the SQL Editor and confirm it errors).
3. Leave body fat/muscle blank on a day and confirm the history row for that day just shows weight + trend, no stray "0%" or blank line.

**Verify the time-range toggle actually filters, not just visually truncates:**

1. With more than a month of weight history logged, tap **1W** — confirm both the chart and the history list below it show only the last 7 days' entries, and tap **All Time** to confirm the rest reappear.

**Verify the graph is reading the real stored trend, not recalculating it — the specific thing you asked to confirm:**

1. Pick any existing weight_logs row and note its `weight_trend` value.
2. In the SQL Editor, deliberately overwrite it to an obviously wrong number that the EWMA formula would never actually produce: `update weight_logs set weight_trend = 999 where id = 'PASTE_ROW_ID';`
3. Reload the Progress tab (pull the app to a fresh load, or re-open it) and look at that point on the chart's trend (oxblood) line, and at that row in the history list below.
4. If the app were recalculating the trend itself from raw weights, your manual `999` would be silently overwritten back to a real number the next time anything recomputed it — but nothing here does that. The history list should show `trend 999` in plain text, and the chart's oxblood line should visibly spike to that point, proving both are reading whatever is actually stored in `weight_trend`, not redoing the math.
5. Put the value back afterward: `update weight_logs set weight_trend = <the number you noted> where id = 'PASTE_ROW_ID';` (or just re-run `weight-trend.sql`'s backfill, which recomputes it correctly from scratch).

## Measure sub-tab on Progress

Run `supabase/body-measurements.sql` in the SQL Editor after `body-metrics.sql`.

**Progress now has two real sub-tabs: Metrics and Measure.** The single "Metrics" label from last chunk is now an actual switcher (it only made sense as a fixed label while it was the only option) — everything that used to live directly on Progress moved into `MetricsPanel`, unchanged, and the new measurement logging lives in `MeasurePanel` alongside it.

**Design call worth flagging:** your spec said "for each measurement type, show a graph... plus a history list." I built that as **one type selected at a time** (Waist/Chest/Arms/Thighs/Hips/Neck chips, defaulting to Waist) rather than six separate graphs stacked on the screen — picking a chip swaps in that type's own log form, graph, and history together. This matches the Metrics tab's actual visual treatment (one chart + one list, not several at once) and keeps the screen a reasonable length. Say the word if you actually wanted all six visible at once instead.

**What's new at the database level:** a `body_measurements` table — one row per client, per date, per measurement type (so logging waist and chest the same day are two independent rows, but logging waist twice the same day updates in place, same upsert rule weight uses). No `weight_trend`-style smoothing column here — there's no EWMA for these, the graph plots the raw logged value exactly as entered.

**Units, updated:** originally shipped in centimetres (`value_cm`); run `supabase/body-measurements-inches.sql` right after this file to switch to inches. That migration renames the column to `value_in` and converts any rows already logged in cm (÷ 2.54) so existing history doesn't silently jump to the wrong scale — a waist logged as 85 (cm) becomes 33.46 (in), not a mislabeled 85. Verified against a real Postgres instance: the conversion, the column rename, and the swapped check constraint (rejecting a negative or zero value) all behave correctly.

**New pieces:**
- `src/lib/body-measurements.ts` — `listBodyMeasurements()`, `saveBodyMeasurement()` (upsert), and `groupMeasurementsByType()`, which splits one flat list into six independent buckets so switching the selected chip never has to re-query, just reads a different bucket of what's already loaded.
- `src/components/measurement-chart.tsx` — a new, simpler chart: same time-proportional-X approach as `WeightTrendChart`, but one line only (teal, "actual" per the brand's color convention — no oxblood trend line, since there's nothing calculated to plot alongside the raw number).
- `src/lib/time-ranges.ts` + `src/components/time-range-toggle.tsx` — the 1W/1M/6M/1Y/All Time toggle from the Metrics chunk, pulled out into shared code so Measure could reuse the exact same behavior rather than a second copy that could drift.

**Verify each measurement type tracks and graphs independently:**

1. Select **Waist**, log a value, then select **Chest** and log a different value for today — confirm switching back to Waist still shows the waist number, not the chest one (proves the log form doesn't share state across types).
2. Log several days of history for Waist only (leave Chest with just the one entry) — confirm Waist shows a full trend graph with history, while Chest still correctly shows "not enough measurements" (or a single-entry history list with no graph) — proving one type's data volume has no effect on another's.
3. In the SQL Editor: `select measurement_type, count(*) from body_measurements where client_id = 'PASTE_CLIENT_ID' group by measurement_type;` — confirm the counts match exactly what you logged per type, with no cross-contamination (already confirmed independently against a real Postgres instance: inserting waist and chest history for the same client produced exactly 3 waist rows and 2 chest rows, with zero overlap).
4. Delete or edit nothing — this chunk doesn't add delete for measurements (matching the literal ask: log, graph, and list). Say if you want that added, same as food logs got earlier.

## Photos sub-tab on Progress

Run `supabase/progress-photos.sql` in the SQL Editor after `body-measurements-inches.sql`. Then run `npm install` (this chunk adds `expo-image-picker` and `base64-arraybuffer`), and if you're testing on a device rather than just the web export, restart with `npx expo start -c` so the new native module actually gets picked up.

**Progress now has three sub-tabs: Metrics, Measure, Photos.**

**1. Upload.** Pick an angle (Front/Side/Back — this one selector also decides which angle's gallery and compare tool you're looking at below), then **Take Photo** or **Choose from Library**. Photos are stored in a new **private** Supabase Storage bucket (`progress-photos`) — not public, so nobody can view a client's photos just by guessing or finding a URL. Each upload is its own row in a new `progress_photos` table; unlike weight or measurements, there's deliberately no "one per day" limit — a retake or a same-day second angle-check is just another row, never silently overwriting the last one.

**2. Gallery.** Chronological (most recent first), filtered to whichever angle is selected above. Every image shown is loaded via a **signed URL** generated fresh each time the panel loads (the bucket being private means there's no permanent public link to store or cache) — signed for one hour, plenty for a browsing session.

**3. Compare tool — built as a genuinely standalone, reusable component.** `src/components/photo-compare-slider.tsx` takes nothing but two image URIs and two optional labels — it has no idea what a "client," an "angle," or a "progress photo" even is. Drag the handle left/right to reveal more of the "before" or "after" image underneath. Because it only needs URIs and labels, dropping it into the coach's Clients view later is just importing it and handing it two photo URLs — no changes to the component itself.

**Pinch-to-resize, added after this shipped:** two photos of the same person are almost never at the same scale — different distance from the camera, a different crop — so lining up a specific landmark (waist, shoulders) between them needed each image to be independently resizable, not just wiped between. Pinching **either** photo scales just that one (1x–3x, never below 1x since the image already fills the frame at 1x and zooming out further would just show empty space at the edges). This is the one place in the app that needed real multi-touch gesture recognition, so it's also the first thing in this codebase to actually use `react-native-gesture-handler` and `react-native-reanimated` — both were already dependencies (pulled in by Expo Router itself) but sitting unused; the divider drag was rebuilt on the same gesture system for consistency rather than mixing two different touch-handling approaches in one component. Wiring them up required one small root-level change: `src/app/_layout.tsx` now wraps the whole app in `GestureHandlerRootView`, which gesture-handler needs at the top of the tree to behave reliably everywhere, not just on this one screen.

**Web-specific fix, caught on first real run:** the first version crashed on web with `PinchGestureHandler ... received child that is not valid HTML element`. `GestureDetector`'s direct child has to be a plain View — wrapping `expo-image`'s `Image` directly (even through Reanimated's `createAnimatedComponent`) doesn't expose a real DOM node the way gesture-handler-web expects. Fixed by putting the pinch/scale transform on a wrapping `Animated.View` instead, with a plain, un-animated `Image` inside it just filling that View — confirmed by actually running the dev server and loading the page in a real headless browser (static export alone can't catch this, since gesture attachment only happens on a live mount, not during prerendering).

**Why no delete, no editing beyond crop, no multi-select:** matching the same scope discipline as body measurements — this chunk is upload, view, and compare, full stop. Say the word if you want delete added, same as food logs got.

**Verify upload, gallery, and compare each work correctly:**

1. **Upload:** select Front, tap **Take Photo** (or **Choose from Library** if testing somewhere without a camera, e.g. web), confirm it appears in the Front gallery immediately after. In Supabase's Table Editor, confirm a new `progress_photos` row exists with today's date and `angle = 'front'`, and in Storage → `progress-photos`, confirm a file exists under `<your user id>/front/`.
2. **Gallery filtering:** upload one photo each as Front, Side, and Back — confirm switching the angle chips shows only that angle's photos, never mixing angles together.
3. **Compare tool:** with at least two Front photos from different dates, scroll to **Compare front photos**, tap one thumbnail under "Before" and a different one under "After" — confirm the slider appears and dragging its handle left and right smoothly reveals more of each image. Try picking the same photo for both slots — confirm it doesn't error, it just shows no visible difference (expected).
4. **Pinch-to-resize (device or simulator only — pinch needs two real touch points, so this won't work with a mouse in a web browser):** with the compare slider open, pinch on the left ("before") photo — confirm only that photo resizes, the right one stays put. Pinch the right photo — confirm the same in reverse. Confirm you can't shrink either photo smaller than its starting size (pinching inward past that point just stops scaling down further, rather than shrinking to reveal empty space).
5. **Privacy, already confirmed against a real Postgres instance:** the storage path convention (`<client_id>/<angle>/<filename>`) and the `progress_photos` table's RLS were both tested directly — a second account attempting to insert a photo row while falsely claiming another client's `client_id` is rejected outright by the database, not just hidden by the app's UI.

## Calendar tab: Week and Month views

No new SQL this chunk — the Calendar tab reads the exact same `assignments` data every other screen already reads from (`listMyAssignments()`, the same function the Home tab's "Up Next" and the Training tab's full history already use). Nothing new to store; this is purely a new way to look at data that already exists.

**Week view:** 7 day-rows, Monday through Sunday (the same Monday-start week Momentum Score and the missed-workout auto-reschedule already use, so "this week" means the same thing everywhere in the app), each showing that date's assigned session(s) — workout name and Pending/Completed status — or "Nothing scheduled." if there's nothing that day.

**Month view:** a real calendar grid — full weeks only, so it always starts on the Monday on/before the 1st and ends on the Sunday on/after the last day (a 4, 5, or 6-row grid depending on the month, never a partial week). Days outside the current month are dimmed but still functional. Each day with a session shows a small dot (plus a count if more than one); tapping a day opens a detail card below the grid listing that day's sessions by name and status — this is the easiest way to actually verify a date is right, since a tiny grid cell can't show a full workout name.

**Navigation:** ‹ / › move by a week or a month depending on which view is active; tapping the date range label jumps straight back to today. Switching between Week and Month keeps whichever session data is already loaded — there's no separate query per view, just a different way of laying out the same `Map<date, sessions[]>` built once from the same fetch.

**Explicitly not in this chunk, as scoped:** no drag-and-drop to reschedule, and no richer visual states beyond the plain Pending/Completed text every other screen already uses — this chunk is proving the grid places real sessions on the correct dates, full stop.

**Verify sessions land on the actual correct dates, in both views:**

1. As the coach, assign a client 3-4 workouts on specific, spread-out dates — at least one earlier this week, one next week, and one in a different month than today (use Assignments → + New, or assign a programme).
2. As that client, open the Calendar tab (defaults to Week view, showing the current Monday–Sunday). Confirm the session assigned for "this week" appears on the exact right day-row, with the correct workout name and status.
3. Tap **Month**, then use **›** to navigate to the month containing your "different month" test assignment. Confirm a dot appears on the exact correct date, then tap that date and confirm the detail card names the right workout.
4. Tap the date-range label from any week/month you've navigated away from — confirm it snaps straight back to the current week/month (today's date visibly outlined in Month view, labeled "Today" in Week view).
5. As a final cross-check, compare against ground truth directly: `select assigned_date, workouts(name) from assignments where client_id = 'PASTE_CLIENT_ID' order by assigned_date;` in the SQL Editor, and confirm every row shows up on its exact date in both views — no session shifted by a day, no session dropped, no session appearing twice.

Also removed `src/components/coming-soon.tsx` this chunk — Calendar was its last remaining user, so it's now dead code rather than a component kept around "just in case."

## Calendar drag-and-drop rescheduling

No new SQL — `rescheduleAssignment(assignmentId, newDate)` already existed (built for the missed-workout auto-reschedule) and a client updating their own `assigned_date` was already permitted (`reschedule.sql`'s column-level grant). This chunk is entirely UI: two different interactions depending on the view, both calling that same function.

**Before building, you asked me to check on Month view rather than guess — here's why it needed a different answer:** Month grid cells are roughly 50×50dp and only show a small dot, not a full session card. Dragging something that small onto a target that small is a genuine mobile-UX failure mode (your fingertip is about the size of the whole cell), and it gets worse on a day with 2+ sessions, where there'd be no way to tell which one you'd even grabbed. You confirmed the recommended fix: tap-to-move instead of physical drag.

**Week view — real drag-and-drop.** Press and hold a session card (long-press, not an instant grab — a plain scroll swipe never accidentally picks one up), then drag it up or down onto a different day. On release, the app measures each day-row's actual on-screen position and checks which one the drop point landed in — this is the part that's easy to get wrong with approximations, so it's checked against real measured positions, not assumed row heights. The moved day-row briefly rises above the others while a card is being dragged over it, so the floating card doesn't look like it's sliding underneath a neighboring day.

**Month view — tap-to-move.** Tap a day to open its detail card (from last chunk), tap **Move** next to a session, then tap the day you want to move it to (including a dimmed adjacent-month cell, if that's genuinely where it should go) — a banner confirms what's being moved and how to cancel.

**Instant reflection, not a manual refresh.** Both paths update the local list the moment a drop/tap lands, then save to the database in the background — so "the calendar immediately reflects the new date" is true even before the network round-trip finishes. If the save fails, it reloads from the server so the screen never keeps showing a move that didn't actually stick.

**One shared component change:** `ThemedView` now forwards its ref (`React.forwardRef`) — needed so the drag logic can measure a day-row's real on-screen bounds. Existing usages that don't pass a ref are completely unaffected.

**Verified beyond typecheck and static export, since neither one exercises a real gesture:** ran a live dev server in an actual headless browser and simulated a real press-hold-drag-release with mouse events through the real gesture-handler pipeline — a card dragged from day-row 0 down to day-row 3 correctly resolved to exactly that day's date, with zero console errors, confirming the on-screen-measurement logic (not just the visual animation) actually works.

**Verify a dragged session's new date actually persists — the specific thing you asked about:**

1. In Week view, press-and-hold a session card, drag it to a different day, and release. Confirm it visually appears under the new day immediately.
2. **Without touching the app again**, check the database directly: `select assigned_date from assignments where id = 'PASTE_ASSIGNMENT_ID';` in the SQL Editor — confirm it shows the new date, not the old one. This is the real test: a bug that only updates the on-screen list (and not the database) would still look correct in step 1.
3. Force-close and reopen the app (or just navigate away from Calendar and back) — confirm the moved session still shows on its new day, proving the move survived a fresh load from the server, not just the optimistic local update.
4. Repeat steps 1-3 for Month view using **Move** instead of drag.
5. To specifically confirm the failure-handling path: temporarily turn off your device's network mid-drag (or mid-tap-to-move), attempt a move, and confirm the app shows an error and reloads back to the real (unmoved) state rather than silently pretending the move worked.

## Calendar visual states, and tapping into a session's detail

No new SQL, and no new detail screen either — `/assigned/[id]` (the existing "logs performance, or shows it once completed" screen used by the Home tab's "Start" button) already did exactly what was asked here: editable weight/reps inputs with a completion button when a workout is still pending, or plain read-only logged numbers once it's done. This chunk's job was entirely wiring the calendar into that existing screen, plus the four visual states.

**"Missed" isn't a new database status.** `assignments.status` is still just `pending`/`completed` — Missed is derived the moment the calendar renders, using the exact same definition the missed-workout auto-reschedule already uses: still pending, but its date has already passed. Nothing new to store, nothing that can drift out of sync with the real status column.

**The four states, exactly as specified:**
- **Completed** — a small teal ✓.
- **Missed** — a small oxblood ⚑, deliberately no bigger or bolder than the check mark — "a flag, not an alarm."
- **Upcoming** — no glyph at all. A plain, on-schedule session doesn't need to compete for attention with the two states that actually call for it.
- **Rest day** — nothing. Same as Upcoming's "no glyph," the difference being there's no session there to label at all.

**A design call on "Upcoming" in Month view specifically, worth flagging:** because Upcoming gets no glyph, a day with an upcoming session and an empty rest day look visually identical in the compact month grid — both just show a plain date number. That's intentional (the grid's job is to flag exceptions at a glance, not list everything), but say so if you'd rather Upcoming got a quiet dot in Month view to distinguish "something's here" from "nothing's here" — Week view doesn't have this ambiguity, since it already lists every session's name directly.

**A day can hold more than one session**, so Month view's single glyph per day picks the state most worth surfacing: a missed session anywhere that day wins (most actionable), then an upcoming one, and only a day where everything is done reads as fully Completed.

**Tapping now opens the actual workout:**
- **Week view:** tap a session card to open its detail screen directly. This coexists with dragging on the exact same card — a quick tap (released before the 350ms long-press threshold that activates dragging) opens detail; holding past that threshold drags it instead. They're composed as a "race," so whichever one actually activates first is the one that runs — there's no scenario where both fire.
- **Month view:** tap a day to open its detail card (unchanged from last chunk), then tap a specific session inside that card to open its detail screen. **Move** stays as a separate, adjacent action on the same row, not nested inside the tap target, so tapping "Move" never also opens the workout by accident.

**One shared-component note:** none needed this chunk beyond what `ThemedView`'s ref-forwarding (from last chunk) already provides.

**Verified beyond typecheck and static export** — this chunk added a new gesture composition (`Gesture.Race` between the drag and a new tap), which is exactly the kind of thing that can silently misfire. Ran a live dev server in a real browser and simulated both: a quick release correctly triggered navigation (the browser left the debug page entirely — nothing else in that code path could do that), while a sustained press-then-drag correctly stayed on the page and resolved to the exact right day, with zero console errors either way.

**Verify all four states display correctly, and that tapping opens the right thing:**

1. Set up one session of each kind: complete one (so it's `completed`), leave one dated yesterday untouched (so it reads `missed`), leave one dated in the future untouched (`upcoming`), and pick a day with nothing assigned at all (`rest`).
2. In Week view, confirm: the completed session shows a small teal ✓ and "Completed"; the missed one shows a small oxblood ⚑ and "Missed" — clearly present but not shouting; the upcoming one shows no glyph, just the name and "Upcoming"; the empty day shows "Nothing scheduled." with nothing else.
3. Switch to Month view and navigate to the same days — confirm the completed day shows a teal ✓, the missed day shows an oxblood ⚑, and both the upcoming-only day and the true rest day show a plain, unmarked date number.
4. Tap the completed session (Week view directly, or Month view → day → session) — confirm it opens showing the actual logged weight/reps, not input fields.
5. Tap the missed or upcoming session — confirm it opens the same screen with editable weight/reps inputs and a completion button (a missed session can still be logged late — nothing blocks that).
6. In Week view, quickly tap-and-release a session — confirm it opens detail. Then press and hold the same card past roughly a third of a second before moving your finger — confirm it drags instead of opening anything.
7. In Month view, tap a day with 2+ sessions of different statuses (e.g., one missed, one upcoming) — confirm the day's single glyph shows the missed flag (the higher-priority state), then confirm both individual sessions still show their own correct status once you open the day's detail card.

## Reusing the calendar in Programme Builder, and a phase overlay

No new SQL. Both pieces of this chunk lean entirely on data and permissions that already existed — RLS already let a coach both read (`"Coaches can view their own assignments"`) and update (`reschedule.sql`'s column grant, combined with `"Coaches can update their own assignments"`) any assignment they created, for any of their clients. Nothing needed opening up.

**1. You asked me to confirm before building whether this would genuinely be the same component or a second version — the honest answer at the time was that it would have been a second version**, because the calendar's code lived directly inside the client route file, not as a separate reusable piece. So this chunk's real first step was extracting it: everything that used to be in `client/calendar.tsx` (the view toggle, drag-and-drop, the four visual states, tap-to-move) now lives in `src/components/session-calendar.tsx` as `<SessionCalendar clientId={...} role={...} />`, and `client/calendar.tsx` is now just a thin wrapper supplying the screen's title and chrome around it. The coach's Programme Builder (`programmes/[id].tsx`) imports and renders the exact same `SessionCalendar` — same file, same queries, same `rescheduleAssignment()` call, not a lookalike copy.

**The only thing that differs by caller is `role`, and it only decides one thing:** which detail screen a tapped session opens — `/assigned/[id]` (the client's own logging flow) for `role="client"`, `/assignments/[id]` (the coach's existing read-only prescribed-vs-actual view) for `role="coach"`. Everything else — the data fetched, the drag math, the visual states, the phase overlay below — is identical code, not parallel implementations that happen to look alike.

**Where it shows up for the coach:** open a client's *assigned* programme (not a template — templates have no client or real dates to show a calendar for) in Programme Builder, and a new "Client Calendar" section appears below the Weeks list, with a one-line note that it's the same calendar the client sees. Because `programmes/[id].tsx` had no scrolling before (its Weeks list was a `scrollEnabled={false}` FlatList relying on nothing else on the page needing to scroll), the whole screen is now wrapped in a `ScrollView` too — needed simply because the page is longer now, not a behavior change for anything already there.

**A real, pre-existing gap this surfaced:** there was no way for a coach to actually navigate to a client's assigned programme at all — the Template Library only lists templates (`client_id is null`, by design), and assigning a programme redirected to the unrelated individual-workout Assignments list, never to the programme itself. That made the new Client Calendar (and the Calorie target editor from an earlier chunk) unreachable for anything beyond the moment right after creating it, if even that. Fixed two ways: assigning a programme now lands the coach directly on the programme it just created instead of `/assignments`, and the coach's **Clients** detail page now has a **Programme** section — the client's current assigned programme, tap through any time to reach its Weeks, calorie target, and calendar.

**2. The phase overlay** ("Phase 4 — Week 2/6") is derived, not stored: `listClientPhases()` (new, in `programmes.ts`) fetches every assigned programme this client has ever had, oldest first — "Phase 4" literally just means "the 4th one," in the order they started. `getPhaseForDate()` then works out, for any given date, which of those phases (if any) covers it, and which week of that phase it falls in — the exact same week-number math `getClientProgramme()` already uses for "Week 2/6" on the Training tab, reapplied here to whatever date is currently in view rather than always "today." It reads `referenceDate` (the same anchor both Week and Month navigation already use — it's always somewhere inside whichever period is on screen) so the label updates correctly the moment you page forward or back, in either view mode. If the visible period falls in a gap between phases, or before/after every phase the client's ever had, the label just doesn't show — there's nothing true to say.

**Verify the coach and client are genuinely looking at the same data, not two systems that happen to look similar:**

1. As the coach, open a client's assigned programme in Programme Builder, and drag one of their sessions to a different day in the embedded calendar.
2. As that client (a different login), open their own Calendar tab — confirm the session shows on the new date, not the old one, without you having touched anything else.
3. Reverse it: as the client, drag a session to yet another date. As the coach, reopen Programme Builder for that programme — confirm it reflects the client's move immediately.
4. For a harder proof than "looks the same": in the SQL Editor, note an assignment's `id`, move it from either side, and confirm `select assigned_date from assignments where id = '...'` shows the same single row changing — there is only one row, one table, being read and written by both.

**Verify the phase overlay updates correctly across navigation:**

1. As a client with at least two sequential assigned programmes (e.g., a finished 6-week block followed by a current one), open Calendar and confirm the header shows the right "Phase N — Week X/Y" for the current week.
2. Page backward with **‹** into the previous phase's date range — confirm the phase number, week number, and total both update to match that earlier programme, not the current one.
3. Switch to Month view and page into a month that falls entirely within one phase — confirm the same label appears and matches. Page into a month before the client's very first assigned programme (or after their last one ends) — confirm the label disappears rather than showing something misleading.
4. Repeat step 1 from the coach's side, in Programme Builder's embedded calendar for that same client — confirm it shows the identical phase/week label, since it's reading the same `listClientPhases()`/`getPhaseForDate()` logic against the same data.

## Fixing the "app resets to Home after backgrounding" bug

No new SQL, no navigation-library upgrade, and — this is the part worth understanding — it turned out not to be about navigation state at all. Backgrounding the app (switching apps, locking the screen) and returning was snapping the client's 5-tab view back to the Home tab, and doing the equivalent to a coach mid-way through a section (Clients, Programmes, etc.) — dropping them back to that section's own list screen.

**The real cause:** every screen in the app that needs to know the signed-in user's role (every coach-only section, plus the client's tab bar) reads `profile` from `AuthProvider`, and each one had a guard that read `if (loadingProfile) return null`. That line was written for one specific moment — the split second right after login, before the app has ever fetched the `profiles` row — so it doesn't render anything role-gated before it actually knows the role.

The problem is `loadingProfile` didn't only turn on for that first fetch. `AuthProvider` re-fetches the profile every time Supabase hands it a new `session` object, and Supabase creates a **brand-new session object on every `TOKEN_REFRESHED` event** — including the routine, automatic token refresh that fires almost every time the app comes back from the background (its refresh timer is paused while backgrounded, so the moment you resume, it checks whether the token's due for a refresh and, almost always, refreshes it). Same user, same role, nothing meaningful changed — but the effect treated it exactly like a fresh login, flipping `loadingProfile` back on while it re-fetched a profile row that hadn't changed.

Every one of those `if (loadingProfile) return null` guards took that as its cue to unmount: the client's whole `<Tabs>` navigator, or a coach section's whole `<Stack>`, for the half-second the re-fetch was in flight. When it flipped back off and the navigator remounted, it had no memory of where it had been — a freshly created `<Tabs>` opens on its first tab (Home), and a freshly created `<Stack>` opens on its first screen (that section's index). That's the entire bug: not a lost navigation state, not the root navigator remounting, but seven separate, identically-written guards each discarding and rebuilding their own corner of the app on a routine, harmless token refresh.

**The fix, two parts:**
1. `AuthProvider`'s profile-fetching effect now keys off `session?.user.id`, not the `session` object itself. A token refresh changes the object but not the user id, so it's a no-op now — the effect (and `loadingProfile`) only fires again when the signed-in user actually changes (sign-in, sign-out, switching accounts).
2. Every one of those seven guards (`programmes`, `clients`, `assignments`, `habits`, `workouts`, `exercise-library`, and the client's `<Tabs>` layout) now reads `if (loadingProfile && !profile) return null` — so even if a re-fetch ever does happen while a profile is already cached, it no longer unmounts a navigator that's already rendering. It only blocks rendering during the one moment that guard was actually meant for: before the very first profile fetch resolves.

**Verify it:**
1. Log in as a client, navigate a few tabs deep (e.g. Training or Progress, not Home), then background the app (switch to another app or lock the screen) and wait at least 10–15 seconds before returning — confirm you land back on the same tab, not Home.
2. Log in as a coach, drill into something nested (e.g. Clients → a specific client, or Programme Builder for one client's assigned programme), background and return the same way — confirm you're still on that exact screen, not bounced back to the Clients or Programme Builder list.
3. To see the actual mechanism rather than just the symptom: temporarily add a `console.log('profile fetch', userId)` inside `AuthProvider`'s effect, background/resume a few times, and confirm it does **not** log again on resume (only once, at login) — proving the fetch that used to repeat on every resume no longer does.

## Archiving habits, workouts, and programmes — and why it's not a delete

**Why archiving, not deleting:** every one of these three tables is something other tables build on top of. A habit has `habit_logs` pointing at it (every day a client checked it off). A workout has `workout_exercises` underneath it and `assignments` pointing at it, and `workout_logs` cascades again off both of those. A programme template has `programme_weeks` underneath it, with a fresh set of `workouts`/`workout_exercises` under each week. In Postgres terms, every one of those child tables is declared `on delete cascade` — which means an actual `delete` on a habit, workout, or programme wouldn't just remove that one row, it would silently wipe out every log, every completed assignment, every set a client ever recorded against it. A coach tidying up their list by deleting an old workout would, without any warning, erase that client's entire logged history for it. Archiving avoids that outright: it's a plain `archived boolean` column (new file, `supabase/archive-content.sql`), defaulting to `false`. Archiving something just flips it to `true` — the row, and everything built on top of it, stays exactly where it was.

**What "disappears from active lists" actually means:** `archived` is checked only in the handful of queries that are genuinely a "pick something to use" list — the coach's Habits list, My Workouts, the Template Library, the workout picker in New Assignment, and the client's own daily habit checklist. Nowhere else reads it: a client's Training tab, Calendar, and workout-log history all keep showing exactly what they already showed, because those screens read `assignments`/`workout_logs`/`habit_logs` directly, never the `archived` flag. Assigning a programme template to a client makes a fully independent copy of it (this was already true before this chunk, from the Duplicate/Assign work) — so archiving the original template afterwards has zero effect on any client who's already been assigned it; their copy is a completely separate row.

**The confirmation prompt is a real modal, not `Alert.alert`.** This app ships to web as well as native, and react-native-web's `Alert.alert` is a no-op stub — calling it on the web build would do nothing at all, no dialog, no way to confirm or cancel. So the "Archive?" prompt (`src/components/confirm-dialog.tsx`) is a real `Modal`, the same approach the food-log-entry modal on the client's Nutrition tab already uses — it renders identically on every platform this app runs on. One shared component, used from all three admin lists (Habits, My Workouts, Template Library), each just supplying its own title/message.

**Verify archiving genuinely preserves history:**
1. Pick a client with some logged history — e.g. a completed assignment with logged weight/reps, or a habit with a few days checked off.
2. As the coach, archive the workout (or habit) behind that history from its admin list — confirm it disappears from that list, and from the New Assignment / assign-a-programme picker.
3. As the client, open Training (or Calendar, or Home's habit checklist history) — confirm the already-completed assignment or habit-log day still shows its real logged numbers, unchanged. Nothing reads as blank, missing, or "unknown."
4. Open the coach's own assignment detail screen for that same completed assignment — confirm the workout name and exercises still display correctly, even though the workout itself is now archived.
5. For programmes specifically: archive a template that's already been assigned to a client — confirm that client's own Programme Builder/Calendar/Training view is completely unaffected (their copy is a separate row from the template you just archived).
6. Tap Archive, then tap Cancel in the confirmation dialog — confirm nothing changes and the item is still in its list; only confirming actually archives it.

## Date navigator on the client's Nutrition tab, and confirming the coach's already supports it

**Client side:** the Nutrition tab's date line (previously a fixed "today," recomputed every render) is now a small state value (`logDate`), with `‹`/`›` arrows on either side — the same nav-row pattern the Calendar already established (`session-calendar.tsx`'s `navRow`/`navButton`), and the same `addDays(isoDate, days)` helper already shared by the Progress tab's time-range filters (`src/lib/time-ranges.ts`), rather than a third reimplementation of "add N days to an ISO date string." `‹` always works; `›` is disabled the moment you're back on today — there's nothing to browse ahead of today, since this is a log of what's already been eaten, not a meal planner. The label reads "Today" when you're there, or the full weekday/month/day for any earlier date.

Nothing about *adding* an entry changes: the meal-entry modal still saves against whichever date is currently on screen (`logDate`), so it doubles as a natural way to log a forgotten meal for yesterday — consistent with how a missed workout can already be logged late elsewhere in this app.

**Coach side:** checked the Nutrition panel on the coach's Clients → [client] detail page — it already pulls a full 14-day history (`listFoodLogHistory(id, 14)`) and renders every one of those days as its own card with its own totals and entries, not just today. It was never a "today only" view, so nothing needed extending here.

**Verify:**
1. As a client, log something today, then use `‹` to go back a day or two and log something for a past day too — confirm both stay associated with the correct date after navigating back to today.
2. Confirm `›` is greyed out and does nothing while viewing today, and re-enables the moment you step back to any earlier day.
3. As the coach, open that same client's Clients detail page — confirm both the "today" entry and the backdated one you just added both show up in the 14-day history list, on their correct dates.

## Swapping the Calendar tab for Chat

No SQL, and — worth being upfront about — this one surfaced two things that didn't actually exist yet, caught by checking the codebase before touching anything rather than assuming the request's premise:

**There's no Chat feature in this app at all.** No messaging tables, no coach-side inbox, no client-side thread — and no "Chats" quick-link on the Home dashboard either (checked every file in `src/` and every SQL migration for "chat," "message," "conversation" — nothing). Building a real client–coach messaging system is a genuinely separate, much larger piece of work than "swap a tab," so rather than build one, this chunk adds Chat as a real tab pointing at a clearly-labeled placeholder screen ("Direct messaging with your coach is coming soon") — so it already has its permanent spot in the tab bar, and turning it into the real thing later won't mean reshuffling the tab bar again.

**There was also no "View Calendar" button on Training** — the request described one as already existing; it didn't. Removing Calendar's tab button without adding a replacement path would have made the Calendar screen completely unreachable, so Training now has one: a small "View Calendar →" link next to the tab's title, opening `/client/calendar` directly.

**How Calendar stays reachable but hidden from the tab bar — the actual mechanism, not just the effect:** the naive approach — deleting the `<Tabs.Screen name="calendar">` line from `client/_layout.tsx` entirely — does **not** hide it. Checked this directly in the installed `expo-router` package's own source rather than assuming: a `Tabs` layout auto-includes every file in its directory as a real screen in the navigator regardless of whether it's declared as a child `<Tabs.Screen>` — undeclared files just get appended to the tab bar with default (unstyled) options. So removing the line would have left Calendar as an ugly, unlabeled 6th tab button, not removed it. The actual fix is `<Tabs.Screen name="calendar" options={{ href: null }} />` — Expo Router's documented way to keep a screen fully registered and routable (so `router.push('/client/calendar')` from Training still works exactly as before) while telling the tab bar specifically not to render a button for it. Verified this exact mechanism live in a throwaway debug route before touching the real tab bar: with `href: null`, the tab bar showed only the declared visible tabs, the hidden route still opened correctly and rendered its content when linked to directly, and the tab bar stayed unchanged while sitting on that hidden screen.

**Nothing about the Calendar screen itself changed** — `client/calendar.tsx` and `session-calendar.tsx` are untouched, byte-for-byte, from the last chunk. This was purely a navigation change.

**Verify the tab bar:**
1. Open the client's 5-tab bar — confirm it now reads Home / Training / Nutrition / Progress / Chat, with no Calendar button anywhere.
2. Tap Chat — confirm it opens the placeholder screen rather than erroring or showing a blank tab.

**Verify Calendar still works exactly as before, just reached differently:**
1. Open Training — confirm a "View Calendar →" link now sits next to the title.
2. Tap it — confirm it opens the exact same Week/Month calendar as always: view toggle, phase overlay, drag-and-drop in Week view, tap-to-move in Month view, all four visual states.
3. Drag a session to a new day, then navigate away and back via Training → View Calendar again — confirm the move persisted (this is the same calendar component and the same `assignments` table as always, so nothing about how it stores or reschedules sessions changed).
4. As the coach, confirm Programme Builder's embedded calendar for a client is completely unaffected — that one was never in the client's tab bar to begin with, and this chunk didn't touch `session-calendar.tsx`.

## Check-in Form Builder (creation only — scheduling and client assignment are next)

New tables (`supabase/form-templates.sql`): `form_templates` (one row per form — just a coach and a name) and `form_questions` (one row per question — its position, type, label, and a `config` jsonb column). Same parent/child shape as `programme_blocks`/`programme_weeks`, same "check the parent belongs to me" RLS pattern as `workout_exercises`.

**The part actually worth explaining is the extensible type system, not the CRUD.** The request was specific: this should be a list of type definitions, not per-type UI branches, so adding a question type later is a data change. Here's how that's actually built, end to end:

- **`src/lib/question-types.ts`** is the whole system. `QUESTION_TYPES` is an array of six entries (short text, number, single select, multi select, scale/slider, weight/measurement) — each one just data: a label, a description, a list of `configFields` it needs, a `defaultConfig()`, a `validateConfig()`, and a `toStoredConfig()`. Nothing about "what a single-select question needs" lives anywhere else.
- **`configFields` doesn't enumerate one shape per question type — it enumerates one shape per *kind of input control*.** There are only three kinds right now: `text` (a single field, used by measurement's unit), `list` (an open-ended list of strings, used by both select types' options), and `range` (a min/max pair, used by scale). Single-select and multi-select both just declare a `list` field — neither one has its own bespoke "options editor."
- **`src/components/question-config-editor.tsx`** has exactly one render branch per `kind` — three branches, not six. This is the piece that makes the extensibility real: a brand new question type that reuses an existing kind (say, a future "coach note" type that's just another `text` field) needs zero new UI code, only a new entry in `QUESTION_TYPES`. Only a genuinely new *kind* of input would ever need a fourth branch here — and even then, it's one new case in one file, not a change anywhere the builder screen itself lives.
- **The builder screen (`forms/new.tsx`) never branches on question type at all.** It renders a type-chip row from `QUESTION_TYPES`, and below it, loops over `getQuestionTypeDefinition(type).configFields` handing each one to `ConfigFieldEditor`. Switching a question's type just replaces its config with that type's `defaultConfig()` and lets the next render pick up whatever fields the new type declares.
- **The read-only detail screen (`forms/[id].tsx`) uses the same trick in reverse** — it reads a saved question's config back into human-readable text generically off `configFields`, so reviewing a saved form doesn't need per-type code either.

**Why `toStoredConfig` exists as its own step, separate from validation:** a scale's min/max are edited as raw text (so a field the coach clears mid-edit reads as `""`, not a `0` that silently passes validation) — `validateConfig` catches a blank or backwards range before save, and only once a question is confirmed valid does `toStoredConfig` convert that raw text into real numbers for the database. Select options get the same treatment: `toStoredConfig` trims whitespace and drops empty rows there too, so what's saved is exactly what a client will eventually see, not everything the coach typed into scratch fields along the way.

**Verified more than typecheck this time**, since dynamic per-type UI is exactly the kind of thing that's easy to convince yourself is right on paper and wrong in practice. Ran a live dev server and drove the actual builder through a throwaway debug page: switching a question's type correctly swapped in that type's config fields every time (a single-select showed 2 empty option boxes, a scale showed a 1–10 default range); adding an option grew the list from 2 to 3 to 4 inputs; validation correctly blocked save with the right per-question message for an empty label, fewer than 2 options, and a scale minimum ≥ maximum; and the final saved payload for a 4-question form (short text, single select, scale, measurement) had exactly the right shape — real numbers for the scale range, trimmed non-empty strings for select options, all matching what the database columns expect.

**Verify a form with a few different question types actually saves correctly:**
1. As the coach, open Check-in Forms (new link on Home) → + New.
2. Name it, then build at least: one Short text question, one Single select with 2–3 options, one Scale/slider (try the default 1–10, or change it), and one Weight/measurement question with a unit like "lb".
3. Tap Save — confirm it lands you on that form's detail page, showing the name, question count, and every question with its correct type label and a readable summary of its config (the select's options listed, the scale's range shown as "1–10", the measurement's unit shown).
4. Go back to Check-in Forms — confirm the new form appears in the list with the right question count.
5. For a harder check than "looks right in the app": open the SQL Editor and run `select * from form_questions where form_id = '<id>' order by position;` — confirm one row per question, in the order you built them, with `question_type` matching what you picked and `config` holding exactly what you'd expect (e.g. `{"options": ["Yes", "No"]}`, `{"min": 1, "max": 10}`).
6. Try saving with a question left blank, or a select with only 1 option, or a scale with min ≥ max — confirm each is rejected with a clear "Question N: ..." message and nothing gets saved (check the SQL Editor shows no new `form_templates` row from the failed attempt).

## Recurring check-in assignments (assignment only — filling the form out is next)

New table (`supabase/form-assignments.sql`): `form_assignments` — one row per (form, client) pairing, holding just a recurrence rule (`recurrence_day`, one of `mon`..`sun` — the exact same day keys `programme_blocks.scheduled_days` already uses, not a new representation) and `due_window_hours` (a plain positive integer). Same coach-assigns-something-to-a-client RLS shape as `assignments.sql`/`habits.sql`: you have to be a coach, the client has to be a client, and the form has to be one of your own.

**Why this is one row per assignment, not one row per future occurrence:** a programme has a fixed duration, so `assignProgrammeToClient` can pre-generate every session's date up front and be done with it. A weekly check-in never ends on its own — there's no fixed number of future dates to generate in advance. So `form_assignments` stores only the *rule*, and `listUpcomingCheckInDates()` (in `src/lib/form-assignments.ts`) computes actual dates from that rule on demand, walking forward from whatever "today" happens to be when it's asked. Nothing about a future occurrence is ever written to the database until this chunk's scope ends — that's deliberate, and it's also literally the answer to "how do I verify this generates the right dates going forward": there's no row to eyeball, there's a function to call.

**The date math itself** reuses `WEEKDAY_INDEX` (now exported from `programmes.ts`) — the same day-key-to-weekday-number mapping `computeWeekSessionDates` already uses to place a programme's sessions — rather than a second copy of the same seven numbers that could quietly drift out of sync with the first. Given a recurrence day and a starting date, it finds the very next matching weekday (today counts, if today already is that weekday — the first check-in isn't pushed a week out just because the coach happened to assign it on the right day), then returns every 7th day after that, as many as asked for. Each occurrence's deadline is that date at midnight UTC plus the due-window hours — so a Monday check-in with a 48-hour window is on time until Wednesday at midnight UTC.

**The assign screen** (`forms/assign/[id].tsx`, reached via a new "Assign" link on each Check-in Forms card) shows a live "Next 5 check-ins" preview that recomputes the moment the coach changes the day or the due window — before anything is saved. This isn't just a nice touch; it's the most direct way to catch a wrong recurrence rule before it goes out to a real client, and it's exactly what got hand-verified this chunk.

**Verified the actual math, not just that it typechecks** — recurrence date generation is exactly the kind of logic that can look right and be subtly wrong (off-by-one-week, wrong weekday, deadline math that breaks on a non-24-hour window). Ran a standalone script against the real function with several scenarios: assigning on a Wednesday for a Monday recurrence correctly lands the first check-in on the *next* Monday, not a Monday two weeks out; assigning exactly on the recurrence day includes that day as the first occurrence rather than skipping a week; every one of the 7 possible recurrence days resolves to a date that actually falls on that weekday; consecutive occurrences are always exactly 7 days apart; and a due window that isn't a multiple of 24 hours (30h) correctly produces a deadline with a non-midnight time, not a silently-rounded one. Separately, drove the assign screen's live preview through a throwaway debug page and confirmed switching the day chip and editing the due-window field both correctly recompute the visible list in real time.

**Verify an assignment actually generates the right scheduled dates going forward, not just a single one-off entry:**
1. As the coach, open Check-in Forms → pick a form → Assign.
2. Pick a client, pick a day of the week, leave the due window at 48 — confirm "Next 5 check-ins" shows five dates, all on the day you picked, each exactly 7 days after the last.
3. Change the day — confirm the whole preview list updates immediately to the new weekday, before you've saved anything.
4. Change the due window to something odd, like 30 — confirm each "Due until" timestamp shifts by exactly that many hours from midnight on its scheduled date, not just to the next full day.
5. Tap Assign — confirm it lands you on that client's own page, showing a new "Check-in Schedule" section with the form's name and "Weekly on [Day] · due within Xh."
6. For the real proof this isn't a one-off: open the SQL Editor and run `select * from form_assignments where client_id = '<id>';` — confirm there's exactly **one row**, holding only the rule (day + due-window hours), with no per-occurrence rows anywhere — then separately confirm (by re-opening the assign screen for that same form/client, or re-running the preview math by hand for a later date) that the same rule keeps producing correct future dates indefinitely, not just for the dates shown at the moment you assigned it.

## Client check-in fill-out, Up Next / Calendar visibility, and archive-not-delete

Four things this chunk, all built around one new idea: a check-in **occurrence** is now a real row (`form_check_ins`), not just something computed on the fly from the recurrence rule. The rule (`form_assignments`) still says "weekly on Monday" forever; this table is what actually exists for a given week, once it's close enough to matter.

**1. `form_check_ins` and `form_responses`** (`supabase/form-check-ins.sql`). A check-in occurrence has three states — `pending`, `completed`, `missed` — plus a separate `archived` flag. Those are deliberately two different things: `status` records what actually happened, `archived` decides what's still visible. A missed check-in gets **both** `status='missed'` and `archived=true` set at the same moment, but the row is never deleted — Compliance Score and On Time/Late tracking (next chunk) read this history, so it has to still exist and still be queryable, just not shown anywhere active. `form_responses` holds the actual submitted answers, one row per (check-in, question) — same shape as `workout_logs`' one-row-per-exercise, for the same reason: the answer's shape genuinely varies by question type, so a flexible per-question row beats one big JSON blob per submission.

**2. Lazy materialization, not a schedule.** `ensureCheckInsUpToDate()` (in `src/lib/form-check-ins.ts`) runs once per app open on the client's Home tab — same "on app open" shape as the missed-workout auto-reschedule and the weekly TDEE check already there, no server cron to build or monitor. For each of the client's active recurring assignments, it reuses `listUpcomingCheckInDates()` (the exact function from last chunk's assign-screen preview — not a second date-math implementation) to work out which occurrence should exist by "today + 2 days," upserts it if it doesn't exist yet (silently no-ops if it does, via a `unique(form_assignment_id, scheduled_date)` constraint), then sweeps for anything still `pending` more than 7 days past its scheduled date and archives it as `missed`. This single function is what makes a check-in "appear 2 days before due" and "disappear a week after, but never truly vanish" — both are just consequences of when this function chooses to insert a row and when it chooses to archive one, not two separate features.

**3. Client fill-out screen** (`checkins/[id].tsx`). Reuses last chunk's extensible type system in the other direction: `question-types.ts` now also declares an `answerKind` (`short_text` / `numeric` / `single_choice` / `multi_choice` / `scale` — five kinds for six types, since `number` and `measurement` both just need a numeric box, differing only in whether `config.unit` happens to be set) plus `validateAnswer`/`toStoredAnswer` per type. `question-answer-input.tsx`'s `<AnswerInput>` has exactly one render branch per kind, mirroring `ConfigFieldEditor`'s shape — the fill-out screen itself never branches on question type, same as the builder never did. Once completed, a check-in renders read-only instead of swapping back to a blank form.

**4. Up Next and Calendar reuse, not reinvention.** Home's Up Next now merges pending workouts and due check-ins into one date-sorted list, in the exact same card style, differing only in the button label ("Start" vs "Fill out") and destination. `SessionCalendar` fetches check-ins alongside sessions and phases (one query, sliced by date client-side, same as it already does for sessions) and renders them in both Week and Month view — a plain, non-draggable row in Week view, a small dot indicator plus a listing in Month view's selected-day card. Check-ins deliberately get their **own** status marker rather than being folded into the workout sessions' 3-state priority glyph on a shared day — they're a different kind of thing, and merging them would lose information, not add it. One access-control detail worth calling out: a check-in row is only tappable when `role="client"` — a coach viewing a client's calendar through Programme Builder sees it (useful information), but tapping through to `/checkins/[id]` and trying to submit would hit an RLS wall (that screen submits as whoever's signed in, and a coach isn't the client), so the coach's version is display-only.

**5. Coach delete/cancel, following the same archive rule.** Two actions on the Clients page's Check-in Schedule section, both behind the shared `ConfirmDialog`: "Cancel schedule" archives the `form_assignments` row (stops new occurrences; already-generated ones are untouched, since they still reference it), and "Remove" on an individual check-in instance checks its status first — still `pending` means nothing worth keeping, so it's a real delete; already `completed` or `missed` means archive instead, never delete, exactly the rule point 3 established and for the same reason.

**Verified the archive lifecycle directly**, since "disappears from view but still exists" is precisely the kind of thing that's easy to get backwards (delete when you meant archive, or filter so aggressively the row becomes unreachable even by id). Ran a standalone script simulating the real upsert-and-sweep logic against a fake table: confirmed a check-in genuinely doesn't materialize 3 days before due but does at exactly 2; confirmed a still-pending check-in survives untouched the day before its 7-day cutoff and is archived-as-missed the day after; confirmed the archived row is excluded from every "active" filter yet still present in the raw table with its real `status`/`archived` values (not deleted); confirmed a completed check-in is never touched by the missed-sweep no matter how old; and confirmed running the generation step repeatedly never creates a duplicate row for the same week. Separately, drove the new `<AnswerInput>` live through all six question types in a browser — every type validated correctly when blank, accepted valid input, and produced the exact right stored shape (real numbers where numbers are expected, a replaced single selection rather than an additive one, a growing/shrinking array for multi-select) with zero console errors.

**Verify the archive behaviour specifically — a missed check-in disappears from view but the record still exists and is queryable:**
1. As the coach, assign a check-in on a day that's already a few days past (e.g. if today's Wednesday, assign it for "Monday" — the first occurrence lands this coming Monday, so to test the *missed* path specifically, pick a form/client where you can wait, or directly insert a test row in SQL — see step 4 below for the faster path).
2. As the client, confirm the check-in shows in Up Next starting 2 days before its due date, not earlier — open the app on day 3-before and confirm it's absent, then again on day 2-before and confirm it now appears.
3. Let it go unanswered past its due window and past the 7-day mark from its scheduled date (or, faster: in the SQL Editor, backdate a test row's `scheduled_date` to more than 7 days ago while `status='pending'`), then reopen the client's Home tab (which is what actually runs the archive sweep) — confirm the check-in is now gone from both Up Next and the Calendar.
4. In the SQL Editor, run `select id, scheduled_date, status, archived from form_check_ins where id = '<that id>';` — confirm the row is still there, `status = 'missed'`, `archived = true` — not deleted, not blanked out.
5. As the coach, open that client's page — confirm the same check-in no longer appears under "Individual check-ins" either (it's excluded from the coach's active list the same way), while the SQL row from step 4 still proves it exists.
6. For the coach-initiated side of the same rule: as the coach, remove a check-in that's still `pending` — confirm in SQL that the row is gone entirely (`select … where id = '<id>'` returns nothing). Then remove one that's already `completed` — confirm in SQL the row is still there with `archived = true`, submitted answers in `form_responses` still intact.

## Real Compliance Score

No new database tables — same shape as Momentum Score: pure calculation over data that already exists (`form_check_ins`, `food_logs`, the real Adaptive TDEE target from `tdee.ts`), computed fresh whenever it's asked for (`src/lib/compliance.ts`). It displays in two places: a new **Compliance** sub-tab on the client's Progress screen (first in the row, ahead of Metrics/Measure/Photos — it's meant to be the first thing a client checks), and a color-coded `{score}%` badge on each row of the coach's Clients list.

**The formula**, over the trailing 28 days ending today:

- **Punctuality** = check-ins submitted on time ÷ check-ins scheduled in the window (if none were scheduled, this counts as 1 — nothing to miss). "On time" means `status = 'completed'` and `completed_at` at or before that occurrence's own `due_at`; late-but-eventually-submitted counts against this the same as never submitted. The query deliberately does **not** filter out archived rows — a missed check-in that got auto-archived still has to count against punctuality, which is exactly why archiving a check-in has never meant deleting it.
- **Macro adherence** = days within ±15% of the client's current calorie target ÷ 28. A day with nothing logged is 0 calories against the target, which is always outside 15% of any real target — an unlogged day fails automatically, by design, not as a special case. If the client has no calorie target at all yet (too new for a TDEE estimate), this counts as 1 — same "nothing to miss" reasoning as punctuality.
- **Score = round(((punctuality + macro adherence) / 2) × 100)**

**One simplification worth knowing about:** macro adherence compares every one of the 28 days against the client's *current* calorie target, not whatever target happened to be active on that specific historical day. If a client's TDEE recalculated mid-window and their target moved, days before that change are still judged against the new number. This is the same shortcut Momentum Score and the Nutrition tab already take — nothing in the app currently answers "what was the target as of date X," only "what is the target right now" — and a mid-window change is the exception, not the rule, since TDEE only recalculates roughly weekly. Worth revisiting if it ever produces a visibly wrong-looking number for a client who just had a big goal change.

**Hypothetical walkthrough** (illustrative numbers only — I don't have a live connection to your database in this environment, so this isn't a real client's data; use the verification steps below on an actual client to get a real number):

Picture a client, "Sarah," with a weekly Monday check-in and a calorie target of 1980 kcal/day (a 2400 kcal TDEE, cutting at −17.5%). Over the last 28 days:

- **Punctuality:** 4 Mondays fell in the window. She submitted on time twice, submitted one late (Thursday, past a Wednesday cutoff), and one occurrence went unanswered long enough to auto-archive as missed. That's 2 of 4 on time → **50%**.
- **Macro adherence:** of the 28 days, 4 have nothing logged (automatic fails), 6 of the remaining 24 logged a day clearly outside ±15% of 1980, and 18 landed inside that range. That's 18 of 28 → **64%**.
- **Compliance Score:** (50% + 64%) ÷ 2 = **57%**.

That's a client who's roughly on track with food most days but slipping on check-ins — the kind of number that should prompt a conversation about accountability, not necessarily programming.

**Verify the number is actually correct**, on a real client, the same way Momentum Score's section above does:

1. In Supabase, find the client's id (**Table Editor** → `profiles`) and today's date minus 27 days (the 28-day window start).
2. Punctuality — **SQL Editor**:
   ```sql
   select due_at, status, completed_at from form_check_ins
   where client_id = 'PASTE_CLIENT_ID' and scheduled_date between 'WINDOW_START' and 'TODAY';
   ```
   Count the rows returned (the denominator), then count how many have `status = 'completed'` and `completed_at <= due_at` (the numerator). Divide.
3. Macro adherence — first find their current target: latest `tdee_estimates.estimated_tdee` for that client, adjusted by `programme_blocks.calorie_target_percent` on their current phase (or the goal default, −17.5% for Cutting / +12.5% for Bulking / 0% for Recomp — see "Calorie targets" above), or just read whatever the Nutrition tab currently shows them. Then:
   ```sql
   select log_date, sum(calories) from food_logs
   where client_id = 'PASTE_CLIENT_ID' and log_date between 'WINDOW_START' and 'TODAY'
   group by log_date;
   ```
   For each of the 28 calendar days in the window (treating any day missing from these results as 0 calories), check whether the total is within 15% of the target. Count how many days qualify, out of 28.
4. Average the two percentages from steps 2 and 3, round to the nearest whole number.
5. Open the app as that client (Progress → Compliance), or as the coach on the Clients list, and confirm the displayed score matches your hand-calculated number exactly.

## Community Posts feed

Run `supabase/community.sql` in the SQL Editor after `progress-photos.sql`. A shared feed both the coach and every client can read and post into — four fixed tags (Announcement, Win, PR, Question), with Announcement restricted to the coach.

**Where it lives.** Not a 6th tab — the client tab bar already carries 5. Same shape as Calendar: a real, routable screen (`/community`, `/community/new`) reached via a link, not a permanent tab bar slot. There's a "Community" card on the client's Home tab and a "Community" link on the coach's Home screen.

**The table** (`community_posts`): author, tag, body, an optional image, plus `reaction_count` and `comment_count` — two plain integer columns, both default to 0. There's no reacting or commenting built yet this chunk, and no separate tables for them — those columns exist now purely so the feed card's layout won't need to change shape again the day that feature actually lands. Don't read a nonzero count anywhere yet; there isn't one.

**The Announcement restriction is enforced by Postgres, not by the compose screen being polite.** The client-side tag picker never *offers* Announcement to a client account — that's just good UX, not the actual security boundary. The real boundary is `community_posts`' insert policy:

```sql
with check (
  auth.uid() = author_id
  and (tag <> 'announcement' or public.is_coach())
)
```

This runs against whoever is really signed in, checked at the database, every time — a client-role account can't get past it by editing the request, calling the API directly, or anything else short of actually being a coach. The verification steps below prove this by trying it directly in SQL as an impersonated client, not just by clicking around the UI.

**Two separate on/off switches, not one:**

1. **The coach's app-wide switch** (`app_settings.community_enabled`, a singleton table — it can only ever hold exactly one row). Turned off, Community disappears from *every* client's Home tab, full stop, regardless of anyone's personal preference. The control for it lives at the top of the Community screen itself, visible only to the coach — a client account never sees it, and the update policy backs that up the same way the Announcement restriction does (`using (public.is_coach())`).
2. **A client's own "hide Community for me" toggle** (`profiles.community_hidden`, the eye icon on their Home card) — personal, independent of switch #1, and only ever readable/settable for that client's own account. Tapping the eye icon doesn't remove the card outright; it collapses to a small "👁 Community (hidden) — tap to show" row, so there's always a way back rather than a setting that's easy to lose track of.

   This one needs its own explicit column grant, not just an RLS policy — `xp.sql` already tightened `profiles` updates down to `full_name` only (`revoke update on public.profiles from authenticated; grant update (full_name) ...`), specifically so a client can't touch anything else on their own row via the API. `community.sql` adds `community_hidden` to that allowed list (`grant update (community_hidden) on public.profiles to authenticated;` — additive, doesn't reopen anything `xp.sql` closed). Without it, the row-level policy still says "yes, this is your row," but Postgres rejects the column itself before that's even consulted — which looks exactly like the eye icon doing nothing.

If the coach's switch is off, a client's personal preference doesn't matter — there's nothing to show either way. If it's on, each client's own eye-icon choice is theirs alone; it has no effect on any other client or on the coach.

**Images** use the same private-bucket-plus-signed-URL shape as progress photos (`community-images`, signed at read time via `createSignedUrls`), except the read policy is deliberately open to *any* signed-in user rather than folder-owner-only — it's a shared feed, so everyone needs to be able to see everyone else's post images, not just their own.

**Verify both roles can post correctly:**
1. As the coach, open Community → + New. Confirm all four tags are offered, post one of each (Announcement, Win, PR, Question) — confirm all four appear in the feed with the right emoji/label, and the Announcement post gets a distinct left-accent border.
2. As a client, open Community → + New. Confirm the tag picker shows only Win, PR, and Question — Announcement is never in the list, not even greyed out.
3. Post a Win as that client — confirm it appears in the shared feed alongside the coach's posts, visible to both of you.

**Verify the Announcement restriction is a real database rule, not just a UI suggestion:**
1. In Supabase's SQL Editor, use **Impersonate user** (top of the editor) to run as one of your client accounts.
2. While impersonating that client, run:
   ```sql
   insert into community_posts (author_id, tag, body) values ('<that client's own id>', 'announcement', 'This should fail');
   ```
3. Confirm this is **rejected** with a row-level security policy violation — even though `author_id` correctly matches the impersonated client. The app's UI never even gave this client the option, but this proves the database wouldn't have allowed it either way.
4. Switch impersonation to your coach account and run the same insert (with the coach's own id as `author_id`) — confirm it **succeeds** this time. Delete that test row afterward.

**Verify the coach's app-wide switch:**
1. As the coach, open Community — confirm the "Community is on for clients / Turn off" row appears (a client account never sees this control at all).
2. Tap Turn off. In Supabase, confirm `app_settings.community_enabled` is now `false`.
3. As a client, confirm the Community card is now gone from their Home tab entirely. If they already had the Community screen open, confirm it now shows "Your coach has turned Community off for now" instead of the feed.
4. Turn it back on as the coach — confirm the client's Home card reappears.

**Verify the client's personal eye-icon toggle is separate from the coach's switch:**
1. With Community turned on, as a client, tap the eye icon on the Community card — confirm it collapses to "👁 Community (hidden) — tap to show." If it instead flickers and snaps right back, the column grant below hasn't been run yet.
2. Log in as a *different* client — confirm Community still shows normally for them; one client hiding it never affects another.
3. In Supabase, confirm `profiles.community_hidden` is `true` only for the client who tapped it.
4. Tap the hidden row again — confirm Community reappears for that client.

**If the eye icon looks like it's doing nothing:** you likely ran an earlier version of `community.sql` before it included the column grant. Just run this one line again in the SQL Editor (safe to run on its own, and safe to re-run):
```sql
grant update (community_hidden) on public.profiles to authenticated;
```

## Community moderation: Report, Delete, Block

Run `supabase/community-moderation.sql` in the SQL Editor after `community.sql`. Required before real peer posting opens to actual clients — three pieces, all enforced at the database, not just the UI.

**1. Report.** Any signed-in user can report a post from the feed (a plain-text "Report" link on any post that isn't their own) — a modal asks for an optional reason, then submits. The same person reporting the same post twice fails cleanly with "You've already reported this post" (a real unique constraint, `community_reports`' `unique(post_id, reporter_id)`), not a duplicate row the coach has to review twice.

**2. Delete.** A "Delete" link appears on a post when you're its author, or on every post if you're the coach — one `deletePost()` function in `community.ts`, no role branching in the code at all. `community_posts` now carries two delete policies (author-of-their-own, coach-of-any), and Postgres ORs them together, so whichever one actually applies to whoever's signed in is the one that fires. Deleting a post also cleans up its image from storage, best-effort — a delete that already succeeded in the database is never rolled back over a failed file cleanup.

**3. Block.** The coach-facing Moderation screen (`/community/moderation`, a "🚩 Moderation" link on the Community screen, only visible to the coach, with an open-report count badge) lets the coach block the author of a reported post. A blocked client keeps every post they've already made — nothing about existing posts or the feed's select policy changes — they simply can't create a *new* one; their next attempt to post gets rejected the same way the Announcement restriction rejects a client, at the database, not the UI. The compose screen checks this ahead of time too, so a blocked client sees a plain "You've been restricted from posting" message instead of a confusing raw error — that's a courtesy on top of the real wall, not the wall itself.

**Why Block is a separate table, not a column on `profiles`, and why that matters:** the obvious design — `profiles.community_blocked` — runs into the exact trap `community_hidden` almost fell into with `xp.sql`'s column lockdown, except worse: granting `authenticated` a column-level UPDATE on `community_blocked` (needed so the *coach* can write it) would ALSO let a *client* flip it back off on **themselves**, via the same existing "Users can update their own profile" row policy — there's no way in Postgres to grant a column to "coaches acting on someone else's row" only. A dedicated `community_blocks` table sidesteps this cleanly: insert (block) and delete (unblock) are gated by `is_coach()` alone, full stop, with the same defense-in-depth check `assignments.sql` already established (not just "you're a coach," but "the id you're blocking actually belongs to a client").

**Blocking doesn't auto-resolve the report that led to it** — deliberately. The coach might still want to delete the specific offending post, or leave it up while the author's blocked from posting more; dismiss or delete it separately if you're done with it. Deleting the post *does* clean up every open report pointing at it, automatically (cascade delete on `community_reports.post_id`) — there's nothing left to review once the post itself is gone.

**A "Blocked clients" list with Unblock** sits below the reports on the Moderation screen — shipping a block with no way to reverse it felt like an obvious gap worth closing while building this, not a separate ask.

**Verify Report works and the duplicate-report guard is real:**
1. As a client, open Community, find a post that isn't your own, tap Report, type a reason, submit.
2. As the coach, open Community → 🚩 Moderation — confirm the report appears with the right post, the reporting client's name, and the reason you typed.
3. As that same client, try to report the exact same post again — confirm you get "You've already reported this post," not a second entry in the moderation list.

**Verify Delete works for both the author and the coach, and only for them:**
1. As a client, post something, then delete it yourself from the feed — confirm it's gone for everyone.
2. As a different client, post something. As the coach, confirm you can delete that post too, from either the feed or the Moderation screen's "Delete post."
3. As a client, confirm you do **not** see a Delete link on any post that isn't your own.

**Verify Block actually stops new posts, not just the compose screen's UI:**
1. As the coach, open Moderation and block a client (via "Block author" on one of their reported posts, or by testing directly).
2. As that client, open Community → + New — confirm you see "You've been restricted from posting" instead of the compose form.
3. Confirm their **existing** posts are still visible in the feed, unchanged.
4. The real proof it's a database rule: in Supabase's SQL Editor, use **Impersonate user** to run as that blocked client, then try `insert into community_posts (author_id, tag, body) values ('<that client's id>', 'win', 'test');` directly — confirm it's rejected, exactly the same way the impersonation test for the Announcement restriction works.
5. As the coach, unblock that client from the Moderation screen's "Blocked clients" list — confirm they can post again, both through the app and via the same impersonated insert now succeeding.

## Community Leaderboards, and a real membership tier for the first time

Run `supabase/community-leaderboards.sql` in the SQL Editor after `community-moderation.sql`. Adds a second sub-tab to Community — **Posts** (everything above) and **Leaderboards** — ranking clients by XP, gated by a real membership tier for the first time in this app.

**Where the tiers actually came from.** Rather than invent a meaningless "Tier 1/Tier 2," I checked your live Stripe account — you have three real products: **Club** (£29.99/mo, the base membership, whose own Stripe listing already promises "Community access" — shown in the app as **Base**), **Accelerator** (£99/mo), and **Precision** (£250/mo, full weekly-accountability tier). Leaderboards is gated to Accelerator and Precision — Base members see Posts normally but get the locked/upsell state on Leaderboards. **There's no live Stripe → Supabase sync** — that's a real webhook-plus-customer-mapping project of its own, well beyond this chunk. For now, the coach sets each client's tier by hand from a new "Tier: Base / Accelerator / Precision" row on the Clients list, to match whatever they actually pay for. A client with no tier set yet defaults to Base (the most restricted option) — never accidentally the most permissive one. (The stored value is still `'club'` under the hood, matching the Stripe product and the database's check constraint — only the on-screen label changed.)

**The ranking itself reuses real data, not a second scoring system:**
- **This week** (the default view) sums the `xp_events` ledger — the exact same table `profiles.total_xp` is itself kept in sync from by the trigger `xp.sql` set up — filtered to the current Monday–Sunday week. That's the same week boundary Momentum Score already uses (`getCurrentWeekRange()`, now exported from `momentum.ts` specifically so this doesn't become a second copy of that date math).
- **Lifetime** (a secondary toggle underneath) reads `profiles.total_xp` directly — the exact same number the Home dashboard's Level/XP card already shows for one client, just for every client at once here.
- Both run as a single SQL query per view, computed by a `SECURITY DEFINER` Postgres function (`get_weekly_xp_leaderboard` / `get_lifetime_xp_leaderboard`) rather than a client-side loop calling `getMomentumScore`-style functions once per client. This also sidesteps a real gap: there's still no "clients can view other clients' profiles" policy (on purpose — the same reason a client can't just query `community_reports`), so a plain client-side query couldn't see everyone's names or XP anyway. The function returns only `{client_id, full_name, email, xp}` — nothing else from `profiles` leaks through it.

**Avatar is a placeholder, not a real feature.** There's no photo-upload avatar system anywhere in this app yet — the leaderboard shows a colored circle with the person's first initial. Worth a real chunk of its own if you want actual profile pictures later; wasn't worth inventing here just to fill a column.

**Why tier lives in its own `client_tiers` table, not a `profiles` column — same trap as `community_blocks`, avoided the same way:** granting `authenticated` a column-level UPDATE on `profiles.tier` (needed so the coach can set it) would ALSO let a client set their own tier via the existing "Users can update their own profile" row policy — there's no way to grant a column to "coaches acting on someone else's row" only. A dedicated table sidesteps that: only `is_coach()` can insert or update a row in it, full stop.

**Verify the ranking is actually correct:**
1. In Supabase, find two client ids and note today's Monday–Sunday range (same query as the Momentum Score section above: `select (current_date - ((extract(dow from current_date)::int + 6) % 7)) as week_monday, (current_date - ((extract(dow from current_date)::int + 6) % 7) + 6) as week_sunday;`).
2. For each client, run `select coalesce(sum(amount), 0) from xp_events where client_id = '<id>' and event_date between '<monday>' and '<sunday>';` — write down both totals.
3. Open Community → Leaderboards → This week as either client (with Accelerator/Precision tier) — confirm both clients appear in the right order with the exact totals from step 2.
4. Switch to Lifetime — confirm it matches `select total_xp from profiles where id = '<id>';` for each client, and that the order can differ from the weekly view (a client who's been around longer but did less this week should rank lower on This week than on Lifetime).
5. Log a new workout completion, meal, or habit for one client (any of the ways that already award XP), refresh Leaderboards — confirm This week's total for that client goes up by the right amount immediately, since it's reading the ledger live, not a cached number.

**Verify the tier gate actually works, both directions:**
1. As the coach, open Clients — confirm every client shows a Tier row defaulting to Base, and tapping Accelerator or Precision updates it (check `select tier from client_tiers where client_id = '<id>';` in Supabase to confirm it saved as `'club'`).
2. As a Base-tier client, open Community → Leaderboards — confirm you see the locked "🔒 Leaderboards... Accelerator and Precision perk" message, not the real ranking, while Posts on the other sub-tab works completely normally.
3. As the coach, set that same client to Accelerator. As that client, reopen Leaderboards — confirm the real ranking now shows.
4. As the coach, open Leaderboards yourself — confirm you always see the real ranking regardless of any tier, since tiers are a client-only concept.

## Real-time Chat, from scratch: text, voice, edit, delete, presence

Run `supabase/chat.sql` in the SQL Editor after `community-leaderboards.sql`. Worth knowing up front: **there was no existing messaging system at all** — the Chat tab was a placeholder ("coming soon") since the tab bar was first built. This chunk is the whole thing: conversations, messages, real-time delivery, and presence, plus voice messages, an emoji picker, edit, and two genuinely different delete modes on top.

**One conversation per client**, not per (coach, client) pair — this is a single-coach app, so "the coach" doesn't need to be named; every other feature here already assumes the same thing. A client's Chat tab and the coach's per-client thread (`/messages/[clientId]`, reached from a new "Messages" inbox link on the coach's Home) are the same `<ChatThread>` component underneath — only which "other party" gets passed in differs.

**Real-time delivery** is genuine Postgres realtime (`supabase.channel(...).on('postgres_changes', ...)`), not polling — new messages, edits, and deletes all reach the other side live because `chat.sql` adds `messages` to the `supabase_realtime` publication. **Presence** is deliberately *not* a realtime presence channel — it's a heartbeat: `profiles.last_seen_at` gets written every ~45 seconds while a chat screen is open (same "check while active, no background job" shape the weekly TDEE recalculation and missed-workout checks already use), and "online" is just "last seen within about 90 seconds," computed in the app, not stored anywhere.

**Voice messages** are capped at exactly 15 minutes by passing `forDuration: 900` straight to `expo-audio`'s `recorder.record()` — the native recorder auto-stops itself at that mark, so there's no JS timer that could drift or get throttled in the background. They're stored the same way progress photos are: a private Storage bucket (`chat-audio`) plus signed URLs at read time, uploaded via the same base64-read-then-decode-to-ArrayBuffer approach already proven for photos and Community images (React Native's Blob/File upload path isn't reliable against Supabase Storage). New dependencies: `expo-audio` (recording + playback) and `expo-file-system` (reading the local recording as base64 before upload).

**Emoji picker** is a fixed, curated grid (32 common emoji), not a full emoji-keyboard library — it's a composer accent, not a replacement for the OS keyboard's own emoji support, which still works fine on its own.

**Edit** captures the pre-edit text automatically via a database trigger (`track_message_edit`) the first time a message's body actually changes — the app just writes new text with a plain update; it never has to check "is this the first edit?" itself. "Original isn't silently lost" means it's sitting right there in `original_body`, not that every subsequent edit is versioned.

**Delete, both modes, genuinely different mechanisms, not just different labels:**
- **Delete for me** — always available, either side, no time limit, and never touches the shared message row at all. It's a row in a separate `message_hidden_for` table (`message_id`, `user_id`). The message still exists, in full, for the other person; it's purely a per-viewer suppression, filtered out in the app when building the list.
- **Delete for everyone** — sender-only, within 30 minutes of sending, and it actually clears the content (`body`/`audio_storage_path` set to null, `deleted_for_everyone_at` stamped) — genuinely gone for both sides, not hidden by a flag the UI happens to check. The 30-minute rule is enforced by `messages`' own update policy, evaluated against the row's real `created_at`, which a client can never rewrite (see the column-grant lockdown below) — so it's a real database rule, not a UI suggestion that stops asking after 30 minutes.

**Why the 30-minute check is trustworthy:** the same column-level lockdown `xp.sql` first established gets applied to `messages` too — `authenticated` only ever has UPDATE on `(body, original_body, edited_at, deleted_for_everyone_at, audio_storage_path)`, never `created_at`, `sender_id`, `conversation_id`, or `kind`. Without that, a client could in principle rewrite their own message's `created_at` to a fresh timestamp and delete-for-everyone something from last week.

**One access gap closed in passing:** clients have never been able to see the coach's own profile row (only the reverse existed). Needed now so a client's Chat screen can show the coach's name and online status — added as its own policy, using a new `is_client()` SECURITY DEFINER helper (mirroring `is_coach()`) rather than an inline subquery, since a policy on `profiles` querying `profiles` directly inside itself causes infinite recursion.

**What's deliberately not built:** read receipts and an unread-message count. Nothing in this chunk's request needed them, and they're a genuinely separate feature (per-message read tracking) rather than a side effect of anything above — flagging the boundary rather than let it be a surprise later.

**Verify text messaging and real-time delivery:**
1. As a client, open Chat, send a message.
2. As the coach, open Messages → that client — confirm it appears without needing to refresh (this is the realtime subscription, not a lucky refetch — leave the coach's screen open and send a second message from the client's side to be sure).
3. Confirm the coach's Messages inbox shows that client with the right last-message preview and timestamp.

**Verify voice messages and the 15-minute cap:**
1. Record a short voice message (a few seconds) and send it — confirm it appears as a playable bubble with a duration, and that tapping play/pause actually plays it back for the other party too.
2. To verify the cap without literally waiting 15 minutes, temporarily change `MAX_VOICE_MESSAGE_SECONDS` in `src/lib/chat.ts` to something like `10`, reload, record past 10 seconds, and confirm it auto-stops and sends by itself at exactly that mark, with no button press. Revert the change afterward — this is a temporary test hook, not something to ship changed.

**Verify the emoji picker:** tap the 😊 button in the composer, pick a few emoji, confirm they land in the text field, send the message, confirm they render normally in the bubble (they're just Unicode characters).

**Verify edit:** send a message, edit it, confirm the bubble now shows the new text with a small "edited" label, and confirm in Supabase (`select body, original_body, edited_at from messages where id = '<id>';`) that `original_body` holds the pre-edit text.

**Verify the two delete modes are genuinely different — this is the one worth being careful about:**
1. As the client, send a message. As the coach, delete it **for me** (long-press → Delete for me). Confirm: gone from the coach's view, but as the client, it's still sitting there completely unaffected.
2. As the client, send another message. This time, as the **client** (the sender), delete it **for everyone**. Confirm it now shows "This message was deleted" on *both* sides.
3. In Supabase, compare the two: `select id, body, deleted_for_everyone_at from messages where id in ('<id1>', '<id2>');` — the delete-for-me message still has its real `body` and `deleted_for_everyone_at` is null (only a row in `message_hidden_for` exists for the coach); the delete-for-everyone message has `body = null` and a real `deleted_for_everyone_at` timestamp.
4. **The real proof the 30-minute window is a database rule:** send a message, then in Supabase's SQL Editor backdate it — `update messages set created_at = now() - interval '31 minutes' where id = '<id>';` — then, using **Impersonate user** as that message's sender, try `update messages set deleted_for_everyone_at = now(), body = null where id = '<id>';` directly. Confirm it's **rejected**. The app's UI would already have hidden the option by then anyway, but this proves the wall is real, the same way the Announcement and Block checks were proven earlier.

**Verify presence:** open the app as a client and leave the Chat tab open — as the coach, open that client's thread and confirm it shows "🟢 Online." Background the client's app (or navigate away from Chat) and wait about 90 seconds — confirm it flips to "Offline" for the coach without either side needing to do anything.

## Read receipts

Run `supabase/chat-read-receipts.sql` in the SQL Editor after `chat.sql`. One "Sent" or "Read" label under your most recently sent message, not a full read-tracking system.

**One cursor per person, not one row per message.** `conversation_reads` holds a single `last_read_at` timestamp per (conversation, person) — opening a conversation and seeing what's in it counts as "read up to right now," the same simplification every real messaging app makes, rather than tracking which individual messages were actually looked at. A message counts as read by someone the moment their cursor reaches or passes that message's `created_at`. This is also why only real-time chat needed this chunk to be small: the conversations/messages foundation, RLS conventions, and realtime wiring all already existed — this is one new table plugged into the same patterns.

**Only your last message shows a status, not every one.** Reading a conversation advances one cursor past everything before it, so if the most recent message you sent has been read, every earlier one has too — showing "Read" under all of them would be redundant clutter, not more information.

**Who can see what:** unlike `message_hidden_for` (which only its own owner can ever see — the whole point is that it's private), a read cursor is visible to *both* participants in the conversation, not just its owner — that's the entire purpose of a read receipt. But a person can still only ever write their *own* cursor; nobody can mark a message "read" on someone else's behalf. Two different RLS shapes for two different privacy needs, both already established elsewhere in this app (`community_blocks`' owner-only visibility vs. the broader "any participant" visibility `messages` itself already uses).

**Verify it:**
1. As a client, send a message. As the coach, without opening that client's thread yet, confirm the client's own view still shows "Sent" under it.
2. As the coach, open that client's thread (which marks it read). As the client, without needing to refresh, confirm the label flips to "Read" live — this is the same realtime channel messages already use, just also listening for `conversation_reads` changes now.
3. Send two messages in a row as the client. Confirm only the *second* (most recent) one ever shows a status — the first never does, even after it's been read.
4. In Supabase, confirm `conversation_reads` has exactly one row per person per conversation (never one per message) — `select * from conversation_reads where conversation_id = '<id>';` should return at most 2 rows, no matter how many messages exist.

## Recipe Builder: calculated macros, never typed in

Run `supabase/recipes.sql` in the SQL Editor after `chat-read-receipts.sql`. A coach-only "Recipe Builder" for building reusable recipes — name, cover photo, an ingredients list, instructions, prep/cook time, servings, and tags — with macros per serving that are *always calculated*, never manually entered.

**Two new tables, no client-facing view yet.** `recipes` holds the recipe itself (name, instructions, prep/cook minutes, servings, tags, an optional cover photo path). `recipe_ingredients` holds one row per ingredient in a recipe. Both are locked to "you own it" RLS — a coach can only ever see, edit, or delete their own recipes — the same shape as `programme_blocks`/`programme_weeks`, just with no client ever assigned one yet.

**Ingredients reuse the exact same search you already use for food logging.** Tapping "+ Add ingredient" opens the same USDA FoodData Central typed search as the Nutrition tab's "Add to meal" flow — search, pick a result, enter a quantity in grams. The moment you pick a quantity, that ingredient's macros are scaled from the per-100g source figures and saved into `recipe_ingredients` as plain numbers — calories, protein, carbs, fat, all already multiplied out for that quantity. Exactly like `food_logs` already does for a logged meal: the numbers are a permanent snapshot, so if USDA's data for that food changes later, or the food disappears from their database entirely, every recipe that already used it keeps showing the exact numbers it saved at the time.

**Macros per serving are never stored — they're calculated on every read.** There is no `calories_per_serving` column anywhere. `computeMacroTotals()` in `src/lib/recipes.ts` is the one place this math happens: sum every ingredient's cached calories/protein/carbs/fat, then divide each total by the recipe's `servings`. It's a small, pure function with no database or network dependency, called identically by the Recipe Library list (for the calories/serving preview on each card) and the recipe detail screen (for the full per-serving + whole-recipe breakdown). Changing `servings` on the Edit screen doesn't touch a single ingredient — it just changes the divisor, and every macro number updates immediately.

**A recipe's cover photo works exactly like progress photos.** A private `recipe-photos` Storage bucket, one folder per coach (`storage.foldername(name)[1] = auth.uid()`), uploaded via the same base64-decode-to-ArrayBuffer path used everywhere else in this app for Storage uploads (React Native's Blob/File/FormData path against Supabase Storage isn't reliable). Replacing a photo removes the old file; deleting a recipe removes its file too.

**Verify the calculated macros are actually correct — not just present:**
1. In the Recipe Builder, tap **+ New**, name it anything, set servings to a real number (e.g. 2), and save — you land on the recipe's detail screen.
2. Tap **+ Add ingredient**, search for a real food (e.g. "chicken breast, raw"), and note the exact "Per 100g" figures the app shows you *before* you save it — those are the real numbers coming back from USDA for that specific search result.
3. Enter a quantity (e.g. 200g) and tap **Add to recipe**. By hand (or a calculator), multiply each per-100g figure by 200/100 — that's what the ingredient row should now show.
4. Repeat with one or two more ingredients, writing down each one's per-100g figures and its quantity as you go.
5. On the recipe detail screen, hand-add every ingredient's calories together, then divide by the servings number you set — compare that to the "Per serving (calculated)" card's calorie figure. Do the same for protein, carbs, and fat.
6. Change the **Edit → Servings** number and save. Confirm the per-serving figures on the detail screen change immediately (same totals, different divisor) — and that removing or adding an ingredient changes the totals, not the per-serving math itself.
7. In Supabase, run `select name, calories, protein, carbs, fat from recipe_ingredients where recipe_id = '<id>';` and confirm every row matches what you hand-calculated in step 3 — this is the actual snapshot the app is reading from, not a live lookup.

## Nutri-Score: computed from scratch, not read off anyone's badge

Run `supabase/nutri-score.sql` in the SQL Editor after `recipes.sql`. Every ingredient and every recipe now carries a real A–E Nutri-Score grade — but it's calculated by this app's own implementation of the public formula, not copied from Open Food Facts' badge (which USDA FoodData Central, our primary generic-food source, doesn't have at all).

**The formula, in plain terms.** Four "bad" nutrients (energy, sugar, saturated fat, sodium) each score 0–10 negative points from a fixed table of thresholds — the worse the number, the more points. Three "good" ones (fibre, protein, and % fruit/vegetable/legume/nut content) each score 0–5 positive points the same way. `score = negative − positive`, and the score maps to a grade: A (≤−1), B (0–2), C (3–10), D (11–18), E (≥19). One special rule: if a food is bad enough on the negative side (≥11 points) and isn't essentially all fruit/veg/nuts, its protein points get zeroed out — this is what stops something like a processed meat from using high protein to buy its way to a better grade.

**The real gap this exposed: we weren't fetching most of the inputs.** USDA and Open Food Facts both have sugars, saturated fat, sodium, and fibre — this app just wasn't asking either one for them (only calories/protein/carbs/fat, since that's all food logging needed). `usda-fooddata.ts` and `open-food-facts.ts` now pull all four. Sodium sometimes only exists as "salt" in Open Food Facts data — converted at 1g salt = 400mg sodium (salt is sodium chloride; the ratio comes from their atomic weights).

**The percentage neither source actually has: fruit/veg/legume/nut %.** Getting the *true* figure means parsing a product's ingredient list and estimating each ingredient's share — something neither database does for arbitrary foods. Instead, this app treats a food's own category as the estimate: if USDA's `foodCategory` or Open Food Facts' `categories_tags` says the food *is* a fruit, vegetable, legume, or nut/seed product, it counts as 100%; otherwise 0%. This is an approximation, clearly documented as one in `nutri-score.ts` — it's the same practical stand-in most Nutri-Score implementations outside the official EU/Open Food Facts tooling use. One deliberate fix worth calling out: this match is whole-word, not substring — a naive `.includes('nut')` check would wrongly call Nutella (which contains "hazelnut") 100% nuts.

**Per-ingredient, in the Recipe Builder's "+ Add ingredient" search.** Every search result now shows its own Nutri-Score badge, computed straight from its per-100g figures (a food's grade doesn't depend on how much of it you're using). A "Sort by Nutri-Score" toggle re-ranks the same results best-grade-first.

**Per-recipe, on the recipe's own view.** There's no client-facing recipe screen in this app yet — recipes aren't assigned to or visible to clients at all, that's a separate future chunk — so this badge is on the one recipe view that exists today (the coach's recipe detail screen and its list cards), ready to carry over the moment a client-facing view exists. The recipe's grade is calculated by summing every ingredient's already-cached, quantity-scaled nutrient snapshot (calories, sugars, saturated fat, sodium, fibre, protein — the fruit/veg/nut % weighted by ingredient mass), dividing by servings, then **re-normalizing to a per-100g basis** before running the same formula. That last step matters: Nutri-Score only ever means anything per 100g — every real product's badge is computed that way — so grading raw per-serving totals directly would make a 600g serving and a 150g serving incomparable, and wouldn't match how any real badge actually works. The detail screen shows exactly how many grams-per-serving the badge was normalized against, so "per 100g" has a concrete meaning for that specific recipe.

**Verify a known food's computed score matches its real-world Nutri-Score grade:**
1. Pick a food with a genuinely well-known, publicly documented Nutri-Score — e.g. Nutella (E) or a can of chickpeas (A). Avoid drinks: beverages use a different official points table this app doesn't implement, so they won't match.
2. Look up that food's own published nutrition label (the manufacturer's site or the physical label) for per-100g: calories, sugar, saturated fat, salt (convert to sodium: mg = grams × 400), fibre, protein.
3. Search for it in the Recipe Builder's ingredient picker and check the badge it's showing.
4. If it doesn't match, the most likely reason is the fruit/veg/nut % estimate — check what category USDA/Open Food Facts filed it under; a miscategorized product is the one part of this calculation that's an approximation rather than exact.
5. For the recipe-level badge: build a small recipe, hand-sum every ingredient's cached sugars/saturated fat/sodium/fibre/protein (visible via `select * from recipe_ingredients where recipe_id = '<id>';` in Supabase), divide by servings, then multiply by `100 / (total grams ÷ servings)` to get the per-100g figures the badge is actually graded on — run those through the point tables above by hand and confirm the grade matches.

## Meal Plan Templates, and portion-scaling to a client's real target

Run `supabase/meal-plan-templates.sql` in the SQL Editor after `nutri-score.sql`. A coach-only "Meal Plan Templates" library — a day of eating (breakfast/lunch/dinner/snacks) built entirely from Recipe Builder recipes, tagged with a goal (Cutting/Bulking/Recomp/Strength, the exact same tags as Programme Builder) and a target macro split. Assign one to a client and every ingredient quantity scales proportionally to that client's real, current Adaptive TDEE target — not the template's original numbers.

**There's no "baseline calories" field to fill in.** Same rule as Recipe Builder's macros and Nutri-Score: never store something that can be computed. A template's baseline is whatever its recipes actually add up to — sum every meal slot's `recipe's calories-per-serving × servings prescribed`, across all four slots. Type in whatever recipes you want; the baseline is always exactly right, because it's not a separate number that could drift from reality.

**The target macro split is a design goal, not an input to the scaling math.** You set a target (e.g. 40% protein / 35% carb / 25% fat) when creating a template, and the template screen shows your recipes' *actual* computed split next to it — so you can see at a glance whether what you built actually hits the ratio you were aiming for. Scaling can't fix a ratio that's off at baseline (see below), so this comparison is where you'd notice and fix it, by swapping or resizing recipes.

**The scaling math, worked through:**
1. `scaleFactor = client's real target ÷ template's computed baseline`. A 2000kcal template assigned to a client with a 2400kcal target: `scaleFactor = 2400 / 2000 = 1.2`.
2. Every ingredient in every recipe in every slot gets multiplied by that same factor — quantity in grams, calories, protein, carbs, fat, sugars, saturated fat, sodium, fibre, all of it (they all scale linearly with mass, so multiplying the cached amount is identical to recalculating from a bigger quantity). The one exception is Nutri-Score's fruit/veg/legume/nut % — that's a ratio of the food itself, not an absolute amount, so it never changes.
3. New day total = baseline × scaleFactor = exactly the client's target, by construction, every time — not an approximation.
4. The macro ratio is untouched by step 2, since scaling everything by the same number can't change the relationship between the numbers. Whatever split the template actually had at baseline is the split the client gets too.

**Why this isn't built like Programme Builder's assignment.** Assigning a programme duplicates it into an independent, client-owned copy — sessions then get rescheduled per client without touching the template or anyone else. A meal plan assignment is deliberately just a *pointer* (`meal_plan_assignments`: template + client, nothing else) — the scaled numbers are recalculated live, every time the assignment is viewed, off the client's **current** calorie target. Freezing a scaled copy at assignment time would go stale the moment that client's Adaptive TDEE recalculates the following week; a live pointer never can.

**No client-facing view yet**, same gap as Recipe Builder: a client can't see their own assigned meal plan in the app yet. The scaled view lives at the coach's `/meal-plans/assigned/[assignmentId]` screen for now, reachable right after assigning — ready to carry over whenever a client-facing Nutrition view for this exists.

**Verify the scaled version actually hits the client's real target:**
1. In Supabase, find or set a client's calorie target — Coach Nutrition panel or the TDEE tables show their current `targetCalories` directly (this is the exact number `getCalorieTarget()` returns and the meal plan scales against).
2. Build a template, add a recipe to each meal slot, and note the "Baseline (calculated from recipes below)" total on the template screen.
3. Assign it to that client, then open the resulting scaled view. Confirm `Client's target` shown there matches step 1's number exactly, and `totals.calories` (the scaled day total) also matches it exactly — not approximately.
4. Confirm `Scale factor` shown equals (client's target ÷ template's baseline) to a couple of decimal places.
5. Pick one ingredient and hand-check it: take its baseline grams (visible on the template's recipe in Recipe Builder), multiply by (the meal slot's prescribed servings ÷ that recipe's total servings), then by the scale factor from step 4 — it should match the scaled grams shown in the assigned view exactly.
6. Confirm the scaled view's protein/carb/fat split matches the template's own "Actual split" percentages shown on the template screen — scaling changes the totals, never the ratio.

## Workout Builder: set-type tagging and coach-recommended baselines

Run `supabase/workout-set-types.sql` in the SQL Editor after `meal-plan-templates.sql`. Two additive capabilities on top of the existing Workout Builder (Phase 4) — nothing about how a workout is built or displayed today changes.

**1. Tagging individual sets with a technique.** Until now, an exercise's volume was one free-text field ("3x10") with no concept of an individual set at all. This adds a real `workout_exercise_sets` table — one row per set a coach explicitly tags — alongside that text field, not replacing it. Most exercises won't use this; it exists for the specific sets where a coach wants to call out something other than a normal set (e.g. "set 3 of this exercise is a drop set"). Four types: Normal, Drop Set, Rest-Pause, FST-7.

**The three special techniques' descriptions are a fixed, built-in constant** (`SET_TYPE_DESCRIPTIONS` in `src/lib/set-types.ts`), not something a coach types out per exercise — same reasoning as `GOAL_TYPES` and `RECIPE_TAGS`: a coach picks a type, every client sees the exact same accurate explanation every time, from whichever coach:
- **Drop Set** — perform to your target reps (or near failure), then immediately drop the weight ~20-30% and keep going for as many reps as you can, no rest in between.
- **Rest-Pause** — reps to near failure, rack it, rest 10-15 seconds, continue with the same weight for a few more reps — repeat that cycle 2-3 times as one "set."
- **FST-7** — seven sets of the last exercise for a muscle group, moderate weight, 8-12 reps, only 30-45 seconds rest, with a deep stretch held after each set — meant to pump blood into the muscle and stretch the surrounding fascia.

**2. Coach-recommended baseline weight/reps, per exercise.** Two new optional columns on `workout_exercises` — `baseline_weight` and `baseline_reps` — filled in on the same New Workout screen where the exercise itself is added. These exist purely as a fallback number: when a client logging a set has no previous session of their own for that exercise to pull real numbers from, the coach's recommended starting point is what's shown instead of nothing. Actually *using* that fallback in a logging screen is the client-facing chunk that comes next — this chunk stores it and makes sure it's genuinely there to read.

**No new detail/edit screen.** Workout Builder has always been create-once (no `workouts/[id].tsx` to come back and edit later) — both new fields are captured on the existing New Workout form, per exercise, at creation time, consistent with how the rest of that screen already works.

**Client read access is already wired up**, even though the client-facing screen itself doesn't exist yet — same "no client-facing view yet" gap as Recipe Builder and Meal Plan Templates, but for `workout_exercise_sets` specifically there's no reason to wait: it's the exact same RLS shape `client-access.sql` already grants on `workout_exercises` (read-only, only for a workout actually assigned to that client), so this migration adds it now rather than needing to be revisited later just for that.

**Verify a coach can tag sets and set baselines correctly:**
1. In the New Workout screen, add an exercise from the library, fill in a baseline weight and reps, then tap **+ Tag a set** a couple of times and set different types on each (e.g. set 1 Normal, set 2 Drop Set).
2. Remove one of the tagged sets and confirm the rest renumber immediately (set 3 becomes set 2, etc.) — set numbers should always stay contiguous starting at 1.
3. Save the workout. In Supabase, run:
   ```sql
   select we.name, we.baseline_weight, we.baseline_reps, wes.set_number, wes.set_type
   from workout_exercises we
   left join workout_exercise_sets wes on wes.exercise_id = we.id
   where we.workout_id = '<the workout id>'
   order by we.position, wes.set_number;
   ```
   Confirm the baseline numbers and every tagged set's type match exactly what you entered.

**Verify the data is actually queryable for the client-facing screen that comes next:**
1. Assign that workout to a client (same Assignments flow as before).
2. As that client (or via `set role postgres` / the SQL Editor's role switcher, or by temporarily copying the client's JWT), run the same query as above — the RLS policy this migration added means it should return the identical rows, proving a client-facing screen can genuinely read this data once it's built, not just the coach.
3. `src/lib/workouts.ts` now exports `getWorkoutDetail(workoutId)`, which runs the exact query shape a client screen will need (every exercise, its baseline, and its tagged sets, in order) — call it from anywhere in the app and confirm it returns the same numbers as steps 1-3 above. That function existing and returning correct data now is what makes it a drop-in call for the next chunk instead of new plumbing.

## Pre-workout readiness questionnaire

Run `supabase/readiness.sql` in the SQL Editor after `workout-set-types.sql`. Every client now answers a short readiness check-in at the very start of a workout session — before they see a single exercise — built on the exact same question-type system (short text/number/select/scale/measurement) as the Phase 8 check-in Forms, but structurally simpler on purpose.

**Reused vs. not reused, and why.** `form_templates` and `form_questions` (the actual question builder — types, labels, config) are reused as-is; you build a readiness questionnaire in the same Forms screen you already use for check-ins. `form_assignments` and `form_check_ins` are *not* reused, because none of what they exist for applies here — there's no recurring schedule, no due-window, no "missed" state to track. Readiness is triggered by starting a workout, full stop. Reusing that machinery would've meant faking a recurrence rule for something that isn't recurring.

**One global questionnaire, not a per-client assignment.** `app_settings` gains one column, `readiness_form_id`, pointing at whichever single form is active — the same singleton-settings shape already used for Community's on/off switch. Every client answers the exact same questions; a coach switches which form is "the" readiness questionnaire from a new **Set as readiness** action on the Forms list, which also shows a ✓ badge on whichever one is currently active.

**Responses link to the session, not a schedule.** The new `readiness_responses` table has a straight foreign key to `assignments` — an actual, specific, already-scheduled workout for a specific client. No check-in row, no assignment-of-a-form in between. That's the real structural difference from check-ins: a readiness answer belongs to the one session it precedes, permanently, whether or not anything about "how often does this client check in" ever existed.

**A default questionnaire so there's something to test with immediately.** The migration seeds one, once: "Pre-Workout Readiness" with four scale (1–10) questions — sleep quality, muscle soreness, energy level, stress — owned by whichever coach account already exists, and marked active automatically. If you later build your own and set it as active, this default is simply no longer used (still sitting in your Forms library, easy to delete once you don't need it as a reference).

**Where the gate lives.** The client's workout session screen (`/assigned/[id]`) now checks readiness status before rendering exercises: if the active questionnaire hasn't been answered yet for *this specific session*, the questionnaire shows instead — same screen, no separate route. Submitting reveals the exercises immediately, no reload needed. A session that's already `completed`, or one where no readiness questionnaire is configured at all, skips the gate entirely and behaves exactly as before this chunk.

**Verify the questionnaire shows correctly:**
1. As the coach, open Check-in Forms — confirm "Pre-Workout Readiness" appears with its ✓ badge and 4 questions (or build your own and tap **Set as readiness** on it).
2. As a client with a pending workout assigned, open that workout. Confirm you see the readiness questions — not the exercise list — and that submitting with a question left blank shows a validation error instead of going through.
3. Answer every question and submit. Confirm the exercise list (and Mark Complete flow) now appears in the same screen, unchanged from before this chunk.
4. Reopen the same workout. Confirm the readiness questionnaire does **not** show again — it's already answered for this session.

**Verify responses link to the right session:**
1. Have the same client complete readiness for two different assigned workouts (two different `assignments` rows).
2. In Supabase, run:
   ```sql
   select assignment_id, question_id, answer
   from readiness_responses
   where client_id = '<the client id>'
   order by assignment_id, question_id;
   ```
   Confirm each session's four answers are grouped under its own distinct `assignment_id` — never mixed together, and never overwriting each other, even though both sets of answers came from the same client and the same questionnaire.
3. Delete (or in a test environment, note the id of) one assignment and confirm its `readiness_responses` rows disappear with it (`on delete cascade`) while the other session's rows are untouched.

**Fix, added after this chunk shipped: a client could never actually read the readiness form itself.** `form_templates`/`form_questions` only had a client-facing read policy for a form reached via `form_assignments` or `form_check_ins` (`form-client-access.sql`) — and this chunk's whole design point, right above, is that the readiness form deliberately isn't reached through either of those. So a client had permission to answer the readiness questionnaire (`readiness_responses`' own policies were fine) but never permission to actually see it — RLS silently returned zero rows rather than erroring, which surfaced as *every* workout failing to open with "Cannot coerce the result to a single JSON object." Run `supabase/readiness-client-access.sql` after `live-session.sql` — it grants read access to a form specifically when it's the one currently configured as the active readiness questionnaire, additive to the existing "assigned to them" access.

## Weight/reps prefill: previous session, then coach baseline, then nothing made up

No new migration — this is entirely app code, since every field it needs (`workout_logs`, and `workout_exercises.exercise_library_id`/`baseline_weight`/`baseline_reps`) already existed from earlier chunks. When a client opens an exercise they haven't logged yet for *this* session, the weight/reps fields now start pre-filled instead of blank, using a strict fallback order — and every pre-filled number stays fully editable, it's a starting point, never a locked value.

**The three cases, walked through with concrete examples:**

1. **Bench Press** — this client logged it 60kg × 8 reps in a previous session, and the coach also set a baseline of 40kg × 10 on this exercise. **Case 1 wins**: the fields pre-fill with 60 / 8, their own actual last performance — a real result always outranks a generic recommendation, even when both exist.
2. **Bulgarian Split Squat** — this client has never logged this exercise before (first time it's come up), but the coach set a baseline of 20kg × 12 when building the workout. **Case 2**: the fields pre-fill with 20 / 12, and the screen labels it "Prefilled from your coach's suggested starting point" so the client knows it's a recommendation, not their own history.
3. **Cable Face Pull** — brand new to this client, and the coach never set a baseline for it either. **Case 3**: the fields stay empty, with placeholder hint text ("Enter your starting weight" / "Enter your starting reps") instead of the generic "Weight"/"Reps" labels used everywhere else. Deliberately no fabricated number here — a "light starting weight" means something completely different for a deadlift than a bicep curl, so guessing one would be actively misleading rather than helpful.

**Matching by the exercise, not the workout-exercise row.** Every time an exercise is added to a new workout, it gets a brand-new `workout_exercises` row (a fresh instance, its own id) — but it's the same underlying `exercise_library_id` every time the coach picks "Bench Press" again. Case 1's lookup matches on that library id across the client's entire logging history, not on any specific `workout_exercises.id`, which is what makes "their most recent numbers for this exact exercise" mean the same exercise across different workouts, weeks, and programmes — not just a coincidental repeat within one workout.

**Resuming your own in-progress session takes priority over all three cases.** If a client already logged this exact exercise for THIS assignment (reopening a partly-filled session, or one already marked complete), the fields always show exactly what they themselves entered — the fallback chain never overwrites a real answer that already exists; it only ever fires for an exercise this specific session hasn't touched yet.

**Verify all three fallback cases actually trigger:**
1. **Previous session (case 1)**: log an exercise once (any weight/reps), mark that workout complete. Assign the *same client* a new workout containing the *same library exercise*. Open it — the fields should pre-fill with what was logged last time, and a small note should say it came from your last session.
2. **Coach baseline (case 2)**: pick an exercise this client has never logged. In Workout Builder, set a baseline weight/reps on it when adding it to a workout, then assign that workout. Open it as the client — the fields should pre-fill with the coach's numbers, labeled as a suggested starting point.
3. **Nothing available (case 3)**: assign a workout with an exercise this client has never logged and that has no baseline set. Open it — both fields should be empty, showing "Enter your starting weight" / "Enter your starting reps" instead of the usual placeholders.
4. **Editability**: in any of the three cases, change the pre-filled number before saving, then mark the workout complete. Confirm what's actually stored (`select weight, reps from workout_logs where assignment_id = '<id>';`) matches what you typed, not the original suggestion.
5. **Priority check**: reopen a workout you already partially logged (don't mark it complete). Confirm the fields show what you entered then — not a fresh pull from the fallback chain — proving case 0 (resuming your own session) always wins over cases 1–3.

## Mid-session exercise swap, for today only

Run `supabase/exercise-swaps.sql` in the SQL Editor after `readiness.sql`. A client can swap any exercise in a live session for a same-muscle-group alternative from the Exercise Library — "the bench is taken, I'll do incline dumbbell press instead" — without touching the coach's actual programme.

**Why this can't be a direct edit.** `workout_exercises` rows are shared by reference, not copied, across every assignment that points at them — assigning a workout just creates an `assignments` row linking to the existing `workout_id`; it never duplicates the workout or its exercises. The same "Push Day" and its exact exercise rows can be attached to many clients, or the same client on many recurring dates. Editing a `workout_exercises` row directly to "swap" it would silently change that exercise for every other assignment referencing it too — every other client, every other date, and the coach's original design. So swapping is a brand new, purely additive table instead: `assignment_exercise_swaps` records "for THIS one assignment, THIS one exercise slot was actually performed as something else" — nothing else ever reads or writes it, and `workout_exercises` itself is never touched.

**The exercise "slot" and what's actually performed are different things.** `workout_logs.exercise_id` still points at the original `workout_exercises` row regardless of a swap — that row represents *position* #3 in the workout, not a locked-in exercise. A swap changes what was actually performed in that position for one session; it doesn't change which position a logged set belongs to. The client's session screen is what overlays a swap's replacement name onto the display (and onto the prefill logic below) — the database's own foreign keys never move.

**The swapped exercise goes through last chunk's full 3-tier prefill logic, fresh — and the original exercise's baseline does NOT carry over.** A swap is "effectively a new exercise for logging purposes," so: (1) this client's own previous-session history for the *replacement* exercise, if any: (2) the coach's baseline, but only if this exercise was never swapped — a baseline of 40kg set for Bench Press is meaningless for whatever it got swapped to, so it's deliberately suppressed the instant a swap is active; (3) otherwise, empty with a hint, same as always. Undoing a swap reverts all of this back to the original exercise's own numbers.

**Verify the swap is session-only and doesn't quietly alter the programme:**
1. Note a workout's exercise and its `workout_exercises.id` (call it `<slot-id>`) — `select id, name, exercise_library_id from workout_exercises where id = '<slot-id>';`.
2. As the client, open that session and swap that exercise for an alternative.
3. Re-run the exact same query from step 1 — confirm it returns **identical** results. The swap changed nothing about the row itself.
4. Run `select * from assignment_exercise_swaps where assignment_id = '<this assignment id>';` — confirm the swap is recorded there, scoped to this one assignment.
5. If this same workout is assigned to another client, or to this same client on a different date, open that *other* assignment and confirm it still shows the original, un-swapped exercise — proving the swap never leaked into the shared workout definition.
6. If this workout belongs to a Programme Builder week, reopen the programme and confirm the week's session still lists the original exercise, untouched.
7. Tap **Undo** on the swapped exercise and confirm it reverts to the original name and its coach baseline (if one was set) — then confirm `assignment_exercise_swaps` no longer has a row for that slot.
8. Log the swapped exercise and mark the workout complete — confirm `workout_logs.exercise_id` still equals `<slot-id>` (the original slot), not some new id — the log belongs to the position in the workout, exactly as before this chunk.

## The live session screen: per-set logging, RPE, an auto rest timer, and local-first caching

Run `supabase/live-session.sql` in the SQL Editor after `exercise-swaps.sql`. This is the screen the last four chunks were all building toward: `/assigned/[id]` now logs a session **set by set**, not one number per exercise, and brings prefill, swap, and set-type tagging together on it for the first time. It also stops depending on the network to not lose a set.

**Why logging moved from one row per exercise to one row per set.** `workout_logs` used to hold a single weight/reps/rpe per exercise per assignment — fine for "how much did you lift," useless for "what did you actually do on set 3 of the drop set." This chunk adds `workout_logs.set_number` and `workout_logs.rpe`, plus a `unique (assignment_id, exercise_id, set_number)` constraint, so every set a client checks off is its own row. `getAssignmentDetail()` no longer touches `workout_logs` at all — what's *prescribed* (name, description, sets/reps, tagged set-types, baseline) and what's *actually logged* are now fully separate concerns, fetched and merged by the screen. How many checkable set rows to show is a heuristic, not a stored count: it's the leading number parsed out of `sets_reps` (e.g. "4x8" → 4), widened to cover any set a coach explicitly tagged past that number — so a coach who tags set 5 of a "3x10" as an FST-7 finisher always sees 5 rows, never 3.

**Each set's checkbox drives the rest timer, weight/reps are logged per set, and a tagged set shows its own instructions inline.** Checking a set complete auto-starts a rest timer (90 seconds, ±15s adjustable, or Skip) — the same timer whether it's a plain set or a Drop Set/Rest-Pause/FST-7 one. A tagged set additionally shows a small label ("Drop Set") and the exact built-in instructions for performing it (from `src/lib/set-types.ts`, unchanged from the Workout Builder chunk), directly under that set's checkbox — so the client doesn't have to remember what a drop set is mid-workout.

**RPE is asked once per exercise, not once per set.** It reuses the same 1–10 scale input the readiness questionnaire uses (a smaller `compact` version of it — `src/components/question-answer-input.tsx`'s `AnswerInput` now takes an optional `compact` prop, only affecting the scale chips' size), but only renders under the *last* set of each exercise — asking "how hard did that feel" four separate times for a 4-set exercise added noise without adding information. The value is still stored exactly where the rest of this chunk's design already put it: on that last set's own `workout_logs` row (`set_number` = the exercise's final set); earlier sets in the same exercise simply have `rpe = null`, same as any set nobody was asked to rate.

**Local-first caching, so a set is never lost to a bad connection.** This is the mechanism piece, and it's worth walking through exactly what happens when you tap a set's checkbox, in order:

1. **The write to on-device storage happens first, and the UI waits only on that.** The set's values are saved to `AsyncStorage` immediately (a plain device-storage write — it cannot fail because of the network), and the checkbox flips to checked the instant that's done.
2. **The push to Supabase is then attempted, but never allowed to block or fail the UI.** If it succeeds, the local entry is marked `synced: true` and nothing else happens. If it fails — phone loses signal, Supabase is briefly unreachable, anything — the failure is caught, logged, and otherwise ignored. The set stays checked, exactly as if the push had succeeded, because as far as the client is concerned, they did the set. What's missing is durably recorded as `synced: false` on-device, not lost.
3. **Every unsynced entry gets retried automatically, with no user action required.** A retry sweep runs on screen load, after every subsequent set that gets checked (a natural "we're talking to the network again" moment), and on a quiet 20-second timer for as long as the screen stays open. A single in-memory flag stops two sweeps from overlapping; if the client keeps working while offline, the queue just grows until connectivity returns.
4. **Retrying is always safe, even if a push actually succeeded and only the confirmation was lost.** Every sync is an `upsert` keyed on the same `(assignment_id, exercise_id, set_number)` constraint the SQL above adds — so retrying a set that's secretly already saved just overwrites it with the same values, never creates a duplicate row or throws a conflict error.
5. **Reopening the screen trusts on-device data over the server for anything not yet confirmed.** On load, the screen merges Supabase's confirmed logs with whatever's still sitting in local cache, and a local unsynced value always wins — it reflects the last thing the client actually did, which the server may not know about yet. Once everything for a session is confirmed synced, the local cache for it is cleared; a leftover entry for a finished session is harmless either way.

Unchecking a set (or editing an already-checked one) goes through the exact same local-write-first path — including a queued delete if the un-check itself fails to reach the server offline.

**Swaps and prefill both plug into the per-set model exactly as designed in earlier chunks.** A swap's replacement exercise goes through its own fresh 3-tier prefill (previous session for *that* exercise → coach baseline, suppressed since a swap is active → empty with a hint), per set — so an ascending pyramid's different weight per set still prefills correctly. Tagged set-types are deliberately **not** cleared by a swap — a "set 3 is a drop set" instruction describes the session's structure, not which exercise fills that slot, so it stays exactly where it was even if the exercise underneath it changes. Swapping (or undoing a swap) does clear any sets already checked off under the exercise identity being replaced, since those checked numbers belonged to whichever exercise was actually performed at the time.

**Verify the whole screen — prefill, swap, set-types, checkboxes, timer, and local caching — together, in one real session:**
1. Assign a workout with at least two exercises: one the client has logged before (any previous completed assignment with the same library exercise), and one with a coach-set baseline but no history. Open it as that client.
2. If a readiness questionnaire is active, answer it — confirm the exercise list only appears after submitting.
3. Confirm the previously-logged exercise pre-fills per set from its own last session (not one number smeared across every set, if it had a different weight per set), labeled "From your last session with this exercise"; confirm the baseline-only exercise pre-fills from the coach's numbers, labeled as a suggested starting point.
4. If either exercise has a coach-tagged set (Drop Set/Rest-Pause/FST-7 from the Workout Builder), confirm that set shows the label and its full built-in instructions.
5. Check a set complete — confirm the rest timer starts automatically at the top of the screen, and that ±15s/Skip work.
6. Tap **Swap** on one exercise, pick a same-muscle-group alternative, and confirm: the name/description update, its baseline suggestion is gone (fresh prefill instead), and any tagged set on that exercise still shows its label. Tap **Undo** and confirm it reverts fully, including the prefill.
7. To see local caching survive an actual failure: put your device in Airplane Mode (or otherwise cut its connection), then check a new set complete. It should still show as checked — nothing on screen indicates a failure. Leave Airplane Mode on and fully close/reopen the app to that same session: the set should *still* show checked, proving it was never only sitting in memory. Turn connectivity back on and wait roughly 20 seconds (or check one more set, which also triggers a retry).
8. In Supabase, confirm the set from step 7 actually landed:
   ```sql
   select assignment_id, exercise_id, set_number, weight, reps, rpe
   from workout_logs
   where assignment_id = '<this assignment id>'
   order by exercise_id, set_number;
   ```
   Confirm one row per checked set (not per exercise), with the weight/reps/RPE you actually entered — including the one you logged offline in step 7.
9. Tap **Finish Session** — confirm the status flips to Completed, every input becomes read-only, and re-running the query above shows nothing changed from what was already logged incrementally (finishing the session never (re-)saves anything itself — every set was already saved the moment it was checked).

## Editing a saved workout, and unassigning workouts/programmes from a client

No new migration — every table and RLS policy this needed already existed (`workout_exercises`/`workout_exercise_sets` already had coach-scoped update/delete policies from earlier chunks; `assignments` already had a coach-scoped delete policy). This chunk closes two gaps: there was no way to open an already-saved workout and change it, and no way to pull a workout or programme back off a client once assigned.

**Editing a workout reuses the exact same builder screen as creating one.** `/workouts/[id]` (tap **Edit** on a workout in My Workouts) renders the identical form `/workouts/new` does — same exercise search, same baseline fields, same set-type tagging — just preloaded from `getWorkoutDetail()` instead of starting blank. Both routes are now thin wrappers around one shared `<WorkoutForm>` component, so there's exactly one place this UI's behavior lives, not two copies that could quietly drift apart.

**Saving an edit updates exercises in place — it never deletes and recreates them.** An exercise a client has already logged sets against still has to mean the same thing after the coach tweaks its sets/reps or baseline, so every exercise the coach keeps is updated by its existing row id, never replaced. Only genuinely new exercises get a fresh insert, and only genuinely removed ones get deleted — and a removal is checked against `workout_logs` first: if a client has ever logged a set against that exercise, the whole save is refused with a clear message naming it, rather than silently cascading away that client's real history. (Tagged sets themselves carry no history of their own — `workout_logs` stores its own set number directly — so those are freely replaced on every save.)

**Unassigning a workout deletes the assignment outright, but only when that's actually safe.** A pending workout with nothing logged against it yet is a scheduling mistake with no cost to undoing — "Unassign" on the Clients page removes it completely. It's refused for a completed workout (that's a real result) and refused for a pending one the client has already started logging sets against, even though it's technically still "pending" — deleting the assignment would cascade-delete those real logged sets right along with it.

**Unassigning a programme archives it, using the exact same flag as everything else in this app that "unassigns" — it never deletes.** A client's assigned programme is already their own fully independent copy (made by `assignProgrammeToClient` back when Programme Builder shipped), so "Unassign" flips `programme_blocks.archived` on that copy and archives every workout under its own weeks too. Archiving those workouts is what makes any of the programme's still-*pending* sessions disappear from Up Next and the Calendar — reusing the exact same archived-workout check the live session screen chunk added to `listMyAssignments()`, rather than a second, parallel filter. Anything already completed under the programme is untouched either way, on both counts: an archived programme still exists for `getProgrammeDetail()`/history, and archiving a workout only ever hides a pending one, never a real logged result.

**Verify editing a workout preserves history correctly:**
1. As the coach, open a workout that's been assigned to a client who has already logged at least one set against one of its exercises.
2. Tap **Edit**, remove that specific exercise, and try to save. Confirm you get an error naming it and explaining it can't be removed — and that nothing was changed (`select * from workout_exercises where workout_id = '<id>';` still shows it).
3. Instead, just change that exercise's sets/reps or baseline and save. Confirm the save succeeds and `workout_exercises.id` for that row is unchanged (`select id from workout_exercises where workout_id = '<id>' order by position;`) — proving the client's earlier logged sets (`workout_logs.exercise_id`) still point at a row that still exists and still means the same exercise.
4. Add a brand-new exercise and save. Confirm it appears at the bottom of the workout for anyone who opens it next.

**Verify unassigning a workout respects logged history:**
1. On the Clients page, under **Assigned Workouts**, unassign a pending workout with nothing logged yet. Confirm it disappears from the list, and `select * from assignments where id = '<id>';` returns nothing.
2. Try to unassign a pending workout the client has already logged at least one set against. Confirm you get an error and the assignment (and its logs) are untouched.
3. Confirm a **completed** workout shows in the list with no Unassign option at all.

**Verify unassigning a programme:**
1. Assign a programme to a client, then have them complete at least one session and leave at least one more pending.
2. On the Clients page, tap **Unassign** on the Programme card. Confirm the card now reads "No programme assigned yet."
3. As that client, confirm the pending session is gone from Up Next and the Calendar, but the completed one still shows in their history exactly as before.
4. Run `select archived from programme_blocks where id = '<programme id>';` — confirm `true`, and confirm the row (and its weeks/workouts/logs) still exist rather than being gone.

## Session-level RPE, Mark Workout Complete, and a 10-minute background snapshot

Run `supabase/session-rpe.sql` in the SQL Editor after `readiness-client-access.sql`. Three small additions on top of the live session screen, all client-facing.

**Session-level RPE is one number per session, not per set.** It lives directly on `assignments.session_rpe` — a single column, not a new table, since there's exactly one of it per session, same reasoning as `assigned_date` or `status` living there. It's a completely separate value from the per-exercise RPE the live session screen already asks for after each exercise's last set: that one is "how hard did THIS exercise feel," this one is "how did the WHOLE session feel," asked once, at the bottom of the screen. `assignments` already had its `UPDATE` privilege locked down to an explicit column allow-list (`reschedule.sql`'s fix for the same kind of gap `lock-coach-role.sql` and others closed elsewhere) — this migration adds `session_rpe` to that list; skipping it would make the save fail with a real Postgres permission error the moment it's used.

**"Mark Workout Complete" is the existing finish button, not a new one.** `finishSession()` now takes the session RPE as a second argument and saves it in the exact same database write that flips `status` to `completed` — one write, not two. XP and streaks needed no new "trigger": XP was already awarded right there in the same handler, and the streak (`src/lib/streak.ts`) is a pure calculation read fresh from completed assignments wherever it's shown, so it reflects a just-finished session the instant that write lands, automatically. The rating is optional — skipping it saves `null`, same as this app's standing rule against fabricating a number nobody actually gave it.

**The 10-minute snapshot is a safety net layered ON TOP of the live session screen's existing local-cache system, not a replacement for it.** That system (from the live session screen chunk) only ever saves a set's values the instant it's *checked complete* — a weight typed into a box that's never been checked was never captured anywhere before this. Every 10 minutes while a session is open and still pending, a separate timer:
1. Writes a full snapshot of everything currently on screen — every set's typed weight/reps/RPE, checked or not, plus the session-level RPE if started — to its own spot in on-device storage (`src/lib/session-snapshot.ts`), independent of any check action.
2. Also re-triggers the existing per-set sync retry, as an extra, less-frequent chance for anything stuck to get pushed, on top of that system's own 20-second loop.

On reopening the screen, that snapshot is checked: for any set that's still *unchecked*, whatever was in its boxes at the last snapshot is restored into the form. A set that's already checked is left alone — the per-set system is the authority there; this only ever fills the specific gap that system doesn't cover. The snapshot is deleted the moment a session is actually marked complete, same as the per-set cache already is.

**Verify all three, in one session:**
1. Open a pending workout as a client. Confirm a "How did the whole session feel?" 1–10 selector appears near the bottom, below the exercises — and confirm it's visually distinct from any per-exercise RPE row above it (those only appear on an exercise's last set).
2. Log at least one set normally, rate the session, and tap **Mark Workout Complete**. Confirm the screen flips to Completed, the session RPE becomes read-only showing what you picked, and:
   ```sql
   select status, session_rpe from assignments where id = '<this assignment id>';
   ```
   shows both saved together.
3. Confirm XP and the streak reflect the session the same way they already did before this chunk — no separate step needed to "trigger" either.
4. For the snapshot: open a different pending session, type a weight/reps into a set WITHOUT checking it off, and leave the screen open at least 10 minutes (or force it sooner for testing by temporarily lowering `SNAPSHOT_INTERVAL_MS` in `assigned/[id].tsx`). Force-close the app and reopen that same session. Confirm the unchecked set still shows what you typed. Confirm a checked set's values always come from the server/per-set cache regardless — this mechanism never overrides those.

## The completion scorecard: PBs, total weight lifted, and duration

No new migration — everything this needs (`workout_logs.weight/reps/created_at`, `assignment_exercise_swaps`, `assignments.session_rpe`) already existed. Tapping **Mark Workout Complete** now lands on a new screen, `/assigned/complete/[id]`, instead of just reloading the same screen read-only.

**A PB is "this session's heaviest weight for an exercise beats every weight this client has ever logged for that exercise, in any other session"** — matched by the exercise's real library identity, not by which `workout_exercises` row it happened to be logged against (a fresh row every time an exercise is added to any workout), the same matching rule the weight/reps prefill chunk already established. A swapped exercise is compared as whatever was actually performed (the replacement), never the originally-prescribed one it replaced. An exercise with no previous logged weight at all is **never** flagged as a PB — there's nothing for a first attempt to beat, so "personal best" wouldn't mean anything there. One accepted, documented limitation carries over from that same prefill feature: matching a *past* session's exercise identity reads straight from that old `workout_exercises` row, without re-checking whether a swap was active on it too at the time — consistent with how "previous session" already works everywhere else in this app, not a more precise version nothing else here has either.

**Total weight lifted is `sum(weight × reps)` across every logged set this session** — 0 for an all-bodyweight session, not hidden, since that's a real, honest answer, not a missing one.

**Duration is an honest approximation, not a tracked fact.** Nothing today records when a session actually starts, so this reads the timestamp range already sitting on the session's own logged sets — first set checked to last set checked. It undercounts any time spent before the first set and after the last one before tapping Complete, but it's a genuine measurement rather than an invented one. A session logged in one quick pass (or during testing) can come back as "&lt;1m" — shown as-is, not smoothed over.

**The screen is computed fresh every time it's opened, not a stored snapshot.** Reopening a completed session later from Training or the Calendar still shows the ordinary read-only `/assigned/[id]` view exactly as before this chunk — this scorecard is a one-time landing screen right after finishing, not the permanent detail view for a finished session.

**A new `<StatRing>` component** (`src/components/stat-ring.tsx`) draws the ring gauges — an SVG circle with a teal arc on a carbon-black track, soft teal glow behind it, sized to fit whatever number lands in the middle. A stat with a real 0–10 (or similar) ceiling — session RPE — passes a real 0–1 `progress` fraction, and an unrated one renders as a genuinely **empty** ring, never a misleadingly full one that would look like a maxed-out rating nobody actually gave. A stat with no natural ceiling — total weight lifted — omits `progress` entirely and renders as a full ring, used purely as a frame around the number rather than a fabricated percentage. Oxblood appears exactly once on the whole screen: the **Done** button, per this app's own color rule that oxblood is for buttons and active states only, never decoration.

**Verify the whole scorecard, using your own real logged history:**
1. Pick (or set up) a client with at least one already-completed session logging a specific exercise at a known weight.
2. Assign them a new workout with that same exercise, have them log a **heavier** weight on it this time, and a **second** exercise they've done before at a **lighter** weight than their previous best, and (optionally) a **third**, brand-new exercise they've never logged. Rate the session and tap **Mark Workout Complete**.
3. Confirm the scorecard shows: a PB card for the heavier exercise (with "up from Xkg"), no PB card for the lighter one, and no PB card for the brand-new one either.
4. Confirm the total weight lifted number matches `select sum(weight*reps) from workout_logs where assignment_id = '<this assignment id>';` run in Supabase.
5. Confirm the session RPE ring matches what was actually rated (or renders empty if skipped), and the duration is a plausible span given how long logging actually took.
6. If this session included a mid-session swap, confirm any PB check on that slot compared against the swapped-in exercise's own history, not the originally-prescribed exercise's.
7. Tap **Done**, then reopen the same (now completed) assignment from Training or the Calendar — confirm it shows the ordinary read-only logged-sets view, not the scorecard again.

## Volume Analyser: a weekly per-muscle-group heat-map on the Training tab

No new migration — this reads data that already exists (`workout_logs`, `workout_exercises`, `assignment_exercise_swaps`, `exercise_library`), it's just never been aggregated by muscle group before.

**"This week" is the exact same Monday–Sunday window Momentum Score and the Leaderboard already use** — `getCurrentWeekRange()` from `momentum.ts`, reused rather than a second copy of the date math, so "this week" means the same thing everywhere in the app.

**Every logged set counts, including ones from a still-in-progress session.** A `workout_logs` row only ever exists because a set was actually checked off, so counting rows already means "sets actually done" — it's not waiting for the whole session to be marked complete first.

**Swap-aware, same rule as PBs and the scorecard**: a set logged against a slot that was swapped mid-session counts toward the *replacement* exercise's muscle group, not the originally-prescribed one — that's what was actually performed. The one accepted limitation carried over from the same prefill/scorecard logic: a swap is only checked for the assignment the set belongs to, not re-verified for consistency with any other session.

**Tiers: bright teal under 10 sets, deep teal 10–19, oxblood 20+**, per muscle group — a real on-brand intensity gradient, not a borrowed red/yellow/green traffic light (that was a first-draft mistake, corrected before shipping to real clients). Oxblood already means "needs attention" everywhere else in the app (buttons, active/selected states), so a muscle group pushed into overtraining reads exactly the same way here — the palette stays self-consistent instead of importing an unrelated convention. **Zero sets logged gets no color at all**, a plain neutral region, rather than being lumped in with "bright teal" as if some real (if light) work had been done there. The **overall status badge** (Low/Moderate/High) takes the *worst* tier reached by any single muscle group, not an average — one muscle group pushed into the red is worth flagging on its own, and averaging it against several quiet ones would hide exactly what this card exists to catch.

**The heat-map is the real reference "Muscle Anatomy" chart artwork, used exactly as supplied — not redrawn.** `assets/images/muscle-anatomy-front.png` and `muscle-anatomy-back.png` are that artwork's own line art (background removed, black lines recolored bone-white so they read on a dark card), rendered on-screen unmodified. Every colored region — deltoids, pecs, the segmented ab grid, biceps/forearms, quads, calves on the front; traps, lats, triceps, glutes/hamstrings, calves on the back — is that same artwork's own enclosed shape, traced directly off its line art (connected-component labeling of the outline, one shape per drawn muscle) rather than approximated by hand, so a color fill always lines up exactly with the muscle it's naming. The fills render as an SVG layer *underneath* the artwork image, with the artwork's own lines on top — the same "colored regions, real outline strokes" look as a printed anatomy poster. A soft teal ambient glow sits behind the whole diagram (`Glow.teal`, the same treatment `<StatRing>` already uses), so it still reads as part of this app's visual language. Tap anywhere on it to flip between front and back. Chest and core only exist on the front artwork (not visible from behind); back only exists on the back artwork; shoulders/arms/legs/calves appear on both since they're visible either way and always carry the same count.

**The card sits directly beneath the "Workouts Assigned" hero stat** — the first thing in the Training tab's scrollable content, above even the Programme section — since this week's training load is the thing worth seeing first.

**New files**: `src/lib/muscle-group-analysis.ts` (`getWeeklyMuscleGroupSetCounts()`, `tierForSetCount()`, `overallVolumeStatus()`), `src/components/muscle-heatmap.tsx` (`<MuscleHeatmap>`, the tap-to-flip diagram — the two PNG assets plus the SVG fill paths traced off them, plus `colorForCount()` — the shared zero-aware tier color, so the diagram and the list below it never disagree), `src/components/workout-analyser-card.tsx` (`<WorkoutAnalyserCard>` — the whole card: heatmap + exact-count list + status badge), wired into `client/training.tsx` right after the hero stat.

**Verify the set counts are correct against real logged data:**
1. Note today's Monday–Sunday window (Monday's date through the following Sunday).
2. In Supabase, run a query resolving each of this week's logged sets to its real muscle group, swap-aware:
   ```sql
   select coalesce(el2.muscle_group, el1.muscle_group) as muscle_group, count(*) as sets
   from workout_logs wl
   join assignments a on a.id = wl.assignment_id
   join workout_exercises we on we.id = wl.exercise_id
   join exercise_library el1 on el1.id = we.exercise_library_id
   left join assignment_exercise_swaps s on s.assignment_id = wl.assignment_id and s.workout_exercise_id = wl.exercise_id
   left join exercise_library el2 on el2.id = s.replacement_exercise_library_id
   where a.client_id = '<this client's id>'
     and a.assigned_date >= '<this Monday>' and a.assigned_date <= '<this Sunday>'
   group by 1;
   ```
3. Compare each row's count against what the Volume Analyser card shows for that muscle group, and confirm the tier color (neutral at 0, then bright teal/deep teal/oxblood at the 10/20 thresholds) matches.
4. Confirm a set logged on a date **outside** this window (last week, or a session dated for later) is **not** included in either the app's numbers or the query above.
5. If a session included a mid-session swap, confirm its sets are counted under the swapped-in exercise's muscle group, not the one it replaced.
6. Confirm the overall badge reads the worst tier among all seven muscle groups, not an average.

## A real coach home screen — dashboard, not a link list

The coach's `/home` used to be one card of plain text links to every section, no actual information on it. Replaced with a real dashboard built entirely from data this app already has — nothing here is a placeholder or an invented number.

**Deliberately missing two things a template coaching dashboard would have**: a revenue card and an appointments/calendar card. This app has no billing integration and no session-booking feature, so there's nothing genuine to put in either one — a fake number there would be actively misleading, not just decorative, so neither exists.

**Four real stat tiles**: Active Clients (`listClients().length`), Avg Compliance (the average of every client's own Compliance Score — the exact same 28-day calculation the Clients list already shows per client, not a new metric), Overdue Check-ins (check-ins still `pending` and already past their `due_at`, excluding ones already auto-archived as `missed` — those already have their outcome recorded, this is specifically the ones a nudge could still save), and Open Reports (the same open-reports count the Community moderation screen uses). The compliance-color coding (`complianceColor()`, now shared out of `compliance.ts` so the Clients list and this dashboard never disagree on what "red" means) carries over to the Avg Compliance tile.

**Needs Attention** lists every client below 50% compliance, worst first, tap through to their detail page — or a plain "every client is above 50%" line when nobody qualifies, not an empty gap.

**Recent Activity is a genuine merged feed** of logged meals and completed workout sessions across every client, most recent first. Two real constraints worth knowing: habit-log and weight-log activity are left out on purpose — coaches don't have read access to either table yet (no RLS policy grants it, unlike `food_logs` and `workout_logs`), so including them would silently show nothing or fail outright; and a completed workout's timestamp is approximated the same way the completion scorecard already does, from that session's most recently logged set, since `assignments` has no `completed_at` column of its own.

**Every other coach destination is still one tap away**, just organized into two real groups instead of one long list: **Manage** (Clients, Messages, Assignments, Community, Check-in Forms) and **Coaching Hub** (Programmes, Workouts, Exercise Library, Habits, Recipes, Meal Plans) — the same eleven screens as before, grouped by how a coach actually uses them.

**New file**: `src/lib/coach-dashboard.ts` — `getCoachDashboardStats()`, `getClientsNeedingAttention()`, `getRecentClientActivity()`.

**Verify against real data:**
1. Confirm Active Clients matches `select count(*) from profiles where role = 'client';`.
2. Confirm Avg Compliance is the mean of what the Clients list shows for every individual client (open a few to check).
3. Confirm Overdue Check-ins matches `select count(*) from form_check_ins where status = 'pending' and archived = false and due_at < now();`.
4. Confirm Open Reports matches the count on the Community moderation screen.
5. Log a meal and complete a workout as a test client — confirm both appear at the top of Recent Activity within a few seconds of reopening the dashboard, in the correct order (most recent first), with the right client name.
6. Drop a client's compliance below 50% (or find one already there) and confirm they appear in Needs Attention; confirm a client sitting at exactly 50% or above does not.

## Client Home tab: side-by-side hero stats, and an honest Steps placeholder

The client's Home tab had one full-width Momentum Score block and nothing else at a glance — everything else (streak, level, Up Next, habits) was further down the scroll. Added a 3-across hero row right under the greeting: Momentum, Steps, and Calories Today, using the new shared `<StatTile>` component (`src/components/stat-tile.tsx`, also used by the coach dashboard's stat row now, so the two screens share one visual language for "small stat card in a row").

**Momentum and Calories Today are both real, already-computed numbers** — Momentum reuses `getMomentumScore()` exactly as before (just displayed as a compact tile instead of a full-width `<HeroStat>`), and Calories Today is a genuinely new calculation: `sum(calories)` across today's `food_logs`, shown against the client's real calorie target (`getCalorieTarget()`, the same Adaptive TDEE number Nutrition and Compliance already use) when one exists, or a plain "logged today" otherwise.

**Steps is a deliberate, honest placeholder — not a fake number.** This app has no step data anywhere: no pedometer/HealthKit integration, no manual step log, nothing in the database. Rather than invent a number, the Steps tile renders in a visibly different, muted style — a dashed border, a plain "--", "Sync a wearable" as its subtitle — so it reads as "not connected yet," not as a real zero. It'll start showing a real number the moment a wearable integration exists to back it; nothing about the design needs to change then beyond swapping in that real value.

**`<StatTile>` has a `muted` mode for exactly this situation** — any future "not connected yet" stat (anywhere in the app) can reuse the same honest-placeholder treatment instead of a new one-off getting invented per screen.

**Smaller layout cleanup while in here**: the greeting now shows first name only (matching the coach dashboard's greeting) instead of the full name, which was wrapping to three lines on longer names; streak and Level/XP were combined into one compact row instead of two separate stacked blocks, freeing up space so the hero stats and Up Next are visible without scrolling on most phones.

**Verify:**
1. Confirm the Momentum tile's number matches what the old full-width version showed (no calculation change, just a smaller card).
2. Log a meal or two as a test client, confirm Calories Today updates to match `select sum(calories) from food_logs where client_id = '<id>' and log_date = current_date;` on reopening Home.
3. Confirm the Steps tile always shows "--" / "Sync a wearable" in its own muted, dashed-border style — never a number, never styled like the other two.

## Pausing a client — reversible, and it touches nothing else

Added a `status` field to clients (`active` | `paused`) and the coach-side action to change it. Worth being upfront about: the user asked for this assuming the status field already existed in the data model — it didn't (`profiles` only ever had `role`), so this chunk adds the column and its RLS from scratch, not just a UI wired to something already there.

**Pausing changes exactly one thing: the `status` column on that client's own profile row.** No workout, log, assignment, or message is touched, archived, or hidden — the client keeps full app access and every screen works for them exactly as before. The only visible effect anywhere in the app is cosmetic: a "Paused" badge next to their name on the Clients screen, and the coach dashboard's **Active Clients** count no longer includes them. Reactivating is the identical write with the other value — there's no separate "restore" path to get wrong.

**Deliberately scoped narrow.** `listClients()` — the one function every coach screen shares (assigning workouts, messaging, the roster itself) — still returns every client regardless of status, unchanged. A paused client stays fully reachable everywhere except the one place "Active" is a literal, displayed claim (the dashboard count). Compliance scoring, Needs Attention, and the Recent Activity feed are also untouched — pausing doesn't hide a client's history from the coach, only from that one headline number. If you'd rather paused clients disappear from more places (the assign-workout picker, say), that's a follow-up, not a hidden side effect of this one.

**A real gap closed while adding this, not left as a loose end**: Postgres column grants apply to every signed-in user, not "just coaches" — a bare `grant update (status)` would have technically let a client flip their *own* status via a direct API call (bypassing the app, which never shows them this control). A small trigger (`enforce_status_change_by_coach`) closes it: any actual change to `status` is rejected unless the person making it is a coach, no matter which row policy let the UPDATE statement through in the first place.

**New migration**: `supabase/client-status.sql` — the `status` column, the coach's update policy (reusing `is_coach()` from `assignments.sql`), and that trigger. **Changed**: `clients.ts` (`ClientSummary.status`, new `setClientStatus()`), `coach-dashboard.ts` (Active Clients now actually filters on status), `clients/index.tsx` (the "Paused" badge + Pause/Reactivate action per row).

**Verify it's genuinely non-destructive:**
1. Note a client's row counts before pausing: `select (select count(*) from workout_logs where client_id = '<id>') as sets, (select count(*) from food_logs where client_id = '<id>') as meals, (select count(*) from assignments where client_id = '<id>') as assignments;`
2. Pause them from the Clients screen. Re-run the exact same query — every count should be identical, because pausing never touches any of those tables.
3. Confirm the paused client can still log in and use the app completely normally (log a set, send a message) — pausing is not a lockout.
4. Confirm the coach dashboard's Active Clients count drops by exactly one, and the client now shows the "Paused" badge on the Clients screen.
5. Reactivate them. Confirm the badge disappears and the dashboard count goes back up — same one-column write, opposite value.
6. Optional, confirms the trigger: as the *client's own* logged-in session, try `update profiles set status = 'paused' where id = auth.uid();` directly in Supabase — it should fail with "Only a coach can change a client's status," even though that client can normally update other columns (like `full_name`) on their own row.

## Modern tab icons, and extending the Home redesign to Nutrition and Compliance

Two separate things in one pass: real icons on the client's 5-tab bar (the app had none anywhere before this), and applying Home's newer "sleeker" visual language — a unified glowing summary card, side-by-side stat cards instead of a stack — to the other screens where it genuinely fits.

**Tab icons**: added `@expo/vector-icons` (the standard cross-platform icon set for Expo — works on iOS, Android, *and* web, unlike `expo-symbols`, which is iOS-only and already a dependency but unusable for a screen this app also renders on web). Installed at `^15.1.1`, matching the `^15.0.2` Expo SDK 57 expects. Each tab gets a filled glyph when active, outline otherwise (Home, Training/barbell, Nutrition/apple, Progress/trending-up, Chat/speech bubble) — color comes from the tab bar's existing `tabBarActiveTintColor`/`tabBarInactiveTintColor` (oxblood/textSecondary), the same values the text label already used, so the icon and label never disagree about which tab is active.

**Nutrition**: the date navigator, the calorie hero stat, and the three macro rings used to be three separate floating elements with a stray text line in between. They're now one glowing card (`Glow.teal`, matching the Volume Analyser and the Nutrition summary's own conceptual sibling) — "today's nutrition" now reads as one thing, not three.

**Progress → Compliance**: the two breakdown cards (check-in punctuality, macro adherence) were stacked full-width underneath the Compliance Score hero. They're now side by side, matching the "hero + supporting stats in a row" shape Home and the coach dashboard both already use, and freeing up more than half the vertical space they used to take.

**Deliberately NOT touched, and why**: Metrics, Measure, and Photos (chart- and photo-comparison-centered — a different, already-appropriate visual language; forcing stat tiles in wouldn't clarify anything and risks touching working weight/measurement-logging forms for no real gain), and Chat/Calendar (a messaging tool and a scheduler, not a stats dashboard — only their tab icons changed). "Replicate the pattern everywhere" was read as "apply it where it actually improves the screen," not "add a stat-tile row to every screen regardless of fit."

**Verify:**
1. Open the client tab bar — confirm all 5 tabs show a real icon, filled on whichever tab is active, outline on the rest, in the same oxblood/gray the labels already used.
2. Open Nutrition — confirm the date nav, calorie ring, and macro rings all sit inside one bordered/glowing card rather than floating separately.
3. Open Progress → Compliance — confirm the two breakdown cards sit side by side under the score, and that both still show their full detail sentence (the 15%/kcal specifics weren't trimmed for the sake of fitting a narrower card).

## Permanent client deletion — the one genuinely irreversible action in the app

Every other "remove" in this app so far has been reversible: archiving a workout/programme/habit, pausing a client. This is the first action that isn't, so it's deliberately built differently from anything before it — its own confirmation screen (not a modal), a coach must type the client's exact full name to enable the delete button, and the two categories of data it touches are handled on purpose, not by accident:

- **The client's own personal data — genuinely, permanently deleted.** Workout logs, food logs, weight logs, body measurements, progress photos (both the DB rows and the actual files in Storage), chat messages, form/check-in responses, assignments, habits — all of it. This isn't per-table delete code: almost every one of these tables already declared `client_id ... references profiles (id) on delete cascade`, and `profiles.id references auth.users(id) on delete cascade`. Deleting the client's actual **auth account** (not their profile row directly) is the one operation that cascades the entire database in a single atomic step.
- **Anything visible to or shared with other clients — anonymized, not deleted.** Community posts are the one exception to "cascade deletes everything": their `author_id` column used to be `on delete cascade`, which would have silently deleted a client's posts along with their account — breaking any replies or reactions other clients left on them. `supabase/client-deletion.sql` changes that one foreign key to `on delete set null` instead. Postgres sets `author_id` to `null` automatically, in the same instant, as part of the same cascade — there's no separate "anonymize" step to get the ordering wrong on or skip if something errors partway through. The app already renders `author_id = null` as **"Deleted user"** (see `community.ts`), so the post, its image, and every reply/reaction stay exactly as they were.

**Where the actual deletion happens.** Deleting an auth account requires Supabase's service-role key, and that key can never safely live in this client app — it bypasses every RLS policy that protects everyone's data. So the real work happens in a **Supabase Edge Function** (`supabase/functions/delete-client/index.ts`), deployed separately, server-side, through the Supabase dashboard. It: verifies the caller is actually a coach, verifies the target is actually a client, looks up their conversation before anything is deleted, best-effort empties their two Storage folders (`progress-photos/{clientId}`, `chat-audio/{conversationId}` — Storage files don't cascade-delete with a DB row, they need an explicit `list()` + `remove()`), and only then calls `admin.auth.admin.deleteUser(clientId)` — the actual point of no return that triggers every cascade above. It uses two separate Supabase clients internally: one built with the *caller's* own auth token, used only to check who's asking; a completely separate one built with the service-role key, used for every privileged step — so a bug in the function can't leak elevated access back to the wrong identity.

**The confirmation screen** (`clients/[id]/delete.tsx`, linked from a new "Danger Zone" section at the bottom of a client's detail page) spells out exactly what's deleted vs. kept before asking for anything, then requires typing the client's exact full name (or email, if they have no name on file) into a field — the delete button stays disabled at 40% opacity until the typed text matches exactly. `client-deletion.ts` is the thin client-side wrapper that calls the Edge Function and surfaces its real error message (not supabase-js's generic "non-2xx status") if it fails.

**New**: `supabase/client-deletion.sql` (the one FK change above), `supabase/functions/delete-client/index.ts` (the Edge Function), `src/lib/client-deletion.ts`, `src/app/(app)/clients/[id]/delete.tsx`. **Changed**: `community.ts` (`authorId`/`postAuthorId` are now `string | null`, `authorName`/`postAuthorName` render "Deleted user" when null), `community/moderation.tsx` (hides the "Block author" action on an already-anonymized report — there's no one left to block), `clients/[id].tsx` (the Danger Zone link).

**What was verified here, and what genuinely can't be**: there's no live Supabase project or Deno runtime in this sandbox, so the SQL migration and the Edge Function's actual database/Storage behavior could not be run against a real backend — only the confirmation screen's own logic was verified locally (with `supabase.from`/`supabase.functions.invoke` stubbed): the name-matching gate genuinely disables the button on a mismatch and enables it on an exact match, a successful call navigates away, and a failed call surfaces the real error message and stays put. **You need to do the rest, once, against your real project:**

1. Run `supabase/client-deletion.sql` in the SQL Editor (after `client-status.sql`).
2. Deploy the Edge Function: Supabase dashboard → **Edge Functions** → Create function → name it `delete-client` → paste in `supabase/functions/delete-client/index.ts` → Deploy. No CLI needed.
3. Pick a real throwaway test client (not a real one — this is permanent). Note their row counts first: `select (select count(*) from workout_logs where client_id = '<id>') as sets, (select count(*) from food_logs where client_id = '<id>') as meals, (select count(*) from progress_photos where client_id = '<id>') as photos;` — and have them post something to Community first.
4. From their client detail page, go to Danger Zone → Delete this client, type their exact name, confirm.
5. Re-run the same row-count query — everything should be `0`.
6. Confirm their Community post is still there, now showing "Deleted user" as the author, with any replies/reactions intact.
7. Confirm their two Storage folders (`progress-photos/<id>`, `chat-audio/<conversation-id>`) are now empty in the Storage browser.
8. Confirm their login no longer works — trying to sign in with their old email/password should fail outright, since the auth account itself is gone.

## UK supermarket products in food search, and real portion units

Two changes to the client's food-add flow, done together since both touch the same search-and-scale pipeline.

**UK-blended search.** Typed food search went through USDA FoodData Central only — great for generic whole foods ("chicken breast," "rice"), completely blank on UK branded/packaged products, since USDA is a US government database. Every search now runs USDA alongside a second, UK-specific pass over Open Food Facts (`searchUKFoods()` in `open-food-facts.ts`).

*Correction after the first version of this shipped, still gone through the same "explain before building" gate: `/api/v2/search` — which the first version called with a `countries_tags`/`brands_tags` filter alongside the typed search text — turns out not to support free-text search at all; that endpoint only understands structured tag filters, and silently ignores a search term instead of erroring on it. That's confirmed against Open Food Facts' own docs, not guessed — this sandbox's network proxy blocks both live APIs outright, so it couldn't be caught by testing here. The fix: `searchUKFoods()` now runs the one endpoint that genuinely does support free text (`cgi/search.pl`, the same one `getProductByBarcode()`'s sibling `searchFoods()` in this file already uses) and does the UK-relevance check itself in code afterward — keeping only results tagged `countries_tags` containing `en:united-kingdom`, or whose `brands` text names one of the major UK supermarkets (Tesco/Asda/Aldi/Sainsbury's/Morrisons/Lidl) — rather than asking the API for something it can't actually do.*

**Ranking is a quality gate, not a popularity contest.** A UK result only earns a spot at the top of the list if every word typed shows up somewhere in its name or brand (`isGoodMatch()` in the new `food-search.ts`) — so a Tesco ready-meal that merely lists "chicken" as an ingredient doesn't crowd out a plain "chicken breast" search, but "beans" correctly surfaces Heinz/a supermarket's own-brand beans above the generic USDA entries. Results that pass the gate render first, tagged with a small 🇬🇧 marker; USDA's generic results always follow beneath, unchanged. If the UK pass fails outright (network blip), search silently falls back to USDA-only rather than breaking; if USDA fails (e.g. a missing API key), that error still surfaces same as before, since it's a real setup problem worth seeing.

**Real portion units — grams, a structured serving, or a manual custom item.** Quantity used to be gram-only. Now, when the picked food's own source data genuinely provides one, real per-item weights (never guessed) appear as quick-pick chips: USDA's Survey (FNDDS) data type — already one of the three types this app searches — often carries `foodMeasures` like "1 small apple" or "1 rice cake" with USDA's own lab gram weight attached; Open Food Facts sometimes has a clean numeric `serving_quantity` alongside its display label. Where neither source has real portion data (true for almost every protein powder — nobody's product entry structurally records "1 scoop = 30g"), a **Custom item** option lets the coach/client type a gram weight once for that add (e.g. "1 scoop = 30g") — not saved anywhere new, no invented per-product database. Grams stays the always-available default. This only changes the client's own Nutrition tab (`nutrition.tsx`) — the coach's Recipe Builder ingredient search stays gram-only, a deliberately different, more precision-oriented use case.

**New**: `src/lib/food-search.ts` (`searchAllFoods()` — the blend/merge/rank logic, and the only function the UI calls now). **Changed**: `open-food-facts.ts` (shared `mapProduct()` helper, `FoodPortion`/`portions` on every result, new `searchUKFoods()`), `usda-fooddata.ts` (parses `foodMeasures` into `portions`), `nutrition.tsx` (blended search + 🇬🇧 badge, the grams/portion/custom-item unit picker replacing the old single gram field).

**Confirmed working against the real API.** This sandbox's network proxy blocks both `world.openfoodfacts.org` and `api.nal.usda.gov` outright, so the merge/rank logic was first verified here against realistic canned API responses run through the real production code — which is exactly how the `/api/v2/search` bug above got through the first time, since it could only be caught by someone actually running it. After that fix, a real "beans" search on a live device confirmed the full pipeline genuinely works: 100 raw Open Food Facts results narrowed to 44 correctly identified as UK-relevant, 10 of those passing the strict word-match gate, and a real UK branded product (with its 🇬🇧 marker) rendering above the generic USDA entries in the actual search results list.

**How you verify UK products actually surface correctly on a real device:**
1. Search **"digestives"** or **"beans"** — a UK-branded result (McVitie's / Heinz / a supermarket's own-brand) should appear above the USDA entries with a 🇬🇧 marker, not just interspersed or absent.
2. Search **"chicken breast"** — should look the same as it always has (USDA only) — confirms the quality gate isn't dumping irrelevant branded results onto ordinary generic searches.
3. Search a supermarket own-brand phrase directly, e.g. **"Tesco basmati rice"** or **"Aldi granola"** — should surface that exact product near the top.
4. If an expected UK product doesn't show, check the network tab for the `api/v2/search` requests — that tells you whether it's a ranking-gate issue (fixable) or an Open Food Facts data-coverage gap (nothing to fix on this end).
5. Pick a food with real portion data — a plain "apple" or "rice cakes" search against USDA should offer chips like "1 small apple" alongside Grams. Pick something like a protein powder brand — it should only offer Grams and Custom item, never a fabricated per-scoop weight.

## Client Activity: a real-time, cross-client feed

The coach dashboard's "Recent Activity" preview was always capped, dashboard-only, and missing habits entirely — this adds a full dedicated screen (`/activity`, linked via a new "View all →" on that same section) that's genuinely live: a new event from any client appears within a couple of seconds, with no manual refresh.

**Three real event types, merged into one chronological stream**: a meal logged, a habit completed, and a workout completed — reusing this app's existing calculations rather than computing anything new. A completed workout's stats (duration, total weight lifted, RPE) reuse the exact same `getSessionScorecard()` the completion screen itself shows; a meal's calories/protein come straight off its `food_logs` row; a habit shows its real name via `habits.name`.

**One real correction from the original plan, made deliberately**: "workout completed" listens for `assignments` flipping to `status = 'completed'`, not new `workout_logs` rows. `workout_logs` gets a new row per **set** — 15-25 per session — so listening there would have fired the feed on every single set instead of once when the workout actually finishes. The one-event-per-completed-assignment de-duplication already used by the dashboard's small preview is reused here, just extended.

**A real, previously-undiscovered gap, closed by this chunk's migration**: coaches never had read access to `habit_logs` — only a client could see their own. That's not just why the old preview never showed habits; it also meant `getMomentumScore()`'s habit component was silently reading zero rows whenever a *coach* (not the client themself) computed it, undercounting every client's Momentum Score by up to a quarter of it. One new RLS policy on `habit_logs`, mirroring the existing habits-table pattern, fixes both at once.

**Momentum Score and Compliance Score shown per event** are each client's real, current values — computed once per distinct client appearing on the page (not once per event, since several events from the same client would otherwise repeat the same non-trivial queries for an identical answer), using `getMomentumScore()`/`getComplianceScore()` completely unchanged.

**Realtime delivery** is three `postgres_changes` subscriptions on one channel (new `food_logs`, new `habit_logs`, `assignments` updated to `completed`), each just re-triggering a full refetch — the same "any change → refetch everything" approach `chat.ts`'s `subscribeToConversation` already uses, rather than trying to reconstruct one feed entry from a partial realtime payload. Supabase only broadcasts changes for tables explicitly added to its realtime publication, which none of these three were before this migration.

**New**: `supabase/client-activity-feed.sql` (the habit_logs RLS policy + the three tables added to the realtime publication), `src/app/(app)/activity.tsx`. **Changed**: `coach-dashboard.ts` (`getClientActivityFeed()`, `subscribeToClientActivity()` — additions, the existing `getRecentClientActivity()` dashboard preview is untouched), `home.tsx` (a "View all →" link on Recent Activity).

**What was verified here, and what needs your own project.** This sandbox has no live Supabase project or websocket server at all, so the one thing that categorically cannot be tested here is realtime delivery itself. What *was* verified, against realistic fake data run through the real production code: the three event types merge into correct chronological order, the workout-completion de-duplication and scorecard reuse work, Momentum/Compliance attach correctly per client, and the subscription is created on mount pointed at the right three tables/events.

**How you verify it's genuinely live, not just refetching on open:**
1. Run `client-activity-feed.sql` in the SQL Editor.
2. Open the coach's new Activity screen on one device/browser tab and leave it open.
3. From a second device or client account, log a meal, complete a habit, or finish a workout — do this once per event type, since each is an independent subscription that could fail on its own.
4. A new row should appear within a couple of seconds **without touching pull-to-refresh or reopening the screen**.
5. Optional: toggle wifi off on the first device, log something from the second, toggle wifi back on — confirm the feed catches up on reconnect rather than staying stuck (a real outage's events aren't retroactively replayed, so briefly missing one while offline is expected; the subscription recovering afterward is what this checks).

## Per-client feature toggles

A real, extensible gating system: 9 feature keys (Form Check, AI Create Workout, AI-Assisted Logging, Community, Challenges, Leaderboard, Progress Photo Scanning, Momentum Score, Chat), a coach-facing screen to flip any of them on/off per client, and the actual gate wired into the 4 features that exist today.

**Extensible by design, not a hardcoded enum.** `feature_key` is a real table (`key`, `label`) — adding a 10th gateable feature later is an `insert`, never a schema migration. `client_feature_toggles` links `(client_id, feature_key)` to an `enabled` flag, and **no row means enabled** — a coach only ever writes a row when actively turning something off for someone (or back on afterward), not 9 rows created per client on day one. The other 5 keys exist in the table starting now so the coach's toggle screen and this schema are ready the moment each one is actually built; toggling one of them today simply does nothing yet, same as it would for any feature nobody's wired a check for.

**The gate is additive, never a replacement for existing access logic.** Leaderboards already had its own tier-based lock (`🔒 Leaderboards`, greyed, an upgrade message) — the toggle is a second, independent gate on top: off locks it regardless of tier, on still requires the client's tier to qualify same as before. The locked-card message itself is aware of which gate actually fired, so a client whose tier qualifies but whose toggle is off sees "your coach turned this off," not a misleading nudge to upgrade for something upgrading wouldn't fix.

**Community's per-client toggle is a new, separate gate from its existing app-wide on/off switch** (the coach's "Community is on/off for clients" control) — the two are independent and visually distinct on purpose: the pre-existing app-wide-off state still shows its original plain grey text unchanged, while the new per-client-off state shows the same locked card the other three features use, so testing either one is unambiguous about which actually fired.

**Momentum Score has no full-screen home** — it's one compact tile in the client Home hero row (Momentum/Steps/Calories). Rather than force a mismatched full-width locked card into a 3-across row, toggling it off reuses the exact `muted` treatment already sitting right next to it (the "Steps: Sync a wearable" placeholder) — same greyed-out, explained-why spirit, adapted to the tile's compact form.

**New**: `supabase/feature-toggles.sql`, `src/lib/feature-toggles.ts` (`getClientFeatureToggles()`, `setClientFeatureToggle()`, and `isFeatureEnabled()` — the one function every gated screen calls), `src/components/feature-locked-card.tsx` (the shared `🔒 [Feature]` greyed card — extracted here since Leaderboard, Community, and Chat all needed the exact same visual, and a fourth screen reusing hand-copied JSX three times over was exactly the kind of drift worth avoiding), `src/app/(app)/clients/[id]/features.tsx` (the coach's toggle screen, linked from a new "Feature Access" section on the client detail page). **Changed**: `leaderboard-panel.tsx`, `community/index.tsx`, `client/chat.tsx`, `client/index.tsx` (the 4 retrofits above).

**What was verified here.** All four gates were tested against realistic fake data run through the real production code, in both states: toggle off correctly shows the locked treatment with the right message (and, for Leaderboard/Community, correctly distinguishes itself from the pre-existing tier/app-wide logic rather than colliding with it); toggle on shows the real feature exactly as before this chunk. The `setClientFeatureToggle()`/`isFeatureEnabled()` round-trip itself was verified directly: no row defaults to enabled, turning off reads back as off, turning back on reads back as on. **Momentum Score's retrofit was verified by direct code review, not a live render** — its screen (`client/index.tsx`) pulls in roughly a dozen unrelated subsystems (assignments, check-ins, habits, TDEE, weight logs...) that would need faking just to reach one hero tile; the tile's own logic is a direct, already-typechecked conditional wired to the exact same `isFeatureEnabled()` call already proven correct by the other three screens, so this was a reasonable place to rely on review rather than a disproportionate test-harness effort.

**How you verify each of the 4 on your own device**, after running `feature-toggles.sql`:
1. Open a client's detail page → **Feature Access** → turn a feature off.
2. **Chat**: as that client, open the Chat tab — should show a locked card instead of the conversation. Turn it back on → conversation loads normally.
3. **Community**: as that client, open Community — should show the locked card. This is deliberately a different message from "your coach turned Community off for everyone" (the app-wide switch on the Community screen itself) — try both independently to confirm they're not the same code path.
4. **Leaderboard**: Community → Leaderboards — locked card appears even for a client whose tier would otherwise grant access. Toggle back on → leaderboard shows again (assuming their tier still qualifies).
5. **Momentum Score**: client Home — the Momentum tile should go grey/dashed like the Steps placeholder next to it, instead of showing a real number.

## Toggle presets: apply all 9 feature states at once

Three starter bundles on top of last chunk's feature toggles — **Base Plan defaults**, **Accelerator defaults**, **Precision defaults** — so setting up a new client's access doesn't mean flipping 9 switches one at a time.

**The real plan-defaults matrix, from the source spreadsheet you provided:**

| Feature | Base | Accelerator | Precision |
|---|---|---|---|
| Form Check | Off | On | On |
| AI Create Workout | On† | Off | On |
| AI-Assisted Logging | On | On | On |
| Community | Off | On | On |
| Challenges | Off | On | On |
| Leaderboard | Off‡ | On | On |
| Progress Photo Scanning | On | On | On |
| Momentum Score | On | On | On |
| Chat | Off | On | On |

†Base's real spec is "on, but limited to one AI workout creation with the coach able to reset it" — a usage-quota rule this boolean toggle system can't express yet. Stored as plain On; the quota itself is a real feature to build later, and moot today since AI Create Workout isn't built at all.

‡The source matrix said On for Base here; deliberately overridden to match Community's value instead, per your call — Leaderboards is a sub-tab inside Community, and it's also independently gated by membership tier (Base never qualifies there, unchanged from an earlier chunk), so "on" for Base would have been a real toggle value with no visible effect. Accelerator/Precision are unaffected — the source and the override agree there.

**Applying a preset is a one-time bulk write, not an ongoing link.** `applyPresetToClient()` reads a preset's 9 values and upserts them straight into the exact same `client_feature_toggles` rows `setClientFeatureToggle()` already writes to — nothing records "this client is on the Accelerator preset" afterward. That's deliberate, not a missing feature: it's exactly what keeps every toggle freely, individually adjustable right after applying one, with no separate "unlock" step needed. A confirm dialog gates applying one, since it silently overwrites whatever individual customization a client already had.

**New**: `supabase/toggle-presets.sql` (`toggle_preset` + `toggle_preset_value`, coach-only, seeded with the matrix above). **Changed**: `feature-toggles.ts` (`listPresets()`, `applyPresetToClient()`), `clients/[id]/features.tsx` (three preset buttons + confirm dialog above the existing per-feature list).

**Verified here**: applying Base Plan defaults to a client sets exactly the 9 values above (checked directly against the underlying rows, not just the UI); after applying, manually flipping one feature back (Chat) updates only that one row — every other feature stays exactly where the preset left it, proving individual adjustment survives a preset apply rather than being reverted or locked.

**How you verify it yourself**: open a client's Feature Access screen, apply "Base Plan defaults," confirm Form Check/Community/Challenges/Leaderboard/Chat all read Off and the rest read On. Then flip just one of them back — confirm only that one changes, and re-applying a preset later still works normally (nothing about one manual change breaks a future preset apply).

## The External Builder: shareable forms with zero login, and a real PAR-Q

A second form type alongside the Check-in Builder from Phase 8 — one-off and shareable via a public link, rather than recurring and tied to an existing client account. Fully reuses the same question-type system (`question-types.ts`, `ConfigFieldEditor`, `AnswerInput`) — no new question-type logic was written for this at all.

**The interesting problem this chunk actually solves: letting a stranger submit data with no account, without opening a hole in the database.** Every other table in this app is protected by RLS keyed to a real signed-in `auth.uid()`. A visitor clicking a link has no identity at all. The wrong fix would be a blanket "anyone can read/write this table" RLS policy — that would let anyone holding this app's public API key (which ships in every install, by design) list *every* external form and *every* response ever submitted, not just the one they were sent.

Instead, the three new tables (`external_forms`, `external_form_questions`, `external_form_responses`) have **no direct anonymous grant at all**. Every anonymous read and write goes through exactly two database functions — `get_external_form_by_token` and `submit_external_form_response`, both `SECURITY DEFINER` (the same mechanism this app already uses for leaderboards). A visitor can only ever see the one form whose `share_token` matches their exact link, and can only ever submit answers tied to that same form's real question IDs. There's no path from "have the public API key" to seeing or writing anyone else's data.

**The PAR-Q template**, seeded via migration (same pattern the default Pre-Workout Readiness form already uses) so it exists from day one, not something the coach has to build by hand: two identifying questions (no login means no other way to know who answered), then the standard 7-question PAR-Q verbatim — heart condition, chest pain during activity, chest pain at rest in the past month, dizziness/loss of consciousness, bone or joint problems, blood pressure/heart medication, and a catch-all "any other reason." This is the template Onboarding will reference directly next.

**New**: `supabase/external-forms.sql` (the 3 tables + the 2 gateway functions + the PAR-Q seed), `src/lib/external-forms.ts`, a new coach-only `/external-forms` section (list → builder → detail, the detail page showing the copyable link front and center plus every submission received, grouped one card per visitor), and `src/app/e/[token].tsx` — the public screen itself, deliberately outside the app's normal login-guarded area entirely, so it never touches `useAuth()` and never redirects anywhere.

**Verified here**: a coach's detail view renders the share link, questions, and a real submission's answers correctly; the public screen loads and accepts a submission with zero login prompt anywhere in the page; and — the negative case that actually proves the security model — a wrong token shows a plain "not valid" message without leaking so much as the real form's name.

**How you verify it yourself:**
1. Run `external-forms.sql`, pull the latest code.
2. Coach Home → **External Forms** → "PAR-Q Health Screening" should already be there.
3. Open it, copy its link.
4. Open that link in a private/incognito window (or log all the way out) — it should load immediately, no login prompt, no redirect.
5. Answer all 9 questions, submit — confirm the "Thanks!" screen.
6. Back in your own coach session, reopen that form — the submission should appear with the exact answers you gave.
7. Edit one character of the link's token and reload — confirm it shows "not valid," not someone else's form.

## Onboarding: welcome, in-app signup, PARQ, and a resumable health-advisory hold

The start of the client-facing onboarding sequence — four screens (`(onboarding)/welcome.tsx` → `signup.tsx` → `parq.tsx` → `health-advisory.tsx`), all flat routes (`/welcome`, `/signup`, `/parq`, `/health-advisory` — Expo Router groups like `(onboarding)` never add a path segment, they're purely organizational).

**Account creation is real, not a stub**: `signup.tsx` calls `supabase.auth.signUp()` directly — every signup becomes a client (coach accounts are still granted by hand in Supabase, never chosen at signup) and `profiles` rows are created automatically by the existing `handle_new_user()` trigger. On success it continues straight into PARQ rather than dropping the client at Home.

**The PARQ step reuses last chunk's External Builder template**, not the anonymous response table that powers it — onboarding's PARQ is filled out by an authenticated client, and the safety gate needs to know exactly whose account to hold, so it gets its own table (`onboarding_parq_responses`, keyed to `client_id`) while reading the same question definitions and reusing the exact same `<AnswerInput>` every other question screen in this app uses.

**A real RLS gap this surfaced**: `external_forms`/`external_form_questions` only ever had coach-only read policies — an authenticated client during onboarding had zero access to read the PARQ questions at all, the exact same class of bug `readiness-client-access.sql` fixed for the pre-workout questionnaire. Fixed the identical way: an additive policy granting read access specifically to whichever form `app_settings.parq_form_id` currently points at.

**The safety gate is a database trigger, not app code** (`flag_onboarding_health_risk_trigger` in `onboarding.sql`): any `single_select` question answered exactly "Yes" flags the account, checked by reading that question's real `question_type` off `external_form_questions` rather than a hardcoded list of question IDs — the rule keeps working even if a coach edits the template later, and can't be silently bypassed by some future code path writing to this table. A flagged account isn't blocked or dead-ended: `health-advisory.tsx` shows the advisory, a checkbox ("I acknowledge this advisory and choose to proceed"), and an optional free-text clearance note — either path (a bare acknowledgment or one with a note) sets the same `onboarding_health_acknowledged_at` timestamp, since the real effect is identical either way. No document-upload subsystem — a clearance note is a plain text field, deliberately not a new feature area for this chunk.

**Resume works by re-deriving status from real data, not a tracked step column.** `getOnboardingStatus(clientId)` looks at whether a PARQ response exists yet, and whether the account is flagged-and-unacknowledged, and returns `needs_parq` / `needs_health_review` / `complete` fresh every time — called from `index.tsx` (the main router), `client/_layout.tsx` (belt-and-suspenders against a stale bookmark or deep link), `welcome.tsx` (so an already-signed-in visitor who lands there gets routed to where they actually are), and `parq.tsx` itself right after a submission, so "first time through" and "resuming after abandoning" both route through the exact same logic — no separate resume-tracking code exists to drift out of sync.

**New**: `supabase/onboarding.sql` (`app_settings.parq_form_id`, `profiles.onboarding_health_flagged/onboarding_health_acknowledged_at/onboarding_clearance_note`, `onboarding_parq_responses`, the two client-access RLS policies on `external_forms`/`external_form_questions`, and the flagging trigger), `src/lib/onboarding.ts` (`getOnboardingStatus`/`getParqForm`/`submitOnboardingParq`/`acknowledgeHealthAdvisory`), the whole `(onboarding)/` route group. The old standalone `(auth)/signup.tsx` is gone — `login.tsx`'s sign-up link now points at `/welcome`.

**A real bug found and fixed along the way**: `parq.tsx` originally showed the load error (network failure, RLS denial, anything `getParqForm()` could throw) only inside the same conditional block as the loaded form itself — so if loading genuinely failed, the client saw a misleading "No health screening form is configured yet" instead of the real error. Fixed by tracking the load failure in its own state and showing it as its own message, ahead of the "not configured" fallback.

**Verified here** (via a temporary debug harness patching `supabase` with an in-memory fake and then driving REAL navigation through the real routes, so the actual routing/guard logic executed genuinely — not a live Supabase project, see the sandbox note below): the clean path (PARQ answered "No") lands directly on `/client`; the flagged path (PARQ answered "Yes") lands on `/health-advisory`, and only proceeds to `/client` once acknowledged — the Continue button stays disabled until then; and the resume guarantee itself — creating an account, reaching PARQ, leaving it unsubmitted, then re-entering the app — lands back on `/parq`, not Welcome and not a blank state.

**How you verify the safety gate yourself:**
1. Run `onboarding.sql` in the Supabase SQL Editor (after `external-forms.sql`).
2. From a fresh browser session (logged all the way out), go to Welcome → Get started → create an account.
3. On the PARQ, answer "Yes" to any of the yes/no health questions, submit.
4. Confirm you land on the Health Advisory screen, not Home and not an error.
5. Try leaving — you should not be able to reach `/client` (via the tab bar, a direct URL, or a reload) until you return and check the acknowledgment box.
6. Check the box (with or without a clearance note) and continue — confirm you land on `/client` from here on, including after a fresh login.

**How you verify the resume behaviour yourself:**
1. Create a new account, reach the PARQ screen, and close the tab (or just navigate elsewhere) without submitting.
2. Log back in with that same account.
3. Confirm you land back on the PARQ screen — not Welcome, and not a blank page — with the form ready to fill in again (answers themselves aren't saved mid-form, only which step you're on).

**What this sandbox could verify vs. what needs your real Supabase project**: the resume-routing logic, the flag/acknowledge data flow, and every screen's rendering were all verified end-to-end against a faked backend in this sandbox (no live Supabase/Postgres is available here). What still needs confirming against your real project: the `flag_onboarding_health_risk_trigger` actually firing in real Postgres, the new RLS policies actually enforcing (not just modeled in the fake), and the real email-confirmation flow (if "Confirm email" is on in your Supabase project, a client sees a "check your email" screen instead of an immediate session — they confirm, log in, and land wherever `getOnboardingStatus` says next, but that hop through a real inbox can only be confirmed on your end).

## Check-in detail for the coach: real answers, not just a submission stamp, and one source of truth for weight/measurements

The Clients admin "Check-in Schedule" panel (Phase 8) only ever showed a date and On Time/Late-style status for each individual check-in. Extended it so a coach can actually see what the client said.

**Every completed check-in is now tappable** (pending/missed ones aren't — there's nothing to show yet). It opens the exact same `/checkins/[id].tsx` screen the client's own Up Next/Calendar already use to fill a check-in out — reused as-is rather than building a second read-only view, since it already rendered every question with its stored answer once a check-in was no longer pending. The only gap was that the screen never told a coach viewing it *whose* check-in this was, so it now shows the client's name at the top when opened by a coach (the client's own view already knows it's their own, so nothing changes there).

**The "one source of truth" part**: a "Weight / measurement" question in the check-in builder can now be tagged with "Also save this answer as" — Weight, or one of the six body-measurement types (Waist, Chest, Arms, Thighs, Hips, Neck), or left as "Nothing — just this check-in" (the default, and exactly the old behavior for every question already built this way). Tag one, and submitting that check-in writes the value straight into `weight_logs`/`body_measurements` — the same tables the client's own Metrics/Measure tabs, weight trend chart, and TDEE calculation already read from — dated to the day the check-in was actually *for* (its scheduled date), not necessarily the moment it happened to get submitted. The read-only view shows this plainly: "✓ Also saved to Weight log" right under the answer, so a coach isn't left guessing whether it actually went anywhere.

No unit-conversion subsystem was built for this — the "Unit" field a coach types when building the question (already existed) is read literally against the one fixed unit each canonical table actually stores (kg for weight, inches for the six body measurements): blank, or the native unit itself, is taken as-is; the handful of real-world synonyms a coach would plausibly type ('lb'/'lbs', 'cm') are converted; anything else is left recorded on the check-in itself but simply isn't synced anywhere, rather than risk writing a silently wrong number.

Syncing a weight answer never wipes out body fat %/muscle % the client already logged that day some other way — `saveWeightLog()` now treats those two fields as "leave unchanged" when not supplied at all (the check-in path), versus explicitly cleared when the Metrics tab's own form is submitted with them blank (unchanged existing behavior there).

**New**: the `select` config-field kind (`question-config-editor.tsx`, `question-types.ts`) — chips, same shape as an answer's single-choice picker — for the "Also save this answer as" field; `CheckInAnswerSubmission` and the sync loop in `submitCheckIn()` (`form-check-ins.ts`); `getCheckInDetail()` now also returns the client's name/email (via the same `profiles!client_id(...)` embed pattern already used across the coach dashboard) for the coach-only header. No new tables and no RLS changes — coaches already had read access to a client's check-in responses and profile.

**Verified here** (fake backend, no live Supabase in this sandbox — see the sandbox note elsewhere in this doc): a coach viewing a real completed check-in sees the client's name, every question, every real answer with its unit, and the sync confirmation for tagged questions; a client submitting a check-in with a Weight and a Waist question produces real rows in the fake `weight_logs`/`body_measurements` tables, dated correctly and unit-converted correctly; and the check-in builder's new chip picker renders and saves correctly.

**How you verify this yourself:**
1. No migration to run — this chunk only touches app code.
2. Coach Home → Forms → build (or edit) a check-in template → add a "Weight / measurement" question → under "Also save this answer as," pick Weight → save.
3. Assign that check-in to a test client, or use one already scheduled.
4. As that client, submit the check-in with a real number for the weight question.
5. As the coach, open Clients → that client → Check-in Schedule → tap the now-completed check-in. Confirm you see every question and the client's actual answers, not just "Completed" — and "✓ Also saved to Weight log" under the weight answer.
6. Still as the coach, open that client's detail page and check their weight history (or ask them to open their own Progress → Metrics tab) — confirm the same value appears there, dated to the check-in's scheduled date.
7. Repeat with a question tagged to a body measurement (e.g. Waist) and confirm it shows up in Progress → Measure the same way.

## Auto-provisioning: onboarding ends on the Base Plan, zero coach involvement

The last piece of onboarding's completion moment. There was never a plan-choice screen or a payment step built — this chunk didn't remove either, since neither existed — so "complete onboarding" simply means: the instant a client's PARQ is done (and any health-advisory flag has been acknowledged), they're placed on the Base Plan (Tier 1, stored as `'club'` — see `leaderboard.ts`) with the exact "Base Plan defaults" toggle preset from the Toggle Presets chunk, automatically, with nothing left for the coach to set by hand.

**Why this needed a database function, not just an app-side call.** Both `client_tiers` and `client_feature_toggles` have always been coach-only for insert/update under RLS — a client has never been allowed to set their own tier or flip their own feature toggles, which is exactly the access a client provisioning *their own* account at signup needs. So `complete_client_onboarding()` is a `SECURITY DEFINER` function (the same controlled-bypass pattern already used for leaderboards and the External Builder's anonymous gateway), scoped tightly to `auth.uid()` — a client can only ever provision their own account, never anyone else's.

**Why it's safe to call more than once.** A new `profiles.onboarding_provisioned_at` column is set the first (and only) time the function actually does anything — every call after that is a complete no-op. This matters because the app calls it from three places, deliberately overlapping for reliability rather than trying to guarantee a single perfect call: right after a clean PARQ submission, right after acknowledging the health advisory, and — as a pure safety net — every single time a fully-onboarded client's onboarding status is re-checked (which already happens on every app open). Without the one-time guard, that safety net would re-apply the Base defaults on every visit, forever, silently undoing any tier change or toggle customization a coach makes later. With it, the function does nothing at all once a client has been provisioned once, so a coach's later manual changes are permanent.

**New**: `supabase/onboarding-auto-provision.sql` (the `onboarding_provisioned_at` column and the `complete_client_onboarding()` function); `ensureClientProvisioned()` in `onboarding.ts`, called from `parq.tsx`'s clean-completion path, `health-advisory.tsx`'s acknowledge path, and `client/_layout.tsx`'s existing onboarding-status safety-net check.

**Verified here** (fake backend, no live Supabase in this sandbox): a client finishing PARQ clean lands on Home already on Base tier with all 9 toggles set to the real Base Plan defaults; a flagged client is confirmed genuinely un-provisioned while held on the health advisory, and only gets provisioned the moment they acknowledge it; and — the guarantee that actually matters long-term — simulating a coach manually changing one toggle after onboarding, then forcing the safety-net re-check to run again, confirmed the manual change survives untouched rather than being reset back to the Base default.

**How you verify this yourself:**
1. Run `onboarding-auto-provision.sql` in the Supabase SQL Editor (after `onboarding.sql`).
2. Sign up a brand-new test account end to end (Welcome → Create account → PARQ, answering every yes/no question "No" so nothing gets flagged) with zero coach action anywhere in between.
3. Confirm you land on Home immediately — no plan screen, no payment prompt, nothing waiting.
4. As the coach, open Clients → that new client: their Tier should already show **Base**, and Feature Access should already show the real Base Plan defaults (Chat/Community/Challenges/Leaderboard/Form Check off; AI Create Workout/AI-Assisted Logging/Progress Photo Scanning/Momentum Score on) — not a blank/default state waiting for you to set it.
5. To check the flagged path: sign up a second test account and answer "Yes" to one of the health questions. Confirm the account is held on the Health Advisory screen — check Clients for that account and confirm it is **not yet** on Base tier or provisioned. Acknowledge the advisory as that client, then re-check Clients — now it should show Base tier and the defaults, same as step 4.
6. To check the safety net doesn't clobber your own changes: on either test client, manually change one toggle (e.g. turn Chat on) from the Feature Access screen. Have that client log out and back in (or just reopen the app). Confirm your manual change is still there — it should never revert to the Base default.

## A Settings screen: Hero card + editable profile, reached from either Home's gear icon

The start of a real account-settings area — a gear icon next to Sign out on both the coach's and the client's Home screen, opening one shared `/settings` screen (profiles are the same table for both roles, so one screen serves both rather than building two near-identical ones).

**Hero card**: a colored-initials avatar circle (no photo-upload feature exists anywhere in the app yet, so this is the only avatar there is right now — same placeholder-initials idea `leaderboard-panel.tsx` already uses, just two letters instead of one for this larger card), the account's email, and its current plan — a client's real tier (Base/Accelerator/Precision, via `getMyTier()`), or plainly "Coach" for a coach account, since coaches don't have a tier and showing a fabricated one would be worse than just naming what they actually are.

**Profile settings card**: name, email, and a new phone number field, one Save button. Name and phone save immediately through a normal `profiles` update (a new column-level grant, same pattern every other self-editable profile field already uses — RLS alone isn't the whole gate in this schema; a column also has to be explicitly granted, or a client could otherwise write any column on their own row through the same "update your own row" policy).

**Email is handled differently, deliberately.** A login email isn't a plain column to overwrite — it's account identity. Saving a changed email calls Supabase Auth's own `updateUser({ email })`, which (with this project's default "Secure email change" setting) sends a confirmation link to the new address rather than switching over immediately. The screen reflects that honestly: after saving, it tells the client to check the new address, and reverts the displayed field back to the still-active old email — it never claims a change happened before it actually has. A new trigger keeps `profiles.email` in sync automatically once a change is actually confirmed (nothing did this before now — `handle_new_user()` only ever ran once, at signup — so a confirmed real email change would previously have updated the real login email while leaving the stored profile silently showing the old one forever).

**A real, unrelated bug found and fixed while in this file**: `client/_layout.tsx`'s onboarding-status check (added two chunks ago) had no error handling at all — if it ever failed for any reason (a network blip, anything), the client's entire tab layout would render permanently blank, forever, with no error and no way to recover. Fixed by catching the failure and showing a plain, visible error message instead of silently hanging.

**New**: `supabase/settings-profile.sql` (`profiles.phone_number` + its grant, and the email-sync trigger on `auth.users`); `src/lib/settings.ts` (`updateProfileDetails()`, `requestEmailChange()`); `src/app/(app)/settings.tsx`. Both Home screens gained a gear icon (`accessibilityLabel="Settings"`) next to Sign out.

**Verified here** (fake backend, no live Supabase in this sandbox): both the coach's and the client's gear icon reach the real Settings screen; the Hero card shows the right initials, email, and plan for each role; name/phone save immediately and persist; requesting an email change shows the confirm-pending message, reverts the displayed field, and leaves the stored email untouched until confirmed; and the onboarding-status error fix genuinely shows a message instead of a blank screen when the check is made to fail.

**How you verify this yourself:**
1. Run `settings-profile.sql` in the Supabase SQL Editor (after `onboarding-auto-provision.sql`).
2. As a client, tap the gear icon on Home — confirm the Hero card shows your initials, email, and real tier.
3. As the coach, tap the gear icon on your own Home — confirm it shows "Coach" instead of a tier.
4. On either account, change the name and/or phone number, Save, reload the app — confirm both values persisted.
5. Change the email field to a real address you can check, Save — confirm the screen tells you to check that inbox and keeps showing your current (old) email, not the new one. Click the confirmation link in the email Supabase sends, then reopen Settings — confirm it now shows the new address (this is the one step that needs your real Supabase project's email delivery to test end to end).

## Settings: notification preferences (storage only) and an honest Wearable placeholder

Two more cards on the Settings screen, after Hero and Profile settings.

**Notification toggles**: four switches — push notifications, workout reminders, habit reminders, community updates — each saving the instant it's flipped (optimistic UI, reverts on failure), no separate Save button, same shape as the Community tab's own hide-toggle elsewhere in the app. This chunk is deliberately **preference storage only** — no real notification delivery exists anywhere in this app yet (that's Phase 14), so flipping these switches doesn't cause anything to fire. What matters now is that a client's real choice is sitting there correctly waiting, so Phase 14 doesn't ship with everyone silently defaulted to whatever the code happens to assume. All four default to **on** — the same "on unless someone turns it off" convention this schema already uses elsewhere (`client_feature_toggles`' own "no row means enabled" rule).

**Wearable card**: genuinely static, not simulated. "Not connected," "Last synced: Never," and a visibly disabled Force Sync button are hardcoded — there is no wearable-connection data model in this database at all yet, on purpose. Phase 14 will define what a real connected state actually looks like; inventing a fake one now would just be something to rip out and reconcile later. The button is disabled at the actual component level (`disabled`, not just styled to look inactive), so tapping it does nothing at all — not a broken action, an honest absence of one.

**A real rendering bug found and fixed while building the switches**: React Native's cross-platform `Switch` API has one `thumbColor` prop, expected to apply in both states — but react-native-web (the layer this app's web build runs on) only honors `thumbColor` for the OFF state. The ON-state thumb is controlled by a separate, web-only prop (`activeThumbColor`) that silently defaults to react-native-web's own teal (`#009688`) whenever it's left unset — which would have put a non-brand teal color on every switch's "on" thumb, quietly breaking the "oxblood is the only active-state accent" rule everywhere a `Switch` is used. Fixed by passing `activeThumbColor` explicitly alongside `thumbColor`, both set to the same bone-white.

**New**: `supabase/notification-preferences.sql` (four boolean columns on `profiles`, all defaulting to true, plus their self-update grant); `setNotificationPreference()` in `src/lib/settings.ts`; the two new cards in `settings.tsx`.

**Verified here** (fake backend, no live Supabase in this sandbox): all four switches default to on; flipping one saves immediately and leaves the other three untouched; a simulated save failure reverts the switch and shows an error rather than leaving it stuck in the wrong state; the Wearable card shows exactly the three placeholder values and its Force Sync button is confirmed inert (genuinely disabled, clicking it does nothing) — plus the thumb-color fix, confirmed by inspecting the actual rendered color before and after.

**How you verify this yourself:**
1. Run `notification-preferences.sql` in the Supabase SQL Editor (after `settings-profile.sql`).
2. Open Settings — confirm all four notification switches default to on, and both switch states use oxblood/bone-white only (no teal anywhere on them).
3. Flip one off, then reload the app — confirm it's still off (it genuinely saved, not just a visual toggle).
4. Flip it back on, reload again — confirm it's back on.
5. Check the Wearable card shows "Not connected" and "Never," and that tapping Force Sync visibly does nothing (no loading state, no error, no change).

## Sign out moved: Home screens to a card at the bottom of Settings

A small relocation, not a new feature. Sign out no longer lives on either Home screen (it was a standalone button at the bottom of the coach's dashboard, and a header link next to the client's gear icon) — it's now the last card on the shared Settings screen, for both roles, styled the same oxblood-outlined way it already was on the coach's Home. Nothing about how sign-out actually works changed, just where the button lives.

**Verified here** (fake backend, no live Supabase in this sandbox): "Sign out" no longer appears anywhere on either Home screen; it appears as its own card at the bottom of Settings for both a coach and a client account; and tapping it there genuinely calls the real sign-out and lands back on the login screen.

**How you verify this yourself:** open Home (either account) — confirm there's no Sign out button anywhere on it. Open Settings via the gear icon, scroll to the bottom — confirm the Sign out card is there, and tapping it actually logs you out.

## Unread badges: the Chat tab and the Community quick-link, both real-time

Two small counters, both scoped to the client experience specifically (the coach's own inbox and Community access already show enough via previews/timestamps and weren't part of this ask).

**Chat tab badge**: a number on the Chat tab icon, counting messages the coach sent that this client hasn't read yet — computed from the exact same `conversation_reads` cursor the read-receipts feature already tracks, so there's no new "unread" concept, just a count over data that already existed. It reuses the same realtime channel `ChatThread` itself subscribes to, so the badge updates live no matter where in the app the client is sitting, and clears the instant they actually open Chat (that "mark as read" call already existed — the badge just now reflects it).

**Community quick-link badge**: a small pill on Home's Community card showing how many posts have appeared since the client last viewed the Posts feed. Needed one new column (`profiles.community_last_viewed_at`) since nothing tracked "last viewed" for Community before — defaulting to *now* rather than null, specifically so shipping this doesn't suddenly show every historical post as "new" to existing clients. Clears the moment the client actually opens the Posts sub-tab (not Leaderboards — that isn't what this badge is about).

Neither badge counts the client's own messages or posts as unread — same reasoning either way: writing something yourself isn't "new" to you.

**A real, structural bug found and fixed along the way**: `ChatThread` marked a conversation read *inside* the same function that also runs every time a realtime change arrives — but marking read is itself a change to the very table it's watching, so opening Chat could touch off a self-sustaining loop (mark read → change event → reload → mark read again → …). This had been sitting in the codebase since the read-receipts chunk shipped; the badge's own subscription to the same data is what finally made it observable. Fixed by moving the "mark read" call to fire once per screen-focus instead of on every reload.

**New**: `supabase/unread-badges.sql` (adds `community_posts` to the realtime publication, alongside the new `community_last_viewed_at` column + grant); `getUnreadMessageCount()` in `chat.ts`; `getCommunityLastViewedAt()`/`markCommunityViewed()`/`getNewCommunityPostCount()`/`subscribeToCommunityPosts()` in `community.ts`.

**Verified here** (fake backend, no live Supabase in this sandbox, including a hand-simulated realtime layer standing in for Postgres logical replication): a badge appears on the Chat tab the instant a message arrives while sitting on Home, doesn't count the client's own reply, and clears the moment Chat is opened and stays cleared afterward; the Community badge behaves the same way for a new post, correctly ignores the client's own post, and clears after visiting Posts specifically.

**How you verify this yourself:**
1. Run `unread-badges.sql` in the Supabase SQL Editor (after `notification-preferences.sql`).
2. As the coach, send a client a chat message. On that client's device/session, confirm a badge appears on the Chat tab without needing to reopen the app — it should update live.
3. Open Chat as that client — confirm the badge disappears immediately, and stays gone after navigating back to Home.
4. Post something in Community as the coach (or a different client). Confirm the client's Home screen shows a number badge on the Community card, live.
5. Open Community as that client (Posts tab) — confirm the post is there, then go back to Home and confirm the badge is gone.
6. To check the "own content doesn't count" rule: as the client, send a message or make a post yourself — confirm neither badge increments for your own activity.

## Fix: Chat crashed on open for clients, from the unread-badges chunk above

Shipped the same day as the badges above, after a real crash report from John's own device: opening Chat as a client threw `cannot add \`postgres_changes\` callbacks for realtime:messages:{conversationId} after \`subscribe()\`` and the screen errored out.

**Root cause**: Supabase's realtime client treats the channel name you pass to `.channel(...)` as a shared handle — call it twice with the same name and you get back the *same* channel object, not two independent ones. The Chat tab's new badge subscription (in `client/_layout.tsx`) and `ChatThread`'s own long-standing subscription both called `subscribeToConversation()` for the same conversation, and both used the exact same channel name (`messages:{conversationId}`). The badge subscription, being mounted the whole time the client sits in the tab bar, always won the race and subscribed first — so the moment `ChatThread` tried to attach its own listeners to that already-subscribed channel, it hit Supabase's guard against exactly that and crashed. The sandbox's fake realtime layer used to verify the badges chunk didn't enforce this restriction, which is exactly why it shipped uncaught.

**Fix**: both `subscribeToConversation()` (`chat.ts`) and `subscribeToCommunityPosts()` (`community.ts`) now append a random suffix to their channel name on every call, so two independent subscribers never share one. The channel name is purely a client-side label — it's the `filter` option inside `.on('postgres_changes', ...)` that actually scopes which rows arrive — so giving each caller its own name is free and permanently rules out this entire class of collision, including any future screen that wants to listen in on the same data.

**Verified here**: directly against the real `@supabase/supabase-js` client rather than the sandbox's usual fake (this particular check is synchronous, client-side logic that needs no live backend to trigger) — confirmed two raw subscriptions sharing one hardcoded channel name do throw the exact reported error, then confirmed `subscribeToConversation()` and `subscribeToCommunityPosts()` can both now be called twice back-to-back for the same conversation/feed with no error.

**How you verify this yourself:** open Chat as a client — it should open normally with no red error screen, and the Chat tab badge should keep updating live afterward exactly as before.

## Client Home redesign: a 2x2 ring grid, and streak/XP pulled into their own cards

A visual redesign of the client's Home tab, requested against a reference dashboard mockup — same "greeting → Up Next → key stats → progress → habits/community" shape, but rebuilt entirely in Primal Physique's own palette rather than the mockup's colors: oxblood stays reserved for buttons/active states only (never a ring color), so every ring uses the app's existing single teal accent, distinguished by which are real data versus honest placeholders — not by borrowing new hues.

**New order, top to bottom**: greeting + settings (unchanged) → logging nudge / auto-reschedule notices (unchanged) → Up Next (unchanged) → a new 2x2 ring grid → new stacked streak + XP cards → Today's Habits (unchanged) → Community (unchanged, still last).

**The ring grid** replaces the old 3-tile hero row, built on `StatRing` (previously used for session RPE only), now extended with a `muted` variant:
- **Momentum** and **Calories** get a real, solid teal ring with a live fill (Momentum's out of 10, Calories against the adaptive TDEE target) — same data these already pulled from before, just re-rendered as a ring instead of a flat tile.
- **Readiness** and **Steps** get the new muted ring style: a thin dashed teal-gray outline, no glow, "--" value, and a small caption ("Coming soon" / "Sync a wearable") — the same honest-placeholder convention `StatTile` already used for Steps, now extended to `StatRing` and to a genuinely new concept (Readiness has no daily score anywhere in the app yet — distinct from the existing per-workout readiness gate before starting a session).

**Streak + XP**, previously a cramped inline pill mid-screen, are now two proper stacked cards side by side beneath the ring grid: a streak card (flame + day count) and an XP card (Level + progress bar), same underlying data (`getCurrentStreak`, `getXpSummary`), just given their own visual weight.

**Verified here**: a generic in-memory fake of `supabase.from()` (assignments, food/habit logs, tdee_estimates, profiles, etc.), seeded with a realistic week of activity, rendered through the real `ClientHomeScreen` component — confirmed the ring grid shows a real teal Momentum ring (4.4/10) and Calories ring (1450 of 2400) side by side with dashed muted Readiness/Steps rings, and the streak (🔥 3 day streak) and XP (Level 2, 150/500 XP) cards render correctly beneath, with Habits and Community unchanged below that.

**How you verify this yourself:** open the client Home tab — Up Next at top, then a 2x2 ring grid (Readiness and Steps should look like dashed "coming soon" outlines; Momentum and Calories should be solid teal rings with real numbers), then a streak card and a level/XP card side by side, then Habits, then Community.

## Nutrition redesign: a calorie ring + real macro-gram targets, food logging untouched

Redesigned the top of the client's Nutrition screen against a reference mockup — same request as the Home redesign above (match the layout, stay in the app's own palette), but this one also surfaced a real product gap: the mockup shows protein/carb/fat **targets** ("229/230g", "16g LEFT"), and this app had none — the old macro rings only ever showed each macro's *share of calories already logged*, never a target. Checked with John first rather than guessing; he asked for real targets to be built, not just the visual restyled.

**New**: `src/lib/macros.ts` — `getMacroTargets()` computes real protein/carb/fat gram targets from the client's own logged bodyweight (`weight_trend`, the same smoothed number Adaptive TDEE already uses) and their existing calorie target: protein by g/kg bodyweight (2.2 g/kg cutting, 1.8 g/kg bulking, 2.0 g/kg recomp/strength/no active phase — evidence-based ranges, higher end while cutting since protein is what protects lean mass in a deficit), fat fixed at 25% of target calories, carbs take whatever's left. Returns null with no weight logged yet — same "not enough history" honesty `getCalorieTarget()` already applies, not a fabricated number.

**New components**: `calorie-ring.tsx` (the hero ring — today's calories, "/ target" and "KCAL" centered inside; renders dashed and un-filled when there's no target yet, same convention as Home's placeholder rings) and `macro-bar.tsx` (one row per macro — dot, label, "current/targetg", a thin fill bar, and a "Xg LEFT"/"+Xg OVER" caption). Deleted `macro-ring.tsx` — its "share of calories" concept is fully replaced by real targets now, and it had no other callers left.

**Staying on-brand**: the mockup color-codes each macro differently; this app's existing macro component already had a stated rule ("macros are told apart by their label and number, not by color-coding each ring differently") and Home's redesign just reaffirmed "no new decorative hues" — so `MacroBar` keeps that: every bar is the same teal on track, and only switches to oxblood (the color every warning/error text in this app already uses) once a macro goes over target, which is a real state change, not decoration.

**Header + date nav** also restyled to match: a fork icon next to the title, a quick-add search icon (logs into whichever meal fits the current time of day — breakfast/lunch/dinner/snacks — reusing the exact same add-food flow as the meal sections' own **+ Add** buttons, not a second implementation), and a small "TODAY" caption above the date on today specifically. The four meal sections and the whole add-food modal (search, barcode scan, portion/gram/custom-item entry, save, delete) are completely unchanged.

**Verified here**: a generic in-memory fake of `supabase.from()` (weight_logs, tdee_estimates, programme_blocks, food_logs), rendered through the real `NutritionScreen` component — confirmed the ring + bars show real numbers matching a seeded cutting-phase client (2,082 / 2,310 kcal; Protein 165/181g etc.), confirmed a macro pushed over its target renders in oxblood with "+Xg OVER," confirmed the no-target fallback (no weight logged yet) renders an honest dashed ring and no macro bars instead of fabricated numbers, and confirmed the quick-add search icon and the meal sections' own add/delete flow all still work exactly as before.

**How you verify this yourself:** open Nutrition — the top card should show a calorie ring with real macro bars underneath showing your actual protein/carb/fat targets, a bar should turn oxblood with "OVER" wording if you log past it, and logging/deleting food in the meal sections below should work exactly as it did before.

## Compliance removed from the client's Progress screen, kept running for the coach

The client's Progress tab no longer shows a Compliance sub-tab — Metrics is now the first and default tab, with Measure and Photos after it. `getComplianceScore()` itself (`src/lib/compliance.ts`) is untouched and keeps running exactly as before: it's what feeds the color-coded `{score}%` badge on each row of the coach's Clients list, and the coach's dashboard — this was purely about removing the client-facing display of it, not the underlying calculation. `compliance-panel.tsx` is deleted since removing its one caller left it with none.

**Verified here**: a generic in-memory fake of `supabase.from()`, rendered through the real `ProgressScreen` component — confirmed no "Compliance" text appears anywhere on the screen, confirmed Metrics is the tab shown by default, and confirmed Measure and Photos both still switch to and render correctly.

**How you verify this yourself:** open Progress as a client — you should see Metrics/Measure/Photos, no Compliance tab, with Metrics showing by default. On the coach side, the Clients list's compliance badge should be completely unaffected.

## Live session screen redesign: a real-time summary bar, PR badges, delete exercise, add set, and an honest Heart Rate placeholder

A full visual redesign of `/assigned/[id]` (the screen a client actually logs a workout on) against a reference mockup, plus everything the mockup implied on top of it — while keeping every existing mechanism (readiness gate, exercise swap, rest timer, per-exercise and session RPE, offline sync/snapshot, finish flow) completely unchanged underneath the new skin.

**The header** is now "{Weekday} - {Workout Name}" (e.g. "Friday - Push") over a live summary bar — Duration, Volume, and Sets completed — plus a Heart Rate row underneath, honestly placeholder for now ("-- bpm · Connect a wearable"), the same convention Home's Steps ring already uses, ready to wire to a real number once a wearable integration exists.

**Duration** ticks live once the very first set of the session is checked (no fabricated "started the moment the screen opened" clock) — anchored to that set's real timestamp, so leaving and reopening the screen resumes the same running total rather than restarting it, and a session reopened after it's finished shows its true frozen duration (first logged set to last), the exact same definition the post-workout scorecard already uses. **Volume** and **Sets** are pure sums over what's actually been checked off — no new data, no new tables.

**Every set row** is now a big Weight/Reps pair with a circular check button (kept in the app's existing oxblood "active state" color, not the mockup's green — this app reserves oxblood for exactly that, and every prior redesign this cycle has followed the same rule rather than introducing new hues). Underneath, a real **"Last: Xkg × Y"** line pulls from the same previous-session data the weight/reps prefill already used, plus a volume delta (↑/↓ vs. that last session). A **Weight PR** / **Vol PR** badge appears the instant a set beats this client's real all-time best for that exercise — reusing the exact PR definition the completion scorecard already established (`getSessionScorecard`'s PBs), now also computed live via a new `getExercisePersonalBests()`, with badges styled in the app's own tealBright (matching the scorecard's existing "NEW PB" tag) rather than the mockup's gold.

**Two new session-only capabilities**, both mirroring the existing exercise-swap pattern (never touches the programme, coach's design untouched):
- **Delete exercise** (trash icon, confirm-gated) — removes it from today's session only, via a new `assignment_exercise_removals` table. It comes back next time this workout comes up.
- **+ Add Set** — logs a set beyond what the programme prescribed, for today only. No schema change: it just renders one more checkable row, tracked locally (surviving a reload via session-snapshot.ts, same as an unchecked typed value already does) and made permanent the moment it's actually logged.

**New**: `supabase/exercise-removals.sql` (assignment_exercise_removals + RLS, identical shape to exercise-swaps.sql); `exercise-removals.ts`; `getExercisePersonalBests()` in `session-scorecard.ts`; `getSetLogTimeRange()` in `set-logging.ts`; `extraSetsByExercise` added to `session-snapshot.ts`'s payload.

**Verified here**: a generic in-memory fake of `supabase.from()` seeded with a prior session's real logged sets (20kg × 16, 20kg × 14 for Cable Fly), rendered through the real screen and driven with Playwright — confirmed the summary bar, Heart Rate placeholder, and tag pill ("Isolation · 90s rest") all render; confirmed logging 35kg × 16 correctly showed "Last: 20kg x 16 ↑ +240kg vol", both a Vol PR and Weight PR badge, live Volume/Sets/Duration updates, and the still-running rest timer and per-exercise RPE prompt (correctly relocated to the new last set); confirmed **+ Add Set** rendered a genuine new checkable row; confirmed the trash icon's confirm dialog, and that confirming actually removed the exercise from the session.

**How you verify this yourself:** open any pending workout as a client — you should see the new header/summary bar/Heart Rate row, big weight/reps boxes with a "Last:" line once you have session history, a PR badge the moment you beat a real best, a working trash icon (with a confirmation) on each exercise, and a working "+ Add Set" link. Everything else — readiness, swap, rest timer, RPE, Mark Workout Complete — should work exactly as it did before.

## Photos sub-tab cleanup: one compare mechanism, not two

The Photos sub-tab had two ways to compare progress photos doing the same job: a gallery grid, and a separate before/after picker section underneath it with its own two horizontal-scroll thumbnail rows feeding the same `PhotoCompareSlider`. That second section is gone — tapping any two photos directly in the gallery now drives the exact same slider in its place.

**How it works now**: tap a photo in the gallery to select it (oxblood border, same visual language as everywhere else selection is shown in this app). Tap a second one and the compare slider appears right below the gallery. Tap either selected photo again to deselect it; tap a third photo while two are already selected and it starts a fresh pair with just that one, rather than leaving it ambiguous which of the two gets bumped. A small caption above the gallery tracks the state in plain language: "Tap two photos to compare them" → "Tap another photo to compare it with" → "Comparing the two selected photos below." Switching angle (front/side/back) clears the selection, same as it already did before this change.

**One thing worth knowing**: which photo reads as "before" and which as "after" is now decided by date, not by tap order — the earlier photo always renders on the left labeled with its own date, the later one on the right, regardless of which one you happened to tap first. The old picker let you assign Before/After arbitrarily by which thumbnail row you tapped; this is more honest and removes a way to accidentally build a backwards comparison.

**Removed**: the separate "Compare {angle} photos" heading, its two Before/After thumbnail-picker rows, and the now-unused `PhotoThumbnailPicker` helper component — none of it is needed anymore since the gallery itself is the picker.

**Verified here**: a generic in-memory fake of `supabase.from()`/`supabase.storage`, seeded with 3 front-angle photos and 1 side-angle photo, rendered through the real Photos sub-tab and driven with Playwright — confirmed the old "Compare front photos" heading and Before/After labels are completely gone; confirmed tapping two gallery photos shows the correct selected-state caption at each step and renders the compare slider with the two photos correctly ordered oldest-to-newest regardless of tap order; confirmed tapping a third photo restarts the selection instead of leaving the stale pair comparing; confirmed switching angle clears the selection.

**How you verify this yourself:** open Progress → Photos with at least 2 photos of the same angle logged. Confirm there's no separate before/after section below the gallery anymore. Tap two photos in the gallery — the compare slider should appear right there, with the earlier date on the left. Tap a third photo and confirm it starts a new pair instead of showing a stale comparison. Switch angle and confirm the selection clears.

## Saved Meals: bundle a logged meal into a reusable template

A client can now save everything currently logged under one meal slot (say, everything under Breakfast today) as a named template — "My protein breakfast" — and log the whole bundle back in one tap later, without re-searching USDA/Open Food Facts for each item. There was no existing "Saved Meals" screen or quick-link anywhere in the codebase yet (despite this having been described as already existing) — both were built from scratch this chunk.

**Save**: each meal section on Nutrition (Breakfast/Lunch/Dinner/Snacks) gets a "Save as meal" link, shown whenever that section has at least one entry for whatever date is currently being viewed. Tapping it prompts for a name, then copies every entry currently in that section — food name, quantity, and its already-scaled calories/protein/carbs/fat — into a new `saved_meals` row and its `saved_meal_items` (same "snapshot at the moment it's captured, never a live reference" rule `food_logs` and `recipe_ingredients` already follow; nothing here ever re-fetches from a food database).

**Load, two ways**: (1) inside the existing add-food modal, a new "📋 Use a saved meal" option next to "📷 Scan a barcode instead" lists every saved template — picking one logs all of its items straight to whichever meal/date the modal is currently open for. (2) The new standalone **Saved Meals screen** (reached via a "Saved Meals" link now on the Nutrition header) lists every template with its item count, total calories, and item names, plus a "Log to Breakfast/Lunch/Dinner/Snacks" quick action per template that logs it to *today* under whichever slot you tap — useful for logging several templates in a row (e.g. a whole day's meal plan) without leaving the screen. Delete is confirm-gated (`ConfirmDialog`) since removing a template is more consequential than deleting one food entry; it only removes the template, never anything already logged from it.

**New**: `supabase/saved-meals.sql` (`saved_meals` + `saved_meal_items`, client-owned only — deliberately not coach-visible, since this is a personal shortcut template, not a record of what was actually eaten, unlike `food_logs`); `src/lib/saved-meals.ts` (`listSavedMeals()`, `saveMealFromEntries()`, `logSavedMeal()`, `deleteSavedMeal()`); `src/app/(app)/client/saved-meals.tsx`. `FoodLogEntry` (`food-logs.ts`) now also exposes `source`/`sourceId` (previously write-only) so a saved meal can carry an already-logged entry's provenance forward.

**Verified here**: a generic in-memory fake of `supabase.from()`, seeded with two Breakfast entries (Oats, Whey protein), driven through the real screens with Playwright — saved Breakfast as "My protein breakfast," confirmed it showed correctly on the standalone Saved Meals screen (2 items, 420 cal, both food names listed), used its "Log to Lunch" action and confirmed Lunch picked up both items with full macros intact, then separately used the add-food modal's "Use a saved meal" option to log the same template into Dinner — confirmed all three meal sections ended up with matching entries and the calorie ring correctly totaled 1,260 kcal (420 × 3) across all three.

**How you verify this yourself:** log at least two items under one meal on Nutrition, tap "Save as meal," name it, and save. Open the new "Saved Meals" link in the Nutrition header — your template should show there with the right item count and total calories. Tap "Log to" any other meal slot — confirm all the items appear there with their original macros intact. Then open "+ Add" on a third meal slot, choose "📋 Use a saved meal," pick your template, and confirm it logs everything there too.

## Training Readiness: a real score for Home's Readiness ring

Home's Readiness ring — a dashed "Coming soon" placeholder ever since the Home redesign, since no daily readiness metric existed anywhere in the app — now shows a real score, built entirely from data the app already collects (no new tables).

**Two things blended together, not just one:**
1. **The client's own reported wellness**, from the existing pre-workout readiness questionnaire (sleep quality, soreness, energy, stress — all 1–10 ratings, answered before starting a session). Rather than just the single most recent check-in, this uses a recency-weighted average of the last 5 — the most recent counts the most, but one unusually good or bad day doesn't swing the whole score alone. A coach can freely customize this form; only scale-type questions count, and one heuristic handles the fact that some questions run backwards from the rest — "how sore/stressed are you" is bad when high, unlike sleep/energy, so any question whose label contains stress/sore/fatigue/pain/tired gets inverted before averaging. It's a heuristic, not perfect (an unusually worded question could still fool it), but it correctly handles the real seeded default form.
2. **How much they've actually trained recently** — completed workouts in the trailing 7 days, more of them meaning less recovery banked. Capped at 6 sessions/week as "about as fatigued as this heuristic will call it" — a deliberately simple, transparent proxy, not a physiological model (no wearable/HRV data exists to do better yet).

The two are weighted equally and rescaled to the same 1–10 scale Momentum already uses. If the client has never once answered a readiness check-in, the ring stays the honest placeholder ("Log a workout to see this") rather than showing a score built from training load alone, which would imply more insight into how they're actually feeling than a workout count really gives.

**New**: `src/lib/training-readiness.ts` — `getTrainingReadiness()`. No SQL changes; reads `readiness_responses`/`form_questions`/`assignments`, all already readable under existing RLS.

**Verified here**: a generic in-memory fake of `supabase.from()`, seeded with 3 past readiness check-ins (trending from rough 14 days ago to great 2 days ago, including the two inverted "lower is better" questions) plus 2 completed workouts in the trailing week, rendered through the real Home screen — hand-calculated the expected blended score (6.6/10) and confirmed the ring showed exactly that; separately confirmed a client with zero readiness history shows the honest placeholder instead of a score, even with workout history present.

**How you verify this yourself:** as a client, answer the pre-workout readiness questionnaire a few times across different sessions, then check Home — the Readiness ring should show a real, filled teal ring (not the dashed placeholder) with a score reflecting your recent check-ins and how much you've trained lately. A brand new client who's never answered the questionnaire should still see the placeholder.

## Wearable integration, Phase A: real data plumbing for Steps, Heart Rate, and the Wearable card

**What/why**: Apple Health and Google Health are the two wearable sources planned (biggest reach, most standardised APIs; Fitbit/Garmin/Whoop are a later addition once these two are stable). But the app actually reading from HealthKit or Health Connect is native-only code — it needs a real EAS Build with a custom dev client, platform entitlements, and a physical device to test permission grants, none of which exist yet for this project. So this chunk is deliberately Phase A only: the three tables a real integration will write to, the read-side functions the app needs, and those functions wired into the three places that were already honest UI placeholders waiting on this (Home's Steps ring, the Workout Logger's Heart Rate row, Settings' Wearable card). There is no "Connect" button — building one now would fake a connection that doesn't exist, which breaks this app's rule of never showing fabricated data. Nothing will look different in your live app today; these screens stay on their honest placeholders until Phase B (the native HealthKit/Health Connect code, needs your own EAS/dev-client setup) exists to actually write rows into these tables.

**New**: `supabase/wearables.sql` — `wearable_connections` (one row per client+provider, `connected_at`/`last_synced_at`), `wearable_daily_metrics` (one row per client+date: steps/resting heart rate/active calories/sleep minutes), `wearable_heart_rate_samples` (append-only bpm readings with a timestamp) — all client-owned + coach-readable, same RLS shape as `food_logs`/`weight_logs`. Run this migration after `saved-meals.sql`. `src/lib/wearables.ts` — read side: `getWearableConnections()`, `getDailyMetricsForDate()`, `getLatestHeartRateSample()` (refuses to return a sample older than 10 minutes, treating a stale reading exactly like "no wearable connected" instead of showing outdated data as if it were live); write side (`recordWearableConnection()`, `recordWearableSynced()`, `saveDailyMetrics()`, `recordHeartRateSample()`) exists for Phase B to call — nothing calls it yet.

Wired in: Home's Steps ring (`client/index.tsx`) now reads `getDailyMetricsForDate()`, showing a real step count when a row exists and the honest "Sync a wearable" placeholder otherwise. The Workout Logger's Heart Rate row (`assigned/[id].tsx`) polls `getLatestHeartRateSample()` every 30 seconds while the session is open, showing a real bpm or falling back to "-- bpm · Connect a wearable". Settings' existing Wearable card now shows the real connected provider name(s) and a real relative "last synced" time (`formatRelativeTime()`) instead of hardcoded "Not connected"/"Never" — Force Sync stays disabled, since there's nothing yet to sync.

**Verified here**: a generic in-memory fake of `supabase.from()`, seeded with one `apple_health` connection, a `wearable_daily_metrics` row (8,432 steps), and a heart rate sample 2 minutes old (132 bpm), rendered through the real Home/Workout Logger/Settings screens — confirmed Home's Steps ring shows "8,432" with subtitle "today" (not the sync placeholder), the Workout Logger shows "132 bpm" with the placeholder text gone, and Settings shows "Apple Health" with a real relative last-synced time instead of "Not connected"/"Never". Then re-seeded the same heart rate sample as 30 minutes old and confirmed both the "shows 132 bpm" and "placeholder gone" checks correctly flipped to failing — proving the 10-minute freshness cutoff genuinely falls back to the honest placeholder instead of showing a stale reading as current.

**How you verify this yourself:** nothing to check in the live app yet — there's no way to actually connect a wearable until Phase B (the native HealthKit/Health Connect build) exists, so Home's Steps ring, the Workout Logger's Heart Rate row, and Settings' Wearable card will all keep showing their honest placeholders. Run `supabase/wearables.sql` in Supabase now so the tables are in place and ready for when Phase B is built.

## Chat attachments, composer reorder, the voice message fix, and bulk/scheduled messaging

**The voice message bug, found**: recording never actually worked on a real device, because the app never told the OS it was allowed to record at all. expo-audio requires one call — `setAudioModeAsync({ allowsRecording: true })` — before the first `recorder.record()`, and it was simply missing. `chat-thread.tsx` now makes that call once when a chat screen mounts. This can't be re-verified end-to-end in this sandbox (there's no microphone in a headless browser, and never has been for this feature — recording itself has always needed a real device), but the fix is the standard, documented cause of exactly the failure you saw, and it's a two-line, low-risk change.

**Chat attachments**: either side can now attach a photo or a document to an ordinary message, not just voice notes. `messages` gained generic `attachment_storage_path`/`attachment_file_name`/`attachment_mime_type`/`attachment_size_bytes` columns and a new `kind` value each for `image` and `file`, backed by a new private `chat-attachments` storage bucket (same signed-URL pattern voice notes already use). Photos go through `expo-image-picker` (already installed); documents go through the newly added `expo-document-picker`. A photo renders as a thumbnail bubble; a document renders as a filename + size card — tapping either opens it via the system viewer.

**Composer reorder**: was `[😊][text box][🎤/Send]`; now `[text box][😊][📎][🎤/Send]` — the message box comes first, everything else stacks to its right, matching how you asked for it. Tapping 📎 offers Photo from library / Take a photo / Document.

**Bulk & scheduled messaging (coach only)**: two new header icons on the coach's Messages inbox — a megaphone (Send Bulk Message) and a calendar (Scheduled Messages). Compose screen: pick clients (checkboxes + Select All), write one message, optionally attach a single photo/document, then either **Send Now** (fires immediately, client-side — one real message per selected client, no different from sending each by hand) or **Schedule** (a date + time, plus an optional Daily/Weekly/Monthly repeat). A scheduled/recurring send is picked up later by a new Postgres `pg_cron` job running every 15 minutes, which fires `dispatch_due_bulk_message_series()` — this writes one real message into every recipient's own conversation and, for a repeating series, advances it to its next occurrence rather than firing once and stopping. The Scheduled Messages screen lists every pending/recurring series with a countdown, cadence + times sent, message preview, recipient count, and the exact scheduled time, with a confirm-gated Cancel Series (stops future sends, keeps what's already gone out).

One deliberate scope decision: the compose screen's "Label" field is for **your own reference only** in the Scheduled Messages list — it is never sent to clients, only the Message body (+ attachment) is, so a client's chat never shows an internal note meant for you.

Bulk sends reuse ordinary chat infrastructure end to end — a bulk message is just several real `messages` rows created at once (or later, by the cron job), each showing up in that client's normal conversation exactly like anything else you'd send them, with realtime delivery and read receipts working the same way. An attachment on a bulk send is uploaded once (under the series' own id, not per recipient) and every recipient's message row simply references that same file — no wasted duplicate uploads.

**New**: `supabase/chat-attachments.sql` (messages' new attachment columns + `chat-attachments` bucket + RLS, run after `chat.sql`); `supabase/bulk-messages.sql` (`bulk_message_series` / `bulk_message_recipients` / `bulk_message_deliveries` + the `pg_cron` extension, job, and `dispatch_due_bulk_message_series()` function, run after `chat-attachments.sql`); `src/lib/bulk-messages.ts` (`createBulkMessageSeries()` / `listScheduledBulkMessageSeries()` / `cancelBulkMessageSeries()`); `src/app/(app)/messages/bulk-send.tsx` and `.../scheduled.tsx`. `chat.ts` gained `sendImageMessage()`/`sendFileMessage()`. Along the way, fixed a real pre-existing bug in `chat-thread.tsx`: a failed send (voice, photo, or otherwise) used to hide the *entire* message list, not just show an error banner — `loadError` (nothing to show) and `actionError` (a banner on top of what's already there) are now two separate states.

**Verified here**: a generic in-memory fake of `supabase.from()`/`.storage`, seeded with 3 clients (one with an existing conversation, two without) — confirmed the composer's new left-to-right order, sent a real photo and a real document into a chat thread via Playwright's file-chooser interception and confirmed both landed as the correct `kind` with the right metadata; ran Send Now to 2 of 3 clients with a photo attached and confirmed exactly 2 new messages were created, in the right two conversations, both referencing the *same* uploaded file (not duplicated), plus a matching delivery row each and the untouched third client getting nothing; ran Schedule with a weekly repeat for all 3 and confirmed a series row was created active with the right cadence and *zero* messages sent (only the cron job sends anything for a scheduled series, and this environment can't run that job for real); confirmed the Scheduled Messages screen lists it correctly and Cancel Series marks it inactive and removes it from the list.

**What's not verified here**: the `pg_cron` job actually firing at the scheduled time. There's no live Supabase project in this sandbox to run it against — you'll need to confirm this once for real after running the migration (e.g. schedule a test message 5 minutes out and confirm it lands in a client's chat on time).

Run `npm install` (this chunk adds `expo-document-picker`), and if you're testing on a device rather than just the web export, restart with `npx expo start -c` so the new native module actually gets picked up.

**How you verify this yourself:** run `supabase/chat-attachments.sql` then `supabase/bulk-messages.sql` (the second one enables `pg_cron` — if that line errors, turn it on first via Dashboard → Database → Extensions, then re-run just that file). In any chat, confirm the composer's new order and try attaching a photo and a document. As the coach, open Messages → tap the megaphone, pick a couple of clients, write a message, and Send Now — confirm it lands in each of their chats. Then compose another one, choose Schedule for a few minutes out, and check the Scheduled Messages screen shows it counting down; wait for it to fire and confirm it actually arrives (this is the one part only a real Supabase project can prove).

## Exercise Library merge: real images from free-exercise-db

**What/why**: the Exercise Library's 872 exercises (imported from exercemus/wger) never had real images — `image_url` was seeded NULL for every row, because that dataset's own images live on the exercemus website, not in the data file. free-exercise-db (github.com/yuhonas/free-exercise-db, public domain, 876 exercises) turned out to share a common origin with the existing data — the overwhelming majority of names match exactly — so this merges it in as a real image source, plus a small number of genuinely new exercises neither dataset had in common.

**The matching approach** (worth explaining before you run it, since name-matching across two independently-structured datasets is exactly the kind of thing that quietly creates duplicates if you trust it blindly):

1. Normalize both name lists (lowercase, trim, collapse whitespace) and match exactly first. This alone matched **852 of 876** free-exercise-db exercises straight onto an existing row — strong evidence the two datasets share an ancestor, not a coincidence.
2. The 24 that didn't match got checked by hand, not by a fuzzier automated pass (an algorithm loose enough to catch "Hammer Curl" vs "Hammer Curls" is also loose enough to wrongly merge two different exercises that happen to share a few words). Cross-checking each one's equipment, primary muscle, and instruction text against the existing library — not just its name — resolved **19 as the same exercise under a different label**: singular/plural ("Hammer Curl"/"Hammer Curls"), word order ("Barbell Decline Bench Press"/"Decline Barbell Bench Press" — the pair that a plain fuzzy-name match actually missed, and only turned up by checking the residual "existing rows with no match" list from the other direction), punctuation style ("Cable Hammer Curls (Rope Attachment)" vs "... - Rope Attachment"), and a couple of real judgment calls confirmed by matching instruction text nearly word-for-word rather than the name at all ("Butterfly" [machine, chest] = the existing "Machine Chest Fly"; "Bench Press - With Bands" turned out to be a near-verbatim instructional match for the existing "Band Bench Press").
3. The remaining **5** are genuinely new exercises — confirmed by their equipment/muscles/instructions not resembling anything already in the library, not just an absent name match: Bench Press - Powerlifting, Kettlebell Halo, Kettlebell Halo with Overhead Extension, Kettlebell Overhead Triceps Extension, Parallel Bar Dip.
4. Only **one** existing exercise, "Dumbbell Skullcrusher", has no free-exercise-db counterpart at all — it keeps its NULL image, same honest-placeholder handling as before.

**New**: `supabase/exercise-library-free-exercise-db-merge.sql` — adds an `image_urls text[]` column (free-exercise-db has up to 2 images per exercise; `image_url` keeps holding just the first one for anything that only reads that single column), backfills images onto the 871 matched rows (852 exact + 19 hand-resolved, guarded by `image_url is null` so it never overwrites an image you've already set — including on a custom exercise you added yourself — and is a safe no-op to re-run), and inserts the 5 new rows with `on conflict (name) do nothing`. Images link directly to free-exercise-db's own GitHub repo (raw.githubusercontent.com), the same "just link to it" approach `video_url` already uses for YouTube. `exercise-library.ts`'s `getExerciseDetail()` now also returns `imageUrls`; the Exercise Library screen shows them as a horizontal scrollable gallery under an expanded exercise, when it has any.

**Verified here** two different ways: first, for real — this sandbox happens to have a genuine local PostgreSQL 16 available, so rather than only simulating the database, I actually ran the base `exercise-library.sql` seed and then this merge migration against a real Postgres instance. Confirmed: 872 → 877 rows after merge; exactly 0 duplicate names; 873 rows now have an image (871 backfilled + 2 of the 5 new ones that happen to have a free-exercise-db image); the 4 rows still without one are exactly the 1 true no-match plus the 3 new Kettlebell exercises free-exercise-db itself has no images for. Re-ran the same migration file a second time and confirmed it's a genuine no-op (`UPDATE 0`, `INSERT 0 0`) — including a check where I manually set a custom image on an existing exercise first, re-ran the merge, and confirmed that custom image was left completely untouched. Second, the app side: a generic in-memory fake of `supabase.from()`, seeded with one exercise carrying two images and one carrying none, confirmed through the real Exercise Library screen that the two-image exercise shows exactly 2 images in its gallery and the no-image one shows zero (with its instructions still displaying normally either way).

**How you verify this yourself:** run `supabase/exercise-library-free-exercise-db-merge.sql`, then in Supabase check `select count(*) from exercise_library` reads 877 (not 872, not more), and `select count(*) from (select name, count(*) from exercise_library group by name having count(*) > 1) d` reads 0. In the app, open Exercise Library as a coach, search for "Kettlebell Halo" and confirm it's there as a new exercise; expand a common exercise like "Bench Press" or "Squat" and confirm real photos now show above the instructions. If you've added any custom exercises of your own, check their images are still exactly what you set them to.

## Decimal keypad, a real voice-recording crash fix, a Community tab (and a real bug it turned up), and an Exercise progress sub-tab

**Decimal keypad**: Progress → Metrics' Weight/Body fat %/Muscle % inputs were `keyboardType="numeric"`, which on iOS has no "." key at all — a value like 73.1 could never actually be typed. All three are `"decimal-pad"` now, the same keyboard type `nutrition.tsx`'s own gram inputs already correctly use.

**Voice recording crash, found and fixed for real this time**: you hit a genuine uncaught crash — "Cannot start an audio recording without initializing a MediaRecorder. Run prepareToRecordAsync() before attempting to start an audio recording." The earlier `setAudioModeAsync` fix was real and still necessary, but it wasn't the whole story: `handleStopRecording`/`handleCancelRecording` had no guard against being called twice (a double-tap on "Stop & send," or tapping both Stop and Cancel in quick succession) — the second `recorder.stop()` call lands on a recorder that already stopped and reset itself, and throws instead of no-op'ing. All three handlers (start/stop/cancel) now check the live `recorderState.isRecording` (not just the UI-only `recordingActive` flag) before acting, are wrapped in try/catch so a failure ever becomes a friendly `actionError` banner instead of an uncaught crash, and the Stop/Cancel buttons disable themselves while a stop is already in flight. This can't be fully re-verified end-to-end here (no real microphone in this sandbox), but I did verify the failure mode directly: tapping the mic with no microphone permission granted now shows "Microphone access is needed..." as a banner, not a crash screen.

**Community tab — and a real bug this surfaced**: Community is now its own tab on the bottom bar (between Progress and Chat), not a card on Home. The card (with its per-client hide toggle and eye icon) is gone entirely; the unread-post badge moved from that card to the tab itself, using the same live-subscription pattern the Chat tab's badge already uses, plus a re-check on every navigation change (`usePathname()`) to catch "just viewed Community" — that write isn't realtime-subscribed the way new posts are, so it needs its own explicit refetch rather than relying on the subscription alone. The shared `community/index.tsx` screen needed one small change (its "Back to home" link now only shows for the coach, who still reaches it by pushing from a NavCard — a client doesn't need it, Home is one tap away like every other tab).

While tracking down what you'd actually circled in your screenshot, found the real bug behind it: `client/saved-meals.tsx` was never given the `href: null` guard `calendar.tsx` has — Expo Router's tab navigator treats every file living directly in a Tabs folder as a real tab unless told otherwise, so saved-meals.tsx had been quietly rendering as an **undeclared 7th tab** with no icon of its own (React Navigation's default fallback glyph, a small ▼) this whole time. That ▼ is what you saw and circled — not Saved Meals itself, but this accidental tab pointing at it. Fixed with the same `href: null` treatment calendar.tsx already has; Saved Meals stays exactly as it was otherwise (reached from Nutrition's header link).

**Exercise progress sub-tab**: a new "Exercise" sub-tab on Progress (Metrics/Measure/Exercise/Photos) lists every exercise this client has ever logged a set for, alphabetically, each card showing a trend arrow — tealBright up / textSecondary steady / oxblood down, the same 3-way scale `complianceColor()` already uses, so no new color needed — plus session count, last performed, and best weight. Tapping a card opens its full history: a progression graph (total volume per session, oldest to newest), a trend label, stat tiles (best weight, best session volume, sessions logged, last performed), and the full session-by-session list underneath. A swapped exercise's sets count toward the exercise actually performed, not whatever the programme originally prescribed — same swap-resolution `getSessionScorecard()` already does for PBs, just applied across a client's whole history instead of one session. Trend compares the average of the most recent sessions (up to 3) against everything before them, with a ±5% deadband so ordinary noise doesn't flip the arrow; fewer than 2 sessions logged shows "maintaining" by default (not a real trend yet) and the graph itself shows a plain "log one more session" message instead of an empty chart.

**New**: `src/lib/exercise-progress.ts` (`listExercisesWithHistory()`, `getExerciseVolumeHistory()`); `src/components/exercise-volume-chart.tsx`; `src/components/exercise-progress-panel.tsx`; `src/app/(app)/client/exercise-progress/[id].tsx`; `src/app/(app)/client/community.tsx` (thin re-export of `community/index.tsx`). **Changed**: `client/_layout.tsx` (Community tab + its badge effects, the `saved-meals`/`exercise-progress/[id]` `href: null` fixes), `client/index.tsx` (Community card and all its plumbing removed), `client/progress.tsx` (Exercise sub-tab), `community/index.tsx` ("Back to home" now coach-only), `chat-thread.tsx` (recording guards), `metrics-panel.tsx` (decimal-pad), `community.ts` (dropped the now-dead `getCommunityHidden`/`setCommunityHidden`).

**Verified here**: a generic in-memory fake of `supabase.from()`, seeded with 4 assignments across 6 weeks — 3 logging "Bench Press" at climbing weights (100kg → 105kg → 110kg) and a 4th where that same exercise slot was swapped to "Incline Dumbbell Press" for one session — confirmed through the real app: the tab bar shows exactly 6 real tabs (verified via the DOM directly, not just visually) with calendar/saved-meals/exercise-progress all correctly hidden; Community's tab renders the seeded feed with no "Back to home" link; the Exercise sub-tab lists "Bench Press" (3 sessions, correctly excluding the swapped one) before "Incline Dumbbell Press" (1 session, alphabetical) with the right best weight; Bench Press's detail screen shows "Trending up," the right best weight/volume, and a rendered graph; Incline Dumbbell Press's (1 session) shows the "log one more" message instead; and the Weight/Body fat % inputs report `inputmode="decimal"` in the actual rendered DOM.

**How you verify this yourself:** open Progress → Metrics and confirm you can type "73.1" into Weight now. Open the app as a client and count the tab bar — should be exactly 6 (Home/Training/Nutrition/Progress/Community/Chat), no stray ▼. Tap Community and confirm the feed loads with no "Back to home" link. Log a few sessions of the same exercise at different weights, then open Progress → Exercise — find it in the alphabetical list, tap it, and confirm the graph and trend arrow look right for what you actually logged.

## Nutrition header size

**What/why**: Nutrition's own header title had a `fontSize: 28`/`lineHeight: 33` override — every other tab (Training, Progress, Exercise Library, and Nutrition itself before whatever chunk first added this) renders its title at the shared `type="title"` size (48px). Removed the override so Nutrition's "Nutrition" heading matches everywhere else; the fork icon, "Saved Meals" link, and search icon in that same header row are untouched and still line up correctly at the larger size (the row was already `alignItems: 'center'`).

**Verified here**: a generic in-memory fake of `supabase.from()`, rendered through the real Nutrition/Training/Progress screens — read each one's title back via `getComputedStyle` and confirmed all three report the identical 48px font size.

**How you verify this yourself:** flip between the Training, Nutrition, and Progress tabs as a client — the title text at the top of each should now look the same size.

## Challenges, Phase A: creation and joining

**What/why**: the start of a Challenges feature — a coach can create a challenge and clients can genuinely opt in or out. This chunk is deliberately just that: creation and joining. There is no progress tracking, no scoring against a challenge's Volume/Consistency type, and no leaderboard yet — `type` is captured on the row from day one so it's there when that logic gets built, but nothing reads it yet.

**Schema**: three new tables in `supabase/challenges.sql`.
- `challenges` — name, `type` (`volume` or `consistency`), `start_date`/`end_date`, and `open_to_all` (true = every client can see and join it; false = only the specific clients picked at creation time).
- `challenge_eligible_clients` — the specific-clients list, populated only when `open_to_all` is false. Same "snapshot the picks at creation time" shape `bulk_message_recipients` already uses for scheduled messages, not a live/dynamic audience.
- `challenge_participants` — who has actually joined. A client is never auto-enrolled; a row here only exists because they tapped Join, and leaving deletes the row outright (no "left" history kept).

**Coach screen** (`/challenges`, `+ New` → `/challenges/new`): a list of every challenge the coach has created (past, active, and upcoming — managing one doesn't stop just because its dates passed), each showing its type, date range, audience, and a real participant count. The create screen is Name, a Volume/Consistency pill toggle, Start/End dates (typed as `YYYY-MM-DD`, validated, not a native date picker — same reason `messages/bulk-send.tsx` does this), and an All Clients/Specific Clients toggle that reveals the exact checkbox-plus-Select-All client picker `bulk-send.tsx` already established.

**Client screen** (same `/challenges` route, branches on role): lists active/upcoming challenges this client is eligible for — open-to-all ones, plus anything they're specifically listed for — each with a real Join button. Tapping Join inserts a `challenge_participants` row and the button flips to Leave; tapping Leave deletes it and it flips back. Nothing is pre-joined.

**Eligibility is enforced by the database, not just the screen** — every policy in `challenges.sql` was tested against a real local PostgreSQL 16 instance in this sandbox (a genuinely low-privilege `authenticated` role, not the table owner, which would bypass RLS entirely), not just written to look right by pattern-matching. That testing caught two real bugs before they shipped: a table-creation-order bug (a policy referenced `challenge_eligible_clients` before that table existed in the file), and an infinite-recursion bug (`challenges`' client-select policy checked `challenge_eligible_clients`, whose own policy checked `challenges` right back — Postgres detects this and refuses to run). Fixed by adding three `SECURITY DEFINER` helper functions (`owns_challenge()`, `is_eligible_for_challenge()`, `can_join_challenge()`), the same pattern this app's existing `is_coach()`/`is_client()` already use to break exactly this kind of cycle.

**New**: `supabase/challenges.sql`; `src/lib/challenges.ts` (`createChallenge`, `listCoachChallenges`, `listClientChallenges`, `joinChallenge`, `leaveChallenge`); `src/app/(app)/challenges/index.tsx`; `src/app/(app)/challenges/new.tsx`. **Changed**: `home.tsx` (a "Challenges" NavCard in the Coaching Hub grid), `client/index.tsx` (a "Challenges" card replacing where Community's card used to sit).

**Verified here** two different ways. First, for real: with `challenges.sql` applied against a real Postgres instance, confirmed a coach could create an open-to-all challenge, a specific-clients challenge, and one already ended; an eligible client saw all 3 while an ineligible client correctly saw only the 2 open ones; an ineligible client's attempt to join the specific-clients challenge was rejected outright by RLS (not just hidden by the UI); an eligible client's join succeeded; joining an already-ended challenge (even one open to all) was rejected; a client could delete their own participation row but not another client's; and participant counts were accurate throughout. Second, the app side: a generic in-memory fake of `supabase.from()`, using a technique new this chunk — simulating a session switch without reloading the page, so one script proves "coach creates → client sees it" continuity — confirmed: the coach's empty state, then both new challenges appearing in the coach's list with the right type/audience/0-joined; switching to an eligible client showed both challenges; joining the open one wrote a real `challenge_participants` row and flipped the button to Leave; leaving removed it and flipped the button back; and a second client's join state stayed completely independent of the first's. (This fake harness has no real RLS engine, so eligibility *enforcement* itself was proven the first way, against real Postgres, not this way.)

**How you verify this yourself:** run `supabase/challenges.sql` in the Supabase SQL Editor (after `community-leaderboards.sql`). As the coach, open Home → Challenges → + New, create one challenge open to all clients and another for a specific client or two, and confirm both show up in the list with the right participant count (0 to start). As that specific client, open Challenges and confirm you see it; as a different client not on that list, confirm you don't. As any eligible client, tap Join and confirm the button flips to Leave — then tap Leave and confirm it flips back and you're no longer counted on the coach's side.

## Challenges, Phase B: real progress, a live leaderboard, and locking at the end date

**What/why**: a joined challenge now actually means something. Tapping into any challenge (coach or client, both audiences share the same new `/challenges/[id]` screen) shows every participant ranked by real progress computed straight from `workout_logs`/`assignments` — a Volume challenge sums weight × reps for every set logged within the challenge's own date range, a Consistency challenge counts completed sessions in that same range. Standings update live as people log workouts, and once a challenge's end date passes it shows Final Standings with the top participant marked, instead of quietly going stale.

**No new "locked" column, and no cutover job runs at midnight on the end date** — a challenge's end_date was already the hard boundary the scoring function filters by (`assigned_date between start_date and end_date`), so a set logged against a session outside that window simply never counts, whether that session happened before the challenge started or after it ended. The challenge locks itself, by construction, the same instant its own date range says it's over — there's nothing that can "forget" to lock it. The end screen (Final Standings vs. Live Standings, disabling Join/Leave) is purely a UI read of `endDate < today`, layered on top of a guarantee the database already provides.

**The scoring function**: `get_challenge_leaderboard(challenge_id)`, SECURITY DEFINER for the same reason `get_weekly_xp_leaderboard()` already is — ranking every participant means reading across clients, which no plain client-side query can do under RLS (`workout_logs`/`assignments` are both "your own rows only"). It isn't wide open just because it bypasses RLS internally, though: the same permission logic already governing "can this client even see this challenge" (`owns_challenge()` for the coach, `is_eligible_for_challenge()` for a client) gates it too — anyone else gets zero rows back, not an error. Every joined participant appears even at zero progress (a client who joined but hasn't logged anything yet still shows up, at the bottom) — the left joins in the query guarantee that rather than silently omitting them.

**Live leaderboard**: visually the same row shape (position, initials avatar, name, "(you)" self-highlight) the Community Leaderboard already established for weekly XP — reused deliberately for consistency, not rebuilt as something unrelated-looking. It's a separate component, though, since the data-fetching and gating are genuinely different: no membership-tier lock (every eligible client can see a challenge's standings), scoped to one challenge's id instead of every client at once, and realtime-subscribed. `subscribeToChallengeProgress()` follows the same unique-channel-per-subscription shape `subscribeToConversation()` (chat.ts) already uses — it listens on `workout_logs` and `challenge_participants` (both newly added to the `supabase_realtime` publication; neither carries a `challenge_id` column to filter by, so this refetches on any change anywhere and lets the scoring function's own WHERE clause decide what's actually relevant, the same broad-subscribe-then-narrow-refetch shape `subscribeToCommunityPosts()` already uses).

**Locking, visually**: while a challenge is active, the header reads "Live Standings" with a small "Updates live" caption; once `end_date` has passed, it reads "🏆 Final Standings," the caption disappears, the #1 row gets a trophy in place of its position number plus a teal highlight, and the Join/Leave control disables itself (showing "Joined" or "Ended" instead of an active button) — a client can't join or leave something that's already over, but their standing on it is still exactly as visible as everyone else's.

**New**: `supabase/challenge-progress.sql` (`get_challenge_leaderboard()`, plus adding `workout_logs`/`challenge_participants` to the realtime publication); `src/lib/challenge-progress.ts` (`getChallengeLeaderboard()`, `isChallengeLocked()`, `formatChallengeProgress()`, `subscribeToChallengeProgress()`); `src/app/(app)/challenges/[id].tsx`. **Changed**: `challenges.ts` (`getChallengeDetail()`, `getMyChallengeParticipation()`), `challenges/index.tsx` (cards are now pressable through to the detail/leaderboard screen; also gained a "‹ Back" link at the top — coach to `/home`, client to `/client` — which this screen was missing entirely until now, the same gap a coach hitting a dead end on Challenges surfaced).

**Also fixed while checking for the same gap elsewhere**: the Challenges list screen had no way back to Home at all (a genuine miss from Phase A — every other coach top-level screen has a "Back to home" link, this one didn't). It's fixed the same way on both audiences now, in the same top-left spot the new detail and create screens already use, rather than the bottom-of-screen placement older coach screens (Workouts, Clients, Messages, and Community's own coach view) happen to use — those are left exactly as they were, since a fleet-wide placement rewrite touching a dozen unrelated screens is well outside this chunk's scope; a separate consistency pass could line them all up together if that's ever wanted. Community's client-side view was checked too — it deliberately has no back link at all, same as every other client tab (Training, Nutrition, Progress, Chat): it's a real tab, not a pushed screen, so Home is one tap away already and a back link would be redundant there, not a fix.

**Verified here** two different ways. First, for real: with `challenge-progress.sql` applied against a real Postgres instance on top of a full test roster (a coach, and clients with workout history both inside and outside a challenge's date range, at various completion statuses), confirmed: Volume sums weight × reps correctly and excludes a huge set logged against a session outside the window entirely; Consistency counts only *completed* sessions inside the window, excluding a pending one and a completed-but-out-of-window one; a participant with zero logged sessions still appears at 0, not omitted; an ineligible client calling the function directly gets zero rows back; an eligible-but-not-yet-joined client can still view standings (just isn't a row in them); and the challenge's own coach sees the same full standings as an eligible client would. Second, the app side: a generic in-memory fake of `supabase.from()`/`supabase.rpc()`/`supabase.channel()`, seeded with an active Volume challenge (Alice 800kg, Bob 600kg) and an already-ended Consistency one — confirmed the active challenge shows "Live Standings" with Alice ranked above Bob at the right kg totals; **firing a simulated realtime event after logging Bob an extra set live re-ranked him above Alice with no page reload**, proving the subscription genuinely triggers a refetch rather than just existing unused; a new client joining live immediately appeared on the board at 0kg; and the ended challenge showed "🏆 Final Standings" with a trophy on the winner's row and a disabled Joined/Ended control depending on whether that viewer had joined.

**How you verify this yourself:** run `supabase/challenge-progress.sql` in the Supabase SQL Editor (after `challenges.sql`). Log a few real sets against a session dated inside an active challenge's window, then open that challenge (as the coach or a joined client) and confirm your total looks right — weight × reps summed for Volume, completed sessions counted for Consistency. Log a set on a *different* device or account while the leaderboard screen stays open on this one, and confirm the standings reorder on their own within a second or two, with nothing to refresh. Then find (or create, with a short date range) a challenge whose end date has already passed — confirm it now reads "Final Standings," the top participant has a trophy, and Join/Leave is no longer tappable.

## Community: an explicit "Back to home" for a client too, not just the coach

**What/why**: you flagged a screenshot of Community with no way back — checked the tab bar it should have sat above, and the layout code says it should be there, but rather than leave a client's only way out riding on how reliably that renders on any given device or browser, Community now shows the exact same "Back to home" link the coach's view already had, for a client too. It was previously coach-only on the reasoning that a client reaches Community as a real tab, so Home is one tap away already, same as Training/Nutrition/Progress/Chat — that reasoning still holds for those other tabs, but Community is getting its own explicit, always-visible link now rather than leaving it to be the one tab that's different only by omission.

**Changed**: `community/index.tsx` — the "Back to home" link (bottom of the screen, same spot it already used for the coach) is no longer gated by `isCoach`; it now routes to `/home` for a coach and `/client` for a client.

**Verified here**: a generic in-memory fake of `supabase.from()`, rendered through the real Community screen as a client with zero posts — confirmed "Back to home" renders directly under the empty-state message and tapping it lands on `/client`.

**How you verify this yourself:** open Community as a client — "Back to home" should now show right under the feed (or under "No posts yet" if there's nothing posted), and tapping it should take you straight to your Home tab.

## Resource Library: coach-side content sharing

**What/why**: there wasn't actually an existing "Resource Library" anywhere in the app to replace — I checked, and neither Home screen had one (no NavCard, no quick-link, no placeholder route). Whatever "empty placeholder" you had in mind, this chunk builds the real thing from scratch: a coach can upload documents/images or add external links, organise them into folders, and pick per item whether every client can see it or only specific ones; a client gets the same folder-organised view, filtered to what they're actually allowed to see.

**Schema** (`supabase/resources.sql`): three tables.
- `resource_folders` — a flat, single-level label a coach creates to group things under (e.g. "Nutrition Guides"). No nesting. Folder *names* aren't sensitive on their own, so any client can read the list of folder names — the real gate is on each item inside one, not the folder itself.
- `resource_items` — the actual thing being shared: either an uploaded file (`storage_path`, in a new private `resource-files` bucket) or an external link (`url`), a check constraint enforces never both. `folder_id` is nullable — an item with no folder shows under "Uncategorized" in the app, and deleting a folder un-categorises its items rather than deleting them. Same "open to all, or a specific list" audience shape `challenges.sql` already established.
- `resource_eligible_clients` — the specific-clients list, populated only when an item's `open_to_all` is false. Same snapshot-at-creation-time shape as `challenge_eligible_clients`.

**Coach screen** (`/resources`, reached from a new "Resource Library" NavCard on Home): every item grouped by folder, each showing a 📄/🔗 icon, an All/Specific audience badge, and Delete. `+ New` opens the create screen: pick Link or Upload File, a name, a folder (tap an existing chip, or "+ New Folder" to create and select one inline — no separate "manage folders" screen needed), and the same All Clients/Specific Clients picker `challenges/new.tsx` already uses. Uploading reuses the exact base64-read-then-`decode()`-then-upload approach `chat.ts`'s document/photo attachments already established, since that's the one that actually works reliably against Supabase Storage from React Native.

**Client screen** (same `/resources` route, branches on role): the new "Resource Library" card on the client's Home leads to the identical folder-grouped layout, minus Delete and the coach's audience badges — just what's actually visible to them. A folder that comes up with zero visible items for a given client simply doesn't render (computed app-side, not a database-level filter, since the folder name itself was never gated). Tapping any item — file or link — opens it (a file's private storage path is resolved to a fresh signed URL, good for an hour, the same pattern chat attachments already use).

**A real bug this caught**: the storage policy gating who can view an uploaded file compared `resource_items.storage_path` against what was meant to be `storage.objects.name` — but `resource_items` has its *own* `name` column (the item's display name), and inside that policy's subquery an unqualified `name` silently resolved to the wrong table's column instead of throwing an error. Running it against a real Postgres instance caught it immediately (an eligible client's file query came back empty when it shouldn't have) — fixed by explicitly qualifying `storage.objects.name`.

**New**: `supabase/resources.sql`; `src/lib/resources.ts` (`listResourceFolders()`, `createResourceFolder()`, `listCoachResourceLibrary()`, `listClientResourceLibrary()`, `createResourceLink()`, `uploadResourceFile()`, `deleteResourceItem()`); `src/app/(app)/resources/index.tsx`; `src/app/(app)/resources/new.tsx`. **Changed**: `home.tsx` (a "Resource Library" NavCard), `client/index.tsx` (a "Resource Library" card, same style as the Challenges card next to it).

**Verified here** two different ways. First, for real: with `resources.sql` applied against a real Postgres instance (including a minimal fake of Supabase's own `storage` schema — buckets, objects, `foldername()` — so the storage policies themselves could be tested, not just assumed), confirmed: a client with no special access sees only the open-to-all item; a specifically-eligible client sees both; any client can read folder names even when everything inside one is hidden from them; a client's own attempt to insert a resource item is rejected outright; a coach sees every item they've made regardless of audience; deleting a folder un-categorises its item instead of deleting it; and — this is where the bug above was actually caught — an eligible client could read the storage row for a private file while an ineligible one got zero rows, and the coach could read their own upload via the folder-name check. Second, the app side: a generic in-memory fake of `supabase.from()`/`.storage`, driven through the real screens — created a link item and a brand-new folder inline, then genuinely uploaded a real local file through Playwright's actual file-chooser (not a simulated pick) via the real Upload File button, picked "Specific Clients" and selected one, submitted, and confirmed both items render correctly grouped by folder with the right audience badges; switching to the eligible client showed both items, a second client showed only the open-to-all one (the FakeQuery harness has no real RLS engine, so full eligibility *enforcement* was proven the first way, against real Postgres); deleting the file item removed it without touching the link item.

**How you verify this yourself:** run `supabase/resources.sql` in the Supabase SQL Editor (after `challenge-progress.sql`). As the coach, open Home → Resource Library → + New, add a link (any URL) into a new folder you name on the spot, then add another item — this time upload an actual PDF or photo — and pick "Specific Clients," choosing just one of your clients. Confirm both show up grouped correctly with the right audience badge. As that specific client, open Resource Library from Home and confirm you see both; as a different client, confirm you only see the open-to-all one. Tap an item as a client to confirm it actually opens (the link in a browser, the file wherever your phone opens PDFs/images).

## App Version card on Settings

**What/why**: the last remaining piece of the Settings screen — a plain static card showing the app's current version number, underneath Sign out.

**How it's pulled**: `Constants.expoConfig?.version` from `expo-constants` (already a project dependency, just not previously used anywhere) — this reads directly from the running build's own config, which is `app.json`'s `expo.version` field (currently `"1.0.0"`), not a second hardcoded string maintained separately. `expoConfig` is Expo's current, non-deprecated field for this (the older `manifest`/`expoManifest` shape is deprecated); it falls back to the literal text "Unknown" only in a bare-workflow context this app doesn't use.

**Changed**: `settings.tsx` — one `APP_VERSION` constant read at module scope, and one small card (label left, version right, same row style the Wearable card's Status/Last synced rows already use) added after the Sign out card.

**Verified here**: a generic in-memory fake of `supabase.from()`, rendered through the real Settings screen — confirmed the card renders "App Version" / "1.0.0", exactly matching `app.json`'s `"version": "1.0.0"` at the time of this chunk, directly below Sign out.

**How you verify this yourself:** open Settings and scroll to the very bottom — the App Version card should show whatever `"version"` currently reads in `app.json`. Bump that field for a real release and confirm the card picks up the new number automatically, with no other code changes needed.

## Volume Analyser bug: real workout sets going silently uncounted

**What was reported**: the Volume Analyser wasn't updating and didn't show all worked muscle groups.

**Root cause, found by reproducing it rather than guessing**: `link-exercise-library.sql` (the migration that first connected `workout_exercises` to the real Exercise Library) deliberately left every exercise slot that existed before it at `exercise_library_id = null` — reasonable at the time, since nothing read that column yet, and the migration says so explicitly ("a bonus for later, not a dependency now"). But real features built *since* then all key off that same column to know which muscle group (or which exercise, for PBs and progress) a logged set belongs to: the Volume Analyser (`muscle-group-analysis.ts`), Progress's Exercise sub-tab (`exercise-progress.ts`), and session PB tracking (`session-scorecard.ts`). None of them error when the link is missing — they just silently skip that set, which is exactly what surfaced as muscle groups going quietly missing rather than showing an obvious 0 or an error banner.

Reproduced directly: a generic in-memory fake of `supabase.from()`, seeded with 7 logged sets across all 7 muscle groups, first with every exercise slot properly linked (all 7 groups showed "1 set," correctly) — then with one slot's `exercise_library_id` set to null, simulating a workout built before the link existed. That one group alone silently dropped to "0 sets," everything else stayed correct — confirming the exact failure mode, not a guess.

**The fix**: `supabase/backfill-exercise-library-links.sql` — matches every currently-unlinked `workout_exercises` row to `exercise_library` by exact name (case-insensitive, trimmed; `exercise_library.name` is unique, so this can only ever match one row), and sets the link. Never overwrites an existing link, never guesses: a genuinely custom exercise name a coach typed before the library existed — with no matching library row — is left exactly as it was, still fully nameable and displayable, just not categorizable by muscle group. Safe to re-run any time (a second run is a no-op once everything matchable has matched).

**Verified here**: applied against a real Postgres instance with three rows — a legacy row whose name matched a library exercise except for case and whitespace (correctly linked), a genuinely custom legacy name with no library match (correctly left null, not fabricated), and an already-linked row (left completely untouched, not overwritten). Re-ran the same migration a second time and confirmed it's a true no-op (`UPDATE 0`).

**How you verify this yourself:** run `supabase/backfill-exercise-library-links.sql` in the Supabase SQL Editor (no particular order relative to other migrations — it's independent). Then run the query in that file's own comment (`select distinct name from workout_exercises where exercise_library_id is null`) to see if anything's still unmatched — if something shows up, that's a workout exercise typed before the library existed with no equivalent in it; you'd need to either rename it to match an existing library exercise or accept it stays uncategorized. In the app, open Training as a client who's logged sets this week against an OLDER workout template and confirm the Volume Analyser now reflects all of it, not just anything logged against newer workouts.

## Form Check: record/upload a video, get written (and optional video) feedback

**What/why**: replaces the toggle-only placeholder that's existed since `feature-toggles.sql` first reserved the `form_check` key — worth being upfront about what I actually found: there was no existing Form Check button or screen anywhere in the app to "replace." The per-client toggle (with its per-tier defaults — off for Base, on for Accelerator/Precision) genuinely did already exist, correctly wired into the toggle-presets system; nothing in the UI ever read it. This chunk builds the real feature end to end and wires it into that existing toggle, the same `isFeatureEnabled('form_check')` gate every other per-client-toggle screen (Chat, Community, Leaderboards) already uses.

**Client side**: a real "Form Check" card now sits on the Training tab (`client/training.tsx`), right under the Volume Analyser. A client with the feature on sees "Record or upload a video," leading to a new `/client/form-check` screen: name the exercise, an optional note ("what feels off?"), then either 🎥 Record (camera) or 📁 Choose from Library — both go through `expo-image-picker`'s video mode, capped at 60 seconds. Submitting uploads the video and lists it under "Your Submissions" as Pending; once the coach responds, it flips to Reviewed and expanding the card shows the coach's written feedback plus their optional follow-up video. A client with the feature off sees the same `FeatureLockedCard` upsell every other gated screen uses, on both the Training card and the screen itself.

**Coach side**: a new "Form Check" NavCard on Home leads to `/form-check` — every submission across every client, pending ones first (oldest first, so it reads as a real queue), then already-reviewed ones. Tapping one opens `/form-check/[id]`: the client's video, their note, and — if still pending — a feedback form (required text, an optional follow-up video via the same Record/Choose-from-Library flow) that marks it Reviewed on send. Once reviewed, this becomes a read-only view of what was sent; there's no re-editing a response in this chunk, same as a check-in's answers don't get revised after the fact.

**Storage, reusing what already exists**: one new private bucket, `form-check-videos`, path `<client_id>/<filename>` for both the client's own video and the coach's follow-up (kept together for a cleaner layout) — same private-bucket-plus-signed-URL shape `chat-audio`/`chat-attachments` already established, and the same base64-read-then-`decode()`-then-upload approach `chat.ts`'s voice/photo/document attachments already use. Playback uses `expo-video` (newly added — `expo-av` is deprecated, and this project had no video-playback library yet; genuinely new, but it's a rendering library, not new backend infrastructure) via a small shared `<VideoPlayback uri>` component wrapping `useVideoPlayer`/`VideoView`.

**A real bug this caught**: `expo-file-system`'s `readAsStringAsync` — the fallback `video-picker.ts` used to turn a picked video into base64 — throws outright on web ("is not available on web"), not just for video specifically. Fixed by requesting `base64: true` from the picker itself and using `asset.base64 ?? (await FileSystem.readAsStringAsync(...))`, the exact same fallback order `chat.ts`'s own document-picker handler already uses for the identical reason. Confirmed empirically: the unfixed version threw that exact error the instant a video was picked in the browser-based verification pass; the fixed version picks up `asset.base64` directly and never touches the broken path there at all.

**New**: `supabase/form-check.sql` (`form_check_submissions` table + the `form-check-videos` bucket and its policies); `src/lib/form-check.ts` (`submitFormCheck()`, `listMyFormCheckSubmissions()`, `listCoachFormCheckSubmissions()`, `getCoachFormCheckSubmission()`, `respondToFormCheck()`); `src/lib/video-picker.ts` (`recordVideo()`, `pickVideoFromLibrary()`); `src/components/video-playback.tsx`; `src/app/(app)/client/form-check.tsx`; `src/app/(app)/form-check/index.tsx` and `[id].tsx`. **Changed**: `home.tsx` (a "Form Check" NavCard), `client/training.tsx` (the real Form Check card, replacing nothing since nothing existed there before), `client/_layout.tsx` (`form-check` given the same `href: null` treatment every other pushed-but-not-tabbed screen already gets). `package.json` gained `expo-video`.

**Verified here** two different ways. First, for real: applied `form-check.sql` against a real Postgres instance — a client can submit only as themselves (submitting as another client id is rejected), a client sees only their own submissions, the coach sees every submission across every client, a client cannot update their own row (fake their own "approval"), the coach's response correctly flips it to reviewed, a client can upload only into their own storage folder (not another client's), an ineligible client gets zero storage rows back, and the coach can read and write into any client's folder. Second, the app side: a generic in-memory fake of `supabase.from()`/`.storage`, driven through the real screens with a genuine picked file (not a simulated pick) via Playwright's actual file chooser — submitted a video with a note, confirmed it showed Pending; switched to the coach, confirmed the client's name/exercise/note appeared and the client's video rendered as a real `<video>` element, wrote feedback and attached a real follow-up video, sent it; switched back to the client and confirmed the submission now read Reviewed with the coach's feedback text and BOTH videos (the client's own and the coach's follow-up) rendering; and confirmed a toggle-off client sees the locked upsell card on both the Training tab and the Form Check screen itself, with no way to reach the submit form.

**How you verify this yourself:** run `supabase/form-check.sql` in the Supabase SQL Editor (after `backfill-exercise-library-links.sql`, though order doesn't actually matter). As a client with Form Check enabled, open Training → Form Check, name an exercise, record or upload a short video, add a note, and submit — confirm it shows up under "Your Submissions" as Pending. As the coach, open Home → Form Check, confirm the submission is there with the right client name and exercise, tap into it, watch the video, write feedback (optionally attach your own follow-up video), and send it. Back as that client, confirm the submission now reads Reviewed and expanding it shows your feedback (and follow-up video, if you sent one). Then, as a different client whose coach has turned Form Check off for them (Clients → that client → Feature Access), confirm they see the locked upsell instead of the record/upload form.

## Chat: message reactions — double-tap to react

**What/why**: either side can now react to an individual message with an emoji — double-tap a bubble to open the same curated picker the composer already uses, tap one to react. "Like and/or heart" both just fall out of picking ❤️ or 👍 from that grid, not a separate special-cased mechanism.

**How it works**: one reaction per person per message, not a stack — reacting again with a different emoji replaces yours (an upsert, keyed on message + person), and tapping your own reaction pill again removes it. A single tap still does whatever it always did (open an attachment, or nothing for a plain text message); a second tap on the *same* message within 300ms is what counts as the double-tap, tracked in a plain ref rather than state since it only ever needs to survive between two rapid taps. Reactions show as small pills under the bubble, grouped by emoji with a count when more than one person picked the same one — tapping any pill (not just your own gesture) toggles your own reaction on that emoji, a small extra that costs little and matches how Slack/Messenger both already work.

**Delivery**: real-time, same infrastructure as messages themselves — a reaction from the other side shows up on an already-open thread with no refresh needed, not just on next focus.

**New**: `supabase/message-reactions.sql` (`message_reactions` table, RLS, added to the realtime publication). **Changed**: `chat.ts` (`ChatMessage.reactions`, `reactToMessage()`, `removeReaction()`, `listMessages()` now fetches and attaches reactions in the same batch as attachment/audio signed URLs, `subscribeToConversation()` now also listens for reaction changes), `chat-thread.tsx` (double-tap detection, reaction pills, a second `<EmojiPicker>` instance reused for reacting rather than composing).

**Verified here** two different ways. First, for real: applied `message-reactions.sql` against a real Postgres instance — a real participant (either side) can react, someone who isn't a participant in that conversation is rejected outright, every participant can see everyone's reactions (not just their own), reacting again with a different emoji correctly replaces the same person's row rather than adding a second one, and a person can remove their own reaction but not someone else's. Second, the app side: a generic in-memory fake of `supabase.from()`, driven through the real Chat screens on both sides of the same conversation — confirmed a single tap does nothing, a double-tap opens the picker, picking ❤️ shows the pill immediately and the other party sees it too without any special handling; a second person's 👍 makes both pills show with correct grouping; tapping that person's own 👍 pill again removes just that reaction, leaving the other person's ❤️ untouched, confirmed identically from both accounts; and a reaction simulated as arriving from another device (no navigation, no refocus) rendered live via the realtime subscription.

**How you verify this yourself:** run `supabase/message-reactions.sql` in the Supabase SQL Editor (after `form-check.sql`). Open a chat thread on either side, double-tap any message, and pick an emoji — confirm it shows as a pill under the message. Open the same conversation from the other account and confirm the reaction is there too. React to the same message from that side with a different emoji and confirm both pills show, each with the right person's reaction; tap your own pill again and confirm it's removed while the other person's stays.

## Nutrition: edit a logged food's quantity

**What/why**: until now, getting a logged food's amount wrong meant delete-and-re-add — there was no update policy on `food_logs` at all, only select/insert/delete. A client can now tap **Edit** on any entry and change how many grams they actually had; calories/protein/carbs/fat rescale automatically rather than needing to be re-entered.

**How the rescaling works**: every number on a `food_logs` row was already a snapshot — "per-gram rate × the quantity logged" — captured once at the moment it was saved (see `food-log-quantity.sql`/`food-log-macros.sql`), never a live reference back to USDA/Open Food Facts. So editing the quantity scales the *current* stored numbers by the new/old ratio (`newCalories = calories × (newQuantity / oldQuantity)`, same for protein/carbs/fat) — mathematically identical to what logging fresh at the new quantity would have saved, without ever touching the original source data.

**Locked down to just the quantity** — changing which food, which meal, or which day an entry belongs to still isn't a supported action (that stays delete-and-re-add, unchanged). The new database policy only grants column-level update access to `quantity_grams`/`calories`/`protein`/`carbs`/`fat`, the same column-lockdown shape `chat.sql` already uses for message edits — a client genuinely cannot use this to rewrite the food's name or move it to a different day, even with a hand-built request.

**New**: `updateFoodLogQuantity()` in `food-logs.ts`; an Edit Quantity modal in `client/nutrition.tsx`, mirroring the existing Save-as-meal modal's shape, pre-filled with the current amount, `decimal-pad` keyboard (so "73.1"-style amounts work, same fix an earlier chunk made for Progress's metrics inputs). **Changed**: `nutrition.tsx` gains an "Edit" action next to each entry's existing "Delete".

**Verified here** two different ways. First, for real: applied `food-log-edit-quantity.sql` against a real Postgres instance (deliberately without a pre-existing blanket update grant, so the test actually proves the new migration's own grant is what's doing the work) — confirmed a client can edit their own entry's quantity and macros, a client's attempt to change `food_name` or `meal` is rejected outright at the column-privilege level (not just hidden by the UI), a different client can't touch someone else's entry, and the coach — who only ever had select access to food logs — can't edit one either. Second, the app side: a generic in-memory fake of `supabase.from()`, rendered through the real Nutrition screen — edited a 100g/165cal chicken breast entry to 200g, confirmed it now reads exactly 330 cal/62g protein/7.2g fat (correctly proportional, carbs staying at 0), confirmed the day's calorie ring updated to match, and confirmed the row persisted with those exact rescaled numbers; separately confirmed Save stays disabled for a zero or empty quantity and re-enables the moment a valid one is entered, and that Cancel discards the change entirely.

**How you verify this yourself:** run `supabase/food-log-edit-quantity.sql` in the Supabase SQL Editor (after `message-reactions.sql`, per its own header comment). Log a food, then tap **Edit** on it and change the quantity — confirm the calories and macros shown update proportionally and the day's ring reflects the new total. Try an empty or zero quantity and confirm Save stays disabled; tap Cancel after changing the number and confirm the entry is untouched.

## Custom exercises in the Exercise Library

**What/why**: `exercise_library` has been seed-only since it was first created — 872 exercises imported once from the exercemus/exercises dataset, with no insert/update/delete policy at all (see `exercise-library.sql`'s own header comment: "No app code ever writes to this table"). That meant a coach could only ever build a workout out of those 872, never something specific to their own coaching (a signature superset, a cue-based variation, a piece of equipment-specific movement the seeded set doesn't cover). The coach can now add their own exercises straight from the Exercise Library screen, with the exact same fields every seeded exercise has — category, muscle group, primary/secondary muscles, equipment, instructions, description — plus a YouTube video link. Once added, it's immediately usable when building a workout exactly like any of the 872 seeded ones, and from there flows into a programme week for a client to see, through the exact same `createWorkout()`/`assignProgrammeToClient()` plumbing every other workout already uses — no changes were needed anywhere in that chain, since the workout builder's exercise search (`workout-form.tsx`) already runs against this same table with no distinction between a seeded row and a coach's own.

**Locked to the coach's own additions**: two new columns, `is_custom` and `created_by`, mark which rows are the coach's own. New RLS policies let the coach insert, edit, or delete only rows where `is_custom = true and created_by = auth.uid()` — the 872 seeded reference rows stay permanently read-only, exactly as they always have been; there's no way, even with a hand-built request, to edit "Bench Press" itself or to sneak a new row in disguised as seeded data (the insert policy's `with check` forces `is_custom = true` and the real coach id on every row a coach adds). Deleting a custom exercise that's currently used in any workout is refused with a clear explanation instead of silently orphaning that workout's exercise link — the same "don't silently lose data" rule `updateWorkout()` already applies to a removed exercise with logged sets, and the exact gap a past chunk had to backfill for the Volume Analyser when `exercise_library` links went missing.

**New**: `createCustomExercise()` / `updateCustomExercise()` / `deleteCustomExercise()` in `exercise-library.ts`; a shared `CustomExerciseForm` component (chip pickers for category/muscle group/equipment, plain text inputs for muscle lists/description/instructions/the video link) behind two new screens, `/exercise-library/new` and `/exercise-library/edit/[id]`, mirroring the create/edit split `WorkoutForm` already established. **Changed**: the Exercise Library screen gains a "+ Add Custom Exercise" button, a "Custom" badge on the coach's own additions, Edit/Delete actions in a custom exercise's expanded detail (never shown for a seeded one), and — since the `video_url` field already existed on every seeded exercise but was never actually rendered anywhere — a "▶ Watch video" link that now shows for any exercise (seeded or custom) that has one.

**Verified here** two different ways. First, for real: applied `custom-exercises.sql` against a real Postgres instance — confirmed a coach can add a properly-marked custom exercise, an insert that tries to fake `is_custom = false` or `created_by` as someone else is rejected outright by the policy (not just hidden by the UI), a coach can edit or delete their own custom row, an attempt to edit or delete the seeded "Bench Press" row affects zero rows and it survives untouched, an attempt to flip a custom row's own `is_custom` back to false mid-edit is rejected, and a client account can't insert, edit, or delete anything in this table at all. Second, the app side: a generic in-memory fake of `supabase.from()`, rendered through the real Exercise Library screen — added a custom exercise with a category/muscle group/equipment/video link, confirmed it appears with the "Custom" badge and a working video link, edited its name and confirmed the change persisted, confirmed deleting an exercise that's in use on a workout is blocked with a clear message, confirmed deleting one that isn't in use succeeds and it disappears from the underlying data entirely (the same data the workout builder's own search reads), and confirmed adding a custom exercise with a name that collides with a seeded one surfaces a friendly "already exists" message instead of a raw database error.

**How you verify this yourself:** run `supabase/custom-exercises.sql` in the Supabase SQL Editor (after `food-log-edit-quantity.sql`, per its own header comment). On the coach side, open the Exercise Library, tap **+ Add Custom Exercise**, fill in a name/category/muscle group/equipment/a YouTube link, and save — confirm it appears in the list with a "Custom" badge. Expand it and confirm the video link opens, then tap **Edit**, change something, and confirm it's saved; tap **Delete** and confirm it's gone. Then go build a workout (**My Workouts → + New**) and search for that same exercise by name — confirm it's selectable exactly like any of the seeded ones, and that assigning that workout into a programme shows it to the client normally.

## Project structure reference

```
src/
  app/
    index.tsx          # routes to /login, coach /home, a pending onboarding step (/welcome, /parq, /health-advisory), or client /client — see getOnboardingStatus() in onboarding.ts
    e/
      [token].tsx        # the public External Builder fill-out screen — outside every login-guarded group entirely, never touches useAuth(), resolves purely off the token in the URL (see external-forms.sql)
    (auth)/
      login.tsx          # sign-up link points at /welcome, not a standalone signup screen
    (onboarding)/
      _layout.tsx        # no blanket redirect — each screen below self-guards, since this group serves both pre-session (welcome/signup) and mid-session (parq/health-advisory) visitors
      welcome.tsx        # step 1 — static intro; an already-signed-in visitor who lands here gets sent to wherever getOnboardingStatus() says they actually are, not shown the intro again
      signup.tsx         # step 2 — name/email/password only, no role choice; every signup becomes a client; continues straight to /parq (or shows "check your email" if email confirmation is required)
      parq.tsx           # step 3 — the real PAR-Q template from external-forms.sql, answered by an authenticated client and written to onboarding_parq_responses; routes to /health-advisory or /client based on getOnboardingStatus() right after submitting
      health-advisory.tsx  # step 4, conditional — only reached when a PARQ answer flagged the account; a checkbox + optional clearance note, both converging on the same acknowledged-at timestamp; not a dead end, just held
    (app)/
      home.tsx          # coach's home screen — a real dashboard (stat tiles, Needs Attention, a merged real Recent Activity preview with a "View all →" into activity.tsx) plus Manage/Coaching Hub nav grids covering every coach screen (including "Challenges", "Resource Library", and "Form Check" cards); a gear icon opens /settings (Sign out lives there now, not here); redirects clients to /client
      settings.tsx      # shared coach/client Settings screen — Hero card (initials avatar, email, real tier or "Coach") + Profile settings card (name/email/phone, one Save; email changes go through Supabase Auth's real confirm-by-link flow, never an instant profiles.email overwrite) + Notification toggles card (4 switches, save-on-flip, preference storage only — no delivery built yet) + Wearable card (real getWearableConnections() read — shows "Not connected"/"Never" until a native HealthKit/Health Connect integration exists to actually write a connection, Force Sync stays disabled) + a Sign out card + an App Version card (Constants.expoConfig?.version, straight off app.json — the true last thing on the screen now)
      activity.tsx      # coach-only "Client Activity" — the full, real-time, cross-client feed (meals/habits/completed workouts, each with that client's live Momentum + Compliance Score); see getClientActivityFeed()/subscribeToClientActivity() in coach-dashboard.ts
      messages/
        index.tsx        # coach-only inbox — every client, most-recently-messaged first, with a last-message preview and an online dot; header carries a megaphone icon (Send Bulk Message) and a calendar icon (Scheduled Messages)
        [clientId].tsx     # coach's per-client thread — same <ChatThread> the client's own Chat tab uses
        bulk-send.tsx      # pick clients (checkboxes + Select All) + a message (+ optional single photo/document) + Send Now or Schedule (date/time text fields, not a native picker — keeps this screen testable in a browser too) with an optional Daily/Weekly/Monthly repeat; see bulk-messages.ts
        scheduled.tsx      # every active scheduled/recurring series — countdown, cadence + times sent, message preview, recipient count, exact scheduled time, Cancel Series (confirm-gated, stops future sends without touching what's already gone out)
      community/
        index.tsx        # Posts/Leaderboards sub-tabs; Posts = shared feed + coach-only app-wide on/off switch + Moderation link + Report/Delete actions per post; a client whose per-client Community toggle is off sees the shared FeatureLockedCard instead (a separate gate from the app-wide switch); a client viewing the Posts sub-tab marks Community "viewed" (clears the Community tab's badge), Leaderboards does not; "Back to home" only renders for the coach now — a client reaches this screen as their own persistent tab (client/community.tsx re-exports this same file), where Home is one tap away same as every other tab
        new.tsx           # compose a post — tag picker excludes Announcement entirely for a client account; shows a plain message instead of the form if this client is blocked
        moderation.tsx      # coach-only (inline role check, no folder _layout.tsx): open reports with Dismiss/Delete post/Block author, plus a Blocked clients list with Unblock
      challenges/
        index.tsx        # shared by both audiences: coach sees every challenge they've created with a participant count and a "+ New" link; a client sees active/upcoming challenges they're eligible for with a genuine Join/Leave button; every card is now pressable through to [id].tsx's live leaderboard; a "‹ Back" link (coach → /home, client → /client) sits at the top, which this screen was missing entirely until the Phase B chunk
        new.tsx           # coach-only create screen — name, Volume/Consistency pill toggle, start/end dates (typed YYYY-MM-DD, same reason bulk-send.tsx does this), All Clients/Specific Clients toggle reusing bulk-send.tsx's own checkbox + Select All client picker
        [id].tsx          # one challenge's detail + live leaderboard, shared by both audiences — real progress (get_challenge_leaderboard(), see challenge-progress.ts) ranked same row style Community's Leaderboard already uses, realtime-subscribed so standings reorder live as sets get logged; "Live Standings" while active, "🏆 Final Standings" with a trophy on the winner once end_date has passed, Join/Leave disabling itself accordingly
      resources/
        index.tsx        # shared by both audiences: coach sees every item they've made, grouped by folder, with Delete and an All/Specific audience badge; a client sees the same folder-grouped layout filtered to what resource_items' own RLS actually hands back — no Delete, no badges
        new.tsx           # coach-only create screen — Link or Upload File, a name, a folder (existing chips or "+ New Folder" inline), and the same All Clients/Specific Clients picker challenges/new.tsx already established; file uploads reuse chat.ts's base64-then-decode()-then-upload approach
      form-check/
        index.tsx        # coach-only — every client's Form Check submission, pending ones first (oldest first, a real queue), then already-reviewed ones; each row shows client name, exercise, and status
        [id].tsx          # coach-only review screen — the client's video (VideoPlayback) + their note, then a feedback form (required text, optional follow-up video) that marks it Reviewed on send; already-reviewed becomes a read-only view of what was sent, no re-editing
      workouts/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of the coach's workouts, with Edit and Archive (soft-delete — see archive-content.sql)
        new.tsx          # thin wrapper around <WorkoutForm> for a blank workout; also reused for programme-week sessions
        [id].tsx          # thin wrapper around the exact same <WorkoutForm>, preloaded from getWorkoutDetail() for editing
      programmes/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # Template Library — list of the coach's programmes, with Duplicate and Archive
        new.tsx          # create-programme form — name, goal type, duration, cover image, training days
        [id].tsx          # one programme — cover image, tap-to-rename, weeks list, + Add week; Calorie target editor + embedded SessionCalendar for assigned (client) instances
        assign/[id].tsx     # pick a client + start date, assign a template to them — redirects straight to the new assigned programme, not the unrelated Assignments list
        week/[weekId].tsx  # one week of a programme — its sessions, + New session
      recipes/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # Recipe Builder library — list of the coach's recipes, calories/serving preview, tags, Delete
        new.tsx           # create-recipe form — name, prep/cook time, servings, tags, instructions; redirects to the recipe so ingredients (and a photo) can be added
        [id].tsx          # one recipe — cover photo upload, calculated per-serving + whole-recipe macro card, ingredient list with + Add (same USDA search as food logging) and Remove, instructions, Delete recipe
        edit/[id].tsx      # edit a recipe's name/prep/cook/servings/tags/instructions — ingredients are added/removed from the detail screen instead
      meal-plans/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # Meal Plan Templates library — computed baseline kcal, actual vs target macro split, item count, Assign, Delete
        new.tsx           # create-template form — name, goal tag (shares Programme Builder's GOAL_TYPES), target protein/carb/fat % (must total 100)
        [id].tsx          # one template — computed baseline totals + actual-vs-target split, breakfast/lunch/dinner/snacks slots each with + Add recipe (search over the coach's own Recipe Builder library) and Remove, Assign to a client, Delete
        edit/[id].tsx      # edit a template's name/goal/target split — recipes are added/removed from the detail screen instead
        assign/[id].tsx     # pick a client, assign — redirects straight to that assignment's scaled view
        assigned/[assignmentId].tsx  # the portion-scaled result for one client: their real calorie target, the scale factor, and every recipe's ingredients scaled to match -- recalculated live on every load, never a frozen copy
      exercise-library/
        _layout.tsx      # coach-only guard for now
        index.tsx        # search + muscle-group filter over the imported exercise_library table; expanding a result shows a horizontal image gallery when the exercise has one, a "▶ Watch video" link when it has a video_url, and — for a coach's own custom exercises only — a "Custom" badge plus Edit/Delete actions; a "+ Add Custom Exercise" button opens new.tsx
        new.tsx          # add a brand-new exercise to the library (CustomExerciseForm, blank)
        edit/[id].tsx     # the same form, preloaded from an existing custom exercise — unreachable (and rejected server-side) for a seeded one
      assignments/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of assignments, with status
        new.tsx          # pick workout + client + date, save
        [id].tsx          # coach's view of one assignment — prescribed vs. actual, one row per logged SET, plus the client's own overall session RPE once completed
      habits/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of habits the coach has created, with Archive
        new.tsx          # pick client + habit name, save
      clients/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of every client account, each row showing a color-coded Compliance Score % badge, a Tier: Base/Accelerator/Precision picker (coach-set, gates that client's Leaderboards access), a "Paused" badge when relevant, and a Pause/Reactivate action
        [id].tsx          # one client's detail page — Programme section (Unassign) + Assigned Workouts section (one-off workouts, Unassign) + Check-in Schedule section (recurring assignments with Cancel, individual check-in instances with Remove — a completed one is also tappable through to /checkins/[id] for its full Q&A) + Nutrition section (target + 14-day food log history, delete) + a Feature Access section + a Danger Zone linking to permanent deletion
        [id]/
          delete.tsx        # the one irreversible action in the app — spells out exactly what's deleted vs. anonymized, requires typing the client's exact full name to enable the delete button, calls deleteClient()
          features.tsx        # per-client feature toggles — all 9 feature_key rows with an On/Off control each, plus 3 one-tap presets (Base/Accelerator/Precision defaults) that bulk-set all 9 at once; see feature-toggles.ts
      forms/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of the coach's check-in form templates, with Assign and Set as readiness (✓ badge on whichever one is currently the active pre-workout questionnaire)
        new.tsx          # form builder — name + ordered question list, each with a type (short text/number/single select/multi select/scale/measurement) and type-driven config
        [id].tsx          # read-only view of one saved form — every question's type and config, rendered generically off question-types.ts, not per-type
        assign/[id].tsx     # pick a client + day of week + due-window hours, live "Next 5 check-ins" preview, confirm — creates one form_assignments row (a rule, not per-occurrence rows)
      external-forms/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of the coach's external (one-off, shareable, no-login) forms
        new.tsx          # near-identical builder to forms/new.tsx, saving to external_forms/external_form_questions instead — same question-type system, deliberately not shared as one component with the check-in builder since the two save to genuinely different tables with different downstream behavior
        [id].tsx          # one form's shareable link (copy button) + its questions (read-only) + every submission received, grouped one card per visitor, + a Danger Zone to delete the form/link/all its submissions
      assigned/
        [id].tsx          # client's live session screen — "{Weekday} - {Workout}" title + a live summary bar (duration/volume/sets, see the redesign chunk below) + a Heart Rate row (real getLatestHeartRateSample() read, polled every 30s while the session is open, refuses to show anything older than 10 minutes so a stale reading never displays as if it were current), readiness gate first if unanswered, then per-SET rows (big weight/reps boxes + a circular check, prefilled: previous session > coach baseline > empty with a hint, always editable) each showing a real "Last: Xkg x Y" + volume delta and live Weight PR/Vol PR badges (session-scorecard.ts), tagged sets show their technique label + instructions, checking a set auto-starts an editable rest timer, a trash icon removes an exercise for today only (exercise-removals.ts, confirm-gated) and a Swap link opens same-muscle-group alternatives (session-only, exercise-swaps.ts), + Add Set logs a set beyond what the programme prescribed, an overall session-RPE selector near the bottom, Mark Workout Complete saves it and navigates to the completion scorecard — every set is cached to on-device storage the instant it's checked and synced to Supabase in the background (see set-logging.ts), with a 10-minute full-screen snapshot (session-snapshot.ts, also covers any added extra sets) as a second safety net underneath that, so nothing is lost to a dropped connection or an app crash mid-set; reopening an already-completed session later (Training/Calendar) shows this same screen read-only, not the scorecard again
        complete/
          [id].tsx          # the post-completion scorecard — PBs (this session's heaviest per exercise beating every previous session's, swap-aware), total weight lifted, an approximate duration, and the session RPE, all computed fresh on every open, never stored
      checkins/
        [id].tsx          # shared by both audiences: client's check-in fill-out screen (<AnswerInput> per question while pending) and the coach's read-only detail view once completed — a coach sees a client-name header the client's own view doesn't need, plus a "✓ Also saved to ..." note on any measurement question tagged to sync into weight_logs/body_measurements
      client/
        _layout.tsx      # client-only guard + the 6-tab bar (Home/Training/Nutrition/Progress/Community/Chat), each with an @expo/vector-icons Ionicon (filled when active, outline otherwise) — calendar.tsx, saved-meals.tsx, and exercise-progress/[id].tsx all stay registered via href: null, hidden from the tab bar but still routable (saved-meals.tsx was missing this until now — see the dated section below for what that actually looked like); also re-checks getOnboardingStatus() and redirects into onboarding if incomplete (belt-and-suspenders against a stale bookmark or deep link), and, when it finds onboarding complete, calls ensureClientProvisioned() as a safety net (a no-op once already provisioned) — a failed onboarding-status check shows a plain visible error instead of a permanently blank screen; also owns the Chat tab's and the Community tab's unread-count badges (tabBarBadge), each live via its own realtime subscription, for as long as the client is anywhere in the tab bar, not just while that tab is open — Community's badge additionally re-checks on every navigation change (usePathname()), since viewing it moves a plain profiles cursor forward rather than something realtime-subscribed
        index.tsx        # Home tab — greeting + a gear icon opening /settings (Sign out lives there now, not here) + daily logging nudge + Up Next (merges pending workouts + due check-ins) + a 2x2 ring grid (Readiness [real, see training-readiness.ts] / Momentum [greyed if the coach has toggled it off] / Steps [real getDailyMetricsForDate() read, muted placeholder until a wearable actually syncs] / Calories Today) + streak/Level/XP cards + weekly TDEE recalculation check + Today's Habits checklist + a "Challenges" card into /challenges + a "Resource Library" card into /resources (where Community's old card used to sit — Community is its own tab now, see _layout.tsx)
        training.tsx      # Training tab — Volume Analyser card (this week's per-muscle-group set counts, see muscle-group-analysis.ts) directly under the hero stat, then a Form Check card (real record/upload entry point into form-check.tsx, or the locked upsell card if the coach has toggled it off) + Your Programme card (week counter, day row, next workout) + full assignment history + "View Calendar →" link
        nutrition.tsx      # Nutrition tab — header (fork icon + title, same 48px size every other tab's title uses, + Saved Meals link + quick-add search icon) → ‹›date navigator → one glowing summary card (calorie ring + Protein/Carbs/Fat target bars, see macros.ts), 4 meal sections each with "Save as meal" (bundles its currently-logged entries into a new saved_meals template, see saved-meals.ts) alongside "+ Add", blended USDA + UK-supermarket search (food-search.ts) + camera barcode scan + "Use a saved meal" (logs every item in a template at once) inside the add-food modal, quantity as grams / a real structured portion chip / a manual custom item; each logged entry also has an "Edit" action next to "Delete" — a modal to change just the quantity, rescaling calories/macros proportionally (updateFoodLogQuantity(), see food-logs.ts)
        saved-meals.tsx    # Saved Meals screen — every saved template with item count/total kcal/item names, a "Log to {slot}" quick action per meal slot (logs to today), delete (confirm-gated); reached from Nutrition's header link, not a tab — and, since this chunk, actually hidden from the tab bar too (see _layout.tsx)
        form-check.tsx     # reached from Training's Form Check card, not a tab (href: null, see _layout.tsx) — name the exercise + optional note, Record or Choose from Library (expo-image-picker, video mode), submit; lists past submissions with Pending/Reviewed status, expanding a Reviewed one shows the coach's feedback text and optional follow-up video; the standard locked upsell card if the coach has toggled Form Check off
        progress.tsx       # Progress tab shell — Metrics/Measure/Exercise/Photos sub-tab switcher (Metrics first, and the default tab); Compliance was removed from here, but getComplianceScore() itself still runs — it feeds the coach's Clients list badge (see clients/index.tsx / coach-dashboard.ts)
        exercise-progress/
          [id].tsx          # one exercise's full logged history — progression graph (volume per session, see exercise-volume-chart.tsx), a trend arrow + label, best weight/best session volume/sessions logged/last performed stat tiles, and a full session-by-session list; reached from Progress's Exercise sub-tab, not a tab itself (href: null, see _layout.tsx)
        community.tsx      # the Community tab — a thin `export { default } from '../community/index'` re-export, since Expo Router's Tabs navigator only recognizes a file living directly in this folder as a real tab; the coach still reaches the exact same screen by pushing '/community' from a NavCard, unchanged
        chat.tsx             # Chat tab — real messaging now: resolves/creates this client's conversation with "the coach", then renders <ChatThread>; the shared FeatureLockedCard instead if the coach has toggled Chat off for this client
        calendar.tsx        # Not a tab anymore, still a real route — thin wrapper: title + chrome around <SessionCalendar clientId={self} role="client" />, reached via Training's "View Calendar" link
  components/
    hero-stat.tsx        # glowing teal oversized-number card; optional progress bar (used where one number should dominate the screen)
    stat-tile.tsx        # <StatTile value label subtitle? color? muted? onPress?> — the compact stat card for side-by-side rows (coach dashboard's 4-across); muted renders a dashed-border, textSecondary "not connected yet" placeholder instead of a real value
    calorie-ring.tsx      # <CalorieRing current target?> — Nutrition tab's hero ring (today's logged calories, "/ target" and "KCAL" centered inside); target null renders a dashed, un-filled "not tracked yet" ring instead of a fabricated goal
    macro-bar.tsx          # <MacroBar label current target> — Nutrition tab's Protein/Carbs/Fat rows: dot + label + "current/targetg", a thin fill bar, and a "Xg LEFT"/"+Xg OVER" caption; teal on track, oxblood (the app's existing warning color) once over
    weight-trend-chart.tsx  # SVG line chart — actual weight (teal) + smoothed trend (red), used by MetricsPanel
    measurement-chart.tsx    # SVG single-line chart — raw body measurement values (no smoothing), used by MeasurePanel
    exercise-volume-chart.tsx  # SVG single-line chart — total volume (weight x reps) per session for one exercise, oldest to newest, spaced by actual elapsed time same as weight-trend-chart.tsx; used by exercise-progress/[id].tsx
    video-playback.tsx           # <VideoPlayback uri> — a signed-URL video with native playback controls (expo-video's useVideoPlayer/VideoView); used by both audiences' Form Check screens for the client's submitted video and the coach's optional follow-up
    exercise-progress-panel.tsx  # Progress → Exercise sub-tab content — every exercise this client has ever logged, alphabetically, each card showing a trend arrow (tealBright up / textSecondary steady / oxblood down, same 3-way scale complianceColor() already uses), session count, last performed, and best weight; taps through to exercise-progress/[id].tsx
    photo-compare-slider.tsx  # generic, reusable before/after image slider — drag to reveal, pinch either photo to resize it
    photos-panel.tsx            # Progress → Photos sub-tab content (front/side/back upload, gallery) — tap any two photos in the gallery to swipe-compare them right there (photo-compare-slider.tsx); one comparison mechanism, not a second duplicate before/after picker underneath
    session-calendar.tsx          # <SessionCalendar clientId role> — the real Week/Month calendar, shared by client/calendar.tsx and Programme Builder; also renders due/completed check-ins (own status marker, tappable only for role="client")
    time-range-toggle.tsx     # shared 1W/1M/6M/1Y/All Time chip row, used by both MetricsPanel and MeasurePanel
    metrics-panel.tsx          # Progress → Metrics sub-tab content (weight/body fat %/muscle % check-in, TDEE, trend chart + history) — all three number inputs are keyboardType="decimal-pad" now, not "numeric" (which has no "." key on iOS, so a value like 73.1 was never actually enterable)
    measure-panel.tsx           # Progress → Measure sub-tab content (waist/chest/arms/thighs/hips/neck logging, per-type graph + history)
    brand-logo.tsx        # fixed top-left logo overlay, mounted once in the root layout
    confirm-dialog.tsx      # <ConfirmDialog> — real Modal (not Alert.alert, a no-op on web), shared "Are you sure?" prompt — archive actions, Community's Delete/Block
    report-post-modal.tsx    # <ReportPostModal> — same Modal shape as ConfirmDialog plus a free-text optional reason field, kept separate since ConfirmDialog's callers all expect its fixed message-only shape
    leaderboard-panel.tsx     # Community → Leaderboards sub-tab content — This week/Lifetime toggle, ranked rows with a placeholder initials avatar, self-highlight; shows the shared FeatureLockedCard instead when the viewing client's tier doesn't qualify OR their coach has toggled Leaderboard off (independent gates, both funnel into the same locked card with a gate-appropriate message)
    feature-locked-card.tsx    # <FeatureLockedCard title message> — the shared "🔒 [Feature]" greyed card every per-client-toggle-gated screen renders when its feature is off
    chat-thread.tsx             # <ChatThread> — the whole conversation view (messages, composer, voice recording, emoji picker, photo/document attachments, edit/delete actions, reactions, presence, Sent/Read status on your last message), shared identically by the client's Chat tab and the coach's per-client thread; composer is text box first, then emoji/attachment/mic-or-send stacked to its right; double-tap a message to react (a second EmojiPicker instance, reused); marks the conversation read once per screen-focus, deliberately not inside the same reload function its own realtime subscription calls (that would have the mark-read write retrigger itself forever)
    emoji-picker.tsx             # <EmojiPicker> — fixed curated grid, not a full emoji-keyboard library
    question-config-editor.tsx  # <ConfigFieldEditor> — one render branch per config-field kind (text/list/range/select), not per question type; used by both the form builder and its read-only detail view
    question-answer-input.tsx    # <AnswerInput> — one render branch per answer kind (short_text/numeric/single_choice/multi_choice/scale), same reasoning; used by the check-in fill-out screen
    nutri-score-badge.tsx         # <NutriScoreBadge grade size> — official Nutri-Score A-E colors, small (list/search rows) or large (recipe hero) size
    stat-ring.tsx                   # <StatRing value label progress? size?> — SVG ring gauge (teal arc + glow on a carbon-black track), used by the completion scorecard; a real 0-1 progress renders a genuine partial/empty arc, omitting it renders a full ring as a plain frame for an open-ended number
    workout-form.tsx               # <WorkoutForm workoutId? weekId?> — the coach's whole workout builder, shared by /workouts/new (blank, or a programme-week session) and /workouts/[id] (preloaded for editing); which mode it's in is just whether workoutId was passed
    custom-exercise-form.tsx        # <CustomExerciseForm exerciseId?> — add-or-edit form for a coach's own exercise_library row (same create/edit-split shape as WorkoutForm); chip pickers for category/muscle group/equipment, plain inputs for muscle lists/description/instructions/the YouTube link
    muscle-heatmap.tsx               # <MuscleHeatmap counts> — tap-to-flip real "Muscle Anatomy" reference artwork (assets/images/muscle-anatomy-front.png / -back.png, used as-is), with SVG fill paths traced directly off that same artwork's line art (one exact enclosed shape per muscle group, not hand-approximated) layered underneath it, colored by colorForCount() (zero = neutral, no tier color); soft teal ambient glow (Glow.teal) behind it; exports TIER_COLORS (bright teal -> deep teal -> oxblood, an on-brand intensity gradient) and colorForCount() so the analyser card's list/badge use the exact same colors
    workout-analyser-card.tsx        # <WorkoutAnalyserCard counts> — the Training tab's "Volume Analyser" card: title + status badge (worst tier wins) + <MuscleHeatmap> + exact per-muscle-group set count list
  constants/
    theme.ts             # single source of truth: Colors, Glow, Spacing, typography
  context/
    auth-context.tsx    # session + profile state, available anywhere via useAuth()
  lib/
    supabase.ts          # Supabase client, reads from .env
    workouts.ts           # createWorkout() (also saves per-exercise baseline weight/reps + any tagged sets) / getWorkoutDetail() (every exercise + baseline + tagged sets + exerciseLibraryId/muscleGroup, in order) / updateWorkout() (reconciles exercises by id in place -- refuses to remove one with logged history) / listWorkouts() / listWorkoutsForWeek() / archiveWorkout() database calls
    set-types.ts           # SET_TYPES / SET_TYPE_DESCRIPTIONS -- the four set-tagging options and their fixed, built-in technique explanations (Drop Set/Rest-Pause/FST-7; Normal has none)
    programmes.ts          # createProgramme() / listProgrammes() / getProgrammeDetail() / addProgrammeWeek() / duplicateProgramme() / assignProgrammeToClient() / getClientProgramme() (excludes an archived/unassigned instance) / updateProgrammeName() / archiveProgramme() (a coach's own template) / unassignProgramme() (a client's assigned instance -- archives it and its own workouts) / getActiveGoalModifier() / setGoalModifierPercent() / listClientPhases() / getPhaseForDate()
    exercise-library.ts     # listExerciseLibrarySummaries() / getExerciseDetail() — the 872 seeded rows stay read-only, but createCustomExercise() / updateCustomExercise() / deleteCustomExercise() (refuses one currently used in a workout) now let a coach add their own on top, marked is_custom/created_by so only those (never a seeded row) can be edited or deleted
    assignments.ts         # coach + client assignment database calls; getAssignmentDetail() (prescribed exercises + tagged sets + sessionRpe, no per-set logged data — see set-logging.ts) / getSetPrefills() — the per-SET weight/reps fallback chain (that exact set number's previous session by exercise_library_id, then coach baseline, then nothing fabricated) / finishSession() (flips status AND saves the session-level RPE in one write — per-set logging already happened incrementally) / getCoachAssignmentDetail() (per-set loggedSets[] + sessionRpe) / listClientStandaloneAssignments() (one client's one-off workouts, excludes programme sessions) / unassignWorkout() (deletes a pending assignment outright -- refuses one with logged sets)
    clients.ts               # listClients() (every client regardless of status — every other coach screen still needs a paused client reachable) / getClient() / setClientStatus() (pause/reactivate — one column, fully reversible) — single-coach app so any coach sees any client
    food-logs.ts            # addFoodLog() / listFoodLogsForDate() / listFoodLogHistory() / deleteFoodLog() / updateFoodLogQuantity() (rescales calories/protein/carbs/fat by the new/old quantity ratio, column-locked at the database) — stores a quantity-scaled macro snapshot, not a live link; FoodLogEntry now also carries source/sourceId (previously write-only) so Saved Meals can copy an already-logged entry's provenance forward without re-fetching
    saved-meals.ts           # listSavedMeals() (meals + items, merged in JS) / saveMealFromEntries() (bundles already-logged FoodLogEntry rows into a new named template) / logSavedMeal() (re-logs every item in a template to one date/meal slot via addFoodLog(), no re-fetching) / deleteSavedMeal()
    open-food-facts.ts       # getProductByBarcode() — live barcode lookup, used by the scanner; searchUKFoods() — a real cgi/search.pl full-text search, filtered client-side for UK relevance (country tag or a major UK supermarket's brand name), blended into typed search (see food-search.ts) — /api/v2/search was tried first but doesn't support free-text search at all; searchFoods() (same endpoint) built but unused for typed search; portions on every result, from a real serving_quantity when Open Food Facts has one
    usda-fooddata.ts          # searchFoods() — live query against USDA FoodData Central, the primary/generic source for typed search; portions parsed from Survey (FNDDS) foodMeasures when present (real per-item gram weights, e.g. "1 small apple")
    food-search.ts             # searchAllFoods() — the one function the food-add UI calls; blends USDA + searchUKFoods(), keeps only genuinely well-matched UK results (isGoodMatch — every searched word must appear in the product's name/brand), ranks them ahead of USDA's generic results
    weight-logs.ts           # saveWeightLog() (upsert, computes weight_trend; body fat %/muscle % default to "leave unchanged" when omitted, vs. explicitly cleared when passed null) / listWeightLogs() / hasWeightLogForDate() database calls
    body-measurements.ts      # listBodyMeasurements() / saveBodyMeasurement() (upsert) / groupMeasurementsByType() — waist/chest/arms/thighs/hips/neck, no smoothing
    time-ranges.ts              # TIME_RANGES / filterByRange() — shared 1W/1M/6M/1Y/All Time filtering logic
    progress-photos.ts            # uploadProgressPhoto() / listProgressPhotos() — private Storage bucket + signed URLs
    tdee.ts                   # calculateAndSaveTdee() (gated) / checkAndRecalculateTdeeIfDue() (weekly, on app open) / getLatestTdeeEstimate() / getTdeeConfidence() / getCalorieTarget()
    macros.ts                  # getMacroTargets() — real protein/carb/fat gram targets from the client's own logged bodyweight (weight_trend) and calorie target: protein by g/kg (2.2 cutting / 2.0 recomp,strength,none / 1.8 bulking), fat fixed at 25% of target calories, carbs take the remainder; null if there's no weight logged yet
    habits.ts                 # coach + client habit + habit-log database calls, including archiveHabit()
    momentum.ts                # getMomentumScore() — pure calculation, no new tables; getCurrentWeekRange() exported so other "this week" features (the Leaderboard's weekly XP ranking) share the exact same Monday, not a second copy of the date math
    training-readiness.ts       # getTrainingReadiness() — pure calculation, no new tables; blends a recency-weighted average of the client's last 5 pre-workout readiness check-ins (scale-type questions only, "lower is better" ones like soreness/stress detected by keyword and inverted) with a training-load freshness figure (fewer completed workouts in the trailing 7 days = fresher); null (shown as a placeholder) only if the client has never once answered a readiness check-in
    wearables.ts                # Phase A read/write plumbing for Apple Health/Google Health — getWearableConnections() / getDailyMetricsForDate() / getLatestHeartRateSample() (refuses samples older than 10 minutes, treating stale exactly like "no wearable" rather than showing outdated data as live); recordWearableConnection() / recordWearableSynced() / saveDailyMetrics() / recordHeartRateSample() are the write side nothing calls yet — there's no native integration to call them until a real EAS/dev-client build exists
    chat.ts                      # getOrCreateConversation() / listMessages() (now also fetches + attaches each message's reactions) / sendTextMessage() / sendVoiceMessage() / sendImageMessage() / sendFileMessage() / editMessage() / deleteMessageForMe() / deleteMessageForEveryone() / reactToMessage() / removeReaction() / subscribeToConversation() (realtime — messages, conversation_reads, and now message_reactions) / updateLastSeen() / getLastSeen() / isOnline() / listCoachConversations() / getAnyCoach() / markConversationRead() / getReadReceipts() / getUnreadMessageCount() (the Chat tab badge's count, filtered the same way listMessages() is so the two never disagree)
    bulk-messages.ts             # createBulkMessageSeries() (uploads any attachment once under the series' own id, snapshots the recipient list, then either fires immediately — one real message per recipient, client-side — or leaves it active with a next_run_at for pg_cron to pick up) / listScheduledBulkMessageSeries() / cancelBulkMessageSeries() (sets active false, keeps history)
    compliance.ts                # getComplianceScore() — pure calculation, no new tables; averages check-in punctuality and macro adherence over a trailing 28-day window; complianceColor() — the shared red/neutral/teal scale, used by the Clients list and the coach dashboard alike
    coach-dashboard.ts            # getCoachDashboardStats() (active clients, avg Compliance Score, overdue check-ins, open community reports) / getClientsNeedingAttention() (sub-50% compliance, worst first) / getRecentClientActivity() (small dashboard preview: logged meals + completed workouts only) / getClientActivityFeed() (the full activity.tsx feed: meals + habits + completed workouts, each with that client's live Momentum/Compliance Score attached) / subscribeToClientActivity() (realtime: new food_logs, new habit_logs, assignments updated to completed)
    community.ts                   # listCommunityPosts() / createCommunityPost() / getCommunityEnabled() / setCommunityEnabled() / getCommunityHidden() / setCommunityHidden() / reportPost() / deletePost() / getOpenReports() / dismissReport() / blockClient() / unblockClient() / listBlockedClients() / isBlocked() — the Announcement-is-coach-only and blocked-can't-post rules live in RLS, not in this file; authorId/postAuthorId are string | null and render as "Deleted user" once a client is permanently deleted (see client-deletion.sql) / getCommunityLastViewedAt() / markCommunityViewed() / getNewCommunityPostCount() (excludes the viewer's own posts) / subscribeToCommunityPosts() (realtime, the Community badge's live update)
    leaderboard.ts                  # getWeeklyLeaderboard() / getLifetimeLeaderboard() (call SECURITY DEFINER SQL functions) / getMyTier() / setClientTier() / listClientTiers() / tierHasLeaderboardAccess() — CLIENT_TIERS mirrors the real Club/Accelerator/Precision Stripe products (Club shown in the app as "Base")
    recipes.ts                    # createRecipe() / listRecipes() / getRecipeDetail() / updateRecipeDetails() / deleteRecipe() / addRecipeIngredient() / removeRecipeIngredient() / uploadRecipePhoto() / computeMacroTotals() — the one place recipe macros are summed and divided by servings, pure and reused by both the list and detail screens
    nutri-score.ts                # computeNutriScore() — the public Nutri-Score formula from scratch (energy/sugar/sat-fat/sodium negative points, fruit-veg-nut%/fibre/protein positive points) / computeRecipeNutriScore() (sums ingredients, divides by servings, re-normalizes to per-100g before scoring) / estimateFruitVegLegumeNutPercentFromCategory() (category-based estimate, since neither data source has a real % for arbitrary foods)
    meal-plans.ts                  # computeMealPlanTotals() (baseline kcal + actual macro % from a template's recipes, never stored) / scaleMealPlan() (the portion-scaling engine -- pure, DB-independent) / createMealPlanTemplate() / listMealPlanTemplates() / getMealPlanTemplateDetail() / updateMealPlanTemplateDetails() / deleteMealPlanTemplate() / addMealPlanItem() / removeMealPlanItem() / assignMealPlanToClient() / listMealPlanAssignmentsForClient() / getScaledMealPlan() (loads an assignment and scales it live against the client's CURRENT calorie target)
    xp.ts                       # awardWorkoutXp() / awardMealXp() / awardHabitXp() / getXpSummary()
    question-types.ts            # QUESTION_TYPES — the extensible question-type registry (label, configFields, defaultConfig, validateConfig, toStoredConfig, plus answerKind/validateAnswer/toStoredAnswer per type); adding a type is an entry here, not a UI rebuild; the 'measurement' type's config.tracks (default 'none') is the "also save this as Weight/Waist/etc." hook form-check-ins.ts's submitCheckIn() reads at submission time
    form-templates.ts             # createFormTemplate() / listFormTemplates() / getFormTemplateDetail() database calls
    external-forms.ts               # createExternalForm() / listExternalForms() / getExternalFormDetail() / deleteExternalForm() / listExternalFormResponses() (coach-side, normal RLS) / getExternalFormByToken() / submitExternalFormResponse() (the public side — both call the two SECURITY DEFINER functions in external-forms.sql, never a direct table read/write)
    form-assignments.ts            # createFormAssignment() / listClientFormAssignments() / archiveFormAssignment() database calls + listUpcomingCheckInDates() — pure, computes future dates from a recurrence rule, nothing stored per-occurrence
    form-check-ins.ts              # ensureCheckInsUpToDate() (lazy materialize + archive-as-missed sweep, run on client app open) / listUpNextCheckIns() / listVisibleCheckIns() / getCheckInDetail() (now also returns the client's name/email, for the coach's read-only view) / submitCheckIn() (also syncs any config.tracks-tagged measurement answer into weight_logs/body_measurements, unit-converted, dated to the check-in's scheduled_date) / listClientCheckInInstances() / archiveOrDeleteCheckIn() database calls
    readiness.ts                    # getReadinessFormId() / setReadinessFormId() (app_settings.readiness_form_id, the one active questionnaire) / getReadinessStatusForAssignment() (the active form's questions + whatever THIS session has answered so far) / submitReadinessResponses() -- deliberately not built on form_assignments/form_check_ins, see readiness.sql
    exercise-swaps.ts                # listExerciseSwapsForAssignment() / swapExerciseForSession() / undoExerciseSwap() -- session-only substitutions in assignment_exercise_swaps; never touches workout_exercises or the underlying programme
    exercise-removals.ts              # listExerciseRemovalsForAssignment() / removeExerciseForSession() / undoExerciseRemoval() -- session-only removals in assignment_exercise_removals, identical "never touches workout_exercises or the programme" shape as exercise-swaps.ts
    set-logging.ts                    # saveSetLog() / deleteSetLog() — write to AsyncStorage first (the only thing the caller awaits), then best-effort push to Supabase, silently queuing on failure; flushPendingSetLogs() retries anything still queued (idempotent upsert, safe to retry); getMergedSetLogs() — server-confirmed logs overridden by anything still unsynced locally; getSetLogTimeRange() — first/last logged-set timestamp this session, the live summary bar's duration anchor
    session-snapshot.ts                # saveSessionSnapshot() / loadSessionSnapshot() / clearSessionSnapshot() — a 10-minute-interval safety net ON TOP of set-logging.ts: snapshots every set's typed values (checked or not), the session RPE, and any + Add Set counts to AsyncStorage, restoring only into still-UNCHECKED sets on reopen; never overrides anything the per-set system already has
    session-scorecard.ts                # getSessionScorecard() — PBs (per-exercise heaviest this session vs. every prior session, swap-aware, matched by exercise_library_id same as getSetPrefills), total weight lifted (sum of weight x reps), and an approximate duration (first logged set's timestamp to the last); getExercisePersonalBests() — the same all-time-best definition, fetched once per exercise so the live session screen can flag a Weight PR/Vol PR the instant a set is checked, not just after finishing
    exercise-progress.ts                 # listExercisesWithHistory() (Progress → Exercise sub-tab's card list, alphabetical) / getExerciseVolumeHistory() (one exercise's full session-by-session volume, for the progression graph) — both resolve swaps the same way getSessionScorecard() does (a swapped exercise's sets count under the replacement, not the original), just across a client's ENTIRE history rather than one assignment; trend ("up"/"maintaining"/"down") compares the average of the most recent sessions (up to 3) against everything before them, ±5% deadband
    muscle-group-analysis.ts            # getWeeklyMuscleGroupSetCounts() — this week's logged sets grouped by muscle group, swap-aware, using getCurrentWeekRange(); tierForSetCount() (green/yellow/red at 10/20) and overallVolumeStatus() (worst tier wins, not an average)
    streak.ts                    # getCurrentStreak() — pure calculation, no new tables
    feature-toggles.ts             # getClientFeatureToggles() (all 9 feature_key rows + this client's real on/off state) / setClientFeatureToggle() (coach-only) / isFeatureEnabled() — the one function every gated screen calls; no row for a feature means enabled / listPresets() / applyPresetToClient() — a one-time bulk write of all 9, not an ongoing link, so every toggle stays individually adjustable right after
    client-deletion.ts             # deleteClient() — calls the delete-client Edge Function, surfaces its real {error} message instead of supabase-js's generic "non-2xx status" text
    settings.ts                  # updateProfileDetails() (name + phone, immediate) / requestEmailChange() (goes through supabase.auth.updateUser() — a real confirm-by-link account change, never an instant profiles.email overwrite) / setNotificationPreference() (one of the 4 notification-preference columns, save-on-flip — preference storage only, no delivery reads these yet)
    onboarding.ts                # getOnboardingStatus() (derived, not tracked -- needs_parq/needs_health_review/complete off real data every time) / getParqForm() / submitOnboardingParq() (upserts, so a retried submission re-fires the flagging trigger safely) / acknowledgeHealthAdvisory() / ensureClientProvisioned() (calls complete_client_onboarding() -- auto-places a client on the Base Plan tier + toggle defaults the instant onboarding is genuinely done, a one-time no-coach-involvement action safe to call repeatedly)
    challenges.ts                # createChallenge() (the challenge row, then — only when not open to all — a challenge_eligible_clients snapshot of the picked client ids) / listCoachChallenges() (every challenge this coach made, with a real participant count) / listClientChallenges() (active/upcoming challenges this client is eligible for — RLS does the actual eligibility filtering, this just also excludes anything already ended, then merges in this client's own join state) / joinChallenge() / leaveChallenge() / getChallengeDetail() / getMyChallengeParticipation()
    challenge-progress.ts        # getChallengeLeaderboard() (reads get_challenge_leaderboard(), the SECURITY DEFINER function that actually computes Volume-sum/Consistency-count progress per participant) / isChallengeLocked() (purely a UI cue — endDate < today — since the scoring function's own date-range filter is what actually stops progress counting) / formatChallengeProgress() / subscribeToChallengeProgress() (realtime on workout_logs + challenge_participants, same unique-channel-per-call shape subscribeToConversation() in chat.ts uses)
    resources.ts                 # listResourceFolders() / createResourceFolder() / listCoachResourceLibrary() (every own item, any audience) / listClientResourceLibrary() (RLS-filtered to eligible-only, no coach id needed — same single-coach reasoning as listClientChallenges()) / createResourceLink() / uploadResourceFile() (base64-then-decode()-then-upload, same as chat.ts's attachments) / deleteResourceItem() (removes the storage file too, when there is one)
    form-check.ts                # submitFormCheck() / listMyFormCheckSubmissions() / listCoachFormCheckSubmissions() (pending-first queue) / getCoachFormCheckSubmission() / respondToFormCheck() (written feedback + optional follow-up video, marks reviewed) — all video paths resolved to signed URLs in one batch, same shape chat.ts's listMessages() already uses for attachments
    video-picker.ts               # recordVideo() / pickVideoFromLibrary() — expo-image-picker in video mode (60s cap); reads asset.base64 first, FileSystem.readAsStringAsync only as the native-platform fallback (that call throws outright on web, same reason chat.ts's own document picker orders it this way)
supabase/
  functions/
    delete-client/
      index.ts                    # Edge Function (Deno, deployed via the Supabase dashboard, not this repo) — the only place the service-role key is used; verifies caller is a coach and target is a client, clears their Storage folders, then deletes their auth account, cascading the whole database
  schema.sql              # paste into Supabase SQL Editor once
  workouts.sql             # paste in after schema.sql, adds workouts + workout_exercises
  assignments.sql           # paste in after workouts.sql, adds assignments + client visibility
  client-access.sql          # paste in after assignments.sql, lets clients read their own data
  workout-logs.sql            # paste in after client-access.sql, adds logging + completed status
  coach-log-visibility.sql     # paste in after workout-logs.sql, lets coaches see logged results
  client-name.sql               # paste in after coach-log-visibility.sql, adds full_name
  food-logs.sql                  # paste in after client-name.sql, adds food_logs
  weight-logs.sql                  # paste in after food-logs.sql, adds weight_logs
  lock-coach-role.sql                # paste in after weight-logs.sql — security fix, read it first
  habits.sql                           # paste in after lock-coach-role.sql, adds habits + habit_logs
  xp.sql                                 # paste in after habits.sql — adds XP, also a security fix; read it first
  reschedule.sql                          # paste in after xp.sql — column-level security fix; read it first
  programmes.sql                            # paste in after reschedule.sql, adds programme_blocks + programme_weeks
  assign-programme.sql                        # paste in after programmes.sql, adds programme_blocks.client_id
  client-programme-view.sql                     # paste in after assign-programme.sql, adds start_date + client read access
  exercise-library.sql                            # paste in after client-programme-view.sql — schema AND the imported data itself
  exercise-library-free-exercise-db-merge.sql       # paste in any time after exercise-library.sql — merges in the free-exercise-db dataset: real images backfilled onto 871 of the 872 existing exercises, plus 5 genuinely new ones; safe to re-run, never touches your own custom exercises
  link-exercise-library.sql                         # paste in after exercise-library.sql, adds workout_exercises.exercise_library_id
  food-log-macros.sql                                 # paste in after link-exercise-library.sql, adds protein/carbs/fat to food_logs
  food-log-quantity.sql                                 # adds quantity_grams to food_logs (order vs. other food_logs files doesn't matter)
  weight-trend.sql                                        # adds weight_logs.weight_trend + one-time backfill of existing rows
  tdee-estimates.sql                                        # paste in after weight-trend.sql, adds tdee_estimates
  calorie-target.sql                                          # paste in after tdee-estimates.sql, adds programme_blocks.calorie_target_percent
  coach-nutrition-and-delete.sql                                # paste in after calorie-target.sql — coach read access to food_logs/tdee_estimates, delete on food_logs
  body-metrics.sql                                                # paste in after coach-nutrition-and-delete.sql, adds weight_logs.body_fat_percent + muscle_percent
  body-measurements.sql                                             # paste in after body-metrics.sql, adds body_measurements (originally cm)
  body-measurements-inches.sql                                        # paste in right after body-measurements.sql — renames value_cm to value_in, converts existing rows
  progress-photos.sql                                                   # paste in after body-measurements-inches.sql — private Storage bucket + progress_photos table
  community.sql                                                           # paste in after progress-photos.sql — app_settings singleton, profiles.community_hidden, community_posts, community-images bucket
  community-moderation.sql                                                 # paste in after community.sql — community_reports, community_posts delete policies, community_blocks + the blocked-can't-post insert check
  community-leaderboards.sql                                                 # paste in after community-moderation.sql — client_tiers (Club/Accelerator/Precision) + get_weekly_xp_leaderboard()/get_lifetime_xp_leaderboard() SECURITY DEFINER functions
  chat.sql                                                                     # paste in after community-leaderboards.sql — conversations, messages (+ edit trigger, delete-for-everyone time window), message_hidden_for, chat-audio bucket, realtime publication, profiles.last_seen_at
  chat-read-receipts.sql                                                         # paste in after chat.sql — conversation_reads (one "read up to" cursor per person per conversation), added to the realtime publication too
  recipes.sql                                                                       # paste in after chat-read-receipts.sql — recipes + recipe_ingredients (coach-owned, macros always calculated not stored), recipe-photos bucket
  nutri-score.sql                                                                     # paste in after recipes.sql — adds sugars/saturated_fat/sodium_mg/fiber/fruit_veg_legume_nut_percent columns to recipe_ingredients, no RLS changes needed
  meal-plan-templates.sql                                                               # paste in after nutri-score.sql — meal_plan_templates + meal_plan_template_items (coach-owned, references recipes) + meal_plan_assignments (a template+client pointer, is_coach()-gated like assignments.sql)
  workout-set-types.sql                                                                   # paste in after meal-plan-templates.sql — workout_exercises.baseline_weight/baseline_reps + workout_exercise_sets (per-set technique tagging), client read access already included
  readiness.sql                                                                             # paste in after workout-set-types.sql — app_settings.readiness_form_id, readiness_responses (linked to assignments, not form_check_ins), seeds one default 4-question form if none is configured yet
  exercise-swaps.sql                                                                          # paste in after readiness.sql — assignment_exercise_swaps (session-only exercise substitution, never mutates workout_exercises)
  live-session.sql                                                                              # paste in after exercise-swaps.sql — workout_logs.set_number/rpe + a unique (assignment_id, exercise_id, set_number) constraint (what makes the local-cache sync idempotent), client update/delete policies for editing/unchecking a set
  readiness-client-access.sql                                                                     # paste in after live-session.sql — fixes a real RLS gap: a client never had read access to the active readiness form itself (only to ones reached via form_assignments/form_check_ins, which the readiness feature deliberately bypasses) — every workout failed to load with "Cannot coerce the result to a single JSON object" until this ran
  session-rpe.sql                                                                                   # paste in after readiness-client-access.sql — assignments.session_rpe (the client's overall rating of the whole session) + the column-level grant a client needs to actually save it
  client-status.sql                                                                                   # paste in after session-rpe.sql — profiles.status ('active'/'paused'), the coach-only update policy, and a trigger closing the column-grant gap it would otherwise open (a client could flip their own status via a direct API call)
  client-deletion.sql                                                                                   # paste in after client-status.sql — changes community_posts.author_id from on delete cascade to on delete set null, so permanently deleting a client anonymizes their posts instead of deleting them
  client-activity-feed.sql                                                                                # paste in after client-deletion.sql — coach read access to habit_logs (also fixes Momentum Score's habit component when a coach computes it), adds food_logs/habit_logs/assignments to the realtime publication
  feature-toggles.sql                                                                                       # paste in after client-activity-feed.sql — feature_key (9 seeded rows, extensible) + client_feature_toggles (client + feature_key -> enabled, no row means enabled) + RLS
  toggle-presets.sql                                                                                          # paste in after feature-toggles.sql — toggle_preset (3 seeded bundles) + toggle_preset_value (the real plan-defaults matrix, all 9 features x all 3 presets), coach-only RLS
  external-forms.sql                                                                                            # paste in after toggle-presets.sql — external_forms/external_form_questions/external_form_responses (no anonymous RLS grant at all), get_external_form_by_token()/submit_external_form_response() (the only anonymous access, both SECURITY DEFINER), seeds the real 9-question PAR-Q template
  onboarding.sql                                                                                                  # paste in after external-forms.sql — app_settings.parq_form_id, profiles.onboarding_health_flagged/onboarding_health_acknowledged_at/onboarding_clearance_note, onboarding_parq_responses, client read-access policies on external_forms/external_form_questions (the same RLS gap class readiness-client-access.sql fixed), and the flag_onboarding_health_risk_trigger safety gate
  onboarding-auto-provision.sql                                                                                   # paste in after onboarding.sql — profiles.onboarding_provisioned_at + complete_client_onboarding(), a SECURITY DEFINER function a client calls on their own account to auto-apply the Base Plan tier + toggle defaults exactly once, ever
  settings-profile.sql                                                                                              # paste in after onboarding-auto-provision.sql — profiles.phone_number + its self-update grant, and a trigger keeping profiles.email in sync whenever a real Supabase Auth email change is confirmed
  notification-preferences.sql                                                                                        # paste in after settings-profile.sql — 4 boolean columns on profiles (push/workout-reminders/habit-reminders/community-updates, all default true) + their self-update grant; preference storage only, no delivery system reads these yet
  unread-badges.sql                                                                                                     # paste in after notification-preferences.sql — adds community_posts to the realtime publication, and profiles.community_last_viewed_at (defaults to now(), not null, so existing clients don't see every historical post as "new" the moment this ships) + its self-update grant
  exercise-removals.sql                                                                                                   # paste in after exercise-swaps.sql — assignment_exercise_removals (session-only exercise removal, never mutates workout_exercises), identical shape/RLS to exercise-swaps.sql
  saved-meals.sql                                                                                                           # paste in after exercise-removals.sql — saved_meals + saved_meal_items (a client's own reusable meal templates, same scaled-snapshot shape as food_logs/recipe_ingredients), client-owned only, not coach-visible
  wearables.sql                                                                                                               # paste in after saved-meals.sql — wearable_connections / wearable_daily_metrics / wearable_heart_rate_samples, client-owned + coach-readable (same shape as food_logs/weight_logs); nothing writes to these yet, see the file's own header comment for why
  chat-attachments.sql                                                                                                        # paste in after chat.sql (and before bulk-messages.sql) — generic attachment columns on messages + a chat-attachments bucket, same signed-URL shape chat.sql already uses for voice notes
  bulk-messages.sql                                                                                                           # paste in after chat-attachments.sql — bulk_message_series / bulk_message_recipients / bulk_message_deliveries + the pg_cron job and dispatch function that actually fires a scheduled/recurring series; enable the pg_cron extension first if the `create extension` line errors (Dashboard -> Database -> Extensions)
  exercise-library-free-exercise-db-merge.sql                                                                                 # paste in whenever, after exercise-library.sql — adds image_urls text[], backfills real images onto matched rows (guarded by image_url is null, safe to re-run), inserts the small number of genuinely new exercises
  challenges.sql                                                                                                              # paste in after community-leaderboards.sql — challenges / challenge_eligible_clients / challenge_participants + owns_challenge()/is_eligible_for_challenge()/can_join_challenge() SECURITY DEFINER functions (needed to avoid RLS infinite recursion between the first two tables); creation and joining only — no scoring or leaderboard yet
  challenge-progress.sql                                                                                                      # paste in after challenges.sql — get_challenge_leaderboard() (SECURITY DEFINER, Volume sums weight x reps / Consistency counts completed sessions, both scoped to the challenge's own date range) + adds workout_logs and challenge_participants to the supabase_realtime publication for live standings
  resources.sql                                                                                                               # paste in after challenge-progress.sql — resource_folders / resource_items / resource_eligible_clients + owns_resource_item()/is_eligible_for_resource_item() SECURITY DEFINER functions (same infinite-recursion fix challenges.sql needed) + a private resource-files storage bucket with its own coach/eligible-client policies
  backfill-exercise-library-links.sql                                                                                         # run whenever, independent of the rest — matches any still-unlinked workout_exercises row to exercise_library by exact name, fixing the real bug behind the Volume Analyser (and PB tracking, and Exercise progress) silently missing sets logged against workouts built before that link existed; safe to re-run
  form-check.sql                                                                                                              # paste in whenever, independent of the rest — form_check_submissions (client video + optional coach response, one review each, no threading) + a private form-check-videos storage bucket, path <client_id>/<filename> for both the client's and the coach's follow-up video
  message-reactions.sql                                                                                                       # paste in after form-check.sql — message_reactions (one emoji per person per message, primary key (message_id, user_id) enforces that), participant-only RLS same shape as message_hidden_for's, added to the supabase_realtime publication
  food-log-edit-quantity.sql                                                                                                  # paste in after message-reactions.sql — adds the update policy food_logs never had (only select/insert/delete existed before), column-locked to quantity_grams/calories/protein/carbs/fat only (same column-lockdown shape chat.sql uses), so a client can edit a logged entry's amount without being able to rewrite its food name, meal, or day
  custom-exercises.sql                                                                                                        # paste in after food-log-edit-quantity.sql — adds is_custom/created_by to exercise_library plus insert/update/delete policies scoped to public.is_coach() and is_custom = true and created_by = auth.uid(), so a coach can add their own exercises on top of the 872 seeded ones without ever being able to touch the seeded reference data itself
```
