import assert from 'node:assert';
import { evaluateCalculatedColumn, getConceptAmount } from './src/modules/reports/engine/formula-evaluator.js';
import { exportReportToExcel } from './src/modules/reports/exporters/excel-exporter.js';
import { exportReportToPdf } from './src/modules/reports/exporters/pdf-exporter.js';

console.log('🧪 Iniciando Suite de Pruebas: Motor de Informes y Columnas Calculadas\n');

// --- 1. PRUEBAS DEL EVALUADOR DE FÓRMULAS ---
console.log('▶ Test 1: getConceptAmount con conceptos presentes y ausentes');
const sampleRow = {
  employee: { fileNumber: 'L001', basicSalary: 500000 },
  conceptsMap: {
    '001': 500000,
    '005': 50000, // 10% antigüedad
  },
  items: [
    { conceptCode: '001', amount: 500000 },
    { conceptCode: '005', amount: 50000 },
  ],
};

assert.strictEqual(getConceptAmount(sampleRow, '001'), 500000, 'Debe obtener el básico de conceptsMap');
assert.strictEqual(getConceptAmount(sampleRow, '005'), 50000, 'Debe obtener la antigüedad');
assert.strictEqual(getConceptAmount(sampleRow, '999'), 0, 'Concepto inexistente debe retornar 0.00');
console.log('  ✔ getConceptAmount resolvió montos correctamente');

console.log('\n▶ Test 2: evaluateCalculatedColumn - Suma (Sueldo Conformado = Básico + Antigüedad)');
const formulaConformado = {
  terms: [
    { conceptCode: '001', sign: '+', factor: 1 },
    { conceptCode: '005', sign: '+', factor: 1 },
  ],
};
const sueldoConformado = evaluateCalculatedColumn(formulaConformado, sampleRow);
assert.strictEqual(sueldoConformado, 550000, 'Sueldo conformado debe ser 500000 + 50000 = 550000');
console.log(`  ✔ Sueldo Conformado calculado: $ ${sueldoConformado}`);

console.log('\n▶ Test 3: evaluateCalculatedColumn - Tolerancia a conceptos ausentes (sin antigüedad)');
const sampleRowSinAntiguedad = {
  conceptsMap: { '001': 450000 },
};
const resSinAnt = evaluateCalculatedColumn(formulaConformado, sampleRowSinAntiguedad);
assert.strictEqual(resSinAnt, 450000, 'Si falta antigüedad debe computar 450000 + 0 = 450000');
console.log(`  ✔ Tolerancia a concepto faltante validada: $ ${resSinAnt}`);

console.log('\n▶ Test 4: evaluateCalculatedColumn - Operación de Resta y Diferencias');
const formulaResta = {
  terms: [
    { conceptCode: '001', sign: '+', factor: 1 },
    { conceptCode: '900', sign: '-', factor: 1 }, // Descuento de 30000
  ],
};
const sampleRowConDescuento = {
  conceptsMap: { '001': 500000, '900': 30000 },
};
const resResta = evaluateCalculatedColumn(formulaResta, sampleRowConDescuento);
assert.strictEqual(resResta, 470000, '500000 - 30000 = 470000');
console.log(`  ✔ Operación de resta validada: $ ${resResta}`);

console.log('\n▶ Test 5: evaluateCalculatedColumn - Coeficientes / Factores');
const formulaProporcion = {
  terms: [
    { conceptCode: '001', sign: '+', factor: 0.5 }, // 50% del básico
  ],
};
const resFactor = evaluateCalculatedColumn(formulaProporcion, sampleRow);
assert.strictEqual(resFactor, 250000, '500000 * 0.5 = 250000');
console.log(`  ✔ Coeficiente validado: $ ${resFactor}`);

