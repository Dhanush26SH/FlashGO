import * as fs from 'fs';
import * as path from 'path';

function findMissingRLS() {
  const migrationsDir = path.join('C:\\Users\\dhanu\\FlashGO\\supabase\\migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

  const tables = new Set<string>();
  const rlsEnabled = new Set<string>();

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    
    // Split by lines and search iteratively to avoid regex greediness/multiline issues
    const lines = content.split('\n');
    for (const line of lines) {
        let match = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-zA-Z0-9_]+)"?/i);
        if (match) {
            tables.add(match[1].toLowerCase());
        }

        match = line.match(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-zA-Z0-9_]+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
        if (match) {
            rlsEnabled.add(match[1].toLowerCase());
        }
    }
  }

  const missingRLS = [];
  for (const table of Array.from(tables).sort()) {
    if (!rlsEnabled.has(table)) {
      missingRLS.push(table);
    }
  }

  console.log('Total Tables Found:', tables.size);
  console.log('Total RLS Enabled:', rlsEnabled.size);
  console.log('Tables without RLS:');
  missingRLS.forEach(t => console.log(t));
}

findMissingRLS();
