# LoveAdmin migration (temporary)

While members move from LoveAdmin (the old membership system) to ClubControl,
admins upload LoveAdmin's **Invoices All Report** (.xlsx or .csv) on
`/operations/membership` (**⬆ Upload LoveAdmin invoices**). The dashboard doesn't
connect to LoveAdmin itself.

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

## Removing it once everyone has moved

Every temporary piece is marked `LoveAdmin migration (temporary)`, so
`git grep -n "LoveAdmin migration"` finds them all.

1. **Delete these files:**
   - `lib/importers/loveAdminImportParser.ts`
   - `pages/api/private/membership-import.ts`
   - `pages/api/private/clubcontrol-mandates.ts` (nothing calls it at the moment)
   - `supabase/policies/membership_loveadmin.sql`
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
