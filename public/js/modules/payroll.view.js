import { registerPayrollPeriodsCalcMethods } from './payroll/periodsAndCalculation.js?v=payroll-5.5';
import { registerPayrollNoveltiesMethods } from './payroll/noveltiesAndBatch.js?v=payroll-5.5';
import { registerPayrollSlipsMethods } from './payroll/paySlipsAndPrint.js?v=payroll-5.5';
import { registerPayrollLsdMethods } from './payroll/lsdExportUi.js?v=payroll-5.5';
import { registerFinalSettlementAssistantMethods } from './payroll/finalSettlementAssistant.js?v=payroll-5.5';
import { registerNoveltyMatrixSheetMethods } from './payroll/noveltyMatrixSheet.js?v=payroll-5.5';
import { registerRetroactiveSettlementMethods } from './payroll/retroactiveSettlements.js?v=payroll-5.5';

export function registerPayrollMethods(proto) {
  registerPayrollPeriodsCalcMethods(proto);
  registerPayrollNoveltiesMethods(proto);
  registerPayrollSlipsMethods(proto);
  registerPayrollLsdMethods(proto);
  registerFinalSettlementAssistantMethods(proto);
  registerNoveltyMatrixSheetMethods(proto);
  registerRetroactiveSettlementMethods(proto);
}
