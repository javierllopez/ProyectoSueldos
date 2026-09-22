---
name: gemini-notebooklm
description: >-
  Permite consultar el cuaderno de Google NotebookLM / Gemini Notebook que contiene
  legislación laboral argentina, convenios colectivos de trabajo (CCT), normas previsionales,
  resoluciones de ARCA (ex-AFIP) y criterios de liquidación de haberes para este proyecto.
---

# Integración con Google NotebookLM / Gemini Notebook

Este skill define cómo Antigravity debe consultar e interactuar con el cuaderno de legislación laboral y sueldos del usuario almacenado en Google NotebookLM.

## Cuándo usar este skill

Usar este skill siempre que el usuario o el flujo de trabajo requiera:
1. Conocer o confirmar la interpretación legal de la **Ley de Contrato de Trabajo (LCT 20.744)**, Ley de Bases / 27.802, decretos y resoluciones.
2. Obtener o validar fórmulas y bases de cálculo de conceptos laborales (horas extras, vacaciones, SAC, indemnizaciones por despido art. 245, topes indemnizatorios, licencias especiales, etc.).
3. Consultar escalas salariales, adicionales y acuerdos de Convenios Colectivos de Trabajo (CCT) cargados en el cuaderno.
4. Consultar especificaciones de Libro de Sueldos Digital (LSD) y normativas de ARCA / ANSES / Ministerio de Trabajo.

## Formas de consulta

### 1. Vía Servidor MCP (`notebooklm`)
El servidor MCP está configurado globalmente en `~/.gemini/config/mcp_config.json`:
- `ask_question`: Realiza preguntas grounding directo contra las fuentes del cuaderno activo.
- `list_notebooks`: Muestra los cuadernos registrados en la biblioteca local.
- `select_notebook`: Selecciona el cuaderno activo.
- `get_health`: Verifica si el servidor está autenticado y en línea.

### 2. Vía Scripts de Terminal del Proyecto
Si se necesita ejecutar o comprobar desde la consola:
- `npm run notebook:status` -> Estado de conexión, autenticación y cuaderno seleccionado.
- `npm run notebook:auth` -> Abre Google Chrome para iniciar sesión en Google y guardar cookies.
- `npm run notebook:add <URL> [NOMBRE]` -> Registra y activa un cuaderno a partir de su enlace compartido de NotebookLM.
- `npm run notebook:query "pregunta..."` -> Realiza una consulta directa e imprime la respuesta y fuentes citadas.
