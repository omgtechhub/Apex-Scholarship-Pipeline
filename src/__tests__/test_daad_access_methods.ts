import axios from 'axios';
import { chromium } from 'playwright';

async function testAccessMethods() {
  const url = 'https://www2.daad.de/bundles/daadstipendiendatenbanklsh/data/a/js/scholarships.js';
  console.log(`Testing access methods for: ${url}\n`);

  // Method A: Axios with curl UA
  try {
    const resA = await axios.get(url, {
      headers: { 'User-Agent': 'curl/8.4.0' },
      timeout: 10000,
    });
    const lenA = typeof resA.data === 'string' ? resA.data.length : 0;
    console.log(`[Method A: Axios + curl UA] Status: ${resA.status}, Bytes: ${lenA}`);
  } catch (err: any) {
    console.log(`[Method A: Axios + curl UA] Failed: ${err.message}`);
  }

  // Method B: Axios with no custom UA
  try {
    const resB = await axios.get(url, {
      headers: {},
      timeout: 10000,
    });
    const lenB = typeof resB.data === 'string' ? resB.data.length : 0;
    console.log(`[Method B: Axios default] Status: ${resB.status}, Bytes: ${lenB}`);
  } catch (err: any) {
    console.log(`[Method B: Axios default] Failed: ${err.message}`);
  }

  // Method C: Axios with Firefox UA
  try {
    const resC = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000,
    });
    const lenC = typeof resC.data === 'string' ? resC.data.length : 0;
    console.log(`[Method C: Axios + Firefox UA] Status: ${resC.status}, Bytes: ${lenC}`);
  } catch (err: any) {
    console.log(`[Method C: Axios + Firefox UA] Failed: ${err.message}`);
  }

  // Method D: Playwright with realistic userAgent & headers
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const content = await page.content();
    console.log(`[Method D: Playwright goto JS] Status: ${response?.status()}, Bytes: ${content.length}`);
    await browser.close();
  } catch (err: any) {
    console.log(`[Method D: Playwright] Failed: ${err.message}`);
  }
}

testAccessMethods();
