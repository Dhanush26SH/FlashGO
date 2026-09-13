import dotenv from 'dotenv';
dotenv.config();

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function rpc(functionName, payload = {}) {
    const res = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
}

async function run() {
    console.log("Fetching warehouse ID...");
    const whRes = await fetch(`${url}/rest/v1/warehouses?select=id&limit=1`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    const whData = await whRes.json();
    if (!whData || whData.length === 0) {
        console.error("No warehouse found");
        return;
    }
    const warehouseId = whData[0].id;
    console.log("Warehouse ID:", warehouseId);

    console.log("\nBootstrapping physical layout...");
    const layoutRes = await rpc('bootstrap_warehouse_physical_layout', { p_warehouse_id: warehouseId });
    console.log(layoutRes);

    console.log("\nBootstrapping product placements...");
    const placeRes = await rpc('bootstrap_warehouse_product_placements', { p_warehouse_id: warehouseId });
    console.log(placeRes);
}

run();
