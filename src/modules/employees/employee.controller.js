import * as employeeService from './employee.service.js';

export async function list(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const { search, departmentId, status } = req.query;

  const result = await employeeService.listEmployees(req.tenantPrisma, {
    page,
    limit,
    search,
    departmentId,
    status,
  });
  return res.status(200).json(result);
}

export async function getById(req, res) {
  const employee = await employeeService.getEmployeeById(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: employee });
}

export async function create(req, res) {
  const employee = await employeeService.createEmployee(req.tenantPrisma, req.body);
  return res.status(201).json({
    data: employee,
    message: 'Empleado registrado exitosamente',
  });
}

export async function importEmployees(req, res) {
  const result = await employeeService.importEmployees(req.tenantPrisma, req.body.employees);
  return res.status(200).json({
    data: result,
    message: result.createdCount > 0
      ? `Se importaron ${result.createdCount} empleado(s) exitosamente`
      : 'No se agregaron nuevos empleados',
  });
}

export async function update(req, res) {
  const employee = await employeeService.updateEmployee(
    req.tenantPrisma,
    req.params.id,
    req.body
  );

  return res.status(200).json({
    data: employee,
    message: 'Empleado actualizado correctamente',
  });
}

export async function remove(req, res) {
  await employeeService.deleteEmployee(req.tenantPrisma, req.params.id);
  return res.status(200).json({ message: 'Empleado dado de baja exitosamente' });
}

// --- FAMILIARES (RELATIVES) ---

export async function listRelatives(req, res) {
  const relatives = await employeeService.listRelatives(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: relatives });
}

export async function createRelative(req, res) {
  const relative = await employeeService.createRelative(req.tenantPrisma, req.params.id, req.body);
  return res.status(201).json({
    data: relative,
    message: 'Familiar registrado exitosamente',
  });
}

export async function updateRelative(req, res) {
  const relative = await employeeService.updateRelative(req.tenantPrisma, req.params.relativeId, req.body);
  return res.status(200).json({
    data: relative,
    message: 'Familiar actualizado exitosamente',
  });
}

export async function deleteRelative(req, res) {
  await employeeService.deleteRelative(req.tenantPrisma, req.params.relativeId);
  return res.status(200).json({ message: 'Familiar eliminado exitosamente' });
}

// --- CONCEPTOS FIJOS / RECURRENTES POR EMPLEADO ---

export async function listConcepts(req, res) {
  const concepts = await employeeService.listEmployeeConcepts(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: concepts });
}

export async function assignConcept(req, res) {
  const assignment = await employeeService.assignEmployeeConcept(req.tenantPrisma, req.params.id, req.body);
  return res.status(201).json({
    data: assignment,
    message: 'Concepto asignado exitosamente al empleado',
  });
}

export async function updateConcept(req, res) {
  const assignment = await employeeService.updateEmployeeConcept(
    req.tenantPrisma,
    req.params.id,
    req.params.conceptAssignmentId,
    req.body
  );
  return res.status(200).json({
    data: assignment,
    message: 'Asignación de concepto actualizada exitosamente',
  });
}

export async function removeConcept(req, res) {
  await employeeService.deleteEmployeeConcept(
    req.tenantPrisma,
    req.params.id,
    req.params.conceptAssignmentId
  );
  return res.status(200).json({ message: 'Asignación de concepto eliminada exitosamente' });
}

export async function massAssign(req, res) {
  const result = await employeeService.massAssignConcept(req.tenantPrisma, req.body);
  return res.status(200).json({
    data: result,
    message: `Concepto asignado a ${result.assignedCount} empleado(s) correctamente`,
  });
}

// --- AUMENTOS GENERALIZADOS / MASIVOS ---

export async function previewMassWageIncrease(req, res) {
  const result = await employeeService.applyMassWageIncrease(req.tenantPrisma, req.body, true);
  return res.status(200).json({ data: result });
}

export async function applyMassWageIncrease(req, res) {
  const result = await employeeService.applyMassWageIncrease(req.tenantPrisma, req.body, false);
  return res.status(200).json({
    data: result,
    message: `Aumento generalizado aplicado con éxito sobre ${result.affectedCount} empleado(s)`,
  });
}

// --- ASIGNACIÓN INVERSA: EMPLEADOS POR CONCEPTO PERSISTENTE ---

export async function listEmployeesByConcept(req, res, next) {
  try {
    const list = await employeeService.listConceptAssignedEmployees(req.tenantPrisma, req.params.conceptId);
    return res.status(200).json({ data: list });
  } catch (err) {
    return next(err);
  }
}

export async function assignEmployeesToConcept(req, res, next) {
  try {
    const result = await employeeService.assignConceptToEmployees(req.tenantPrisma, req.params.conceptId, req.body);
    return res.status(200).json({
      message: `Concepto asignado exitosamente a ${result.assignedCount} empleado(s)`,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

export async function removeEmployeeFromConcept(req, res, next) {
  try {
    const result = await employeeService.deleteConceptAssignment(req.tenantPrisma, req.params.assignmentId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}



