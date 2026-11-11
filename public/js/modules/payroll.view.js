import { registerPayrollPeriodsCalcMethods } from './payroll/periodsAndCalculation.js?v=payroll-4.1';
import { registerPayrollNoveltiesMethods } from './payroll/noveltiesAndBatch.js?v=payroll-4.1';
import { registerPayrollSlipsMethods } from './payroll/paySlipsAndPrint.js?v=payroll-4.1';
import { registerPayrollLsdMethods } from './payroll/lsdExportUi.js?v=payroll-4.1';

export function registerPayrollMethods(proto) {
  registerPayrollPeriodsCalcMethods(proto);
  registerPayrollNoveltiesMethods(proto);
  registerPayrollSlipsMethods(proto);
  registerPayrollLsdMethods(proto);
}
