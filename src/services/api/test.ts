import { supabase } from './supabaseClient';
supabase.rpc('get_serving_warehouse', { p_lat: 13.3427, p_lng: 74.7472 }).then(console.log);
