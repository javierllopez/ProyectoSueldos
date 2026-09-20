import * as authService from './auth.service.js';

export async function register(req, res) {
  const result = await authService.register(req.body);
  return res.status(201).json({
    data: result,
    message: 'Cuenta creada con éxito',
  });
}

export async function login(req, res) {
  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const result = await authService.login({
    ...req.body,
    ipAddress,
    userAgent,
  });

  return res.status(200).json({
    data: result,
    message: 'Autenticación exitosa',
  });
}

export async function refresh(req, res) {
  const result = await authService.refreshAccessToken({
    refreshTokenString: req.body.refreshToken,
  });

  return res.status(200).json({
    data: result,
    message: 'Token renovado con éxito',
  });
}

export async function logout(req, res) {
  await authService.logout({
    refreshTokenString: req.body.refreshToken,
  });

  return res.status(200).json({
    message: 'Sesión cerrada correctamente',
  });
}

export async function me(req, res) {
  return res.status(200).json({
    data: {
      user: req.user,
    },
  });
}
