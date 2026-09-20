# ProyectoSueldos — Buenas prácticas y convenciones

SaaS multi-tenant para liquidación de haberes. API REST en Node.js (CommonJS) + Express 5 + Prisma + MySQL.

Este archivo es la fuente de verdad para las convenciones de diseño, diagramación y codificación del proyecto. Toda contribución (humana o de IA) debe respetarlo.

## Idioma y comunicación

- El código se escribe en **inglés** (variables, funciones, modelos): `getEmployee`, no `obtenerEmpleado`. Excepción: términos del dominio previsional argentino sin traducción precisa (`aguinaldo`, `sac`, `cuil`) se mantienen en español.
- Comentarios, mensajes de error de la API y documentación: en **español**.
- La comunicación con Javier (el dueño del proyecto) es en español de Argentina, tono cordial y descontracturado.

## Arquitectura en capas

Flujo de una request: `routes → controllers → services → Prisma (DB)`.

| Capa | Responsabilidad | Prohibido |
|------|-----------------|-----------|
| `src/routes/` | Definir endpoints y encadenar middlewares (incl. validación Zod) | Lógica de negocio |
| `src/controllers/` | Leer `req` (ya validada) y armar `res` | Acceder a Prisma directamente; validar entrada |
| `src/services/` | Lógica de negocio y acceso a datos vía Prisma | Tocar `req`/`res` |
| `src/middlewares/` | Concerns transversales (auth, tenant, errores) | Lógica de un módulo puntual |
| `src/config/` | Configuración centralizada (env, prisma) | — |

Reglas:

- Un módulo de dominio = un trío `x.routes.js` + `x.controller.js` + `x.service.js`. Las rutas se montan **solo** en `src/routes/index.js`.
- `src/config/env.js` es el único lugar que lee `process.env`. El resto importa de ahí.
- `src/config/prisma.js` exporta la única instancia de `PrismaClient`. Nunca hacer `new PrismaClient()` en otro archivo.
- `app.js` no levanta el servidor (lo hace `server.js`); así la app es testeable con supertest.

## Multi-tenancy

- **Modelo: Database-per-Tenant.** Hay una base **MASTER** central (modelos `Account`, `User`, `CompanyRegistry`, `UserCompanyAccess`) que gestiona autenticación, permisos y el registro de empresas; y una **base física separada por cada empresa** con sus datos operativos (empleados, recibos, conceptos).
- **Jerarquía**: Un `Account` (Cuenta/Tenant) maneja múltiples `Company` (Empresa). Los datos operativos (empleados, recibos) viven en la base propia de cada empresa; la configuración global del cliente va en la base MASTER, asociada por `accountId`.
- **Orquestación de conexiones**: el middleware de tenant resuelve la empresa activa consultando `CompanyRegistry`, y antes de abrir conexión valida dos cosas: que la empresa pertenezca al `Account` autenticado **y** que exista el `UserCompanyAccess` del usuario. La URL se arma en runtime con `dbName`/`dbHost`/`dbPort` del registro + credenciales de variables de entorno (`TENANT_DB_USER`/`TENANT_DB_PASSWORD`). Nunca guardar credenciales ni connection strings completas en la base.
- Los `PrismaClient` de tenant se cachean por `dbName` (pool LRU con límite y desconexión al evictar); nunca crear un cliente nuevo por request.
- Nunca confiar en un `accountId`/`companyId` que venga del body o query string del cliente: el contexto de tenant sale del token autenticado y del middleware.
- En la base MASTER, los índices únicos de datos por cuenta son compuestos: `@@unique([accountId, cuit])`, no `@unique` a secas. En las bases de tenant no hace falta clave de tenant en cada tabla: la separación física ya la garantiza.

## Diseño de la API

- Prefijo versionado: `/api/v1`. Rutas en plural y kebab-case: `/api/v1/employees`, `/api/v1/pay-slips`.
- Verbos HTTP semánticos: GET (leer), POST (crear), PUT/PATCH (actualizar), DELETE (borrar). Nada de `/getEmployees` o `/employees/delete`.
- Respuestas de error siempre con la misma forma: `{ "error": { "message": "...", "status": 400 } }`.
- Códigos de estado correctos: 201 al crear, 204 al borrar sin body, 400 validación, 401/403 auth, 404 no encontrado, 409 conflicto, 500 solo para errores no manejados.
- Listados con paginación desde el día uno: `?page=1&limit=20`, respuesta con `data` y `meta` (total, página).

## Manejo de errores

- Los errores se propagan al `errorHandler` central (`src/middlewares/errorHandler.js`). No hay `try/catch` con `res.status(500)` repetido en cada controller.
- Al usar Express 5, no es necesario usar `asyncHandler`: los errores en funciones `async` fluyen automáticamente al middleware central. No agregar wrappers ni librerías tipo `express-async-handler`.
- Errores de negocio: lanzar errores con `status` y mensaje claro (ej. `err.status = 404`). El handler nunca filtra stack traces al cliente.

## Base de datos y Prisma

