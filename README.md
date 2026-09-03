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

**Each set's checkbox drives the rest timer, weight/reps/RPE are logged per set, and a tagged set shows its own instructions inline.** Checking a set complete auto-starts a rest timer (90 seconds, ±15s adjustable, or Skip) — the same timer whether it's a plain set or a Drop Set/Rest-Pause/FST-7 one. A tagged set additionally shows a small label ("Drop Set") and the exact built-in instructions for performing it (from `src/lib/set-types.ts`, unchanged from the Workout Builder chunk), directly under that set's checkbox — so the client doesn't have to remember what a drop set is mid-workout. RPE reuses the same 1–10 scale input the readiness questionnaire uses, just configured per-set instead of per-question.

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

## Project structure reference

```
src/
  app/
    index.tsx          # routes to /login, coach /home, or client /client
    (auth)/
      login.tsx
      signup.tsx        # name/email/password only — no role choice; every signup is a client
    (app)/
      home.tsx          # coach's home screen only; redirects clients to /client — includes Community and Messages links
      messages/
        index.tsx        # coach-only inbox — every client, most-recently-messaged first, with a last-message preview and an online dot
        [clientId].tsx     # coach's per-client thread — same <ChatThread> the client's own Chat tab uses
      community/
        index.tsx        # Posts/Leaderboards sub-tabs; Posts = shared feed + coach-only app-wide on/off switch + Moderation link + Report/Delete actions per post
        new.tsx           # compose a post — tag picker excludes Announcement entirely for a client account; shows a plain message instead of the form if this client is blocked
        moderation.tsx      # coach-only (inline role check, no folder _layout.tsx): open reports with Dismiss/Delete post/Block author, plus a Blocked clients list with Unblock
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
        index.tsx        # search + muscle-group filter over the imported exercise_library table
      assignments/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of assignments, with status
        new.tsx          # pick workout + client + date, save
        [id].tsx          # coach's view of one assignment — prescribed vs. actual, one row per logged SET now, not one per exercise
      habits/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of habits the coach has created, with Archive
        new.tsx          # pick client + habit name, save
      clients/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of every client account, each row showing a color-coded Compliance Score % badge and a Tier: Base/Accelerator/Precision picker (coach-set, gates that client's Leaderboards access)
        [id].tsx          # one client's detail page — Programme section (Unassign) + Assigned Workouts section (one-off workouts, Unassign) + Check-in Schedule section (recurring assignments with Cancel, individual check-in instances with Remove) + Nutrition section (target + 14-day food log history, delete)
      forms/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # list of the coach's check-in form templates, with Assign and Set as readiness (✓ badge on whichever one is currently the active pre-workout questionnaire)
        new.tsx          # form builder — name + ordered question list, each with a type (short text/number/single select/multi select/scale/measurement) and type-driven config
        [id].tsx          # read-only view of one saved form — every question's type and config, rendered generically off question-types.ts, not per-type
        assign/[id].tsx     # pick a client + day of week + due-window hours, live "Next 5 check-ins" preview, confirm — creates one form_assignments row (a rule, not per-occurrence rows)
      assigned/
        [id].tsx          # client's live session screen — readiness gate first if unanswered, then per-SET checkboxes (weight/reps/RPE, prefilled: previous session > coach baseline > empty with a hint, always editable), tagged sets show their technique label + instructions, checking a set auto-starts an editable rest timer, a Swap link opens same-muscle-group alternatives (session-only), Finish Session locks it read-only — every set is cached to on-device storage the instant it's checked and synced to Supabase in the background, so nothing is lost to a dropped connection
      checkins/
        [id].tsx          # client's check-in fill-out screen — <AnswerInput> per question while pending, read-only submitted answers once completed
      client/
        _layout.tsx      # client-only guard + the 5-tab bar (Home/Training/Nutrition/Progress/Chat) — calendar.tsx stays registered via href: null, hidden from the tab bar but still routable
        index.tsx        # Home tab — greeting, streak, daily logging nudge, weekly TDEE recalculation check, Level/XP, Momentum Score, Up Next (merges pending workouts + due check-ins), Today's Habits checklist, Community card with its own eye-icon hide toggle
        training.tsx      # Training tab — Your Programme card (week counter, day row, next workout) + full assignment history + "View Calendar →" link
        nutrition.tsx      # Nutrition tab — ‹›date navigator, 4 meal sections, USDA search + camera barcode scan, calories vs. real calorie target
        progress.tsx       # Progress tab shell — Compliance/Metrics/Measure/Photos sub-tab switcher (Compliance first, and the default tab)
        chat.tsx             # Chat tab — real messaging now: resolves/creates this client's conversation with "the coach", then renders <ChatThread>
        calendar.tsx        # Not a tab anymore, still a real route — thin wrapper: title + chrome around <SessionCalendar clientId={self} role="client" />, reached via Training's "View Calendar" link
  components/
    hero-stat.tsx        # glowing teal oversized-number card; optional progress bar (used by Momentum Score)
    macro-ring.tsx        # small SVG donut ring (Nutrition tab's Protein/Carbs/Fat breakdown)
    weight-trend-chart.tsx  # SVG line chart — actual weight (teal) + smoothed trend (red), used by MetricsPanel
    measurement-chart.tsx    # SVG single-line chart — raw body measurement values (no smoothing), used by MeasurePanel
    photo-compare-slider.tsx  # generic, reusable before/after image slider — drag to reveal, pinch either photo to resize it
    photos-panel.tsx            # Progress → Photos sub-tab content (front/side/back upload, gallery, compare tool)
    compliance-panel.tsx          # Progress → Compliance sub-tab content — HeroStat + punctuality/macro-adherence breakdown cards, reads getComplianceScore()
    session-calendar.tsx          # <SessionCalendar clientId role> — the real Week/Month calendar, shared by client/calendar.tsx and Programme Builder; also renders due/completed check-ins (own status marker, tappable only for role="client")
    time-range-toggle.tsx     # shared 1W/1M/6M/1Y/All Time chip row, used by both MetricsPanel and MeasurePanel
    metrics-panel.tsx          # Progress → Metrics sub-tab content (weight/body fat %/muscle % check-in, TDEE, trend chart + history)
    measure-panel.tsx           # Progress → Measure sub-tab content (waist/chest/arms/thighs/hips/neck logging, per-type graph + history)
    brand-logo.tsx        # fixed top-left logo overlay, mounted once in the root layout
    confirm-dialog.tsx      # <ConfirmDialog> — real Modal (not Alert.alert, a no-op on web), shared "Are you sure?" prompt — archive actions, Community's Delete/Block
    report-post-modal.tsx    # <ReportPostModal> — same Modal shape as ConfirmDialog plus a free-text optional reason field, kept separate since ConfirmDialog's callers all expect its fixed message-only shape
    leaderboard-panel.tsx     # Community → Leaderboards sub-tab content — This week/Lifetime toggle, ranked rows with a placeholder initials avatar, self-highlight; shows the locked/upsell state instead when the viewing client's tier doesn't have access
    chat-thread.tsx             # <ChatThread> — the whole conversation view (messages, composer, voice recording, emoji picker, edit/delete actions, presence, Sent/Read status on your last message), shared identically by the client's Chat tab and the coach's per-client thread
    emoji-picker.tsx             # <EmojiPicker> — fixed curated grid, not a full emoji-keyboard library
    question-config-editor.tsx  # <ConfigFieldEditor> — one render branch per config-field kind (text/list/range), not per question type; used by both the form builder and its read-only detail view
    question-answer-input.tsx    # <AnswerInput> — one render branch per answer kind (short_text/numeric/single_choice/multi_choice/scale), same reasoning; used by the check-in fill-out screen
    nutri-score-badge.tsx         # <NutriScoreBadge grade size> — official Nutri-Score A-E colors, small (list/search rows) or large (recipe hero) size
    workout-form.tsx               # <WorkoutForm workoutId? weekId?> — the coach's whole workout builder, shared by /workouts/new (blank, or a programme-week session) and /workouts/[id] (preloaded for editing); which mode it's in is just whether workoutId was passed
  constants/
    theme.ts             # single source of truth: Colors, Glow, Spacing, typography
  context/
    auth-context.tsx    # session + profile state, available anywhere via useAuth()
  lib/
    supabase.ts          # Supabase client, reads from .env
    workouts.ts           # createWorkout() (also saves per-exercise baseline weight/reps + any tagged sets) / getWorkoutDetail() (every exercise + baseline + tagged sets + exerciseLibraryId/muscleGroup, in order) / updateWorkout() (reconciles exercises by id in place -- refuses to remove one with logged history) / listWorkouts() / listWorkoutsForWeek() / archiveWorkout() database calls
    set-types.ts           # SET_TYPES / SET_TYPE_DESCRIPTIONS -- the four set-tagging options and their fixed, built-in technique explanations (Drop Set/Rest-Pause/FST-7; Normal has none)
    programmes.ts          # createProgramme() / listProgrammes() / getProgrammeDetail() / addProgrammeWeek() / duplicateProgramme() / assignProgrammeToClient() / getClientProgramme() (excludes an archived/unassigned instance) / updateProgrammeName() / archiveProgramme() (a coach's own template) / unassignProgramme() (a client's assigned instance -- archives it and its own workouts) / getActiveGoalModifier() / setGoalModifierPercent() / listClientPhases() / getPhaseForDate()
    exercise-library.ts     # listExerciseLibrarySummaries() / getExerciseDetail() — read-only, table seeded by SQL, not the app; both now include each exercise's description
    assignments.ts         # coach + client assignment database calls; getAssignmentDetail() (prescribed exercises + tagged sets, no logged data — see set-logging.ts) / getSetPrefills() — the per-SET weight/reps fallback chain (that exact set number's previous session by exercise_library_id, then coach baseline, then nothing fabricated) / finishSession() (just flips status — logging already happened incrementally) / getCoachAssignmentDetail() (per-set loggedSets[] now, not one logged value per exercise) / listClientStandaloneAssignments() (one client's one-off workouts, excludes programme sessions) / unassignWorkout() (deletes a pending assignment outright -- refuses one with logged sets)
    clients.ts               # listClients() / getClient() — coach-facing client roster, single-coach app so any coach sees any client
    food-logs.ts            # addFoodLog() / listFoodLogsForDate() / listFoodLogHistory() / deleteFoodLog() — stores a quantity-scaled macro snapshot, not a live link
    open-food-facts.ts       # getProductByBarcode() — live barcode lookup, used by the scanner; searchFoods() built but unused (USDA handles typed search)
    usda-fooddata.ts          # searchFoods() — live query against USDA FoodData Central; the active source for typed search
    weight-logs.ts           # saveWeightLog() (upsert, computes weight_trend, optional body fat %/muscle %) / listWeightLogs() / hasWeightLogForDate() database calls
    body-measurements.ts      # listBodyMeasurements() / saveBodyMeasurement() (upsert) / groupMeasurementsByType() — waist/chest/arms/thighs/hips/neck, no smoothing
    time-ranges.ts              # TIME_RANGES / filterByRange() — shared 1W/1M/6M/1Y/All Time filtering logic
    progress-photos.ts            # uploadProgressPhoto() / listProgressPhotos() — private Storage bucket + signed URLs
    tdee.ts                   # calculateAndSaveTdee() (gated) / checkAndRecalculateTdeeIfDue() (weekly, on app open) / getLatestTdeeEstimate() / getTdeeConfidence() / getCalorieTarget()
    habits.ts                 # coach + client habit + habit-log database calls, including archiveHabit()
    momentum.ts                # getMomentumScore() — pure calculation, no new tables; getCurrentWeekRange() exported so other "this week" features (the Leaderboard's weekly XP ranking) share the exact same Monday, not a second copy of the date math
    chat.ts                      # getOrCreateConversation() / listMessages() / sendTextMessage() / sendVoiceMessage() / editMessage() / deleteMessageForMe() / deleteMessageForEveryone() / subscribeToConversation() (realtime) / updateLastSeen() / getLastSeen() / isOnline() / listCoachConversations() / getAnyCoach() / markConversationRead() / getReadReceipts()
    compliance.ts                # getComplianceScore() — pure calculation, no new tables; averages check-in punctuality and macro adherence over a trailing 28-day window
    community.ts                   # listCommunityPosts() / createCommunityPost() / getCommunityEnabled() / setCommunityEnabled() / getCommunityHidden() / setCommunityHidden() / reportPost() / deletePost() / getOpenReports() / dismissReport() / blockClient() / unblockClient() / listBlockedClients() / isBlocked() — the Announcement-is-coach-only and blocked-can't-post rules live in RLS, not in this file
    leaderboard.ts                  # getWeeklyLeaderboard() / getLifetimeLeaderboard() (call SECURITY DEFINER SQL functions) / getMyTier() / setClientTier() / listClientTiers() / tierHasLeaderboardAccess() — CLIENT_TIERS mirrors the real Club/Accelerator/Precision Stripe products (Club shown in the app as "Base")
    recipes.ts                    # createRecipe() / listRecipes() / getRecipeDetail() / updateRecipeDetails() / deleteRecipe() / addRecipeIngredient() / removeRecipeIngredient() / uploadRecipePhoto() / computeMacroTotals() — the one place recipe macros are summed and divided by servings, pure and reused by both the list and detail screens
    nutri-score.ts                # computeNutriScore() — the public Nutri-Score formula from scratch (energy/sugar/sat-fat/sodium negative points, fruit-veg-nut%/fibre/protein positive points) / computeRecipeNutriScore() (sums ingredients, divides by servings, re-normalizes to per-100g before scoring) / estimateFruitVegLegumeNutPercentFromCategory() (category-based estimate, since neither data source has a real % for arbitrary foods)
    meal-plans.ts                  # computeMealPlanTotals() (baseline kcal + actual macro % from a template's recipes, never stored) / scaleMealPlan() (the portion-scaling engine -- pure, DB-independent) / createMealPlanTemplate() / listMealPlanTemplates() / getMealPlanTemplateDetail() / updateMealPlanTemplateDetails() / deleteMealPlanTemplate() / addMealPlanItem() / removeMealPlanItem() / assignMealPlanToClient() / listMealPlanAssignmentsForClient() / getScaledMealPlan() (loads an assignment and scales it live against the client's CURRENT calorie target)
    xp.ts                       # awardWorkoutXp() / awardMealXp() / awardHabitXp() / getXpSummary()
    question-types.ts            # QUESTION_TYPES — the extensible question-type registry (label, configFields, defaultConfig, validateConfig, toStoredConfig, plus answerKind/validateAnswer/toStoredAnswer per type); adding a type is an entry here, not a UI rebuild
    form-templates.ts             # createFormTemplate() / listFormTemplates() / getFormTemplateDetail() database calls
    form-assignments.ts            # createFormAssignment() / listClientFormAssignments() / archiveFormAssignment() database calls + listUpcomingCheckInDates() — pure, computes future dates from a recurrence rule, nothing stored per-occurrence
    form-check-ins.ts              # ensureCheckInsUpToDate() (lazy materialize + archive-as-missed sweep, run on client app open) / listUpNextCheckIns() / listVisibleCheckIns() / getCheckInDetail() / submitCheckIn() / listClientCheckInInstances() / archiveOrDeleteCheckIn() database calls
    readiness.ts                    # getReadinessFormId() / setReadinessFormId() (app_settings.readiness_form_id, the one active questionnaire) / getReadinessStatusForAssignment() (the active form's questions + whatever THIS session has answered so far) / submitReadinessResponses() -- deliberately not built on form_assignments/form_check_ins, see readiness.sql
    exercise-swaps.ts                # listExerciseSwapsForAssignment() / swapExerciseForSession() / undoExerciseSwap() -- session-only substitutions in assignment_exercise_swaps; never touches workout_exercises or the underlying programme
    set-logging.ts                    # saveSetLog() / deleteSetLog() — write to AsyncStorage first (the only thing the caller awaits), then best-effort push to Supabase, silently queuing on failure; flushPendingSetLogs() retries anything still queued (idempotent upsert, safe to retry); getMergedSetLogs() — server-confirmed logs overridden by anything still unsynced locally
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
  assign-programme.sql                        # paste in after programmes.sql, adds programme_blocks.client_id
  client-programme-view.sql                     # paste in after assign-programme.sql, adds start_date + client read access
  exercise-library.sql                            # paste in after client-programme-view.sql — schema AND the imported data itself
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
```
