# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yddh789/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yddh789/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the protocols that record no token yet by what their launch would be worth, each with the steps to farm it. Built by an AI agent for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC).

## The board

- **Snapshot:** DefiLlama protocols, fetched 2026-11-14 (`input/snapshot.json`, 758 protocols). "Records no token" means DefiLlama's record carries no token — it is not proof a protocol has none.
- **Board:** 177 rows — the whole 40-protocol watchlist (TVL ≥ $50M, no token, not a wrapped/staked product) plus the 137 other eligible pre-token protocols below the floor. (The snapshot holds only 177 protocols that pass the no-token, not-wrapped filters; bridges, centralized exchanges and liquid-staking products are left out on purpose.)
- **Top of the board:** Steakhouse Financial (~$2.75B TVL), Gauntlet (~$1.58B) and Veda (~$1.56B) — the three largest pre-token vault managers in the snapshot.

## The model (`lib/model.ts`, version radar-rebuild-3)

```
implied_value_usd = effective_tvl × base_multiple(category)
                      × growth_factor × age_factor × chain_factor
```

- **effective_tvl:** TVL soft-capped at $2B — past that point each extra dollar adds only a quarter as much, because a launch cannot scale its fully-diluted value linearly forever.
- **base_multiple:** what share of TVL a launch in that category is typically valued at — 0.22 for risk curators and capital allocators, 0.25 for DEXes, 0.18 for lending, 0.12 for RWA, 0.05 for stablecoin wrappers, 0.18 by default.
- **growth_factor:** `1 + clamp(change_7d, -20%, +25%) / 100` — rewards protocols still growing.
- **age_factor:** `0.85 + 0.15 × min(age_days, 730) / 730` — rewards time since listing, up to two years.
- **chain_factor:** `0.95 + 0.05 × min(chains, 5) / 5` — rewards a multi-chain footprint: TVL spread over several chains is stickier than TVL on one.

Wrapped, staked and bridged products (and versioned copies like `Foo V2`) are excluded: a wrapped product of a token that already trades is not a token that does not exist yet.

Each row carries a six-step farm plan: fresh wallet, open a $150 position, one qualifying action a week, hold at least 30 days, claim only from the protocol's own links, keep a farm log — each step with its cost and time.

## Run it

```sh
node main.ts
```

Node 22+, standard library only, no install. It reads `input/snapshot.json` and writes `out/board.json`, `out/dashboard/data.js`, copies `dashboard/` and `screenshots/` into `out/`, and writes `out/dossier.json` with the kit's `vendor/makefun-board.ts`.

## Files

| File | What it is |
| --- | --- |
| `main.ts` | Entrypoint: builds the board, the dashboard data and the dossier |
| `lib/model.ts` | The scoring model and the farm-step writer |
| `vendor/makefun-board.ts` | The kit's dossier library, byte for byte |
| `input/snapshot.json` | The frozen DefiLlama snapshot (2026-11-14) |
| `dashboard/` | The static dashboard: `index.html`, `app.css`, `app.js`, `data.js` |
| `screenshots/` | Board, detail and filtered views of the dashboard |
| `board.json`, `data.js`, `dossier.json` | Copies of the run's outputs at the root |

## The dashboard

Open `dashboard/index.html` (or `out/dashboard/` after a run). Search by name, filter by category or chain, sort by implied value, TVL, 7-day growth or age, tick "Watchlist only" for the 40, and click any row for its detail view and farm plan. No network: the page is static and local.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
