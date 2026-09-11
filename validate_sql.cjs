const fs = require('fs');

const files = fs.readdirSync('supabase/migrations')
  .filter(f => f.match(/^202609020000(\d{2}).*\.sql$/))
  .map(f => 'supabase/migrations/' + f);

console.log('--- SQL VALIDATION REPORT ---');

for (const file of files) {
  const match = file.match(/202609020000(\d{2})/);
  if (!match) continue;
  const num = parseInt(match[1], 10);
  if (num < 1 || num > 12) continue;

  const content = fs.readFileSync(file, 'utf8');
  let issues = [];

  if (/AS\s+\$BODY\b(?!\$)/.test(content)) {
    issues.push('Found AS $BODY without trailing $');
  }
  
  if (/\$BODY\s*;/.test(content)) {
    issues.push('Found $BODY; without trailing $');
  }

  const openCount = (content.match(/AS\s+\$BODY\$/g) || []).length;
  const closeCount = (content.match(/\$BODY\$;/g) || []).length;
  if (openCount !== closeCount) {
    issues.push('Unmatched $BODY$: Opened ' + openCount + ', Closed ' + closeCount);
  }
  
  const dollarDollarCount = (content.match(/\$\$/g) || []).length;
  if (dollarDollarCount % 2 !== 0) {
    issues.push('Unmatched $$ count: ' + dollarDollarCount);
  }
  
  if (/CHAR\(10\)/i.test(content)) {
    issues.push('Found CHAR(10), should be CHR(10)');
  }

  console.log('[' + file + ']: ' + (issues.length === 0 ? 'CLEAN' : issues.join(' | ')));
}
