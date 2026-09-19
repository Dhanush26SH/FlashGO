
    SELECT 
        tc.table_schema, 
        tc.table_name, 
        kcu.column_name
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND ((ccu.table_schema = 'public' AND ccu.table_name = 'profiles' AND ccu.column_name = 'id')
       OR (ccu.table_schema = 'auth' AND ccu.table_name = 'users' AND ccu.column_name = 'id'));
  