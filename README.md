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

**How to build one, as the coach:** Home → My Programmes → + New. Fill in name, goal type, duration, and (optionally) description, cover image URL, and training days, then Create. You land on the programme screen showing Week 1 through N as cards. Tap a week to open it, then "+ New session" to build a workout inside that week — this opens the exact same workout builder used for standalone workouts, just labeled with which week it's for and saving into that week instead of your general workout list.

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

## Project structure reference

```
src/
  app/
    index.tsx          # routes to /login, coach /home, or client /client
    (auth)/
      login.tsx
      signup.tsx        # name/email/password only — no role choice; every signup is a client
    (app)/
      home.tsx          # coach's home screen only; redirects clients to /client
      workouts/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of the coach's workouts
        new.tsx          # create-workout form; also reused for sessions inside a programme week (?weekId=)
      programmes/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of the coach's programmes
        new.tsx          # create-programme form — name, goal type, duration, cover image, training days
        [id].tsx          # one programme — cover image, weeks list, + Add week
        week/[weekId].tsx  # one week of a programme — its sessions, + New session
      assignments/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of assignments, with status
        new.tsx          # pick workout + client + date, save
        [id].tsx          # coach's view of one assignment — prescribed vs. actual
      habits/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of habits the coach has created
        new.tsx          # pick client + habit name, save
      assigned/
        [id].tsx          # client's workout view — logs performance, or shows it once completed
      client/
        _layout.tsx      # client-only guard + the 5-tab bar
        index.tsx        # Home tab — greeting, streak, Level/XP, Momentum Score, Up Next, Today's Habits checklist
        training.tsx      # Training tab — full assignment history
        nutrition.tsx      # Nutrition tab — 4 meal sections, add-entry popup, calorie total
        progress.tsx       # Progress tab — log/update today's weight, chronological history
        calendar.tsx        # placeholder
  components/
    coming-soon.tsx     # shared "X — Coming soon." screen for the 1 remaining placeholder tab (Calendar)
    hero-stat.tsx        # glowing teal oversized-number card; optional progress bar (used by Momentum Score)
    brand-logo.tsx        # fixed top-left logo overlay, mounted once in the root layout
  constants/
    theme.ts             # single source of truth: Colors, Glow, Spacing, typography
  context/
    auth-context.tsx    # session + profile state, available anywhere via useAuth()
  lib/
    supabase.ts          # Supabase client, reads from .env
    workouts.ts           # createWorkout() / listWorkouts() / listWorkoutsForWeek() database calls
    programmes.ts          # createProgramme() / listProgrammes() / getProgrammeDetail() / addProgrammeWeek()
    assignments.ts         # coach + client assignment + workout-log database calls
    food-logs.ts            # addFoodLog() / listFoodLogsForDate() database calls
    weight-logs.ts           # saveWeightLog() (upsert) / listWeightLogs() database calls
    habits.ts                 # coach + client habit + habit-log database calls
    momentum.ts                # getMomentumScore() — pure calculation, no new tables
    xp.ts                       # awardWorkoutXp() / awardMealXp() / awardHabitXp() / getXpSummary()
    streak.ts                    # getCurrentStreak() — pure calculation, no new tables
supabase/
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
```
