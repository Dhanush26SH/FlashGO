import fs from 'fs';
const code = fs.readFileSync('src/services/db.ts', 'utf8');
const pMatches = code.match(/id:\s*['"]p[0-9\-]+['"]/g);
console.log("Mock product IDs:", pMatches ? pMatches.length : 0);
