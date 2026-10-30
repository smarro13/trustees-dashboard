// Monthly membership prices and how an account's bill is worked out, for the
// price calculator (pages/operations/membership/calculator.tsx). All amounts
// are in pence. These are typed in, not read from ClubControl: update them here
// when the prices change.

export type PriceKey =
  | 'male'
  | 'child'
  | 'childDiscounted'
  | 'female'
  | 'girls'
  | 'mini'
  | 'miniDiscounted'
  | 'social'
  | 'gym'
  | 'student'
  | 'vets';

export type Prices = Record<PriceKey, number>;

export const PRICE_ROWS: Array<{ key: PriceKey; label: string; pence: number; discounted?: boolean }> = [
  { key: 'male', label: 'Male Player', pence: 2000 },
  { key: 'child', label: 'Child Player', pence: 1600 },
  { key: 'childDiscounted', label: 'with another paying membership', pence: 800, discounted: true },
  { key: 'female', label: 'Female Player', pence: 1350 },
  { key: 'girls', label: 'Girls', pence: 1000 },
  { key: 'mini', label: 'Mini Winnies', pence: 1050 },
  { key: 'miniDiscounted', label: 'with another paying membership', pence: 550, discounted: true },
  { key: 'social', label: 'Non Player (Social)', pence: 1000 },
  { key: 'gym', label: 'Non-Player (Gym)', pence: 1000 },
  { key: 'student', label: 'Student - Unemployed', pence: 1050 },
  { key: 'vets', label: 'Vets - Infrequent Player', pence: 1350 },
];

// Taken off every other membership on an account with more than one paying
// membership. Child Player and Mini Winnies have their own discounted price.
export const MULTIPLE_DISCOUNT_PENCE = 270;

export const CURRENT_PRICES = Object.fromEntries(PRICE_ROWS.map((row) => [row.key, row.pence])) as Prices;

// 'parents' is Parents Access: free, and doesn't count as a paying membership.
export type AccountMembership = 'parents' | Exclude<PriceKey, 'childDiscounted' | 'miniDiscounted'>;

export const MEMBERSHIP_LABELS: Record<AccountMembership, string> = {
  parents: 'Parents Access',
  male: 'Male Player',
  child: 'Child Player',
  female: 'Female Player',
  girls: 'Girls',
  mini: 'Mini Winnies',
  social: 'Non Player (Social)',
  gym: 'Non-Player (Gym)',
  student: 'Student - Unemployed',
  vets: 'Vets - Infrequent Player',
};

// Based on combinations at one address in the ClubControl members export, with
// no member details. The player, child and social account is an illustration.
export const EXAMPLE_ACCOUNTS: Array<{ title: string; memberships: AccountMembership[] }> = [
  { title: 'Parent with two children', memberships: ['parents', 'child', 'child'] },
  { title: 'Parent player with one child and one social member', memberships: ['male', 'child', 'social'] },
  { title: 'Vets player with one child', memberships: ['vets', 'child'] },
  { title: 'Parent with a child and a Mini Winnie', memberships: ['parents', 'child', 'mini'] },
  { title: 'Two adults on gym memberships', memberships: ['gym', 'gym'] },
  { title: 'One male player and one female player', memberships: ['male', 'female'] },
];

const NO_EXCLUSIONS: ReadonlySet<PriceKey> = new Set();

// ClubControl categories that carry a price, as on the members export.
const CATEGORY_PRICES: Record<string, AccountMembership> = {
  'Male Player': 'male',
  'Child Player': 'child',
  'Female Player': 'female',
  Girls: 'girls',
  'Mini Winnies': 'mini',
  'Non Player (Social)': 'social',
  'Non-Player (Gym)': 'gym',
  'Student - Unemployed': 'student',
  'Vets - Infrequent Player': 'vets',
};

const LOTTO_PENCE: Record<string, number> = {
  'Presidents Lotto - Single Entry': 500,
  'Presidents Lotto - Double Entry': 1000,
  'Presidents Lotto - Triple Entry': 1500,
};

// What one member's memberships cost at the given prices, going by the discount
// each member is actually on in ClubControl rather than by priceAccount's rules.
// The export has no field linking members to an account, so income can't use those.
// Memberships in `excluded` get no discount.
export function memberMembershipPence(
  categories: string[],
  prices: Prices,
  multipleDiscount: number,
  excluded: ReadonlySet<PriceKey> = NO_EXCLUSIONS,
): number {
  let pence = 0;
  let canDiscount = false;
  for (const category of categories) {
    const key = CATEGORY_PRICES[category];
    if (!key || key === 'parents') continue;
    const allowed = !excluded.has(key);
    canDiscount = canDiscount || allowed;
    if (allowed && key === 'child' && categories.includes('Membership Discount - Child')) pence += prices.childDiscounted;
    else if (allowed && key === 'mini' && categories.includes('Membership Discount - Mini Winnies')) pence += prices.miniDiscounted;
    else pence += prices[key];
  }
  return canDiscount && categories.includes('Membership Discount - Multiple') ? Math.max(0, pence - multipleDiscount) : pence;
}

export type MonthlyIncome = { current: number; proposed: number; lotto: number; members: number };

// Active members' monthly income: the export's Amount column, moved by what the
// new prices change. Lotto entries stay as they are.
export function monthlyIncome(
  members: Array<{ categories: string[]; amount: number | null; active: boolean }>,
  prices: Prices,
  multipleDiscount: number,
  excluded: ReadonlySet<PriceKey> = NO_EXCLUSIONS,
): MonthlyIncome {
  const income: MonthlyIncome = { current: 0, proposed: 0, lotto: 0, members: 0 };
  for (const member of members) {
    if (!member.active) continue;
    const amount = Math.round((Number(member.amount) || 0) * 100);
    const change =
      memberMembershipPence(member.categories, prices, multipleDiscount, excluded) -
      memberMembershipPence(member.categories, CURRENT_PRICES, MULTIPLE_DISCOUNT_PENCE);
    income.current += amount;
    income.proposed += amount + change;
    income.lotto += member.categories.reduce((sum, category) => sum + (LOTTO_PENCE[category] ?? 0), 0);
    income.members += 1;
  }
  return income;
}

export const increaseByPercent =(pence: number, percent: number) => Math.round((pence * (100 + percent)) / 100);

// What each membership on one account costs per month, in the order given.
// Memberships in `excluded` pay full price but still count as paying memberships,
// so the others on the account keep their discount.
export function priceAccount(
  memberships: AccountMembership[],
  prices: Prices,
  multipleDiscount: number,
  excluded: ReadonlySet<PriceKey> = NO_EXCLUSIONS,
): number[] {
  const multiple = memberships.filter((membership) => membership !== 'parents').length > 1;
  return memberships.map((membership) => {
    if (membership === 'parents') return 0;
    if (!multiple || excluded.has(membership)) return prices[membership];
    if (membership === 'child') return prices.childDiscounted;
    if (membership === 'mini') return prices.miniDiscounted;
    return Math.max(0, prices[membership] - multipleDiscount);
  });
}
