import { createClient } from '@supabase/supabase-js'; // the locally installed one is whatever is in package.json
// Let's explicitly require gotrue-js to check
console.log(require('@supabase/supabase-js/package.json').version);
