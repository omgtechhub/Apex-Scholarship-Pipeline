import axios from 'axios';
import { BaseCrawler, type CrawlerConfig } from '../base-crawler';
import type { ExtractedScholarship } from '../../types';

const BASE_URL = 'https://www2.daad.de';

/*
 * DAAD publishes its scholarship database as a set of sibling TAFFY payloads
 * under one bundle path, not as one blob. The listing alone carries no
 * deadlines and no human-readable labels - those live in the companions below,
 * and ignoring them is what produced a public catalogue with no deadline on a
 * single entry and every degree level wrong.
 *
 *   scholarships.js  the programmes themselves
 *   deadlines.js     application deadline prose, keyed by sapProgid
 *   status.js        legend for `status[]`  (target group -> label)
 *   subjectgroups.js legend for `subjectGrps[]` (letter code -> subject name)
 *
 * intentions.js and origin.js also exist. origin is a ~200-entry country code
 * list that is open to nearly everyone on most programmes, so rendering it
 * tells an applicant nothing; intentions duplicates what the title already
 * says. Both are deliberately left alone.
 */
const DATA_BASE = `${BASE_URL}/bundles/daadstipendiendatenbanklsh/data/a/js`;
const SCHOLARSHIPS_URL = `${DATA_BASE}/scholarships.js`;
const DEADLINES_URL = `${DATA_BASE}/deadlines.js`;
const STATUS_URL = `${DATA_BASE}/status.js`;
const SUBJECT_GROUPS_URL = `${DATA_BASE}/subjectgroups.js`;

const DETAIL_BASE_URL = `${BASE_URL}/deutschland/stipendium/datenbank/en/21148-scholarship-database/`;

/*
 * DAAD's own permanent shortlink for one programme.
 *
 * The previous officialUrl was `${DETAIL_BASE_URL}?detail=${item.id}`, and it
 * 404'd on every single DAAD entry on the live site. Two reasons, and only the
 * second is obvious: `?detail=` wants the programme's **sapProgid**
 * (e.g. 10000092), not the payload's own small `id` (e.g. 94), and the adapter
 * passed the latter. Verified today: ?detail=94 -> 404, ?detail=10000092 -> 200.
 *
 * Using /go/en/stipa<sapProgid> rather than the raw query URL is a hedge
 * against the next UI change: it is the link DAAD publishes for sharing, and it
 * still resolves correctly to the current database route. The thing that rotted
 * here was a deep link, so prefer the one DAAD maintains.
 */
export function officialUrlFor(sapProgid: number | string): string {
  return `https://www.daad.de/go/en/stipa${sapProgid}`;
}

/**
 * DAAD target group -> our DegreeLevel enum.
 *
 * Keyed on the English label from status.js rather than its numeric id, so a
 * renumbering upstream cannot silently re-point the mapping. The ids are not
 * in the order anyone would guess, which is exactly how the old hardcoded
 * `status.includes(3) -> PHD` ladder came to mislabel every entry:
 *
 *   id 1 Undergraduates                  id 2 Postdoctoral researchers
 *   id 3 Graduates                       id 4 Doctoral candidates/PhD students
 *   id 5 Faculty
 *
 * The old ladder read 3 as PHD, 2 as MASTERS and 4 as POSTDOCTORAL - so
 * master's programmes were advertised as doctorates, doctorates as postdocs,
 * and postdocs as master's.
 *
 * "Graduates" is mapped here rather than inferred by normalizeDegreeLevel,
 * which deliberately refuses to guess from the bare word: DAAD means
 * "holds a first degree, applying for a master's", while other sources use it
 * for any post-bachelor level. The adapter knows its own source; the shared
 * normaliser should not have to.
 *
 * Faculty is not a degree level at all, so it maps to null and is excluded
 * from the calculation rather than being forced into a bucket.
 */
const DAAD_TARGET_GROUP_TO_DEGREE: Record<string, string | null> = {
  'undergraduates': 'UNDERGRADUATE',
  'graduates': 'MASTERS',
  'doctoral candidates/phd students': 'PHD',
  'postdoctoral researchers': 'POSTDOCTORAL',
  'faculty': null,
};

