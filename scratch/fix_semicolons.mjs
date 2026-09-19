import fs from 'fs';
let content = fs.readFileSync('supabase/migrations/20260919072801_generic_staff_retirement_lifecycle.sql', 'utf8');

content = content.replace(/\$function\$\r?\n/g, '$function$;\n');
content = content.replace(/\$function\$;;/g, '$function$;');
// For end of file
if (content.trim().endsWith('$function$')) {
    content = content.trim() + ';';
}

fs.writeFileSync('supabase/migrations/20260919072801_generic_staff_retirement_lifecycle.sql', content);
console.log('Fixed semicolons properly.');
