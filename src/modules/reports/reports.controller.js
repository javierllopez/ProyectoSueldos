import { ReportsService } from './reports.service.js';

export async function getMetadata(req, res, next) {
  try {
    const tenantPrisma = req.tenantPrisma || req.tenantClient;
    const metadata = await ReportsService.getMetadata(tenantPrisma);
    res.status(200).json({ success: true, data: metadata });
  } catch (error) {
    next(error);
  }
}

export async function listTemplates(req, res, next) {
  try {
    const tenantPrisma = req.tenantPrisma || req.tenantClient;
    const templates = await ReportsService.listTemplates(tenantPrisma);
    res.status(200).json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
}

export async function getTemplateById(req, res, next) {
  try {
    const tenantPrisma = req.tenantPrisma || req.tenantClient;
    const template = await ReportsService.getTemplateById(tenantPrisma, req.params.id);
    res.status(200).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
}

export async function createTemplate(req, res, next) {
  try {
    const tenantPrisma = req.tenantPrisma || req.tenantClient;
    const template = await ReportsService.createTemplate(tenantPrisma, req.body);
    res.status(201).json({ success: true, data: template, message: 'Plantilla de informe creada exitosamente' });
  } catch (error) {
    next(error);
  }
}

export async function updateTemplate(req, res, next) {
  try {
    const tenantPrisma = req.tenantPrisma || req.tenantClient;
    const template = await ReportsService.updateTemplate(tenantPrisma, req.params.id, req.body);
    res.status(200).json({ success: true, data: template, message: 'Plantilla actualizada exitosamente' });
  } catch (error) {
    next(error);
  }
}

export async function deleteTemplate(req, res, next) {
  try {
    const tenantPrisma = req.tenantPrisma || req.tenantClient;
    await ReportsService.deleteTemplate(tenantPrisma, req.params.id);
    res.status(200).json({ success: true, message: 'Plantilla eliminada exitosamente' });
  } catch (error) {
    next(error);
  }
}

export async function executeReport(req, res, next) {
  try {
    const tenantPrisma = req.tenantPrisma || req.tenantClient;
    const result = await ReportsService.executeReport(tenantPrisma, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function exportReport(req, res, next) {
  try {
    const tenantPrisma = req.tenantPrisma || req.tenantClient;
    const { format } = req.body;
    const { buffer, contentType, filename } = await ReportsService.exportReport(tenantPrisma, req.body);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}
