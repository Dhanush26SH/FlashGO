"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
async function runTest() {
    console.log('--- STARTING WORKFLOW TEST ---');
    // 1. Customer places order
    console.log('\n[1] Customer Places Order');
    const { data: customer } = await supabase.from('profiles').select('id').eq('role', 'customer').limit(1).single();
    const { data: product } = await supabase.from('products').select('*').limit(1).single();
    const { data: order, error: orderErr } = await supabase.from('orders').insert({
        customer_id: customer.id,
        status: 'placed',
        total_amount: product.price,
        delivery_address: '123 Test St',
        payment_method: 'cod'
    }).select().single();
    if (orderErr)
        throw orderErr;
    const { error: itemErr } = await supabase.from('order_items').insert({
        order_id: order.id,
        product_id: product.id,
        quantity: 1,
        price: product.price
    });
    if (itemErr)
        throw itemErr;
    console.log(`Order ${order.id} placed for Product ${product.name}`);
    // 2. Admin Assigns Picker
    console.log('\n[2] Admin Assigns Picker');
    const { data: picker } = await supabase.from('profiles').select('id, warehouse_id').eq('role', 'picker').limit(1).single();
    const { error: assignPickErr } = await supabase.from('orders').update({
        picker_id: picker.id,
        status: 'picking'
    }).eq('id', order.id);
    if (assignPickErr)
        throw assignPickErr;
    console.log(`Picker ${picker.id} assigned to order.`);
    // 3. Picker picks and packs -> Warehouse stock decreases
    console.log('\n[3] Picker Packs Order');
    const { data: stockBefore } = await supabase.from('warehouse_stock').select('quantity').eq('warehouse_id', picker.warehouse_id).eq('product_id', product.id).single();
    console.log(`Stock BEFORE packing: ${stockBefore?.quantity || 0}`);
    const { error: rpcErr, data: rpcRes } = await supabase.rpc('deduct_inventory_for_order', {
        p_order_id: order.id,
        p_warehouse_id: picker.warehouse_id,
        p_user_id: picker.id
    });
    if (rpcErr)
        throw rpcErr;
    await supabase.from('orders').update({ status: 'packed' }).eq('id', order.id);
    const { data: stockAfter } = await supabase.from('warehouse_stock').select('quantity').eq('warehouse_id', picker.warehouse_id).eq('product_id', product.id).single();
    console.log(`Stock AFTER packing: ${stockAfter?.quantity || 0}`);
    const { data: ledger } = await supabase.from('stock_ledgers').select('*').eq('warehouse_id', picker.warehouse_id).eq('product_id', product.id).order('created_at', { ascending: false }).limit(1).single();
    console.log(`Stock Ledger Entry: change=${ledger?.quantity_change}, reason=${ledger?.reason}`);
    // 4. Assign Driver
    console.log('\n[4] Admin Assigns Driver');
    const { data: driver } = await supabase.from('profiles').select('id').eq('role', 'driver').limit(1).single();
    await supabase.from('orders').update({
        driver_id: driver.id,
        status: 'out_for_delivery'
    }).eq('id', order.id);
    console.log(`Driver ${driver.id} assigned.`);
    // 5. Driver delivers + OTP -> Order = Delivered
    console.log('\n[5] Driver Delivers Order');
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', order.id);
    const { data: finalOrder } = await supabase.from('orders').select('status').eq('id', order.id).single();
    console.log(`Final Order Status: ${finalOrder?.status}`);
    console.log('\n--- WORKFLOW TEST COMPLETE ---');
}
runTest().catch(console.error);
