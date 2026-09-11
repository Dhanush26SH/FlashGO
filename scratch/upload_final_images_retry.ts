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
    // 1. Scan local images
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
                        relativeLocalPath: path.relative('C:\\Users\\dhanu\\FlashGO', p),
                        filename: file,
                        normalizedName: normalizeName(path.parse(file).name),
                        category: category
                    });
                }
            }
        }
    };
    walkSync(IMAGES_DIR);

    // 2. Query Supabase
    const { data: allRows } = await supabase.from('products').select('id, name, is_active, image_url, categories(name)');
    const activeProducts = allRows.filter(p => p.is_active);
    
    // Identify targets
    let safeTargets: any[] = [];
    activeProducts.forEach(p => {
        const hasRealImage = p.image_url && p.image_url.startsWith('http');
        if (!hasRealImage) {
            if (p.name === 'Amul Gold Full Cream Milk') {
                // manual resolution
            } else {
                safeTargets.push({
                    ...p,
                    normalizedName: normalizeName(p.name),
                    categoryName: p.categories?.name
                });
            }
        }
    });

    // 4. Pre-upload verification
    let mappings: any[] = [];
    for (const target of safeTargets) {
        const matches = localImages.filter(img => img.normalizedName === target.normalizedName && img.category === target.categoryName);
        if (matches.length === 1) {
            mappings.push({ product: target, file: matches[0] });
        }
    }

    if (mappings.length !== 140) {
        console.log(`Error: Mappings length is ${mappings.length}, expected 140`);
        return;
    }

    // 5. Upload & 6. Migration
    let sql = `-- Update final images retry\n\n`;
    let uploadsCompleted = 0;

    for (const mapping of mappings) {
        const ext = path.extname(mapping.file.filename).toLowerCase();
        const safeName = safeUrlName(mapping.product.name);
        const storagePath = `products/${mapping.product.id}/${safeName}${ext}`;
        
        let localPath = mapping.file.relativeLocalPath;
        let tempPath = null;

        if (localPath.includes('%')) {
            const dir = path.dirname(localPath);
            tempPath = path.join(dir, 'temp_upload' + ext);
            fs.copyFileSync(localPath, tempPath);
            localPath = tempPath;
        }

        try {
            execSync(`npx supabase storage cp "${localPath}" "ss:///product-images/${storagePath}" --project-ref szpfuommfvrfdliloxcg --experimental`, { stdio: 'pipe', cwd: 'C:\\Users\\dhanu\\FlashGO' });
            uploadsCompleted++;
            const { data: pubData } = supabase.storage.from('product-images').getPublicUrl(storagePath);
            sql += `UPDATE products SET image_url = '${pubData.publicUrl}' WHERE id = '${mapping.product.id}';\n`;
        } catch (e: any) {
            console.error(`Upload failed for ${mapping.file.filename}`, e.message);
        } finally {
            if (tempPath && fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        }
    }

    const migrationName = '20260908000015_update_final_images_retry.sql';
    fs.writeFileSync(`C:\\Users\\dhanu\\FlashGO\\supabase\\migrations\\${migrationName}`, sql);

    let migrationApplied = 'NO';
    try {
        execSync('npx supabase db push', { stdio: 'pipe', cwd: 'C:\\Users\\dhanu\\FlashGO' });
        migrationApplied = `YES (${migrationName})`;
    } catch (e) {
        console.error('Migration push failed', e);
    }

    // 7. Final Audit
    const { data: finalRows } = await supabase.from('products').select('id, name, is_active, image_url, categories(name)');
    const finalActive = finalRows.filter(p => p.is_active);
    const finalWithImages = finalActive.filter(p => p.image_url && p.image_url.startsWith('http'));
    const finalMissing = finalActive.filter(p => !p.image_url || !p.image_url.startsWith('http'));

    console.log(`UPLOADS COMPLETED: ${uploadsCompleted}`);
    console.log(`MIGRATION CREATED: YES`);
    console.log(`MIGRATION APPLIED REMOTE: ${migrationApplied}`);
    console.log(`ACTIVE PRODUCTS WITH VERIFIED REAL IMAGES: ${finalWithImages.length}`);
    console.log(`ACTIVE PRODUCTS STILL MISSING REAL IMAGES: ${finalMissing.length}`);
    
    let remainingStr = '';
    finalMissing.forEach(m => remainingStr += `${m.name} (${m.id}), `);
    console.log(`REMAINING PRODUCT IDS/NAMES: ${remainingStr}`);
    console.log(`FINAL IMAGE AUDIT: ${finalActive.length === 224 && finalWithImages.length === 222 && finalMissing.length === 2 ? 'PASS' : 'FAIL'}`);
}
run();