- Modelos en PascalCase singular (`Employee`, `PaySlip`); tablas/columnas mapeadas con `@@map`/`@map` a snake_case si hace falta.
- Todo cambio de schema entra por migración: `npm run prisma:migrate`. Nunca editar la base a mano ni usar `db push` fuera de experimentos locales.
- Campos de auditoría en toda tabla: `createdAt DateTime @default(now())` y `updatedAt DateTime @updatedAt`.
- Montos de dinero: `Decimal` con `@db.Decimal(12, 2)`. **Nunca** `Float` para plata.
- Fechas y horas: Se guardan siempre en UTC en la base de datos. Toda conversión a la zona horaria local (`America/Argentina/Buenos_Aires`) o formateo de fechas (ej. `YYYY-MM-DD`) se maneja con librerías estándar (como date-fns o dayjs) en la capa de servicios o frontend.
- Borrado lógico (`deletedAt`) para datos con valor legal/histórico (empleados, recibos); borrado físico solo para datos operativos sin historia.

## Estilo de código

- **ES Modules** (`import`/`export`); el `package.json` tiene `"type": "module"`. Nada de `require`/`module.exports`.
- Los imports de archivos propios llevan ruta relativa **con extensión**: `import routes from './routes/index.js'` (en ESM la extensión es obligatoria).
- No existen `__dirname`/`__filename`: usar `import.meta.dirname` / `import.meta.filename` (Node 20.11+).
- Convención de exports: `export default` para la pieza principal del archivo (router, app, instancia de config); exports con nombre para colecciones de funciones (controllers, services).
- `const` por defecto, `let` solo si se reasigna, `var` nunca.
- Funciones chicas y con un solo propósito; si un service pasa las ~50 líneas, evaluar partirlo.
- Nombres descriptivos: `calculateNetSalary`, no `calc` ni `procesar2`.
- Async/await siempre; nada de `.then()` encadenados ni callbacks.
- Comentarios solo para explicar el **porqué** (una regla de negocio, una restricción legal), no el qué hace la línea.
- Archivos: `camelCase.js` para código, sufijos por capa: `.routes.js`, `.controller.js`, `.service.js`.

## Seguridad

- Secretos únicamente en `.env` (que está en `.gitignore`); `.env.example` se mantiene actualizado sin valores reales.
- Validar y sanear toda entrada del cliente con **Zod**: los esquemas se definen por módulo y se aplican mediante un middleware de validación en la capa de rutas, **antes** de llegar al controlador. Al controller solo entran datos ya validados y tipados; nada de validar a mano con `if` sueltos adentro de controllers o services.
- `helmet` y `cors` siempre activos; cuando haya frontend definido, restringir `cors` a los orígenes reales.
- Datos sensibles (sueldos, CUIL) no se loguean nunca en texto plano.

## Frontend

- El frontend usa **Bootstrap** (v5) y **Tabler** como framework CSS: grilla, componentes y utilidades antes que CSS artesanal.
- **Combo Boxes con Filtrado en Tiempo Real (TomSelect)**: Todos los combos (`<select>`) de selección de datos (colaboradores, conceptos, sectores, puestos, obras sociales, modalidades, liquidaciones, etc.) deben incorporar búsqueda y filtrado en tiempo real en la medida en que el usuario tipea. Se utiliza la librería **TomSelect** mediante los helpers universales `initSearchableSelect()`, `updateSearchableSelect()`, `setSearchableSelectValue()`, `hideSelect()` y `showSelect()` de `app.js`. Se establece como estándar obligatorio que todo combo nuevo o futuro utilice este método.
- **Formato Estricto de Horas (HH:MM)**: En la carga, edición y visualización de novedades y conceptos con tipo de dato de horas (`HORAS`/`HOURS`), la interfaz debe permitir y mostrar exclusivamente el formato horario `HH:MM` (ej. `08:30`, `15:02`). La conversión hacia/desde decimal para la base de datos se realiza de forma estricta y transparente mediante `hoursToDecimal()` y `decimalToHours()`.
- **Protección de Conceptos Generales en Novedades**: Los conceptos de ámbito general (`scope === 'GENERAL'`) asignados a los colaboradores son visualizables en las novedades del empleado pero **no pueden ser editados ni eliminados** individualmente desde la ficha del colaborador (botones bloqueados en frontend y validación HTTP 400 en backend). Cualquier modificación debe efectuarse desde el módulo de Conceptos.


## Git y flujo de trabajo

- Commits chicos y atómicos, mensaje en español, imperativo: `agrega módulo de empleados`, `corrige cálculo de aguinaldo`.
- No commitear: `.env`, `node_modules`, archivos generados.
- Antes de dar por terminada una feature: el servidor levanta (`npm run dev`) y los endpoints nuevos se probaron al menos manualmente.

## Comandos útiles

```bash
npm run dev              # servidor con recarga automática
npm start                # servidor en modo producción
npm run prisma:migrate   # crear/aplicar migraciones
npm run prisma:generate  # regenerar el cliente de Prisma
npm run prisma:studio    # GUI para explorar la base
```

> Nota de entorno (terminal integrada de esta máquina): si `npm install` o `npx prisma` fallan con `ERR_INVALID_ARG_TYPE`, exportar antes `COMSPEC="C:\Windows\System32\cmd.exe"`.