/** Fallback id -> label, used only if status.js cannot be fetched. */
const STATUS_ID_FALLBACK: Record<number, string> = {
  1: 'undergraduates',
  2: 'postdoctoral researchers',
  3: 'graduates',
  4: 'doctoral candidates/phd students',
  5: 'faculty',
};

/** Fallback subject code -> name, used only if subjectgroups.js cannot be fetched. */
const SUBJECT_GROUP_FALLBACK: Record<string, string> = {
  A: 'Agriculture, Forestry and Nutrition',
  B: 'Law, Economics and Social Sciences',
  C: 'Mathematics and Natural Sciences',
  D: 'Human Medicine',
  E: 'Language and Cultural Studies',
  F: 'Engineering',
  G: 'Art, Music and Sport',
};

const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december';

/**
 * Pull an unambiguous calendar date out of DAAD's deadline prose, or nothing.
 *
 * Only 38 of 147 programmes carry deadline text, and it is free prose rather
 * than a date field: "31 August 2026", but also "17th March" with no year,
 * "9th October for visits beginning between April and September", and
 * "Applications can only be submitted via the online portal of the Argentinian
 * Ministry of Education."
 *
 * Anything without an explicit day, month AND year is left null on purpose. A
 * guessed year on a scholarship deadline is worse than a blank one: the site
 * renders a passed deadline in red and the validation worker expires entries
 * it finds past deadline, so a bad guess either scares applicants off a live
 * award or quietly archives it. The full prose is preserved in
 * applicationInstructions either way, so nothing is lost by declining to guess.
 *
 * The substring is extracted here rather than handing the whole paragraph to
 * parseDate, because parseDate opens with `new Date(s)` on the raw string and
 * a loose parser given a paragraph can return a date that appears nowhere in it.
 */
export function extractExplicitDeadline(text: string): string | null {
  if (!text) return null;
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  const dayMonthYear = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\s+(\\d{4})\\b`,
    'i'
  );
  const monthDayYear = new RegExp(
    `\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
    'i'
  );
  const isoDate = /\b\d{4}-\d{2}-\d{2}\b/;

  for (const re of [dayMonthYear, monthDayYear, isoDate]) {
    const m = plain.match(re);
    if (m) {
      // Strip ordinal suffixes; parseDate's patterns expect "31 August 2026".
      return m[0].replace(/(\d{1,2})(st|nd|rd|th)/i, '$1');
    }
  }
  return null;
}

/**
 * Collapse DAAD's multi-value target group into one DegreeLevel.
 *
 * `status` is an array: [2,3,4] means the award is open to master's, doctoral
 * and postdoctoral applicants at once. The old code returned the first match in
 * a hardcoded ladder, so a programme open to three levels was advertised as
 * whichever one the ladder happened to test first. Several distinct levels is
 * what ANY is for; one level reports that level.
 *
 * Module-level and exported so the mapping can be tested without a network
 * round-trip to DAAD.
 */
export function degreeFromDaadStatus(
  status: number[] | undefined,
  labels: Map<number, string>
): string {
  if (!Array.isArray(status) || status.length === 0) return 'UNKNOWN';

  const levels = new Set<string>();
  for (const id of status) {
    const label = labels.get(id);
    if (!label) continue;
    const level = DAAD_TARGET_GROUP_TO_DEGREE[label];
    if (level) levels.add(level);
  }

  if (levels.size === 0) return 'UNKNOWN';
  if (levels.size === 1) return [...levels][0];
  return 'ANY';
}

/** The documented id -> label legend, for callers that cannot fetch status.js. */
export function daadStatusLabels(): Map<number, string> {
  return new Map(Object.entries(STATUS_ID_FALLBACK).map(([id, label]) => [Number(id), label]));
}

/** Parse a `var x = TAFFY([...]);` payload into plain objects. */
function parseTaffy<T>(body: unknown): T[] {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const match = raw.match(/TAFFY\(([\s\S]+)\)/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1].replace(/\);?\s*$/, ''));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** DAAD's imperia firewall serves the data payloads to curl but not to browsers. */
const CURL_HEADERS = { 'User-Agent': 'curl/8.4.0', Accept: '*/*' };

