// Token Radar scoring model (written for this entry, no code copied in).
//
// Idea: a protocol that still records no token is worth farming in proportion
// to how big it already is, how fast it is still growing, and how long it has
// run without launching — a big, growing, seasoned protocol has the most to
// distribute and the most reason to distribute it soon. The implied value is
// the entry's own claim, never a prediction that a token will launch.
//
//   implied_value_usd = effective_tvl * base_multiple(category)
//                         * growth_factor * age_factor * chain_factor
//
// effective_tvl soft-caps TVL at $2B: past that point each extra dollar of
// TVL adds only a quarter as much to a launch valuation, because a launch
// cannot scale its fully-diluted value linearly forever and the per-user
// airdrop dilutes. base_multiple is what share of TVL a launch in that
// category is typically valued at. growth_factor rewards 7-day TVL growth
// (clamped to -20%..+25%). age_factor rewards time since listing, up to two
// years, because a protocol that has run that long without a token has had
// time to build the user base a launch rewards. chain_factor rewards a
// multi-chain footprint (up to five chains): TVL spread over several chains
// is stickier than TVL on one.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number | null;
    growth_multiplier: number;
    age_multiplier: number;
    chain_multiplier: number;
    effective_tvl_usd: number;
  };
  farm_steps: string[];
}

export const MODEL_VERSION = 'radar-rebuild-3';
export const TVL_SOFT_CAP_USD = 2_000_000_000;
export const TVL_SOFT_CAP_TAIL = 0.25;
export const AGE_FULL_DAYS = 730;

// What share of TVL a launch in this category is typically valued at.
// Vaults and capital allocators sit high: their TVL is sticky, fee-paying
// capital. RWA and wrappers sit low: their TVL is someone else's asset.
const BASE_MULTIPLES: Record<string, number> = {
  'Risk Curators': 0.22,
  'Onchain Capital Allocator': 0.22,
  'Dexs': 0.25,
  'Lending': 0.18,
  'Yield': 0.2,
  'Basis Trading': 0.15,
  'RWA': 0.12,
  'Restaking': 0.15,
  'CeDeFi': 0.15,
  'Chain': 0.3,
  'CDP': 0.15,
  'Collateral Markets': 0.18,
  'Insurance': 0.15,
  'Payments': 0.2,
  'Governance Incentives': 0.1,
  'Staking Pool': 0.08,
  'Stablecoin Wrapper': 0.05,
};
const DEFAULT_BASE_MULTIPLE = 0.18;

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Restaking',
  'CEX',
]);

const EXCHANGE_PREFIXES = [
  'binance',
  'coinbase',
  'bybit',
  'kraken',
  'bitget',
  'okx',
  'bitfinex',
  'gemini',
];

const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking|restaking|restaked)\b/i;

export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

/** A wrapped, staked or bridged product of a token that already trades, or a versioned copy. */
export function isWrappedOrVersioned(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSION_MARKER.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  const lower = p.name.toLowerCase();
  if (EXCHANGE_PREFIXES.some((ex) => lower.startsWith(ex))) return true;
  return false;
}

export function ageDays(asOf: string, listedAt: string | null): number {
  if (listedAt === null) return 365;
  const ms = Date.parse(asOf + 'T00:00:00Z') - Date.parse(listedAt + 'T00:00:00Z');
  return Math.max(0, Math.round(ms / 86_400_000));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function effectiveTvl(tvl: number): number {
  if (tvl <= TVL_SOFT_CAP_USD) return tvl;
  return TVL_SOFT_CAP_USD + (tvl - TVL_SOFT_CAP_USD) * TVL_SOFT_CAP_TAIL;
}

export function scoreProtocol(p: SnapshotProtocol, asOf: string): Omit<BoardRow, 'rank' | 'farm_steps'> {
  const age = ageDays(asOf, p.listed_at);
  const base = BASE_MULTIPLES[p.category ?? ''] ?? DEFAULT_BASE_MULTIPLE;
  const growthPct = p.change_7d ?? 0;
  const growthMultiplier = 1 + clamp(growthPct, -20, 25) / 100;
  const ageMultiplier = 0.85 + 0.15 * (Math.min(age, AGE_FULL_DAYS) / AGE_FULL_DAYS);
  const chainMultiplier = 0.95 + 0.05 * (Math.min(p.chains.length, 5) / 5);
  const effTvl = effectiveTvl(p.tvl_usd);
  const implied = Math.max(1, Math.round(effTvl * base * growthMultiplier * ageMultiplier * chainMultiplier));
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: age,
    implied_value_usd: implied,
    model: {
      base_multiple: base,
      growth_pct: p.change_7d,
      growth_multiplier: Math.round(growthMultiplier * 10000) / 10000,
      age_multiplier: Math.round(ageMultiplier * 10000) / 10000,
      chain_multiplier: Math.round(chainMultiplier * 10000) / 10000,
      effective_tvl_usd: Math.round(effTvl),
    },
  };
}

