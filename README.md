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

**The problem this solves:** "how many calories does this client actually burn a day?" can't be looked up — it has to be inferred from what actually happened to their weight while eating a known amount. This chunk calculates that inference (Adaptive TDEE) and stores it. It does **not** yet check whether there's enough logged data in a given window to trust the number — that check is a deliberate follow-up chunk. For now, it always calculates and stores an estimate.

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
        new.tsx          # create-workout form (search-select exercises from the library); also reused for programme-week sessions
      programmes/
        _layout.tsx      # coach-only guard for everything below
        index.tsx        # Template Library — list of the coach's programmes, with Duplicate
        new.tsx          # create-programme form — name, goal type, duration, cover image, training days
        [id].tsx          # one programme — cover image, tap-to-rename, weeks list, + Add week
        assign/[id].tsx     # pick a client + start date, assign a template to them
        week/[weekId].tsx  # one week of a programme — its sessions, + New session
      exercise-library/
        _layout.tsx      # coach-only guard for now
        index.tsx        # search + muscle-group filter over the imported exercise_library table
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
        training.tsx      # Training tab — Your Programme card (week counter, day row, next workout) + full assignment history
        nutrition.tsx      # Nutrition tab — 4 meal sections, USDA search + camera barcode scan, calorie + macro totals
        progress.tsx       # Progress tab — log/update today's weight, weight+trend chart, chronological history
        calendar.tsx        # placeholder
  components/
    coming-soon.tsx     # shared "X — Coming soon." screen for the 1 remaining placeholder tab (Calendar)
    hero-stat.tsx        # glowing teal oversized-number card; optional progress bar (used by Momentum Score)
    macro-ring.tsx        # small SVG donut ring (Nutrition tab's Protein/Carbs/Fat breakdown)
    weight-trend-chart.tsx  # SVG line chart — actual weight (teal) + smoothed trend (red) on the Progress tab
    brand-logo.tsx        # fixed top-left logo overlay, mounted once in the root layout
  constants/
    theme.ts             # single source of truth: Colors, Glow, Spacing, typography
  context/
    auth-context.tsx    # session + profile state, available anywhere via useAuth()
  lib/
    supabase.ts          # Supabase client, reads from .env
    workouts.ts           # createWorkout() / listWorkouts() / listWorkoutsForWeek() database calls
    programmes.ts          # createProgramme() / listProgrammes() / getProgrammeDetail() / addProgrammeWeek() / duplicateProgramme() / assignProgrammeToClient() / getClientProgramme() / updateProgrammeName()
    exercise-library.ts     # listExerciseLibrarySummaries() / getExerciseDetail() — read-only, table seeded by SQL, not the app
    assignments.ts         # coach + client assignment + workout-log database calls
    food-logs.ts            # addFoodLog() / listFoodLogsForDate() database calls — stores a quantity-scaled macro snapshot, not a live link
    open-food-facts.ts       # getProductByBarcode() — live barcode lookup, used by the scanner; searchFoods() built but unused (USDA handles typed search)
    usda-fooddata.ts          # searchFoods() — live query against USDA FoodData Central; the active source for typed search
    weight-logs.ts           # saveWeightLog() (upsert, computes weight_trend) / listWeightLogs() database calls
    tdee.ts                   # calculateAndSaveTdee() — 14-day rolling Adaptive TDEE estimate, stored, not yet displayed
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
  assign-programme.sql                        # paste in after programmes.sql, adds programme_blocks.client_id
  client-programme-view.sql                     # paste in after assign-programme.sql, adds start_date + client read access
  exercise-library.sql                            # paste in after client-programme-view.sql — schema AND the imported data itself
  link-exercise-library.sql                         # paste in after exercise-library.sql, adds workout_exercises.exercise_library_id
  food-log-macros.sql                                 # paste in after link-exercise-library.sql, adds protein/carbs/fat to food_logs
  food-log-quantity.sql                                 # adds quantity_grams to food_logs (order vs. other food_logs files doesn't matter)
  weight-trend.sql                                        # adds weight_logs.weight_trend + one-time backfill of existing rows
  tdee-estimates.sql                                        # paste in after weight-trend.sql, adds tdee_estimates
```