interface DaadScholarship {
  id?: number;
  sapObjid?: number;
  sapProgid?: number;
  nameEn?: string;
  nameDe?: string;
  programmnameEn?: string;
  programmnameDe?: string;
  introduction?: Record<string, string>;
  status?: number[];
  subjectGrps?: string[];
  isDaad?: number;
}

interface DaadDeadline {
  id?: number;
  general?: Record<string, string>;
}

export class DAADAdapter extends BaseCrawler {
  constructor(config: Partial<CrawlerConfig> & { sourceId: string }) {
    super({
      baseUrl: BASE_URL,
      timeout: 30000,
      ...config,
    });
  }

  /**
   * Maximum programmes to emit per crawl; override with `maxItems` in the
   * source's `config` column.
   *
   * Capped because the ceiling here is not crawl time but article generation:
   * each programme emitted becomes an AI article on a rate-limited free tier,
   * and the feed carries 147. The cap has always been 25, which is why the
   * site shows 25 DAAD entries out of 147 available — raising it is a quota
   * decision, so it is configurable rather than hardcoded.
   *
   * CrawlerManager passes `config` through at runtime but CrawlerConfig does
   * not declare it (the manager casts), hence the cast here.
   */
  private get maxItems(): number {
    const extra = (this.config as CrawlerConfig & { config?: Record<string, unknown> }).config;
    const configured = Number(extra?.maxItems);
    return Number.isFinite(configured) && configured > 0 ? configured : 25;
  }

  private async fetchPayload<T>(url: string): Promise<T[]> {
    const res = await axios.get(url, { headers: CURL_HEADERS, timeout: this.config.timeout ?? 30000 });
    return parseTaffy<T>(res.data);
  }

  /** A companion legend failing should degrade one field, not kill the crawl. */
  private async fetchPayloadSafe<T>(url: string): Promise<T[]> {
    try {
      return await this.fetchPayload<T>(url);
    } catch (err) {
      this.logger.warn({ url, err: (err as Error).message }, 'DAAD companion payload unavailable — using fallback');
      return [];
    }
  }

