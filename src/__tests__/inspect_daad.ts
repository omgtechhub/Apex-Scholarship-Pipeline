import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

async function inspectDAAD() {
  const targetUrl = 'https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/';
  console.log(`Testing DAAD URL: ${targetUrl}\n`);

  // 1. Axios Test
  console.log('--- Method 1: Axios GET ---');
  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 30000,
    });

    const htmlData = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    console.log(`Status: ${res.status}`);
    console.log(`HTML Length: ${htmlData.length} bytes`);

    const $ = cheerio.load(htmlData);
    const title = $('title').text().trim();
    console.log(`Page Title: "${title}"`);

  } catch (err: any) {
    console.log(`Axios Failed: ${err.message}`);
  }

  // 2. Playwright Test
  console.log('\n--- Method 2: Playwright / Chromium ---');
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    const res = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const html = await page.content();
    console.log(`Playwright Status: ${res?.status()}`);
    console.log(`HTML Length: ${html.length} bytes`);

    await browser.close();
  } catch (err: any) {
    console.log(`Playwright Failed: ${err.message}`);
  }
}

inspectDAAD();
