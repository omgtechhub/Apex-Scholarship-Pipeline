import axios from 'axios';

async function testDAADParse() {
  const url = 'https://www2.daad.de/bundles/daadstipendiendatenbanklsh/data/a/js/scholarships.js';
  console.log(`Fetching DAAD database from: ${url}`);

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    },
  });

  const rawJs = response.data as string;
  const jsonMatch = rawJs.match(/TAFFY\(([\s\S]+?)\);?\s*$/);

  if (!jsonMatch || !jsonMatch[1]) {
    throw new Error('Failed to extract JSON from TAFFY payload!');
  }

  const items = JSON.parse(jsonMatch[1]) as Array<Record<string, any>>;
  console.log(`Parsed ${items.length} total DAAD scholarship items from database!`);

  const sample = items[0];
  console.log('\n[SAMPLE DAAD ITEM 1]');
  console.log(`ID: ${sample.id}`);
  console.log(`Title (En): "${sample.nameEn}"`);
  console.log(`Title (De): "${sample.nameDe}"`);
  console.log(`Is DAAD: ${sample.isDaad}`);
  console.log(`Status: ${JSON.stringify(sample.status)}`);
  console.log(`Subject Groups: ${JSON.stringify(sample.subjectGrps)}`);
}

testDAADParse();
