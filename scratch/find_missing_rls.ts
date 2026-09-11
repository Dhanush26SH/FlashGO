import * as fs from 'fs';
import * as path from 'path';

function findMissingRLS() {
  const migrationsDir = path.join('C:\\Users\\dhanu\\FlashGO\\supabase\\migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

  const tables = new Set<string>();
  const rlsEnabled = new Set<string>();

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    
    // Find all created tables
    // Regex matches: CREATE TABLE [IF NOT EXISTS] [public.]table_name
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/g;
    let match;
    while ((match = createTableRegex.exec(content)) !== null) {
      tables.add(match[1]);
    }

    // Find all RLS enabled tables
    const enableRlsRegex = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
    while ((match = enableRlsRegex.exec(content)) !== null) {
      rlsEnabled.add(match[1]);
    }
  }

  const missingRLS = [];
  for (const table of tables) {
    if (!rlsEnabled.has(table)) {
      missingRLS.push(table);
    }
  }

  console.log('Tables without RLS:');
  console.log(missingRLS);
}

findMissingRLS();
