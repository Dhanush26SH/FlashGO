import pandas as pd
import json
import math

file_path = 'C:\\Users\\dhanu\\FlashGO\\flashgo_product_supplier_mapping.xlsx'
xls = pd.ExcelFile(file_path)

output = {}
for sheet_name in xls.sheet_names:
    df = pd.read_excel(xls, sheet_name)
    # Convert all nan to None so JSON.dump produces valid null
    df = df.where(pd.notnull(df), None)
    
    # We must explicitly convert numeric NaN/NaT to None recursively in python dicts
    records = df.to_dict(orient='records')
    
    def clean(val):
        if isinstance(val, float) and math.isnan(val): return None
        return val

    clean_records = []
    for r in records:
        clean_records.append({k: clean(v) for k, v in r.items()})

    output[sheet_name] = clean_records

with open('excel_data.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)