function depositVerb(category: string | null): string {
  switch (category) {
    case 'Dexs':
    case 'Basis Trading':
      return 'trade';
    case 'CDP':
    case 'Collateral Markets':
      return 'borrow against collateral';
    case 'RWA':
      return 'hold a tokenized position';
    default:
      return 'deposit';
  }
}

/** Six farm steps per protocol: fresh wallet, open a position, weekly activity, hold, claim, log. */
export function farmSteps(row: Omit<BoardRow, 'rank' | 'farm_steps'>): string[] {
  const name = row.name;
  const chain = row.chains[0] ?? 'its main chain';
  const verb = depositVerb(row.category);
  return [
    `Open a fresh wallet that holds only the funds you plan to farm with ${name}, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`,
    `${verb === 'deposit' ? 'Deposit' : verb === 'trade' ? 'Trade' : verb === 'borrow against collateral' ? 'Borrow' : 'Open'} $150 into ${name} on ${chain} and keep the position open. Cost: $150 of capital and about $8 of gas. Time: 15 minutes to set up.`,
    `Do one qualifying action each week on ${name}, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least 30 days so the activity is counted in more than one snapshot. Cost: the $150 stays in the position. Time: 30 days.`,
    `Before you withdraw, open ${name}'s own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`,
  ];
}

export interface BoardBuild {
  rows: BoardRow[];
  watchlistSize: number;
  earlySize: number;
  asOf: string;
  source: string;
  floorUsd: number;
}

/**
 * Build the board: every watchlist protocol, plus the best-scoring eligible
 * pre-token protocols below the floor, up to `targetRows` rows in all.
 */
export function buildBoard(snapshot: Snapshot, targetRows = 200): BoardBuild {
  const watchlist = new Set(snapshot.watchlist);
  // The house watchlist is authoritative: every one of its 40 protocols is
  // on the board, whatever category it carries. The wrapped/staked exclusion
  // applies only to the early rows we add ourselves below the floor.
  const scored = snapshot.protocols
    .filter((p) => recordsNoToken(p))
    .map((p) => ({
      protocol: p,
      row: scoreProtocol(p, snapshot.as_of),
    }));
  scored.sort((a, b) => b.row.implied_value_usd - a.row.implied_value_usd);

  const picked: (Omit<BoardRow, 'rank' | 'farm_steps'>)[] = [];
  const pickedSlugs = new Set<string>();
  for (const item of scored) {
    if (watchlist.has(item.row.slug)) {
      picked.push(item.row);
      pickedSlugs.add(item.row.slug);
    }
  }
  for (const item of scored) {
    if (picked.length >= targetRows) break;
    if (pickedSlugs.has(item.row.slug)) continue;
    if (item.row.tvl_usd >= snapshot.floor_usd) continue;
    if (isWrappedOrVersioned(item.protocol)) continue;
    picked.push(item.row);
    pickedSlugs.add(item.row.slug);
  }
  picked.sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  const rows: BoardRow[] = picked.map((row, i) => ({
    ...row,
    rank: i + 1,
    farm_steps: farmSteps(row),
  }));
  return {
    rows,
    watchlistSize: snapshot.watchlist.length,
    earlySize: rows.length - snapshot.watchlist.length,
    asOf: snapshot.as_of,
    source: snapshot.source,
    floorUsd: snapshot.floor_usd,
  };
}
