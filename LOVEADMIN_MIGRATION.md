# LoveAdmin migration (temporary)

While members move from LoveAdmin (the old membership system) to ClubControl,
admins can upload LoveAdmin's **Invoices All Report** (.xlsx) on
`/operations/membership` (⬆ Upload data → **LoveAdmin invoices (temporary)**).

What it does:

- Everyone named as a beneficiary on a **paid** ("reconciled") invoice counts
  as **paid**, even if ClubControl doesn't show them as active yet. Parents
  paying for several children list them comma-separated; each child counts.
  Cancelled or unpaid invoices are ignored.
- Players paid this way get a purple **LoveAdmin** tag beside their status.
- The **Still on LoveAdmin** card lists everyone still paying through
  LoveAdmin, with who pays for them, the invoice amount, their team and their
  ClubControl status. Re-upload a newer report as people move over; when it's
  empty, the migration is done.
- Each upload replaces the previous one.

## Removing it once everyone has moved

Every temporary piece is marked `LoveAdmin migration (temporary)`, so
`git grep -n "LoveAdmin migration"` finds them all.

1. **Delete these files:**
   - `lib/importers/loveAdminImportParser.ts`
   - `supabase/policies/membership_loveadmin.sql`
   - `LOVEADMIN_MIGRATION.md` (this file)
2. **`pages/api/private/membership-import.ts`:** remove the
   `parseLoveAdminInvoices` import, the `kind "loveadmin"` lines in the header
   comment, `'loveadmin'` from the allowed kinds, and the whole
   `if (kind === 'loveadmin') { … }` block.
3. **`pages/operations/membership.tsx`:** remove each marked block:
   - the `LoveAdminPayment` and `LoveAdminPreview` types, and `'loveadmin'`
     from the `Import` kind;
   - the `LoveAdminTag` component and its two uses beside `StatusBadge`;
   - the `loveAdmin` state, its load in `loadData`, `loveAdminImport`,
     `loveAdminByName` and `paidAnywhere`. Put `isPaidUp(...)` back wherever
     `paidAnywhere(...)` is used;
   - the `loveAdmin` field on `PlayerRow` and in `playerRows`, with status back to
     `!member ? 'missing' : isPaidUp(member) ? 'paid' : 'lapsed'`;
   - `stillOnLoveAdmin` and the **Still on LoveAdmin** card;
   - `'loveAdmin'` from the `Card` type and `DEFAULT_OPEN`;
   - the LoveAdmin date in the header, and the LoveAdmin chip, description,
     `accept` type, preview and success message in `UploadPanel`;
   - `loveAdminByName` from the `useMemo` dependency lists.
4. **`lib/importers/membershipImportParser.ts`:** `readXlsxSheets` and
   `cellDate` were exported for the LoveAdmin parser. They can stay exported,
   or go back to plain `function`s.
5. **Database** (Supabase SQL editor), after the code change is deployed:

   ```sql
   begin;
   drop table if exists public.membership_loveadmin;
   delete from public.membership_imports where kind = 'loveadmin';
   alter table public.membership_imports drop constraint if exists membership_imports_kind_check;
   alter table public.membership_imports
     add constraint membership_imports_kind_check check (kind in ('members', 'players'));
   commit;
   ```

6. Check: `git grep -n "LoveAdmin migration"` finds nothing, and
   `npx tsc --noEmit` passes.

**Leave these alone.** The agenda pages mention LoveAdmin for other reasons
(`pages/agenda/membership.tsx`, `pages/agenda/treasury.tsx`,
`pages/meeting/[id].tsx`, `components/MeetingAgendaView.tsx`). They're not
part of this migration feature.
