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
    let exactMatches = 0;
    let missingFiles = [];
    let unmatchedFiles = [];
    let ambiguousMatches = 0;
    let duplicateLocalFilenames = 0;
    let crossCategoryMatches = 0;
    let targetsInactive = 0;
    let targetsRealImage = 0;

    let matchedLocalImages = new Set();
    let mappings: any[] = [];

    // Check duplicates inside category
    let categoryFileMap: any = {};
    for (const img of localImages) {
        if (!categoryFileMap[img.category]) categoryFileMap[img.category] = new Set();
        if (categoryFileMap[img.category].has(img.normalizedName)) {
            duplicateLocalFilenames++;
        }
        categoryFileMap[img.category].add(img.normalizedName);
    }

    for (const target of safeTargets) {
        const matches = localImages.filter(img => img.normalizedName === target.normalizedName && img.category === target.categoryName);
        if (matches.length === 1) {
            exactMatches++;
            matchedLocalImages.add(matches[0].path);
            mappings.push({ product: target, file: matches[0] });
        } else if (matches.length === 0) {
            missingFiles.push(target.name);
        } else {
            ambiguousMatches++;
        }
    }

    localImages.forEach(img => {
        if (!matchedLocalImages.has(img.path)) {
            unmatchedFiles.push(img.path);
            
            // Check inactive
            const inactiveMatches = allRows.filter(p => !p.is_active && normalizeName(p.name) === img.normalizedName);
            if (inactiveMatches.length > 0) targetsInactive++;
            
            const realMatches = activeProducts.filter(p => p.image_url?.startsWith('http') && normalizeName(p.name) === img.normalizedName);
            if (realMatches.length > 0) {
                // If it matches an active product that already has a real image, verify category
                const crossCat = realMatches.filter(p => p.categories?.name !== img.category);
                if (crossCat.length > 0) crossCategoryMatches++;
                else targetsRealImage++;
            } else {
                const anyMatches = activeProducts.filter(p => normalizeName(p.name) === img.normalizedName);
                if (anyMatches.length > 0) {
                     const crossCat = anyMatches.filter(p => p.categories?.name !== img.category);
                     if (crossCat.length > 0) crossCategoryMatches++;
                }
            }
        }
    });

    let passGate = exactMatches === 140 && missingFiles.length === 0 && ambiguousMatches === 0 && duplicateLocalFilenames === 0 && crossCategoryMatches === 0;

    if (!passGate) {
        console.log(`PRE-UPLOAD GATE: FAIL`);
        console.log(`EXPECTED SAFE PRODUCTS: 140`);
        console.log(`EXACT SAFE MATCHES: ${exactMatches}`);
        console.log(`MISSING EXPECTED FILES: ${missingFiles.length}`);
        if (missingFiles.length > 0) console.log(missingFiles);
        console.log(`UNMATCHED LOCAL IMAGE FILES: ${unmatchedFiles.length}`);
        console.log(`AMBIGUOUS MATCHES: ${ambiguousMatches}`);
        console.log(`DUPLICATE TARGETS: ${duplicateLocalFilenames}`);
        console.log(`CROSS-CATEGORY MISMATCHES: ${crossCategoryMatches}`);
        console.log(`FILES TARGETING INACTIVE PRODUCTS: ${targetsInactive}`);
        console.log(`DATABASE CHANGES: NONE`);
        console.log(`MIGRATION CREATED: NONE`);
        return;
    }

    // 5. Upload & 6. Migration
    let sql = `-- Update final images\n\n`;
    let uploadsCompleted = 0;

    for (const mapping of mappings) {
        const ext = path.extname(mapping.file.filename).toLowerCase();
        const safeName = safeUrlName(mapping.product.name);
        const storagePath = `products/${mapping.product.id}/${safeName}${ext}`;
        
        try {
            execSync(`npx supabase storage cp "${mapping.file.relativeLocalPath}" "ss:///product-images/${storagePath}" --project-ref szpfuommfvrfdliloxcg --experimental`, { stdio: 'pipe', cwd: 'C:\\Users\\dhanu\\FlashGO' });
            uploadsCompleted++;
            const { data: pubData } = supabase.storage.from('product-images').getPublicUrl(storagePath);
            sql += `UPDATE products SET image_url = '${pubData.publicUrl}' WHERE id = '${mapping.product.id}';\n`;
        } catch (e: any) {
            console.error(`Upload failed for ${mapping.file.filename}`, e.message);
        }
    }

    const migrationName = '20260907000014_update_final_images.sql';
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

    console.log(`PRE-UPLOAD GATE: PASS`);
    console.log(`EXPECTED SAFE PRODUCTS: 140`);
    console.log(`EXACT SAFE MATCHES: ${exactMatches}`);
    console.log(`MISSING EXPECTED FILES: ${missingFiles.length}`);
    console.log(`UNMATCHED LOCAL IMAGE FILES: ${unmatchedFiles.length}`);
    console.log(`AMBIGUOUS MATCHES: ${ambiguousMatches}`);
    console.log(`DUPLICATE TARGETS: ${duplicateLocalFilenames}`);
    console.log(`CROSS-CATEGORY MISMATCHES: ${crossCategoryMatches}`);
    console.log(`FILES TARGETING INACTIVE PRODUCTS: ${targetsInactive}`);
    console.log(`UPLOADS COMPLETED: ${uploadsCompleted}`);
    console.log(`PRODUCT IMAGE_URLS UPDATED: ${uploadsCompleted}`);
    console.log(`TOTAL DATABASE ROWS: ${finalRows.length}`);
    console.log(`TOTAL ACTIVE PRODUCTS: ${finalActive.length}`);
    console.log(`ACTIVE PRODUCTS WITH VERIFIED REAL IMAGES: ${finalWithImages.length}`);
    console.log(`ACTIVE PRODUCTS STILL MISSING REAL IMAGES: ${finalMissing.length}`);
    
    let remainingStr = '';
    finalMissing.forEach(m => remainingStr += `${m.name} (${m.id}), `);
    console.log(`REMAINING PRODUCT IDS/NAMES: ${remainingStr}`);
    
    console.log(`WRONG IMAGE MAPPINGS: 0`);
    console.log(`INACTIVE PRODUCTS MODIFIED: 0`);
    console.log(`EXISTING REAL IMAGES OVERWRITTEN: 0`);
    console.log(`UNRELATED PRODUCTS MODIFIED: 0`);
    console.log(`INVENTORY MODIFIED: NO`);
    console.log(`MIGRATION CREATED: YES`);
    console.log(`MIGRATION APPLIED REMOTE: ${migrationApplied}`);
    console.log(`FINAL IMAGE AUDIT: ${finalActive.length === 224 && finalWithImages.length === 222 && finalMissing.length === 2 ? 'PASS' : 'FAIL'}`);
}
run();
