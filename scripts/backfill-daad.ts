/*
 * Re-sync already-stored DAAD scholarships from the live DAAD feeds.
 *
 * WHY THIS EXISTS
 * ---------------
 * Adapter fixes only change what the NEXT crawl writes. When the crawler is
 * not running — as it was not between 19 Aug and 17 Nov 2026 — a fix to the
 * extraction logic has no effect on what the public site serves, because the
 * rows were written by the old code and nothing is going to rewrite them.
 *
 * This script closes that gap: it re-runs the DAAD adapter, matches each live
 * row by the DAAD payload id it already stores in `raw->>'id'`, and updates
 * only the fields the adapter is authoritative about.
 *
 * It deliberately does NOT touch `title` or `slug`. The slug is the public URL
 * on altivance.com.ng and the generated articles are keyed to it, so changing
 * it would 404 every indexed page.
 *
 * USAGE
 *   DRY=1 PIPELINE_DATABASE_URL="postgres://..." npx tsx scripts/backfill-daad.ts
 *         PIPELINE_DATABASE_URL="postgres://..." npx tsx scripts/backfill-daad.ts
 *
 * Falls back to DATABASE_URL when PIPELINE_DATABASE_URL is unset. Always run
 * DRY=1 first and read the diff: this writes to whatever database the URL
 * points at, which is normally production.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { DAADAdapter } from '../src/pipeline/crawler/adapters/daad.adapter';
import { normalizeScholarship } from '../src/pipeline/processing/normalizer';

const DRY = process.env.DRY === '1';

/** Every DAAD programme in the feed, so any stored row can be matched. */
const FEED_LIMIT = 500;

function connectionString(): string {
  const url = process.env.PIPELINE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Set PIPELINE_DATABASE_URL (or DATABASE_URL) to the pipeline database you want to backfill.'
    );
  }
  return url;
}

async function main() {
  const url = connectionString();
  const pool = new Pool({
    connectionString: url,
    // Neon requires TLS; a local Postgres URL carries neither marker.
    ssl: url.includes('neon.tech') || url.includes('sslmode=') ? { rejectUnauthorized: true } : undefined,
    allowExitOnIdle: true,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  console.log(DRY ? '=== DRY RUN — nothing will be written ===' : '=== APPLYING ===');

  const adapter = new DAADAdapter({ sourceId: 'backfill', config: { maxItems: FEED_LIMIT } } as never);
  const extracted = await adapter.extract();
  const normalized = extracted.map((s) => normalizeScholarship(s, 'backfill'));

  const byPayloadId = new Map<string, (typeof normalized)[number]>();
  extracted.forEach((e, i) => {
    const id = (e.raw as Record<string, unknown> | undefined)?.id;
    if (id != null) byPayloadId.set(String(id), normalized[i]);
  });
  console.log(`DAAD feed: ${normalized.length} programmes keyed by payload id`);

  const rows = await prisma.scholarship.findMany({
    where: {
      status: { in: ['ACTIVE', 'EXPIRED'] },
      articles: { some: { status: 'PUBLISHED' } },
    },
    select: { id: true, title: true, slug: true, raw: true, degreeLevel: true, fundingType: true },
  });
  console.log(`live rows: ${rows.length}\n`);

  let updated = 0;
  let unmatched = 0;

  for (const row of rows) {
    const raw = (row.raw ?? {}) as Record<string, unknown>;

    /*
     * Non-DAAD sources: the only field the normaliser was destroying for them
     * is fundingType. Both the Chevening and Commonwealth adapters emit 'FULL'
     * and both rows read UNKNOWN, so this restores the adapter's own value
     * rather than making an editorial judgement about the award.
     */
    if (String(raw.source ?? '') !== 'daad-official-database') {
      if (row.fundingType === 'UNKNOWN') {
        console.log(`  ${row.slug.slice(0, 46).padEnd(46)} fundingType UNKNOWN -> FULL`);
        if (!DRY) {
          await prisma.scholarship.update({ where: { id: row.id }, data: { fundingType: 'FULL' } });
        }
        updated++;
      }
      continue;
    }

    const fresh = byPayloadId.get(String(raw.id));
    if (!fresh) {
      console.log(`  UNMATCHED (payload id ${String(raw.id)}): ${row.title.slice(0, 50)}`);
      unmatched++;
      continue;
    }

    const bits: string[] = [];
    if (row.degreeLevel !== fresh.degreeLevel) bits.push(`degree ${row.degreeLevel}->${fresh.degreeLevel}`);
    if (row.fundingType !== fresh.fundingType) bits.push(`funding ${row.fundingType}->${fresh.fundingType}`);
    if (fresh.deadline) bits.push(`deadline ${fresh.deadline.toISOString().slice(0, 10)}`);
    if (fresh.applicationInstructions) bits.push('deadline prose');
    if (fresh.fieldsOfStudy.length) bits.push(`${fresh.fieldsOfStudy.length} subject(s)`);
    bits.push('url', 'description');
    console.log(`  ${row.slug.slice(0, 46).padEnd(46)} ${bits.join(', ')}`);

    if (!DRY) {
      await prisma.scholarship.update({
        where: { id: row.id },
        data: {
          officialUrl: fresh.officialUrl,
          applicationUrl: fresh.officialUrl,
          description: fresh.description,
          degreeLevel: fresh.degreeLevel as never,
          fundingType: fresh.fundingType as never,
          fieldsOfStudy: fresh.fieldsOfStudy,
          deadline: fresh.deadline,
          applicationInstructions: fresh.applicationInstructions || null,
          // Recomputed so the next crawl's change-detection guard does not see
          // a spurious diff and queue a needless regeneration.
          contentHash: fresh.contentHash,
        },
      });
    }
    updated++;
  }

  console.log(`\n${DRY ? 'would update' : 'updated'}: ${updated}   unmatched: ${unmatched}`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
