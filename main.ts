// Token Radar entrypoint (Node 22+, standard library only).
// Reads input/snapshot.json, ranks the protocols that record no token,
// and writes out/board.json, out/dashboard/data.js and out/dossier.json,
// copying dashboard/ and screenshots/ into out/.
//
// Usage: node main.ts            (run from this repository's root)

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, MODEL_VERSION, type BoardRow } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'out');

function money(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1_000)}K`;
}

function main(): void {
  const snapshot = JSON.parse(readFileSync(join(ROOT, 'input', 'snapshot.json'), 'utf8'));
  const board = buildBoard(snapshot, 200);
  const rows: BoardRow[] = board.rows;

  mkdirSync(OUT, { recursive: true });
  mkdirSync(join(OUT, 'dashboard'), { recursive: true });
  mkdirSync(join(OUT, 'screenshots'), { recursive: true });

  // The ranked board, the entry's core artifact.
  const boardJson = JSON.stringify({ rows }, null, 1);
  writeFileSync(join(OUT, 'board.json'), boardJson + '\n');
  writeFileSync(join(ROOT, 'board.json'), boardJson + '\n');

  // The dashboard's data: compact rows (farm steps live in board.json and
  // the page fetches them; keeping data.js small keeps the dossier readable).
  const compact = rows.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    implied_value_usd: r.implied_value_usd,
    age_days: r.age_days,
    listed_at: r.listed_at,
  }));
  const dataJs =
    `window.RADAR_WATCHLIST=${JSON.stringify(snapshot.watchlist)};\n` +
    `window.RADAR=${JSON.stringify({
      as_of: board.asOf,
      source: board.source,
      floor_usd: board.floorUsd,
      model_version: MODEL_VERSION,
      watchlist_size: board.watchlistSize,
      board_size: rows.length,
      early_size: board.earlySize,
      rows: compact,
    })};\n`;
  writeFileSync(join(ROOT, 'dashboard', 'data.js'), dataJs);
  writeFileSync(join(OUT, 'dashboard', 'data.js'), dataJs);
  writeFileSync(join(ROOT, 'data.js'), dataJs);

  // The dashboard page and the screenshots, copied into out/ as the
  // competition's layout requires.
  cpSync(join(ROOT, 'dashboard'), join(OUT, 'dashboard'), { recursive: true });
  if (existsSync(join(ROOT, 'screenshots'))) {
    cpSync(join(ROOT, 'screenshots'), join(OUT, 'screenshots'), { recursive: true });
  }

  // The dossier, built by the kit's own library from out/'s dashboard and
  // screenshots. Caps are the gate's: 64 KiB of text, at most 3 screenshots
  // of at most 512 KiB, dashboard at most 400 files / 4 MiB.
  const dossier = buildDossier(OUT, {
    text_max_bytes: 65536,
    screenshots: { max: 3, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4 * 1024 * 1024 },
  });
  writeFileSync(join(OUT, 'dossier.json'), dossier);
  writeFileSync(join(ROOT, 'dossier.json'), dossier);

  const totalImplied = rows.reduce((n, r) => n + r.implied_value_usd, 0);
  console.log(`Token Radar ${MODEL_VERSION} — snapshot ${board.asOf}`);
  console.log(`board: ${rows.length} rows (${board.watchlistSize} watchlist + ${board.earlySize} early), total implied value ${money(totalImplied)}`);
  for (const r of rows.slice(0, 5)) {
    console.log(
      `  #${r.rank} ${r.name} — TVL ${money(r.tvl_usd)}, 7d ${r.change_7d ?? 'n/a'}%, implied ${money(r.implied_value_usd)}`,
    );
  }
  console.log(`wrote out/board.json, out/dashboard/data.js, out/dossier.json (${dossier.length} bytes)`);
}

main();
