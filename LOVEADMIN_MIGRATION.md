# LoveAdmin migration (temporary)

While members move from LoveAdmin (the old membership system) to ClubControl,
admins upload LoveAdmin's **Invoices All Report** (.xlsx or .csv) on
`/operations/membership` (**⬆ Upload LoveAdmin invoices**). The dashboard doesn't
fetch LoveAdmin data itself; the one exception is looking up payers' mobile
numbers and emails for texting them (below).

What it does:

- Everyone named as a beneficiary on a **paid** ("reconciled") invoice counts
  as **paid**, even if ClubControl doesn't show them as active yet. Parents
  paying for several children list them comma-separated; each child counts.
  Cancelled or unpaid invoices are ignored. There's no date filter, so export
  only the period you want counted.
- Players paid this way get a purple **LoveAdmin** tag beside their status.
- The **Still on LoveAdmin** card lists everyone on the upload who has **no
  active direct debit in ClubControl yet**, with who pays for them, the invoice
  amount, their team and their ClubControl billing method.
  Anyone paid by an active ClubControl direct debit has moved and is left off
  the card. That includes people paid for by **someone else's** direct debit (a
  parent for the family): only the account holder shows "Direct Debit: Active"
  in ClubControl, so the ClubControl fetch also opens each active direct debit
  account and reads who it pays for (`covered_by_id`). "Moved" means an **active
  GoCardless mandate** (status read from each direct debit account's ClubControl
  page, `mandate_status`).
- Names are matched between the two systems exactly, or by a near-identical
  name when exactly one ClubControl person fits: the same surname and a
  compatible first name ("Ste" / "Steven", "Katy" / "Katherine"; see
  `findClubControl` in `lib/membership.ts`). The ClubControl name is shown
  under the status when it differs. Anyone with no match at all is flagged
  **⚠ Not on ClubControl**. Re-upload a newer report as people move over; when
  the card is empty, the migration is done.
- Each upload replaces the previous one.

## Texting payers to move (30 Oct 2026)

**📱 Text payers about moving to ClubControl** (admins, on the Still on
LoveAdmin card): one text to each payer on the LoveAdmin upload whose family
has no active ClubControl mandate, from the club's phone through textbee
(`lib/textbee.ts`, `lib/smsCampaign.ts`, `pages/api/private/sms-campaign.ts`).
Edit the message, send a test, check who'd be texted, queue, then Start. Four
daily crons (`pages/api/cron/sms-drip/[slot].ts`) send up to 10 each, at most
40 a day (textbee's free plan allows 50). Anyone who moves before their turn is
skipped; anyone replying STOP is never texted again (`sms_opt_outs`).

Who to text comes from the upload. Only the payers' **mobile and email** are
looked up in Thrive4 (LoveAdmin's new name), read-only, with the dashboard's
Thrive4 login (`THRIVE4_EMAIL` / `THRIVE4_PASSWORD`; `lib/thrive4Contacts.ts`).
They're kept only until each text is sent. Tables:
`supabase/policies/sms_messages.sql`.

## Removing it once everyone has moved

Every temporary piece is marked `LoveAdmin migration (temporary)`, so
`git grep -n "LoveAdmin migration"` finds them all.

1. **Delete these files:**
   - `lib/importers/loveAdminImportParser.ts`
   - `pages/api/private/membership-import.ts`
   - `pages/api/private/clubcontrol-mandates.ts` (nothing calls it at the moment)
   - `supabase/policies/membership_loveadmin.sql`
   - the texting: `lib/smsCampaign.ts`, `lib/thrive4Contacts.ts`,
     `pages/api/private/sms-campaign.ts`, `pages/api/cron/sms-drip/`, the four
     `sms-drip` crons in `vercel.json`, `SmsCampaignPanel` in
     `pages/operations/membership.tsx`, and the `THRIVE4_*` lines in
     `.env.local.example` and Vercel. Keep `lib/textbee.ts` and
     `supabase/policies/sms_messages.sql` if texts will be used for anything
     else; otherwise drop `sms_messages` and `sms_campaigns` (keep `sms_opt_outs`).
   - `LOVEADMIN_MIGRATION.md` (this file)
2. **`pages/operations/membership.tsx`:** remove each marked block:
   - the `LoveAdminPayment` and `LoveAdminPreview` types, and `'loveadmin'` from
     the `Import` kind;
   - `fileToBase64`, `LoveAdminUploadPanel`, `showLoveAdminUpload` and the upload
     button;
   - the `LoveAdminTag` component and its two uses beside `StatusBadge`;
   - `'loveadmin'` from `StatusFilter`, its check in `visiblePlayers` and its
     chip on the Players card;
   - the `loveAdmin` state, its load in `loadData`, `loveAdminImport`,
     `loveAdminByName` and `paidAnywhere`. Put `isPaidUp(...)` back wherever
     `paidAnywhere(...)` is used;
   - the `loveAdmin` field on `PlayerRow` and in `playerRows`, with status back to
     `!member ? 'missing' : isPaidUp(member) ? 'paid' : 'lapsed'`;
   - `loveAdminRows`, `stillOnLoveAdmin`, `movedFromLoveAdmin` and the
     **Still on LoveAdmin** card;
   - `'loveAdmin'` from the `Card` type and `DEFAULT_OPEN`;
   - the LoveAdmin date in the header;
   - `loveAdminByName` from the `useMemo` dependency lists.
3. **Other files:** remove `saveLoveAdminPayments` in `lib/membershipStore.ts`,
   and `readXlsxSheets`, `cellDate` and their helpers in
   `lib/importers/membershipImportParser.ts`, then `npm uninstall jszip`. In
   `lib/clubcontrol.ts`, `fetchMandates` can go too, unless something else uses
   it by then.
4. **Database** (Supabase SQL editor), after the code change is deployed:

   ```sql
   begin;
   drop table if exists public.membership_loveadmin;
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
