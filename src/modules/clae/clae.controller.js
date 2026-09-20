import * as claeService from './clae.service.js';

export async function list(req, res) {
  const { q, limit, page } = req.query;
  const result = await claeService.listClaeActivities({ q, limit, page });
  return res.status(200).json(result);
}

export async function getByCode(req, res) {
  const { code } = req.params;
  const activity = await claeService.getClaeByCode(code);
  return res.status(200).json({ data: activity });
}
