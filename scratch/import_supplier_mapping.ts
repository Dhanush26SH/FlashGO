import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function importMapping() {
  const data = JSON.parse(fs.readFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\excel_data.json', 'utf8'));
  const suppliers = data['Supplier Master Proposal'].filter(s => s.suggested_flashgo_vendor);
  const mappings = data['Product Supplier Mapping'].filter(m => m.product_id && m.suggested_flashgo_vendor);

  // 1. Fetch remote active products
  const { data: remoteProducts, error: rpErr } = await supabase.from('products').select('id, name, is_active');
  if (rpErr) throw rpErr;
  
  const activeProducts = remoteProducts.filter(p => p.is_active);
  const activeProductIds = new Set(activeProducts.map(p => p.id));

  // 2. Process Suppliers
  console.log('Processing Suppliers...');
  const { data: existingVendors, error: evErr } = await supabase.from('vendors').select('id, name');
  if (evErr) throw evErr;

  const vendorNameIdMap = new Map(existingVendors.map(v => [v.name, v.id]));
  
  const newVendorsToInsert = [];
  for (const s of suppliers) {
    let vName = s.suggested_flashgo_vendor;
    
    // Explicitly handle "PureDairy Co." to avoid creating a duplicate with notes
    if (vName.startsWith("PureDairy Co.")) {
      vName = "PureDairy Co.";
    }

    if (!vendorNameIdMap.has(vName) && !newVendorsToInsert.find(v => v.name === vName)) {
        newVendorsToInsert.push({ name: vName, contact_person: null, email: null, phone: null, address: null });
    }
  }

  if (newVendorsToInsert.length > 0) {
    const { data: insertedVendors, error: nvErr } = await supabase.from('vendors').insert(newVendorsToInsert).select('id, name');
    if (nvErr) throw nvErr;
    for (const v of insertedVendors) {
      vendorNameIdMap.set(v.name, v.id);
      console.log(`Created supplier: ${v.name}`);
    }
  }

  // 3. Process Mappings idempotently
  console.log('Processing Mappings...');
  const mappingsToInsert = [];
  const { data: existingVP, error: eErr } = await supabase.from('vendor_products').select('vendor_id, product_id');
  if (eErr) throw eErr;
  
  const existingSet = new Set(existingVP.map(vp => `${vp.vendor_id}_${vp.product_id}`));
  
  for (const m of mappings) {
    let vName = m.suggested_flashgo_vendor;
    if (vName.startsWith("PureDairy Co.")) {
      vName = "PureDairy Co.";
    }

    const vendor_id = vendorNameIdMap.get(vName);
    if (!vendor_id) throw new Error(`Vendor not mapped: ${vName}`);
    
    if (!existingSet.has(`${vendor_id}_${m.product_id}`)) {
      mappingsToInsert.push({
         vendor_id,
         product_id: m.product_id,
         vendor_sku: null,
         purchase_price: null,
         minimum_order_quantity: 1,
         is_active: true
      });
      existingSet.add(`${vendor_id}_${m.product_id}`); // prevent dups in current batch
    }
  }

  if (mappingsToInsert.length > 0) {
    const { error: insErr } = await supabase.from('vendor_products').insert(mappingsToInsert);
    if (insErr) {
      console.error("Mapping insert failed:", insErr);
      throw insErr;
    }
  }

  console.log(`Successfully created ${newVendorsToInsert.length} new suppliers.`);
  console.log(`Successfully imported ${mappingsToInsert.length} new mappings.`);
}

importMapping().catch(console.error);
