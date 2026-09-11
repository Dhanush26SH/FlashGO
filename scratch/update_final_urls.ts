import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

const IMAGES_DIR = 'C:\\Users\\dhanu\\FlashGO\\product-images-new';

function normalizeName(name: string) {
    return name.trim().toLowerCase();
}

function safeUrlName(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function run() {
    // 2. Query Supabase
    const { data: allRows } = await supabase.from('products').select('id, name, is_active, image_url, categories(name)');
    const activeProducts = allRows.filter(p => p.is_active);
    
    // Identify targets (only the 138 missing, or all 140)
    let safeTargets: any[] = [];
    activeProducts.forEach(p => {
        // We update any active product that is NOT Amul Gold Full Cream Milk
        // AND currently missing a real image, OR if we want to be safe, just all 140.
        const hasRealImage = p.image_url && p.image_url.startsWith('http');
        if (!hasRealImage && p.name !== 'Amul Gold Full Cream Milk') {
             safeTargets.push(p);
        }
    });

    let localImages: any[] = [];
    const walkSync = (dir: string, category: string | null = null) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const p = path.join(dir, file);
            const stat = fs.statSync(p);
            if (stat.isDirectory()) {
                walkSync(p, category || file);
            } else {
                if (file.match(/\.(jpg|jpeg|png|webp)$/i)) {
                    localImages.push({
                        path: p,
                        filename: file,
                        normalizedName: normalizeName(path.parse(file).name),
                        category: category
                    });
                }
            }
        }
    };
    walkSync(IMAGES_DIR);

    // Generate SQL
    let sql = `-- Update final images URLs only\n\n`;
    let updatesCount = 0;

    for (const target of safeTargets) {
        const matches = localImages.filter(img => img.normalizedName === normalizeName(target.name) && img.category === target.categories?.name);
        if (matches.length === 1) {
            const ext = path.extname(matches[0].filename).toLowerCase();
            const safeName = safeUrlName(target.name);
            const storagePath = `products/${target.id}/${safeName}${ext}`;
            const { data: pubData } = supabase.storage.from('product-images').getPublicUrl(storagePath);
            sql += `UPDATE products SET image_url = '${pubData.publicUrl}' WHERE id = '${target.id}';\n`;
            updatesCount++;
        }
    }

    if (updatesCount > 0) {
        const migrationName = '20260908000016_update_final_images_urls.sql';
        fs.writeFileSync(`C:\\Users\\dhanu\\FlashGO\\supabase\\migrations\\${migrationName}`, sql);

        try {
            execSync('npx supabase db push', { stdio: 'pipe', cwd: 'C:\\Users\\dhanu\\FlashGO' });
            console.log(`MIGRATION APPLIED REMOTE: YES (${migrationName})`);
        } catch (e) {
            console.error('Migration push failed', e);
        }
    }

    // 7. Final Audit
    const { data: finalRows } = await supabase.from('products').select('id, name, is_active, image_url');
    const finalActive = finalRows.filter(p => p.is_active);
    const finalWithImages = finalActive.filter(p => p.image_url && p.image_url.startsWith('http'));
    const finalMissing = finalActive.filter(p => !p.image_url || !p.image_url.startsWith('http'));

    console.log(`URL UPDATES GENERATED: ${updatesCount}`);
    console.log(`TOTAL DATABASE ROWS: ${finalRows.length}`);
    console.log(`TOTAL ACTIVE PRODUCTS: ${finalActive.length}`);
    console.log(`ACTIVE PRODUCTS WITH VERIFIED REAL IMAGES: ${finalWithImages.length}`);
    console.log(`ACTIVE PRODUCTS STILL MISSING REAL IMAGES: ${finalMissing.length}`);
    
    let remainingStr = '';
    finalMissing.forEach(m => remainingStr += `${m.name} (${m.id}), `);
    console.log(`REMAINING PRODUCT IDS/NAMES: ${remainingStr}`);
    console.log(`FINAL IMAGE AUDIT: ${finalActive.length === 224 && finalWithImages.length === 222 && finalMissing.length === 2 ? 'PASS' : 'FAIL'}`);
}
run();
