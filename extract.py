import json
import os

with open('funcs.sql', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

for row in data['rows']:
    name = row['pg_get_functiondef'].split(' ')[4].split('(')[0]
    # Handle overloaded functions by using an index
    filename = name + '_' + str(hash(row['pg_get_functiondef'])) + '.sql'
    with open(filename, 'w', encoding='utf-8') as out:
        out.write(row['pg_get_functiondef'])
