# Trustees dashboard: roadmap

## New: vacancies & applicants (27 Oct 2026)

- [ ] Run `supabase/policies/vacancies.sql` in Supabase, then add the Indeed
  job on /operations/vacancies and upload Indeed's candidate export (.csv).
  Indeed has no applicant API for direct employers, so the export is the feed;
  re-upload it to pick up new applicants (stages and notes are kept).

## In progress: automatic membership data (25 Oct 2026)

- [x] **ClubControl members export** fetched automatically (live): every
  Monday, on meeting days before the membership report, and by "Fetch from
  ClubControl now" on /operations/membership. Logins in Vercel.
- [x] **GMS player list** fetched automatically (tested 26 Oct: 389 players).
  Same schedule as ClubControl. Needs GMS_EMAIL / GMS_PASSWORD in Vercel,
  then "Fetch from GMS now" on /operations/membership to load it straight away.
- [ ] Run `supabase/policies/membership_no_emergency_contacts.sql` (the
  page no longer uses emergency contacts; this deletes the stored ones).

## Digital Strategy 2026–2028: pencilled in (14 Oct 2026)

From the club's *Digital Strategy 2026–2028 working draft*. The strategy puts
governance, ownership, security and reporting at the centre, which is this
dashboard's job. The website (`aldwinians-webpages/TODO.md`) and the CMS/app
(`cms-app-dashboard/ROADMAP.md`) carry their own parts.

**Already built, which answers some of the strategy's questions**

- **Asset register** (`/operations/asset-register`): the strategy asks for "a
  digital infrastructure and equipment register" with location, age, owner,
  support and replacement. This is it; it needs the network kit, screens and
  software subscriptions entering.
- **Media screens** (`/operations/media-screens`): records each clubhouse
  screen and its AV routing. Answers part of the Clubhouse Technology gaps.
- **Programme stats** (`/operations/programme-stats`): the first counted
  campaign link (`/api/public/programme`).
- **Public Dashboard, Job Club, Lotto, Trustee/Committee packs**: the
  strategy lists these as "already digitised".

**New, pencilled in**

- [ ] **Digital Systems Register.** The strategy wants every platform listed
  with operational owner, primary admin, backup admin, supplier, cost,
  renewal date, data held and security status. Most columns already exist in
  `assets`. Add a "Software & platforms" category and, for that category:
  primary admin, backup admin, MFA on (yes/no/unknown), personal data held
  (yes/no), last access review date. A filtered view of the asset register,
  not a new page.
- [ ] **Digital Strategy roadmap tracker.** One table of projects with the
  exact fields the strategy asks for: status, current position, platform,
  project owner, operational owner, next action, target date, one-off cost,
  recurring cost, dependencies, priority, benefit, success measure. Same
  pattern as `/agenda/actions`, so it can be reviewed at Trustee meetings.
- [ ] **Counted campaign links (`/api/public/go/[slug]`).** Generalise
  `programme.ts`: a `campaign_links` table (slug, target URL, campaign,
  sponsor) and a redirect that counts each visit. The website maps
  `/go/<slug>` to it in Squarespace, as with `/programme`. Covers social
  posts, signage QR codes, the shop, and sponsor "visit website" clicks.
- [ ] **Digital performance page.** Extend programme stats into the strategy's
  "Digital Performance Framework": campaign link visits, sponsor
  click-throughs (per sponsor, for their reports), shop clicks, app devices
  (read from the CMS project), pre-match meal bookings. Start with what we
  already count rather than every metric.
- [ ] **MFA for trustee/admin logins.** Supabase TOTP, required for admin,
  trustee and director roles. Safeguarding and finance data live here.
