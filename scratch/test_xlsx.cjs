const XLSX = require('xlsx');

const data = [
  {
    "AOV": 159,
    "GOV": 159,
    "Date": "2026-09-15T00:00:00",
    "Refunds": 0,
    "Discounts": 0,
    "COD Revenue": 0,
    "Net Revenue": 159,
    "Online Revenue": 159,
    "Delivered Orders": 1
  },
  {
    "AOV": 1021.4,
    "GOV": 5107,
    "Date": "2026-09-16T00:00:00",
    "Refunds": 0,
    "Discounts": 0,
    "COD Revenue": 0,
    "Net Revenue": 5107,
    "Online Revenue": 5107,
    "Delivered Orders": 5
  }
];

const castNumbers = (d) => d.map(row => {
  const newRow = {};
  for (const key in row) {
    const val = row[key];
    if (typeof val === 'string' && val !== '' && !isNaN(Number(val)) && (key.includes('(₹)') || key.includes('GOV') || key.includes('Amount') || key.includes('Revenue') || key.includes('Cost') || key.includes('Salary') || key.includes('Value') || key.includes('AOV') || key.includes('Refunds') || key.includes('Discounts'))) {
      newRow[key] = Number(val);
    } else {
      newRow[key] = val;
    }
  }
  return newRow;
});

const casted = castNumbers(data);
console.log('Casted:', casted);

const ws = XLSX.utils.json_to_sheet(casted);
console.log('Sheet:', ws);
