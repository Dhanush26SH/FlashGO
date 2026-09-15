const { execSync } = require('child_process');
const fs = require('fs');

const query = "SELECT prosrc FROM pg_proc WHERE proname = 'receive_procurement_order'";
const output = execSync(`npx supabase db query "${query}" --linked`, { encoding: 'utf-8' });
fs.writeFileSync('rpc_dump.txt', output);
