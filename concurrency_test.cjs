const fs = require('fs');

async function runConcurrencyTest() {
    console.log("Starting Real HTTP Concurrency Test...");
    const env = fs.readFileSync('.env', 'utf8');
    const SUPABASE_URL = (env.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
    const SUPABASE_ANON_KEY = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error("Missing SUPABASE credentials in .env");
        process.exit(1);
    }

    async function rpc(func, body = {}) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${func}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || JSON.stringify(err));
        }
        return res.json();
    }

    try {
        // Admin creates a slot with capacity = 1
        console.log("Admin creating slot with capacity = 1...");
        
        const slotId = await rpc('test_create_admin_slot', {
            p_capacity: 1
        });
        
        console.log(`Created slot: ${slotId}`);

        // Fire both booking requests concurrently!
        console.log("Firing concurrent booking requests for Picker 1 and Picker 2...");
        let p1Result = "PENDING";
        let p2Result = "PENDING";

        const p1Promise = rpc('test_concurrent_book', { 
            p_slot_id: slotId,
            p_picker_email: 'test_picker1@flashgo.com'
        })
            .then(() => p1Result = "SUCCESS")
            .catch(e => p1Result = `FAILED: ${e.message}`);
            
        const p2Promise = rpc('test_concurrent_book', { 
            p_slot_id: slotId,
            p_picker_email: 'test_picker2@flashgo.com'
        })
            .then(() => p2Result = "SUCCESS")
            .catch(e => p2Result = `FAILED: ${e.message}`);

        await Promise.all([p1Promise, p2Promise]);

        console.log(`\nworker A (Picker 1) result: ${p1Result}`);
        console.log(`worker B (Picker 2) result: ${p2Result}`);

        // Validate final state
        const shiftsCount = await rpc('test_check_shifts', { p_slot_id: slotId });
        console.log(`final active booking count = ${shiftsCount}`);

        if (p1Result === "SUCCESS" && p2Result === "SUCCESS") {
            console.error("FAIL: Both workers successfully booked a capacity=1 slot.");
        } else if (p1Result.includes("FAILED") && p2Result.includes("FAILED")) {
            console.error("FAIL: Both workers failed to book the slot.");
        } else if (shiftsCount !== 1) {
            console.error(`FAIL: Expected 1 shift, but found ${shiftsCount}`);
        } else {
            console.log("\nCONCURRENCY TEST PASSED: Exactly one success, one capacity rejection, and 1 final active booking.");
        }
        
    } catch (e) {
        console.error("Fatal Error:", e);
    }
}

runConcurrencyTest();
