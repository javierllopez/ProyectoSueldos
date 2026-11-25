---
name: git-sync
description: "Sincroniza el repositorio local con GitHub de forma segura: audita archivos sensibles, genera commits semánticos (Conventional Commits), actualiza la rama remota y realiza el push."
triggers: ["/git-sync", "actualizar repo", "subir a github", "push cambios"]
---

Actúa como un **Arquitecto DevOps Senior** encargado de sincronizar de manera segura, rápida y estandarizada este repositorio local con GitHub.

### Reglas Generales de Seguridad DevOps
- **Prohibido** usar `git push --force` o `--no-verify`.
- **Prohibido** ejecutar `git add .` antes de completar la **Fase 1 (Auditoría de Seguridad y Estado)**.
- **Compatibilidad Windows / PowerShell:** si ejecutas comandos encadenados en PowerShell, evita operadores incompatibles como `&&` y valida explícitamente `$LASTEXITCODE` ante cada paso crítico.
- Si ocurre cualquier bloqueo de seguridad o conflicto, **detén la ejecución de inmediato** e informa al usuario con detalle accionable.

---

### Fase 1: Auditoría de Seguridad y Estado (Bloqueante)
1. Verifica que exista una rama activa (no *detached HEAD*) y que no haya un `rebase` o `merge` inconcluso:
   - `git branch --show-current`
   - `git status --short --untracked-files=all`
2. Inspecciona los cambios pendientes y preparados:
   - `git diff --cached`
   - `git diff`
3. **Control de cambios vacíos:** si `git status --short` no devuelve archivos modificados ni archivos sin seguimiento (*untracked*), informa al usuario que el árbol de trabajo está limpio y **detén la ejecución**.
4. **Filtro de Secretos (Bloqueo Inmediato):** audita todas las rutas devueltas por `git status --short --untracked-files=all` y el contenido de `git diff` / `git diff --cached` comprobando que **NO** estén por incluirse fuera de `.gitignore`:
   - Variables de entorno y secretos locales: `.env`, `.env.local`, `.env.*` (únicamente se permiten plantillas explícitas sin valores reales como `.env.example`).
   - Claves privadas y certificados: `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`.
   - Credenciales y artefactos sensibles: archivos de credenciales (`*credentials*.json`, `*secret*`, `*service-account*.json`), tokens/API keys hardcodeados en el diff o carpetas `node_modules/`.
   - **Acción ante exposición:** si detectas cualquiera de estos elementos, **aborta inmediatamente**, NO ejecutes `git add`, lista exactamente qué archivo(s) o líneas están expuestas y sugiere agregarlos al `.gitignore` o remover el secreto antes de reintentar.

---

### Fase 2: Preparación y Mensaje Semántico
1. Analiza el resumen de archivos modificados, agregados o eliminados (`git status --short` y `git diff --stat`).
2. **Construcción del mensaje bajo Conventional Commits:**
   - **Si el usuario incluyó texto junto al comando** (ejemplo: `/git-sync arreglo en liquidación F931`), tómalo como base, respeta su intención y normalízalo al estándar Conventional Commits en español (`fix: ...`, `feat: ...`, etc.).
   - **Si el usuario no especificó mensaje**, redacta automáticamente un mensaje claro en español siguiendo **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `perf:`):
     - Título breve de **máximo 72 caracteres** en imperativo/descriptivo.
     - Cuerpo con **viñetas concisas** si los cambios abarcan múltiples módulos o capas (p. ej. backend + frontend + docs).
3. Superada la Fase 1 sin hallazgos, prepara el área de trabajo con:
   - `git add .`
4. Re-verifica el índice (`git diff --cached --name-only`) para confirmar que ningún archivo sensible haya quedado en *stage* antes del commit.

---

### Fase 3: Sincronización Remota y Push
1. Obtén y valida el nombre de la rama actual:
   - `$branch = git branch --show-current`
   - Si `$branch` está vacío (*detached HEAD*), detén el flujo e informa al usuario.
2. Registra el commit local:
   - Título único: `git commit -m "<título>"`
   - Si posee cuerpo con viñetas: `git commit -m "<título>" -m "<viñetas>"`
3. Actualiza la rama local desde remoto preservando historial lineal:
   - `git pull --rebase origin $branch`
   - **Manejo de conflictos:** si `git pull --rebase` falla por conflicto de merge/rebase, **detén inmediatamente la ejecución**, lista los archivos en conflicto (`git diff --name-only --diff-filter=U`) y solicita intervención manual del usuario (indicando no continuar con `push` hasta resolver y correr `git rebase --continue` o abortar con `git rebase --abort`).
   - *(Excepción controlada: si la rama local aún no existe en `origin`, infórmalo y realiza `git push -u origin $branch`.)*
4. Publica los cambios confirmados en GitHub:
   - `git push origin $branch`

---

### Fase 4: Reporte Final
Al completar el `push` con código de salida `0`, consulta:
- Hash corto del commit: `git rev-parse --short HEAD`
- Estadística exacta de archivos: `git show --stat --format="" HEAD`

Presenta al usuario un resumen compacto en Markdown con estos datos verificados:

```markdown
### Sincronización con GitHub completada
- **Rama actualizada:** `<rama_actual>`
- **Hash del commit:** `<hash_corto>`
- **Mensaje aplicado:** `<título_del_commit>`
- **Cantidad de archivos modificados:** `<N>` archivos (`+<ins>` / `-<del>`)
```
