const fs = require('fs');
let file = 'supabase/migrations/20260902000003_audit_closure.sql';
let lines = fs.readFileSync(file, 'utf8').split('\n');
for (let i = 0; i < lines.length; i++) {
  let l = lines[i].replace(/\r$/, '');
  if (!l.includes('$BODY$')) {
    // If it's not a tag line, clean up accidental $ characters at the end
    lines[i] = lines[i].replace(/\$;(\r?)$/, ';$1');
    lines[i] = lines[i].replace(/\$(\r?)$/, '$1');
  }
}
fs.writeFileSync(file, lines.join('\n'));
console.log('Cleaned all accidental trailing $ characters.');
