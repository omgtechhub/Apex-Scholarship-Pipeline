import { describe, it, expect } from 'vitest';
import {
  isListingUrl,
  isSectionTitle,
} from '../pipeline/crawler/adapters/opportunities-for-africans.adapter';

/*
 * Regression guard for a scholarship that was not one.
 *
 * The OFA listing selector includes `[class*="scholarship"]`, which on a
 * WordPress archive page also matches the page's own section wrapper. The first
 * <a> inside it is the category link, so the crawler produced an entry titled
 * "Scholarships" pointing at
 * https://opportunitiesforafricans.com/category/scholarships/. It reached the
 * live site, had an AI article written about it, and was published.
 *
 * It was rejected by hand on 17 Nov 2026 and the next crawl recreated it
 * immediately — which is why the guard has to live in the adapter and why these
 * tests exist.
 */

const LISTING_URLS = [
  'https://opportunitiesforafricans.com/scholarships/',
  'https://opportunitiesforafricans.com/scholarships/fully-funded-scholarships/',
  'https://opportunitiesforafricans.com/category/scholarships/',
];

describe('isListingUrl', () => {
  it('rejects the exact URL that caused the incident', () => {
    expect(
      isListingUrl('https://opportunitiesforafricans.com/category/scholarships/', LISTING_URLS)
    ).toBe(true);
  });

  it('rejects the pages the crawler starts from', () => {
    for (const url of LISTING_URLS) {
      expect(isListingUrl(url, LISTING_URLS)).toBe(true);
    }
  });

  it('rejects taxonomy and pagination paths', () => {
    const base = 'https://opportunitiesforafricans.com';
    for (const path of ['/category/fellowships/', '/tag/nigeria/', '/author/admin/', '/page/3/', '/feed/']) {
      expect(isListingUrl(base + path, LISTING_URLS)).toBe(true);
    }
  });

  it('rejects a bare section path', () => {
    expect(isListingUrl('https://opportunitiesforafricans.com/scholarships', LISTING_URLS)).toBe(true);
    expect(isListingUrl('https://opportunitiesforafricans.com/', LISTING_URLS)).toBe(true);
  });

  it('accepts real post permalinks', () => {
    expect(
      isListingUrl(
        'https://opportunitiesforafricans.com/chevening-scholarships-2027-for-developing-countries/',
        LISTING_URLS
      )
    ).toBe(false);
    expect(
      isListingUrl('https://opportunitiesforafricans.com/mastercard-foundation-scholars-program/', LISTING_URLS)
    ).toBe(false);
  });

  it('treats an unparseable URL as unusable rather than throwing', () => {
    expect(isListingUrl('not a url', LISTING_URLS)).toBe(true);
  });
});

describe('isSectionTitle', () => {
  it('rejects the heading that caused the incident', () => {
    expect(isSectionTitle('Scholarships')).toBe(true);
  });

  it('rejects other bare section headings, whatever the punctuation', () => {
    for (const t of ['scholarship', 'Fully Funded Scholarships', 'Opportunities', 'Fellowships', '  Grants  ', 'Latest Scholarships']) {
      expect(isSectionTitle(t)).toBe(true);
    }
  });

  it('rejects an empty or punctuation-only title', () => {
    expect(isSectionTitle('')).toBe(true);
    expect(isSectionTitle('—')).toBe(true);
  });

  it('accepts real award names that contain the category word', () => {
    // The guard must not be so eager that it drops genuine entries, which
    // almost always carry the word "scholarship" alongside a programme name.
    expect(isSectionTitle('Chevening Scholarships 2027 for Developing Countries')).toBe(false);
    expect(isSectionTitle('Mastercard Foundation Scholars Program')).toBe(false);
    expect(isSectionTitle('DAAD Scholarship for Masters Students')).toBe(false);
  });
});
