# LoveAdmin migration (temporary)

While members move from LoveAdmin (the old membership system, now called
**Thrive4**, club.thrive4.com) to ClubControl, the dashboard reads LoveAdmin
automatically. Nothing is uploaded by hand.

## Paid through LoveAdmin last month

**Fetched from Thrive4** (`lib/thrive4.ts`, `lib/thrive4Sync.ts`) every Monday,
on meeting days, and by **Fetch from Thrive4 now** on `/operations/membership`,
with the dashboard's Thrive4 login in Vercel (`THRIVE4_EMAIL` /
`THRIVE4_PASSWORD`, an account with admin access to the club). It takes the
**previous calendar month's** paid invoices (on 28 Oct, September's): the club
is moving off Thrive4, so only who paid there last month matters.

- Everyone a **paid** ("reconciled") invoice was for counts as **paid**, even
  if ClubControl doesn't show them as active yet. Each child on a family
  invoice counts. Cancelled or unpaid invoices are ignored. Each person is
  kept by their Thrive4 id (`person_guid`), so two people with the same name
  stay separate.
- Players paid this way get a purple **LoveAdmin** tag beside their status.
- The **Still on LoveAdmin** card lists everyone who paid through LoveAdmin
  and has **no active direct debit in ClubControl yet**, with who pays for
  them, the invoice amount, their team and their ClubControl billing method.
  Anyone paid by an active ClubControl direct debit has moved: they're left
  off this card and shown on the Thrive4 billing card until closed there.
  That includes people paid for by **someone else's** direct debit (a parent
  for the family): only the account holder shows "Direct Debit: Active" in
  ClubControl, so the ClubControl fetch also opens each active direct debit
  account and reads who it pays for (`covered_by_id`). The card shows them as
  "Paid by <name>'s direct debit", and the mandate checked is the account
  holder's. "Moved" means an **active GoCardless mandate** (status read from
  each direct debit account's ClubControl page, `mandate_status`).
- Names are matched between the two systems exactly, or by a near-identical
  name when exactly one ClubControl person fits: the same surname and a
  compatible first name ("Ste" / "Steven", "Katy" / "Katherine"; see
  `findClubControl` in `lib/membership.ts`). The ClubControl name is shown
  under the status when it differs. Anyone with no match at all is flagged
  **⚠ Not on ClubControl**. When the card is empty, the migration is done.

## Who Thrive4 is still billing, and closing them

**Thrive4 billing** card (on `/operations/membership`, **Check Thrive4**): lists,
live, everyone Thrive4 invoiced this month and the subscriptions that will
raise next month's invoices. Anyone with an **active direct debit in
ClubControl** is flagged: they have moved but are still open on Thrive4.
(Being "active" in ClubControl isn't enough: everyone was brought across as
active.) The direct debit status is ClubControl's "Billing Method", read by
the automatic ClubControl fetch (`supabase/policies/membership_billing_method.sql`).
Checking stores nothing and changes nothing in Thrive4.

For admins, each flagged person also shows their **ClubControl record**, read
live: the GoCardless mandate (id and status), their latest ClubControl
payment (or that the first one isn't collected yet), renewal date, and a link
to open them in ClubControl. Only someone with an **active mandate** can be
made inactive (`pages/api/private/clubcontrol-mandates.ts`).

Admins also get **Make inactive on Thrive4** (per person) and **Make all N
inactive**. This does what Thrive4's own "make inactive" does, which drops the
person's Thrive4 subscriptions so no more invoices are raised. Each person is
checked again on the server first (still billed on Thrive4, a ClubControl
direct debit, and an active mandate on their ClubControl record, read again
live), and every attempt is logged in `thrive4_deactivations`. Undo it in
Thrive4 if needed.

## Removing it once everyone has moved

Every temporary piece is marked `LoveAdmin migration (temporary)`, so
`git grep -n "LoveAdmin migration"` finds them all.

1. **Delete these files:**
   - `lib/importers/loveAdminImportParser.ts` (now only the row type)
   - `lib/thrive4.ts`, `lib/thrive4Sync.ts`, `pages/api/private/thrive4-sync.ts`,
     `pages/api/private/thrive4-billing.ts`, `pages/api/private/thrive4-deactivate.ts`
     and `pages/api/private/clubcontrol-mandates.ts`
   - `supabase/policies/membership_loveadmin.sql`
   - `LOVEADMIN_MIGRATION.md` (this file)
2. **`pages/operations/membership.tsx`:** remove each marked block:
   - the `LoveAdminPayment` type, and `'loveadmin'` from the `Import` kind;
   - the `LoveAdminTag` component and its two uses beside `StatusBadge`;
   - the `loveAdmin` state, its load in `loadData`, `loveAdminImport`,
     `loveAdminByName` and `paidAnywhere`. Put `isPaidUp(...)` back wherever
     `paidAnywhere(...)` is used;
   - the `loveAdmin` field on `PlayerRow` and in `playerRows`, with status back to
     `!member ? 'missing' : isPaidUp(member) ? 'paid' : 'lapsed'`;
   - `loveAdminRows`, `stillOnLoveAdmin`, `movedFromLoveAdmin` and the
     **Still on LoveAdmin** card;
   - the `Thrive4BillingCard` component (and its `ClubControlMandate` type and
     `hasActiveMandate`) and its use;
   - `'loveAdmin'` and `'thrive4'` from the `Card` type and `DEFAULT_OPEN`;
   - `thrive4` from `FetchSource` / `FETCH_NAMES` and the fetch buttons;
   - the Thrive4 date in the header;
   - `loveAdminByName` from the `useMemo` dependency lists.
3. **Other files:** remove the marked Thrive4 blocks in
   `pages/api/cron/membership-sync.ts` and `pages/api/cron/membership-report.ts`,
   and `saveLoveAdminPayments` in `lib/membershipStore.ts`. In
   `lib/clubcontrol.ts`, the mandate reading (`fetchMandates`,
   `hasActiveMandate`, `ClubControlMandate`) can go too, unless something else
   uses it by then. Remove the `THRIVE4_*` lines in `.env.local.example`, and
   `THRIVE4_EMAIL` / `THRIVE4_PASSWORD` in Vercel.
4. **Database** (Supabase SQL editor), after the code change is deployed:

   ```sql
   begin;
   drop table if exists public.membership_loveadmin;
   drop table if exists public.thrive4_deactivations;
   delete from public.membership_imports where kind = 'loveadmin';
   alter table public.membership_imports drop constraint if exists membership_imports_kind_check;
   alter table public.membership_imports
     add constraint membership_imports_kind_check check (kind in ('members', 'players'));
   commit;
   ```

5. Check: `git grep -n "LoveAdmin migration"` finds nothing, and
   `npx tsc --noEmit` passes.

Keep ClubControl's billing method (`billing_method`, `DIRECT_DEBIT_ACTIVE`,
`billingByName`): it's useful beyond the migration.

**Leave these alone.** The agenda pages mention LoveAdmin for other reasons
(`pages/agenda/membership.tsx`, `pages/agenda/treasury.tsx`,
`pages/meeting/[id].tsx`, `components/MeetingAgendaView.tsx`). They're not
part of this migration feature.
