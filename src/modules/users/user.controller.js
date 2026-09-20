import * as userService from './user.service.js';

export async function list(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  const result = await userService.listUsers(req.user.accountId, { page, limit });
  return res.status(200).json(result);
}

export async function getById(req, res) {
  const user = await userService.getUserById(req.user.accountId, req.params.id);
  return res.status(200).json({ data: user });
}

export async function create(req, res) {
  const user = await userService.createUser({
    accountId: req.user.accountId,
    ...req.body,
  });

  return res.status(201).json({
    data: user,
    message: 'Usuario creado exitosamente',
  });
}

export async function update(req, res) {
  const user = await userService.updateUser(
    req.user.accountId,
    req.params.id,
    req.body
  );

  return res.status(200).json({
    data: user,
    message: 'Usuario actualizado correctamente',
  });
}

export async function remove(req, res) {
  await userService.deleteUser(req.user.accountId, req.params.id, req.user.id);
  return res.status(204).send();
}
