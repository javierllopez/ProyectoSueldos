import fs from 'fs';

const content = fs.readFileSync('public/app.html', 'utf8');
const lines = content.split('\n');

const selects = [];
lines.forEach((l, idx) => {
  const match = l.match(/<select[^>]*id="([^"]+)"[^>]*>/);
  if (match) {
    selects.push({
      line: idx + 1,
      id: match[1],
      snippet: l.trim().substring(0, 100)
    });
  }
});

console.log(`Total <select> elements found: ${selects.length}`);
selects.forEach(s => {
  console.log(`${s.line}: id="${s.id}"`);
});
