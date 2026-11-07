import { ensureTenantReportsSchema } from '../../services/tenantProvisioner.service.js';
import { getReportMetadata, executeReportData } from './engine/report-query-engine.js';
import { exportReportToExcel } from './exporters/excel-exporter.js';
import { exportReportToPdf } from './exporters/pdf-exporter.js';

const seedingLocks = new WeakMap();

function createHttpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export class ReportsService {
  /**
   * Obtiene el catálogo de campos disponibles (Metadata / Data Dictionary)
   */
  static async getMetadata(tenantClient) {
    await ensureTenantReportsSchema(tenantClient);
    return await getReportMetadata(tenantClient);
  }

  /**
   * Lista todas las plantillas guardadas en el tenant (crea una predeterminada de forma atómica si no existe ninguna)
   */
  static async listTemplates(tenantClient) {
    await ensureTenantReportsSchema(tenantClient);
    let templates = await tenantClient.reportTemplate.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    if (templates.length === 0) {
      if (!seedingLocks.has(tenantClient)) {
        const seedPromise = (async () => {
          const currentCount = await tenantClient.reportTemplate.count();
          if (currentCount === 0) {
            await tenantClient.reportTemplate.create({
              data: {
                name: 'Resumen de Sueldos por Departamento',
                description: 'Plantilla predeterminada con básico, retenciones, neto y gráfico por sector.',
                category: 'PAYROLL',
                isSystem: true,
                config: {
                  fields: [
                    { id: 'employee.fileNumber', title: 'Legajo', type: 'FIELD', format: 'TEXT', align: 'left', totalize: false },
                    { id: 'employee.fullName', title: 'Apellido y Nombre', type: 'FIELD', format: 'TEXT', align: 'left', totalize: false },
                    { id: 'department.name', title: 'Departamento', type: 'FIELD', format: 'TEXT', align: 'left', totalize: false },
                    { id: 'payslip.grossSalary', title: 'Sueldo Bruto', type: 'FIELD', format: 'CURRENCY', align: 'right', totalize: true },
                    { id: 'payslip.totalDeductions', title: 'Descuentos', type: 'FIELD', format: 'CURRENCY', align: 'right', totalize: true },
                    { id: 'payslip.netSalary', title: 'Sueldo Neto', type: 'FIELD', format: 'CURRENCY', align: 'right', totalize: true },
                  ],
                  groupings: ['department.name'],
                  filters: [],
                  chart: {
                    enabled: true,
                    type: 'bar',
                    title: 'Sueldo Neto por Departamento',
                    xAxisField: 'department.name',
                    yAxisField: 'payslip.netSalary',
                    aggregation: 'SUM',
                  },
                },
              },
            });
          }
        })().finally(() => {
          seedingLocks.delete(tenantClient);
        });
        seedingLocks.set(tenantClient, seedPromise);
      }

      await seedingLocks.get(tenantClient);
      templates = await tenantClient.reportTemplate.findMany({
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
    }

    return templates;
  }

  /**
   * Obtiene una plantilla por su ID
   */
  static async getTemplateById(tenantClient, id) {
    await ensureTenantReportsSchema(tenantClient);
    const template = await tenantClient.reportTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw createHttpError(`Plantilla con ID ${id} no encontrada`, 404);
    }
    return template;
  }

  /**
   * Crea una nueva plantilla de informe
   */
  static async createTemplate(tenantClient, data) {
    await ensureTenantReportsSchema(tenantClient);
    return await tenantClient.reportTemplate.create({
      data: {
        name: data.name,
        description: data.description || null,
        category: data.category || 'PAYROLL',
        isSystem: data.isSystem || false,
        config: data.config,
      },
    });
  }

  /**
   * Actualiza una plantilla existente
   */
  static async updateTemplate(tenantClient, id, data) {
    await ensureTenantReportsSchema(tenantClient);
    const existing = await tenantClient.reportTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw createHttpError(`Plantilla con ID ${id} no encontrada`, 404);
    }
    return await tenantClient.reportTemplate.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : existing.name,
        description: data.description !== undefined ? data.description : existing.description,
        category: data.category !== undefined ? data.category : existing.category,
        config: data.config !== undefined ? data.config : existing.config,
      },
    });
  }

  /**
   * Elimina una plantilla
   */
  static async deleteTemplate(tenantClient, id) {
    await ensureTenantReportsSchema(tenantClient);
    const existing = await tenantClient.reportTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw createHttpError(`Plantilla con ID ${id} no encontrada`, 404);
    }
    if (existing.isSystem) {
      throw createHttpError('No es posible eliminar plantillas predeterminadas del sistema', 403);
    }
    return await tenantClient.reportTemplate.delete({
      where: { id },
    });
  }

  /**
   * Ejecuta el informe retornando la estructura unificada con grupos y totales
   */
  static async executeReport(
    tenantClient,
    {
      templateId,
      config,
      periodId,
      periodFromId,
      periodToId,
      multiPeriodMode,
      groupFilterLevel1,
      groupFilterLevel2,
      employeeFrom,
      employeeTo,
      filtersOverride,
    }
  ) {
    await ensureTenantReportsSchema(tenantClient);

    let activeConfig = config;
    if (templateId) {
      const template = await this.getTemplateById(tenantClient, templateId);
      activeConfig = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
    }

    if (!activeConfig || !activeConfig.fields || activeConfig.fields.length === 0) {
      throw createHttpError('La configuración del informe no contiene columnas válidas', 400);
    }

    return await executeReportData(tenantClient, activeConfig, {
      periodId,
      periodFromId,
      periodToId,
      multiPeriodMode,
      groupFilterLevel1,
      groupFilterLevel2,
      employeeFrom,
      employeeTo,
      filtersOverride,
    });
  }

  /**
   * Exporta el informe ejecutado al formato solicitado (Excel o PDF)
   */
  static async exportReport(tenantClient, params) {
    const { format, chartImageBase64 } = params;
    const reportData = await this.executeReport(tenantClient, params);

    if (format === 'excel') {
      const buffer = await exportReportToExcel(reportData, chartImageBase64);
      return {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `informe-${Date.now()}.xlsx`,
      };
    } else if (format === 'pdf') {
      const buffer = await exportReportToPdf(reportData, chartImageBase64);
      return {
        buffer,
        contentType: 'application/pdf',
        filename: `informe-${Date.now()}.pdf`,
      };
    } else {
      throw createHttpError(`Formato de exportación '${format}' no soportado`, 400);
    }
  }
}
