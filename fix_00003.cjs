const fs = require('fs');
let file = 'supabase/migrations/20260902000003_audit_closure.sql';
let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

for (let i=0; i<lines.length; i++) {
  // Fix weird tags that might have trailing $ or $;
  // Let's explicitly just fix every statement known to end with ;
  let l = lines[i];
  
  if (l.endsWith('$;') && !l.includes('$BODY$')) {
    // If it's just '$;'
    if (l.trim() === '$;' || l.trim() === '$$;') {
      lines[i] = '$BODY$;';
    } else {
      // It's like 'UPDATE public.profiles SET is_suspended = TRUE WHERE id = p_user_id$;'
      lines[i] = l.replace(/\$;$/, ';');
    }
  } else if (l.endsWith('$') && !l.includes('AS $BODY$')) {
    if (l.trim() === 'AS $') {
      lines[i] = 'AS $BODY$';
    } else {
      // It's like 'v_role TEXT$;'
      lines[i] = l.replace(/\$$/, '');
    }
  }
  
  // Specific cleanups for generic_audit_trigger that might be mangled
  if (lines[i].includes('RETURNS TRIGGER AS $')) {
    lines[i] = 'RETURNS TRIGGER\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $BODY$';
  }
  
  if (lines[i].trim() === 'END$;' || lines[i].trim() === 'END$') {
    lines[i] = 'END;';
  }
}

fs.writeFileSync(file, lines.join('\n'));
console.log('Fixed 00003 tags.');