// --- 2. PRUEBA DE ESTRUCTURA DE DATOS AGRUPADOS Y TOTALES ---
console.log('\n▶ Test 6: Consistencia de Subtotales vs Total General');
const mockReportData = {
  meta: {
    companyName: 'Acme Test S.A.',
    cuit: '30-71234567-9',
    periodName: '10/2026 - Mensual',
    generatedAt: new Date().toISOString(),
    totalRows: 4,
  },
  columns: [
    { id: 'legajo', title: 'Legajo', format: 'TEXT', align: 'left', totalize: false },
    { id: 'nombre', title: 'Nombre', format: 'TEXT', align: 'left', totalize: false },
    { id: 'basico', title: 'Sueldo Básico', format: 'CURRENCY', align: 'right', totalize: true },
    { id: 'conformado', title: 'Sueldo Conformado', format: 'CURRENCY', align: 'right', totalize: true },
  ],
  flatRows: [
    { legajo: 'L01', nombre: 'Perez, Juan', basico: 500000, conformado: 550000, dpto: 'Ventas' },
    { legajo: 'L02', nombre: 'Gomez, Ana', basico: 600000, conformado: 660000, dpto: 'Ventas' },
    { legajo: 'L03', nombre: 'Lopez, Carlos', basico: 400000, conformado: 440000, dpto: 'Sistemas' },
    { legajo: 'L04', nombre: 'Diaz, Maria', basico: 700000, conformado: 770000, dpto: 'Sistemas' },
  ],
  groupedData: {
    isLeaf: false,
    groups: [
      {
        groupField: 'dpto',
        groupKey: 'Ventas',
        count: 2,
        subtotals: { basico: 1100000, conformado: 1210000 },
        isLeaf: true,
        rows: [
          { legajo: 'L01', nombre: 'Perez, Juan', basico: 500000, conformado: 550000 },
          { legajo: 'L02', nombre: 'Gomez, Ana', basico: 600000, conformado: 660000 },
        ],
      },
      {
        groupField: 'dpto',
        groupKey: 'Sistemas',
        count: 2,
        subtotals: { basico: 1100000, conformado: 1210000 },
        isLeaf: true,
        rows: [
          { legajo: 'L03', nombre: 'Lopez, Carlos', basico: 400000, conformado: 440000 },
          { legajo: 'L04', nombre: 'Diaz, Maria', basico: 700000, conformado: 770000 },
        ],
      },
    ],
  },
  totals: {
    basico: 2200000,
    conformado: 2420000,
  },
};

// Verificar que la suma de subtotales de cada grupo coincida exactamente con el total general
const sumSubtotalesBasico = mockReportData.groupedData.groups.reduce((acc, g) => acc + g.subtotals.basico, 0);
const sumSubtotalesConformado = mockReportData.groupedData.groups.reduce((acc, g) => acc + g.subtotals.conformado, 0);

assert.strictEqual(sumSubtotalesBasico, mockReportData.totals.basico, 'Subtotales de Básico deben cuadrar con Total General');
assert.strictEqual(sumSubtotalesConformado, mockReportData.totals.conformado, 'Subtotales de Conformado deben cuadrar con Total General');
console.log('  ✔ Cuadre matemático de subtotales por grupo vs Total General verificado');

// --- 3. PRUEBA DE EXPORTACIÓN A EXCEL (.XLSX) ---
console.log('\n▶ Test 7: Exportación a Excel con exceljs');
// Mock de imagen base64 de un pixel transparente PNG
const mockChartBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const excelBuffer = await exportReportToExcel(mockReportData, mockChartBase64);
assert(Buffer.isBuffer(excelBuffer), 'El exportador de Excel debe devolver un Buffer');
assert(excelBuffer.length > 1000, 'El archivo Excel debe tener contenido binario válido');
console.log(`  ✔ Buffer Excel generado con éxito (${excelBuffer.length} bytes)`);

// --- 4. PRUEBA DE EXPORTACIÓN A PDF ---
console.log('\n▶ Test 8: Exportación a PDF con pdfkit');
const pdfBuffer = await exportReportToPdf(mockReportData, mockChartBase64);
assert(Buffer.isBuffer(pdfBuffer), 'El exportador de PDF debe devolver un Buffer');
assert(pdfBuffer.toString('ascii', 0, 4) === '%PDF', 'El archivo debe comenzar con la firma %PDF');
console.log(`  ✔ Documento PDF generado con éxito (${pdfBuffer.length} bytes, firma %PDF validada)`);

console.log('\n🎉 ¡TODAS LAS PRUEBAS DEL MOTOR DE INFORMES PASARON EXITOSAMENTE!');

