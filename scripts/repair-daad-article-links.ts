/*
 * Repair dead DAAD links baked into already-generated article prose and JSON-LD.
 *
 * WHY THIS EXISTS
 * ---------------
 * Fixing the adapter fixes `scholarships.officialUrl`, and scripts/backfill-daad.ts
 * pushes that to the rows already stored. Neither touches the articles, and the
 * articles quote the URL they were handed at generation time — so after the
 * backfill a live scholarship page showed the working link in its sidebar and
 * the 404 in its body.
 *
 * Measured before this ran: 28 published articles carrying 44 occurrences, plus
 * 28 article_seo rows with the dead URL inside `jsonLd`. The JSON-LD matters
 * most: it is the structured data search engines read, so a 404 in there is a
 * machine-readable claim that the official page is somewhere it is not.
 *
 * The rewrite is address-for-address on the SAME programme — the old URL's
 * `?detail=<payload id>` and the new `/go/en/stipa<sapProgid>` resolve to one
 * DAAD page — so the prose keeps its meaning. Nothing else in the content is
 * altered.
 *
 * Newly generated articles do not need this: they inherit the corrected
 * officialUrl from the adapter. This is a one-off repair of the October batch.
 *
 * USAGE
 *   DRY=1 PIPELINE_DATABASE_URL="postgres://..." npx tsx scripts/repair-daad-article-links.ts
 *         PIPELINE_DATABASE_URL="postgres://..." npx tsx scripts/repair-daad-article-links.ts
 */
import 'dotenv/config';
import axios from 'axios';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { officialUrlFor } from '../src/pipeline/crawler/adapters/daad.adapter';

const DRY = process.env.DRY === '1';

const SCHOLARSHIPS_URL =
  'https://www2.daad.de/bundles/daadstipendiendatenbanklsh/data/a/js/scholarships.js';
const DEAD_PREFIX =
  'https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/?detail=';

function connectionString(): string {
  const url = process.env.PIPELINE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set PIPELINE_DATABASE_URL (or DATABASE_URL).');
  return url;
}

/** payload id -> sapProgid, straight from the live feed. */
async function idToSapProgid(): Promise<Map<string, number>> {
  const res = await axios.get(SCHOLARSHIPS_URL, {
    headers: { 'User-Agent': 'curl/8.4.0', Accept: '*/*' },
    timeout: 30000,
  });
  const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  const items = JSON.parse(raw.match(/TAFFY\(([\s\S]+)\)/)![1].replace(/\);?\s*$/, '')) as Array<{
    id?: number;
    sapProgid?: number;
    sapObjid?: number;
  }>;
  const map = new Map<string, number>();
  for (const it of items) {
    const target = it.sapProgid ?? it.sapObjid;
    if (it.id != null && target != null) map.set(String(it.id), target);
  }
  return map;
}

/** Replace every dead DAAD detail URL, returning the new text and a count. */
function rewrite(text: string, map: Map<string, number>): { out: string; n: number } {
  let n = 0;
  const out = text.replace(
    /https:\/\/www2\.daad\.de\/deutschland\/stipendium\/datenbank\/en\/21148-scholarship-database\/\?detail=(\d+)/g,
    (whole, id: string) => {
      const sapProgid = map.get(id);
      if (!sapProgid) return whole; // unknown id: leave it rather than guess
      n++;
      return officialUrlFor(sapProgid);
    }
  );
  return { out, n };
}

async function main() {
  const url = connectionString();
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('neon.tech') || url.includes('sslmode=') ? { rejectUnauthorized: true } : undefined,
    allowExitOnIdle: true,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  console.log(DRY ? '=== DRY RUN — nothing will be written ===' : '=== APPLYING ===');

  const map = await idToSapProgid();
  console.log(`DAAD feed: ${map.size} payload-id -> sapProgid pairs\n`);

  // --- article bodies ---
  const articles = await prisma.article.findMany({
    where: { status: 'PUBLISHED', content: { contains: DEAD_PREFIX } },
    select: { id: true, slug: true, content: true },
  });

  let bodyLinks = 0;
  for (const a of articles) {
    const { out, n } = rewrite(a.content, map);
    if (n === 0) continue;
    bodyLinks += n;
    console.log(`  content  ${a.slug.slice(0, 50).padEnd(50)} ${n} link(s)`);
    if (!DRY) {
      await prisma.article.update({ where: { id: a.id }, data: { content: out } });
    }
  }

  // --- JSON-LD ---
  const seos = await prisma.articleSEO.findMany({ select: { id: true, articleId: true, jsonLd: true } });

  let seoLinks = 0;
  let seoRows = 0;
  for (const seo of seos) {
    if (seo.jsonLd == null) continue;
    const text = JSON.stringify(seo.jsonLd);
    if (!text.includes(DEAD_PREFIX)) continue;
    const { out, n } = rewrite(text, map);
    if (n === 0) continue;
    seoLinks += n;
    seoRows++;
    console.log(`  jsonLd   article ${seo.articleId.slice(0, 8)}…${' '.repeat(34)} ${n} link(s)`);
    if (!DRY) {
      await prisma.articleSEO.update({ where: { id: seo.id }, data: { jsonLd: JSON.parse(out) } });
    }
  }

  console.log(
    `\n${DRY ? 'would rewrite' : 'rewrote'}: ${bodyLinks} link(s) in ${articles.length} article bodies, ` +
      `${seoLinks} link(s) in ${seoRows} jsonLd rows`
  );

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
