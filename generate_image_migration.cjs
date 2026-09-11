const fs = require('fs');

const products = JSON.parse(fs.readFileSync('remote_products.json', 'utf8'));

let sql = `-- 20260904000021_assign_product_images.sql\n\n`;

const bucketUrl = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products';

// We want 15 distinct products to get p1..p15
for (let i = 0; i < products.length; i++) {
    const p = products[i];
    let imageUrl = '';
    if (i < 15) {
        imageUrl = `${bucketUrl}/p${i + 1}.jpg`;
    } else {
        imageUrl = `${bucketUrl}/c1.jpg`;
    }
    
    // escaping quotes in names is not needed if we use ID
    sql += `UPDATE products SET image_url = '${imageUrl}' WHERE id = '${p.id}';\n`;
}

fs.writeFileSync('supabase/migrations/20260904000021_assign_product_images.sql', sql);
console.log('Migration generated.');
