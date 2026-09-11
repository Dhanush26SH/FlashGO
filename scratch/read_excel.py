import pandas as pd

file_path = 'C:\\Users\\dhanu\\FlashGO\\flashgo_product_supplier_mapping.xlsx'
xls = pd.ExcelFile(file_path)

print("Sheets:", xls.sheet_names)

for sheet_name in xls.sheet_names:
    print(f"\n--- Sheet: {sheet_name} ---")
    df = pd.read_excel(xls, sheet_name)
    print(f"Rows: {len(df)}")
    print(df.head())
