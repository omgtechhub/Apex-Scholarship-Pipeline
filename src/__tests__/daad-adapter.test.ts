import { describe, it, expect } from 'vitest';
import {
  extractExplicitDeadline,
  officialUrlFor,
  degreeFromDaadStatus,
  daadStatusLabels,
} from '../pipeline/crawler/adapters/daad.adapter';

/*
 * These are the three things the DAAD adapter got wrong on every one of the 25
 * entries it put on the live site, so they are the three things pinned here.
 * All pure functions — no network, no Playwright.
 */

describe('officialUrlFor', () => {
  it('builds a link from sapProgid, not the payload id', () => {
    // ?detail=94 (the payload `id`) 404s; ?detail=10000092 (sapProgid) is the
    // real programme. Every DAAD card on the live site used the former.
    expect(officialUrlFor(10000092)).toBe('https://www.daad.de/go/en/stipa10000092');
  });
});

describe('degreeFromDaadStatus', () => {
  const labels = daadStatusLabels();

  it('maps each DAAD target group to the right level', () => {
    // The ids are not in an intuitive order, which is what the old hardcoded
    // ladder tripped over: it read 3 as PHD, 2 as MASTERS and 4 as POSTDOCTORAL.
    expect(degreeFromDaadStatus([1], labels)).toBe('UNDERGRADUATE');
    expect(degreeFromDaadStatus([3], labels)).toBe('MASTERS');
    expect(degreeFromDaadStatus([4], labels)).toBe('PHD');
    expect(degreeFromDaadStatus([2], labels)).toBe('POSTDOCTORAL');
  });

  it('reports ANY when a programme is open to several levels', () => {
    // A real record: [2,3,4] = postdoc + master's + doctoral. The old ladder
    // advertised this as PHD only.
    expect(degreeFromDaadStatus([2, 3, 4], labels)).toBe('ANY');
    expect(degreeFromDaadStatus([1, 3], labels)).toBe('ANY');
  });

  it('ignores Faculty, which is not a degree level', () => {
    expect(degreeFromDaadStatus([5], labels)).toBe('UNKNOWN');
    // Faculty alongside a real level must not turn a single level into ANY.
    expect(degreeFromDaadStatus([4, 5], labels)).toBe('PHD');
  });

  it('falls back to UNKNOWN on missing or unrecognised input', () => {
    expect(degreeFromDaadStatus(undefined, labels)).toBe('UNKNOWN');
    expect(degreeFromDaadStatus([], labels)).toBe('UNKNOWN');
    expect(degreeFromDaadStatus([99], labels)).toBe('UNKNOWN');
  });
});

describe('extractExplicitDeadline', () => {
  /*
   * The strings below are real values from DAAD's deadlines.js. The feed is
   * prose, not a date field, so the job is to take a date only when day, month
   * and year are all stated and to decline otherwise.
   */
  it('takes a full date when one is stated', () => {
    expect(extractExplicitDeadline('31 August 2026<br /> <br /> Application deadlines are updated at least once a year.'))
      .toBe('31 August 2026');
    expect(extractExplicitDeadline('Deadline: October 15, 2026')).toBe('October 15, 2026');
    expect(extractExplicitDeadline('apply by 2026-09-30')).toBe('2026-09-30');
  });

  it('strips ordinal suffixes so parseDate can read the result', () => {
    expect(extractExplicitDeadline('1st April 2026')).toBe('1 April 2026');
    expect(extractExplicitDeadline('23rd December 2026')).toBe('23 December 2026');
  });

  it('refuses to guess a year that is not stated', () => {
    // A guessed year is worse than a blank one: the site renders a passed
    // deadline in red and the validation worker expires past-deadline entries.
    expect(extractExplicitDeadline('17th March')).toBeNull();
    expect(extractExplicitDeadline('The DAAD application must be made online via the DAAD Portal between 7th November to 9th December.')).toBeNull();
    expect(extractExplicitDeadline('9th October for visits beginning between April and September of the following year')).toBeNull();
  });

  it('returns null for prose carrying no date at all', () => {
    expect(extractExplicitDeadline('Applications can only be submitted via the online portal of the Argentinian Ministry of Education.')).toBeNull();
    expect(extractExplicitDeadline('')).toBeNull();
  });

  it('ignores HTML markup around the date', () => {
    expect(extractExplicitDeadline('<p>Closing date <b>5 May 2027</b></p>')).toBe('5 May 2027');
  });
});
