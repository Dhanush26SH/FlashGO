import fs from 'fs';
fetch('https://esm.sh/@supabase/gotrue-js@2.60.0/dist/module/GoTrueClient.d.ts')
  .then(r => r.text())
  .then(t => {
    const match = t.match(/getUser\([^)]*\)/g);
    console.log("Matches in gotrue-js 2.60.0:", match);
  });
