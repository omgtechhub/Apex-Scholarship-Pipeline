import axios from 'axios';

async function testHeadersExact() {
  const url = 'https://www2.daad.de/bundles/daadstipendiendatenbanklsh/data/a/js/scholarships.js';

  console.log('--- Test 1: Accept: */* + curl UA ---');
  try {
    const res1 = await axios.get(url, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'curl/8.4.0',
      },
    });
    const len1 = typeof res1.data === 'string' ? res1.data.length : 0;
    console.log(`Test 1 Success! Status: ${res1.status}, Length: ${len1}`);
  } catch (err: any) {
    console.log(`Test 1 Failed: ${err.message}`);
  }

  console.log('--- Test 2: Accept: */* + Chrome UA ---');
  try {
    const res2 = await axios.get(url, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const len2 = typeof res2.data === 'string' ? res2.data.length : 0;
    console.log(`Test 2 Success! Status: ${res2.status}, Length: ${len2}`);
  } catch (err: any) {
    console.log(`Test 2 Failed: ${err.message}`);
  }
}

testHeadersExact();
