const XLSX = require('xlsx-js-style');

const file = 'EL ARCA DISPLAY CLUB.xlsx';
const wb = XLSX.readFile(file, { cellStyles: true });
const ws = wb.Sheets[wb.SheetNames[0]];

console.log("Merges:", ws['!merges']);

const cellsToInspect = ['A1', 'B1', 'C1', 'D1', 'G1', 'B2', 'B3'];

cellsToInspect.forEach(cell => {
    if (ws[cell]) {
        console.log(`\nCell ${cell}:`);
        console.log("Value:", ws[cell].v);
        console.log("Style:", JSON.stringify(ws[cell].s, null, 2));
    }
});
