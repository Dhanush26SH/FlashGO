const fs = require('fs');

async function checkLogin() {
    const env = fs.readFileSync('.env', 'utf8');
    const SUPABASE_URL = (env.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
    const SUPABASE_ANON_KEY = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

    async function login(email, password) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.error) throw new Error(`Login failed for ${email}: ${data.error_description || data.error}`);
        if (!data.access_token) {
            throw new Error(`No access token for ${email}`);
        }
        return data.access_token;
    }

    try {
        const token = await login('test_admin@flashgo.com', 'password123');
        console.log("Login successful! Token:", token.substring(0, 10) + '...');
    } catch (e) {
        console.error(e);
    }
}
checkLogin();