  async extract(): Promise<ExtractedScholarship[]> {
    const scholarships: ExtractedScholarship[] = [];

    try {
      const [items, deadlines, statuses, subjects] = await Promise.all([
        this.fetchPayload<DaadScholarship>(SCHOLARSHIPS_URL),
        this.fetchPayloadSafe<DaadDeadline>(DEADLINES_URL),
        this.fetchPayloadSafe<{ id?: number; nameEn?: string }>(STATUS_URL),
        this.fetchPayloadSafe<{ code?: string; nameEn?: string }>(SUBJECT_GROUPS_URL),
      ]);

      // sapProgid -> deadline prose
      const deadlineById = new Map<number, string>();
      for (const d of deadlines) {
        const text = d.general?.en?.trim();
        if (d.id != null && text) deadlineById.set(d.id, text);
      }

      // target-group id -> English label
      const statusLabel = new Map<number, string>();
      for (const s of statuses) {
        if (s.id != null && s.nameEn) statusLabel.set(s.id, s.nameEn.toLowerCase().trim());
      }
      if (statusLabel.size === 0) {
        for (const [id, label] of Object.entries(STATUS_ID_FALLBACK)) {
          statusLabel.set(Number(id), label);
        }
      }

      // subject letter code -> subject name
      const subjectName = new Map<string, string>();
      for (const s of subjects) {
        if (s.code && s.nameEn) subjectName.set(s.code.toUpperCase(), s.nameEn);
      }
      if (subjectName.size === 0) {
        for (const [code, name] of Object.entries(SUBJECT_GROUP_FALLBACK)) {
          subjectName.set(code, name);
        }
      }

      for (const item of items) {
        const title = item.nameEn || item.nameDe || item.programmnameEn || item.programmnameDe;
        if (!title || title.length < 5) continue;

        const sapProgid = item.sapProgid ?? item.sapObjid;
        if (!sapProgid) continue;

        const deadlineText = deadlineById.get(sapProgid) ?? '';

        scholarships.push({
          title,
          organization:
            item.isDaad === 1 ? 'DAAD - German Academic Exchange Service' : 'DAAD Partner Organisation',
          description: this.buildDescription(item, title),
          officialUrl: officialUrlFor(sapProgid),
          country: 'Germany',
          eligibleCountries: [],
          degreeLevel: this.degreeFromStatus(item.status, statusLabel),
          fieldsOfStudy: this.subjectsFrom(item.subjectGrps, subjectName),
          fundingType: 'FULL',
          deadline: extractExplicitDeadline(deadlineText) ?? undefined,
          applicationInstructions: deadlineText || undefined,
          benefits: [
            'Monthly scholarship allowance',
            'Health, accident and personal liability insurance cover',
            'Travel allowance',
            'One-off study allowance',
          ],
          requirements: [
            "Bachelor's degree or higher",
            'Above-average academic record',
            'German or English language proficiency',
          ],
          raw: {
            source: 'daad-official-database',
            id: item.id,
            sapObjid: item.sapObjid,
            sapProgid,
            hasDeadlineText: Boolean(deadlineText),
          },
        });

        if (scholarships.length >= this.maxItems) break;
      }
    } catch (err) {
      this.recordError((err as Error).message, SCHOLARSHIPS_URL);
    }

    // Fallback to Playwright if the static database payload fails entirely.
    if (scholarships.length === 0) {
      const html = await this.fetchWithPlaywright(DETAIL_BASE_URL).catch(() => null);
      if (html) {
        const $ = this.load(html);
        const mainTitle = $('h1').first().text().trim() || 'DAAD Scholarship Database';
        const mainDesc = $('meta[name="description"]').attr('content') ?? $('p').first().text().trim();

        if (mainTitle && !mainTitle.toLowerCase().includes('403') && !mainTitle.toLowerCase().includes('forbidden')) {
          scholarships.push({
            title: mainTitle,
            organization: 'DAAD - German Academic Exchange Service',
            description: mainDesc || 'DAAD Scholarship Database for study and research in Germany.',
            officialUrl: DETAIL_BASE_URL,
            country: 'Germany',
            eligibleCountries: [],
            degreeLevel: 'ANY',
            fundingType: 'FULL',
            raw: { source: 'daad-fallback' },
          });
        }
      }
    }

    this.logger.info({ count: scholarships.length }, 'DAAD adapter extracted scholarships');
    return scholarships;
  }

  /**
   * Prefer DAAD's own prose over a sentence assembled from the title.
   *
   * Every entry used to get `"${title}. Official DAAD Scholarship Programme for
   * international students, doctoral candidates, and researchers in Germany."`
   * - the same sentence 25 times with the name swapped, which is what the
   *   public site has been showing. `introduction.en` is filled on all 147
   *   programmes and actually describes the award. The template survives only
   *   as a fallback.
   */
  private buildDescription(item: DaadScholarship, title: string): string {
    const intro = item.introduction?.en?.trim() || item.introduction?.de?.trim();
    if (intro) {
      const clean = intro.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean.length > 40) return clean;
    }
    return `${title}. Official DAAD Scholarship Programme for international students, doctoral candidates, and researchers in Germany.`;
  }

  /**
   * Collapse DAAD's multi-value target group into one DegreeLevel.
   *
   * `status` is an array: [2,3,4] means the award is open to master's, doctoral
   * and postdoctoral applicants at once. The old code returned the first match
   * in a hardcoded ladder, so a programme open to three levels was advertised
   * as whichever one the ladder happened to test first. Several distinct levels
   * is what ANY is for; one level reports that level.
   */
  private degreeFromStatus(status: number[] | undefined, labels: Map<number, string>): string {
    return degreeFromDaadStatus(status, labels);
  }

  /** Letter codes -> subject names; A-G filled on every programme. */
  private subjectsFrom(codes: string[] | undefined, names: Map<string, string>): string[] {
    if (!Array.isArray(codes)) return [];
    const out: string[] = [];
    for (const code of codes) {
      const name = names.get(String(code).toUpperCase());
      if (name && !out.includes(name)) out.push(name);
    }
    /*
     * All seven groups means "any subject", which is more useful to a reader as
     * a single phrase than as a seven-item list that fills the card.
     */
    if (names.size > 0 && out.length === names.size) return ['All subjects'];
    return out;
  }
}
