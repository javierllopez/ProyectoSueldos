import {
  incidentTypeSchema,
  updateIncidentTypeSchema,
  sanctionTypeSchema,
  updateSanctionTypeSchema,
  employeeIncidentSchema,
  updateEmployeeIncidentSchema,
  employeeSanctionSchema,
  updateEmployeeSanctionSchema,
  disciplinaryReportParamsSchema,
} from './disciplinary.schema.js';
import * as disciplinaryService from './disciplinary.service.js';
import {
  exportDisciplinaryReportToPdf,
  exportEmployeeHistoryToPdf,
} from './disciplinary-pdf.exporter.js';

function validateBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues?.[0];
    const err = new Error(firstIssue?.message || 'Error de validación en los datos enviados');
    err.status = 400;
    throw err;
  }
  return parsed.data;
}

// --- Incident Types ---

export async function getIncidentTypes(req, res, next) {
  try {
    const { search, includeInactive } = req.query;
    const data = await disciplinaryService.listIncidentTypes(req.tenantPrisma, {
      search: search || '',
      includeInactive: includeInactive !== 'false',
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createIncidentType(req, res, next) {
  try {
    const payload = validateBody(incidentTypeSchema, req.body);
    const data = await disciplinaryService.createIncidentType(req.tenantPrisma, payload);
    res.status(201).json({ message: 'Tipo de incidente creado correctamente', data });
  } catch (err) {
    next(err);
  }
}

export async function updateIncidentType(req, res, next) {
  try {
    const payload = validateBody(updateIncidentTypeSchema, req.body);
    const data = await disciplinaryService.updateIncidentType(
      req.tenantPrisma,
      req.params.id,
      payload
    );
    res.json({ message: 'Tipo de incidente actualizado correctamente', data });
  } catch (err) {
    next(err);
  }
}

export async function deleteIncidentType(req, res, next) {
  try {
    const data = await disciplinaryService.deleteIncidentType(req.tenantPrisma, req.params.id);
    res.json({ message: 'Tipo de incidente eliminado correctamente', data });
  } catch (err) {
    next(err);
  }
}

// --- Sanction Types ---

export async function getSanctionTypes(req, res, next) {
  try {
    const { search, includeInactive } = req.query;
    const data = await disciplinaryService.listSanctionTypes(req.tenantPrisma, {
      search: search || '',
      includeInactive: includeInactive !== 'false',
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createSanctionType(req, res, next) {
  try {
    const payload = validateBody(sanctionTypeSchema, req.body);
    const data = await disciplinaryService.createSanctionType(req.tenantPrisma, payload);
    res.status(201).json({ message: 'Tipo de sanción creado correctamente', data });
  } catch (err) {
    next(err);
  }
}

export async function updateSanctionType(req, res, next) {
  try {
    const payload = validateBody(updateSanctionTypeSchema, req.body);
    const data = await disciplinaryService.updateSanctionType(
      req.tenantPrisma,
      req.params.id,
      payload
    );
    res.json({ message: 'Tipo de sanción actualizado correctamente', data });
  } catch (err) {
    next(err);
  }
}

export async function deleteSanctionType(req, res, next) {
  try {
    const data = await disciplinaryService.deleteSanctionType(req.tenantPrisma, req.params.id);
    res.json({ message: 'Tipo de sanción eliminado correctamente', data });
  } catch (err) {
    next(err);
  }
}

// --- Incidents ---

export async function getIncidents(req, res, next) {
  try {
    const { employeeId, incidentTypeId, dateFrom, dateTo, sanctionedStatus, search } = req.query;
    const data = await disciplinaryService.listIncidents(req.tenantPrisma, {
      employeeId,
      incidentTypeId,
      dateFrom,
      dateTo,
      sanctionedStatus: sanctionedStatus || 'ALL',
      search: search || '',
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createIncident(req, res, next) {
  try {
    const payload = validateBody(employeeIncidentSchema, req.body);
    const data = await disciplinaryService.createIncident(req.tenantPrisma, payload);
    res.status(201).json({ message: 'Incidente registrado correctamente', data });
  } catch (err) {
    next(err);
  }
}

export async function updateIncident(req, res, next) {
  try {
    const payload = validateBody(updateEmployeeIncidentSchema, req.body);
    const data = await disciplinaryService.updateIncident(
      req.tenantPrisma,
      req.params.id,
      payload
    );
    res.json({ message: 'Incidente actualizado correctamente', data });
  } catch (err) {
    next(err);
  }
}

export async function deleteIncident(req, res, next) {
  try {
    const data = await disciplinaryService.deleteIncident(req.tenantPrisma, req.params.id);
    res.json({ message: 'Incidente eliminado correctamente', data });
  } catch (err) {
    next(err);
  }
}

// --- Sanctions ---

export async function getSanctions(req, res, next) {
  try {
    const { employeeId, sanctionTypeId, dateFrom, dateTo, search } = req.query;
    const data = await disciplinaryService.listSanctions(req.tenantPrisma, {
      employeeId,
      sanctionTypeId,
      dateFrom,
      dateTo,
      search: search || '',
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createSanction(req, res, next) {
  try {
    const payload = validateBody(employeeSanctionSchema, req.body);
    const data = await disciplinaryService.createSanction(req.tenantPrisma, payload);
    res.status(201).json({ message: 'Sanción disciplinaria emitida correctamente', data });
  } catch (err) {
    next(err);
  }
}

export async function updateSanction(req, res, next) {
  try {
    const payload = validateBody(updateEmployeeSanctionSchema, req.body);
    const data = await disciplinaryService.updateSanction(
      req.tenantPrisma,
      req.params.id,
      payload
    );
    res.json({ message: 'Sanción disciplinaria actualizada correctamente', data });
  } catch (err) {
    next(err);
  }
}

export async function deleteSanction(req, res, next) {
  try {
    const data = await disciplinaryService.deleteSanction(req.tenantPrisma, req.params.id);
    res.json({ message: 'Sanción disciplinaria eliminada correctamente', data });
  } catch (err) {
    next(err);
  }
}

// --- Employee Disciplinary History ---

export async function getEmployeeHistory(req, res, next) {
  try {
    const data = await disciplinaryService.getEmployeeDisciplinaryHistory(
      req.tenantPrisma,
      req.params.employeeId,
      req.company
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function downloadEmployeeHistoryPdf(req, res, next) {
  try {
    const historyData = await disciplinaryService.getEmployeeDisciplinaryHistory(
      req.tenantPrisma,
      req.params.employeeId,
      req.company
    );
    const pdfBuffer = await exportEmployeeHistoryToPdf(historyData);
    const fileNum = String(historyData.employee?.fileNumber || 'legajo').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Historial_Disciplinario_${fileNum}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

// --- Reports (1 to 4) ---

export async function executeReport(req, res, next) {
  try {
    const payload = validateBody(disciplinaryReportParamsSchema, req.body);
    const data = await disciplinaryService.executeDisciplinaryReport(
      req.tenantPrisma,
      payload,
      req.company
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function exportReportPdf(req, res, next) {
  try {
    const payload = validateBody(disciplinaryReportParamsSchema, req.body);
    const reportData = await disciplinaryService.executeDisciplinaryReport(
      req.tenantPrisma,
      payload,
      req.company
    );
    const pdfBuffer = await exportDisciplinaryReportToPdf(reportData);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Informe_Disciplinario_${payload.reportType}_${payload.dateFrom}_${payload.dateTo}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

