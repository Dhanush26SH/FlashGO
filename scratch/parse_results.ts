import * as fs from 'fs';

const data = fs.readFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\audit_results.json', 'utf16le');
const boundaryIdx = data.indexOf('{');
if (boundaryIdx !== -1) {
    const jsonStr = data.substring(boundaryIdx);
    const results = JSON.parse(jsonStr);
    const rows = results.rows;

    console.log("=== PROFILES ===");
    console.log(rows.filter((r: any) => r.table_name === 'profiles'));

    console.log("=== CATEGORIES ===");
    console.log(rows.filter((r: any) => r.table_name === 'categories'));
    
    // Check constraint for profiles
    console.log("=== ROLE CONSTRAINT ===");
    console.log(rows.filter((r: any) => r.constraint_def));

    console.log("=== ORDER ITEMS POLICY ===");
    console.log(rows.filter((r: any) => r.polname));

    console.log("=== VIEWS ===");
    console.log(rows.filter((r: any) => r.table_name && !r.column_name && !r.privilege_type && !r.polname));
    
    const fns = rows.filter((r: any) => r.proname);
    console.log("=== SECURITY DEFINER FUNCTIONS ===");
    console.log(fns.length);
}
