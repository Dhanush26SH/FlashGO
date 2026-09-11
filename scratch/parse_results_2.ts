import * as fs from 'fs';

const data = fs.readFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\audit_results.json', 'utf16le');
const boundaryIdx = data.indexOf('{');
if (boundaryIdx !== -1) {
    const jsonStr = data.substring(boundaryIdx);
    const results = JSON.parse(jsonStr);
    
    // The query returns 1 row with jsonb_build_object
    const row = results.rows[0].jsonb_build_object;

    console.log("=== PROFILES COLS ===");
    console.log(row.profiles_cols);

    console.log("\n=== CATEGORIES COLS ===");
    console.log(row.categories_cols);

    console.log("\n=== PRODUCTS COLS ===");
    console.log(row.products_cols);

    console.log("\n=== WALLET COLS ===");
    console.log(row.wallet_cols);

    console.log("\n=== ROLE CONSTRAINT ===");
    console.log(row.role_constraint);

    console.log("\n=== ORDER ITEMS POLICY ===");
    console.dir(row.order_items_policy, {depth: null});

    console.log("\n=== VIEWS ===");
    console.log(row.views);
    
    console.log("\n=== SECURITY DEFINER FUNCTIONS ===");
    console.log(row.functions);
}
