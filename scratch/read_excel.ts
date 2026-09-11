import * as xlsx from 'xlsx';

function readWorkbook() {
  const filePath = 'C:\\Users\\dhanu\\FlashGO\\flashgo_product_supplier_mapping.xlsx';
  const workbook = xlsx.readFile(filePath);
  
  console.log('Sheets:', workbook.SheetNames);
  
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    console.log(`Rows: ${data.length}`);
    if (data.length > 0) {
      console.log('Sample row:', data[0]);
    }
  }
}

readWorkbook();
