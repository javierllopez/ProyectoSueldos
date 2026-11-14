import { registerPersonnelCatalogCoreMethods } from './personnel/catalogAndCore.js?v=personnel-3.2';
import { registerPersonnelEmployeesMethods } from './personnel/employeesAndConcepts.js?v=personnel-3.2';
import { registerPersonnelOrgMethods } from './personnel/orgStructure.js?v=personnel-3.2';
import { registerPersonnelAffiliationsMassMethods } from './personnel/affiliationsAndMass.js?v=personnel-3.2';

export function registerPersonnelMethods(proto) {
  registerPersonnelCatalogCoreMethods(proto);
  registerPersonnelEmployeesMethods(proto);
  registerPersonnelOrgMethods(proto);
  registerPersonnelAffiliationsMassMethods(proto);
}
