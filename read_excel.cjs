const XLSX = require('xlsx');

// Read the Excel file
const workbook = XLSX.readFile('schema table.xlsx');

// Get all sheet names
console.log('=== SHEET NAMES ===');
console.log(workbook.SheetNames);
console.log('');

// Process each sheet
workbook.SheetNames.forEach(sheetName => {
  console.log('='.repeat(80));
  console.log('SHEET:', sheetName);
  console.log('='.repeat(80));

  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // Print headers
  if (data.length > 0) {
    console.log('\nHeaders:', data[0]);
    console.log('Total rows:', data.length - 1);
    console.log('');

    // Print all data
    console.log('--- DATA ---');
    data.forEach((row, index) => {
      if (index === 0) {
        // Header row
        console.log('ROW 0 (Header):', row.join(' | '));
      } else {
        console.log('ROW ' + index + ':', row.join(' | '));
      }
    });
  }

  console.log('');
});
