# Catálogo de Propuestas de Mejora Estratégicas — ProyectoSueldos

> **Propósito:** Registro persistente y fuente única de verdad con las 15 propuestas de mejora identificadas desde la perspectiva de Liquidación de Haberes y Legislación Laboral/Previsional Argentina, diseñadas para ser implementadas y probadas **una por una** mediante la skill `/trabajo-en-equipo`.

## Cómo invocar una propuesta con `/trabajo-en-equipo`

En cualquier conversación podés referenciar una propuesta por su **código**, **número** o **título**:

- `"/trabajo-en-equipo PROP-05"`
- `"/trabajo-en-equipo Implementar PROP-09 (Auditoría de variaciones intermensuales)"`
- `"/trabajo-en-equipo Trabajemos la propuesta 11 del catálogo"`

### Convención de Estados

| Estado | Significado |
| :--- | :--- |
| `PENDIENTE` | Propuesta registrada, pendiente de análisis en Fase 1. |
| `EN_CURSO` | Propuesta aprobada en Fase 1 y actualmente en Fase 2 (Ejecución / QA). |
| `IMPLEMENTADA` | Implementada, validada por QA y aprobada por el Auditor Adversarial y Asesor Legal. |
| `DESCARTADA` | Descartada por decisión del Director / Product Owner. |

---

## Tabla Índice Maestra

| Código | Eje | Propuesta | Estado | Trazabilidad / Notas |
| :---: | :---: | :--- | :---: | :--- |
| `PROP-01` | I | Gestión de Licencias, Ausentismo y 3 Tramos de Situación de Revista (Reg. 04 LSD / F.931) | `PENDIENTE` | — |
| `PROP-02` | I | Asistente Integral de Vacaciones (Arts. 150–155 LCT) con Compensación en Liquidación Mensual | `PENDIENTE` | — |
| `PROP-03` | I | Liquidador Asistido de Egresos e Indemnizaciones (Liquidación Final Arts. 123, 156, 232, 233, 245 LCT) | `IMPLEMENTADA` | Asistente modal + 9 causales (incl. Eventual y Período de Prueba Ley 27.802) + hoja persistente + bases ARCA/LRT (2026-11-18) |
| `PROP-04` | II | Importador de Reloj Control / Fichadas y Cruce Automático con Jornadas (`work_shifts`) | `PENDIENTE` | — |
| `PROP-05` | II | Evolución de Planilla Ágil: Arrastre de Período Anterior, Grilla Multiconcepto y Pegado Excel | `IMPLEMENTADA` | Grilla multiconcepto (`#pane-nov-nopers-matrix`) + arrastre dual cerrado/abierto + pegado Excel posicional y por Legajo/CUIL + Undo (2026-11-20) |
| `PROP-06` | II | Gestión de Cuotas y Saldos Decrecientes en Novedades Persistentes y Control Tope Art. 133 LCT | `PENDIENTE` | — |
| `PROP-07` | II | Liquidador Automático de Retroactivos por Homologación Tardía de Escalas Salariales (Paritarias) | `IMPLEMENTADA` | Tipo nativo `RETROACTIVE` (0d, prefijo `RT`, 11 conceptos) + ABM `allowsRetroactives` + Doble Simulación + SAC + Alerta Inactivos/Ganancias + Reg. 03 `AAAAMM` + Corridas auditables `409` (2026-11-24) |
| `PROP-08` | II | Validación Bancaria Módulo 10 de CBU (BCRA), Autocompletado DNI↔CUIL e Historial Laboral | `PENDIENTE` | — |
| `PROP-09` | III | Auditoría Inteligente de Variaciones Intermensuales (Comparador Mes Actual vs. Mes Anterior) | `PENDIENTE` | — |
| `PROP-10` | III | Simulador "Recibo en Vivo" y Depurador Paso a Paso en Editor de Fórmulas y Novedades | `PENDIENTE` | — |
| `PROP-11` | III | Control Unificado de Topes Previsionales Mensuales (SIPA / OS / Detracción) entre Liquidaciones del Mes | `PENDIENTE` | — |
| `PROP-12` | III | Tipificación Impositiva por Concepto para Ganancias 4ta Categoría (RG 4003) | `PENDIENTE` | — |
| `PROP-13` | IV | Exportador de Archivos TXT de Acreditación Bancaria de Haberes (Multibanco e Interbanking) | `PENDIENTE` | — |
| `PROP-14` | IV | Generador de Asiento Contable de Sueldos y Provisiones Mensuales por Centro de Costo (`departments`) | `PENDIENTE` | — |
| `PROP-15` | IV | Tablero de Conciliación Previa del F.931 ARCA y Exportadores Sindicales por Convenio | `PENDIENTE` | — |

---

## Eje I — Ciclo de Vida Laboral, Ausentismo y Asistentes Legales (LCT y ARCA)

### PROP-01 — Gestión de Licencias, Ausentismo y 3 Tramos de Situación de Revista (Registro 04 LSD / F.931)
- **Estado:** `PENDIENTE`
- **Eje:** I — Ciclo de Vida Laboral, Ausentismo y Asistentes Legales
- **Diagnóstico actual:** En `src/services/provisioner/tenantDdl.js` (`pay_slip_bases`) sólo se almacena un `situation_code` único por recibo (por defecto `'01'` Activo), y el módulo disciplinario (`src/modules/disciplinary/disciplinary.service.js`) registra `suspension_days` en `employee_sanctions`, sin impactar automáticamente en la liquidación ni en el LSD.
- **Alcance propuesto:** Incorporar un submódulo de **Ausencias y Licencias por Fechas** (Enfermedad inculpable Art. 208, Maternidad Art. 177 cód. ARCA `05`, Excedencia cód. `10`, Licencia sin goce cód. `13`, Reserva de puesto Art. 211 cód. `14`, ILT/ART primeros 10 días cód. `18` y día 11+ cód. `19`, y Suspensiones cód. `06` sincronizadas desde Régimen Disciplinario) que:
  1. Inyecte automáticamente las novedades de días de descuento y días de licencia paga en la liquidación abierta del período.
  2. Complete automáticamente en el **Registro 04 del LSD** (`src/modules/payroll/lsdExporter.service.js`) los **3 tramos de Situación de Revista** (`Situación 1 / Día inicio 1`, `Situación 2 / Día inicio 2`, `Situación 3 / Día inicio 3`) y la cantidad de días trabajados o de maternidad.
- **Fundamento detallado:** Cuando un trabajador inicia o finaliza una licencia por Maternidad, ILT/ART o Licencia sin goce a mitad de mes, ARCA rechaza el envío o calcula incorrectamente asignaciones familiares y aportes/contribuciones en el F.931 si no se informan los tramos exactos con su día de inicio dentro del período.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

### PROP-02 — Asistente Integral de Vacaciones (Arts. 150 a 155 LCT) con Compensación Automática en la Mensual
- **Estado:** `PENDIENTE`
- **Eje:** I — Ciclo de Vida Laboral, Ausentismo y Asistentes Legales
- **Diagnóstico actual:** Existe el tipo de liquidación `VACATION`, pero la determinación de los días legales que corresponden por antigüedad al 31/12 y el descuento posterior de los días adelantados dentro de la liquidación `MONTHLY` requieren carga manual.
- **Alcance propuesto:** Crear un **Planificador y Asistente de Vacaciones** que calcule automáticamente los días legales según antigüedad al 31/12 del año que corresponda (14, 21, 28 o 35 días corridos, o 1 día cada 20 trabajados conforme Art. 153 LCT cuando no alcanza la mitad de los días hábiles), liquide el adelanto vacacional (divisor 25 + promedio de remuneraciones variables de 6 o 12 meses según opción más favorable Art. 155 LCT) y **genere automáticamente la novedad de descuento de días vacacionados** en la liquidación Mensual del período respectivo.
- **Fundamento detallado:** Evita uno de los errores operativos más frecuentes y costosos en nómina: pagar el recibo de adelanto de vacaciones y olvidar descontar esos días de la base 30 en el recibo mensual, duplicando remuneraciones y bases imponibles del F.931.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

### PROP-03 — Liquidador Asistido de Egresos e Indemnizaciones (Liquidación Final Arts. 123, 156, 232, 233 y 245 LCT)
- **Estado:** `IMPLEMENTADA`
- **Eje:** I — Ciclo de Vida Laboral, Ausentismo y Asistentes Legales
- **Diagnóstico actual:** Al cerrar una liquidación tipo `FINAL` en `src/modules/payroll/services/periodClosing.service.js`, el sistema gestiona la baja automática del legajo, pero la activación y determinación de cada rubro indemnizatorio o proporcional según causal de egreso es manual.
- **Alcance propuesto:** Incorporar un **Asistente de Liquidación Final** donde, al indicar la fecha de egreso y la causal (Renuncia, Despido sin causa, Despido con causa, Período de prueba Art. 92 bis, Mutuo acuerdo Art. 241, Jubilación, Fallecimiento Art. 248), el sistema:
  - Calcule automáticamente días trabajados del mes de baja, SAC proporcional (Art. 123 LCT) y Vacaciones No Gozadas + SAC sobre VNG (Art. 156 LCT).
  - Para despidos incausados, proponga la **Mejor Remuneración Mensual, Normal y Habitual (MRMNH)** de los últimos 12 meses (mostrando el recibo de origen), calcule Indemnización por Antigüedad (Art. 245 LCT, con control de tope convencional y criterio *Vizzoti* del 67%), Preaviso + SAC s/Preaviso (Art. 232 LCT) e Integración del mes de despido + SAC s/Integración (Art. 233 LCT).
- **Fundamento detallado:** Las liquidaciones finales concentran la mayor exposición a reclamos judiciales y multas; requieren precisión absoluta entre conceptos remunerativos sujetos a aportes y conceptos indemnizatorios no remunerativos exentos de SUSS y Ganancias.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* [`fase1_brainstorming_prop03_liquidacion_final.md`](file:///C:/Users/javie/.gemini/antigravity/brain/1cfed17e-e045-4426-bd05-0a105f71fade/fase1_brainstorming_prop03_liquidacion_final.md) (2026-11-18 — aprobada con Opción A unánime, causal 9 Fin contrato eventual y confirmación Art. 48 Ley 27.802)
  - *Fase 2 (Ejecución):* [`fase2_ejecucion_prop03_liquidacion_final.md`](file:///C:/Users/javie/.gemini/antigravity/brain/1cfed17e-e045-4426-bd05-0a105f71fade/fase2_ejecucion_prop03_liquidacion_final.md) (2026-11-18 — Implementada y verificada end-to-end)

---

## Eje II — Agilización del Ingreso de Datos y Automatización Masiva

### PROP-04 — Importador de Reloj Control / Fichadas y Cruce Automático con Jornadas (`work_shifts`)
- **Estado:** `PENDIENTE`
- **Eje:** II — Agilización del Ingreso de Datos y Automatización Masiva
- **Diagnóstico actual:** El sistema cuenta con un modelado completo de jornadas y horarios por día en `work_shifts` y `work_shift_details` (`src/modules/organization/workShift.service.js`), pero esas grillas aún no se cruzan con marcaciones reales de asistencia para generar novedades.
- **Alcance propuesto:** Incorporar un importador de planillas de reloj biométrico (CSV/Excel de fichadas o resumen diario de horas) que contraste las horas cumplidas contra la jornada asignada al colaborador y genere automáticamente en el período abierto las novedades de **Horas Normales (jornalizados), Horas Extras al 50% y 100% (Art. 201 LCT), Horas Nocturnas (Art. 200 LCT) y Tardanzas/Inasistencias**.
- **Fundamento detallado:** En empresas industriales, comerciales, gastronómicas y de servicios por turnos, traducir reportes de reloj a unidades liquidables demanda el mayor porcentaje del tiempo operativo de cada cierre quincenal o mensual.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

### PROP-05 — Evolución de la "Planilla Ágil": Arrastre de Período Anterior, Grilla Multiconcepto y Pegado desde Excel
- **Estado:** `IMPLEMENTADA`
- **Eje:** II — Agilización del Ingreso de Datos y Automatización Masiva
- **Diagnóstico actual:** La Planilla Ágil (`public/js/modules/payroll/noveltiesAndBatch.js`) permite cargar un concepto por vez sobre la nómina filtrada, y al cerrar el mes las novedades no persistentes se purgan (`periodClosing.service.js`).
- **Alcance propuesto:**
  1. Incorporar la acción **"Copiar del período anterior"** (permitiendo elegir entre *traer los mismos legajos con valor en 0 para completar* o *clonar unidades/importes de una liquidación previa*).
  2. Agregar el **modo Grilla Multiconcepto (Matriz Empleado × Conceptos)**: elegir varios conceptos simultáneos como columnas (ej. *Hs Extras 50%*, *Hs Extras 100%*, *Feriados*, *Comisiones*, *Adelanto*) y operar toda la carga en una única grilla editable con teclado (`Enter`/`Tab`/flechas) y soporte de pegado directo (`Ctrl+V`) de rangos tabulares copiados desde Excel.
- **Fundamento detallado:** En la práctica diaria, el liquidador trabaja con sábanas operativas donde cada trabajador acumula varias novedades en el mismo mes; unificar la carga en una vista matricial con navegación por teclado y pegado desde Excel reduce drásticamente el tiempo y los errores de tipeo.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* [`fase1_brainstorming_prop05_planilla_agil_multiconcepto.md`](file:///C:/Users/javie/.gemini/antigravity/brain/1cfed17e-e045-4426-bd05-0a105f71fade/fase1_brainstorming_prop05_planilla_agil_multiconcepto.md) (2026-11-19 / 2026-11-20 — aprobada con Opción A en las 3 decisiones)
  - *Fase 2 (Ejecución):* [`fase2_ejecucion_prop05_planilla_agil_multiconcepto.md`](file:///C:/Users/javie/.gemini/antigravity/brain/1cfed17e-e045-4426-bd05-0a105f71fade/fase2_ejecucion_prop05_planilla_agil_multiconcepto.md) (2026-11-20 — Implementada y verificada end-to-end)

---

### PROP-06 — Gestión de Cuotas y Saldos Decrecientes en Novedades Persistentes y Control de Tope Art. 133 LCT
- **Estado:** `PENDIENTE`
- **Eje:** II — Agilización del Ingreso de Datos y Automatización Masiva
- **Diagnóstico actual:** La tabla `employee_concepts` (`src/services/provisioner/tenantDdl.js`) soporta `valid_from` y `valid_to`, pero no controla cantidad de cuotas ni saldo pendiente.
- **Alcance propuesto:** Incorporar **Planes de Cuotas** (`total_installments`, `paid_installments`, `remaining_balance`) en los conceptos persistentes del legajo. Al cerrar cada liquidación, el sistema avanza automáticamente la cuota cobrada, imprime en el recibo la leyenda *"Cuota X/N"*, desactiva el concepto al saldar la última cuota y advierte en pre-cierre si el total de deducciones por préstamos/adelantos/cuotas excede el **tope del 20% previsto en el Art. 133 LCT** (considerando sus excepciones normativas).
- **Fundamento detallado:** Elimina el seguimiento paralelo en planillas externas de préstamos al personal, compras o descuentos en cuotas, previniendo el descuento indebido de cuotas ya canceladas o retenciones por encima de los límites de intangibilidad salarial.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

### PROP-07 — Liquidador Automático de Retroactivos por Homologación Tardía de Escalas Salariales (Paritarias)
- **Estado:** `IMPLEMENTADA`
- **Eje:** II — Agilización del Ingreso de Datos y Automatización Masiva
- **Diagnóstico actual:** El módulo de escalas (`src/modules/payroll/salaryScale.service.js`) soporta múltiples períodos de vigencia y aumentos masivos, pero si se homologa una paritaria retroactiva que modifica escalas de meses ya cerrados, el cálculo de diferencias por legajo debe hacerse fuera del sistema.
- **Alcance propuesto:** Crear la utilidad **"Generar Diferencias por Retroactivo Paritario"**: seleccionando el rango de períodos cerrados alcanzados por el acuerdo, la escala actualizada y la liquidación abierta destino, el motor re-simula los recibos cerrados con los valores nuevos, determina la diferencia exacta por concepto dependiente (Básico, Antigüedad, Presentismo, Horas Extras, etc.) y genera automáticamente las novedades o conceptos de ajuste retroactivo listos para liquidar.
- **Fundamento detallado:** Las homologaciones paritarias con efecto retroactivo son recurrentes en Argentina; calcular manualmente el impacto en cascada sobre adicionales porcentuales y horas extras de meses cerrados es altamente propenso a errores.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* [fase1_brainstorming_prop07_retroactivos_paritarios_v3.md](file:///C:/Users/javie/.gemini/antigravity/brain/1cfed17e-e045-4426-bd05-0a105f71fade/fase1_brainstorming_prop07_retroactivos_paritarios_v3.md)
  - *Fase 2 (Ejecución):* [fase2_ejecucion_prop07_retroactivos_paritarios.md](file:///C:/Users/javie/.gemini/antigravity/brain/1cfed17e-e045-4426-bd05-0a105f71fade/fase2_ejecucion_prop07_retroactivos_paritarios.md) (Implementado `2026-11-24`)

---

### PROP-08 — Validación Bancaria Módulo 10 de CBU (BCRA), Autocompletado DNI↔CUIL e Historial de Carrera del Legajo
- **Estado:** `PENDIENTE`
- **Eje:** II — Agilización del Ingreso de Datos y Automatización Masiva
- **Diagnóstico actual:** En `src/modules/employees/services/employeeCore.service.js` se valida el CUIL, pero el CBU sólo controla longitud de 22 dígitos y las modificaciones de categoría, puesto, jornada o básico reemplazan el dato previo sin trazabilidad histórica.
- **Alcance propuesto:**
  1. Validar ambos **dígitos verificadores oficiales del CBU (Módulo 10 BCRA)** en bloque 1 (banco/sucursal) y bloque 2 (cuenta), identificando automáticamente la entidad bancaria desde los primeros 3 dígitos.
  2. Sugerir/autocompletar el **DNI a partir del CUIL** (posiciones 3–10) y viceversa al cargar un alta de legajo.
  3. Incorporar una pestaña de **Historial Laboral del Legajo** que registre cambios de puesto, categoría, jornada y remuneración con fecha de vigencia y motivo.
- **Fundamento detallado:** Evita rechazos de acreditación bancaria en el día de pago por un CBU mal tipeado, acelera altas de personal y brinda respaldo documental para cambios de categoría a mitad de mes y confección del Certificado de Trabajo Art. 80 LCT.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

## Eje III — Motor de Cálculo, Auditoría Pre-Cierre y Precisión Fiscal

### PROP-09 — Auditoría Inteligente de Variaciones Intermensuales (Comparador Mes Actual vs. Mes Anterior)
- **Estado:** `PENDIENTE`
- **Eje:** III — Motor de Cálculo, Auditoría Pre-Cierre y Precisión Fiscal
- **Diagnóstico actual:** El pre-flight de cierre (`src/modules/payroll/services/periodClosing.service.js`) verifica LSD, Ganancias, bajas y novedades a purgar, pero no contrasta variaciones cuantitativas frente al mes inmediato anterior.
- **Alcance propuesto:** Incorporar en el flujo previo al cierre un **Tablero de Control de Desvíos Intermensuales** que señale automáticamente:
  - Legajos con variación de Remuneración Bruta o Sueldo Neto superior al umbral parametrizable (ej. ±15%), detallando qué conceptos explican la diferencia.
  - Legajos activos omitidos sin recibo en la liquidación actual.
  - Recibos con neto `$0`, neto negativo o porcentaje anormal de deducciones.
  - Tabla comparativa agrupada por concepto (*Mes Anterior vs. Mes Actual* en cantidad de empleados e importe total).
- **Fundamento detallado:** Permite al liquidador detectar en segundos una novedad cargada con un dígito de más, una fórmula mal asignada o un colaborador omitido antes de transferir haberes y confirmar el período.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

### PROP-10 — Simulador "Recibo en Vivo" y Depurador Paso a Paso en Editor de Fórmulas y Novedades
- **Estado:** `PENDIENTE`
- **Eje:** III — Motor de Cálculo, Auditoría Pre-Cierre y Precisión Fiscal
- **Diagnóstico actual:** El motor guarda `formula_explanation` en `pay_slip_items`, pero para comprobar el resultado de una fórmula (`public/js/modules/concepts.view.js`) o ver cómo impacta una novedad cargada es necesario correr o recalcular la liquidación.
- **Alcance propuesto:**
  1. Agregar en el modal de Conceptos un panel **"Probar Fórmula con Legajo Real"** que seleccione un empleado y un período y muestre en vivo el resultado junto con el desglose de cada token evaluado (`[SUELDO_BASICO]`, `[ANTIGUEDAD]`, funciones `MEJOR_6M`, etc.).
  2. Agregar en la carga de Novedades por Empleado un botón **"Simular Recibo"** para visualizar en tiempo real el recibo resultante sin persistir cambios definitivos ni re-procesar toda la nómina.
- **Fundamento detallado:** Agiliza enormemente el diseño y depuración de fórmulas convencionales complejas y permite responder consultas de RRHH sobre netos estimados antes de liquidar.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

### PROP-11 — Control Unificado de Topes Previsionales Mensuales (SIPA / Obra Social / Detracción) entre Múltiples Liquidaciones del Mes
- **Estado:** `PENDIENTE`
- **Eje:** III — Motor de Cálculo, Auditoría Pre-Cierre y Precisión Fiscal
- **Diagnóstico actual:** En `payroll_settings` se definen `anses_min_cap`, `anses_max_cap` y `detraction_base`, pero al existir múltiples liquidaciones dentro de un mismo período fiscal mensual (`payroll_periods` bajo un mismo `fiscal_period_id`), debe consolidarse el consumo acumulado de topes y detracciones del mes.
- **Alcance propuesto:** Hacer que el motor de cálculo consulte todas las liquidaciones previas del mismo `fiscal_period_id` (ej. *1ra Quincena* + *2da Quincena*, o *Mensual* + *Bono* + *Adicional*) y **descuente el cupo de tope previsional máximo (`anses_max_cap`) y de detracción patronal (`detraction_base`) ya utilizado en el mes** (considerando además ingresos de otros empleadores informados para pluriempleo cuando corresponda).
- **Fundamento detallado:** El tope máximo de aportes y las detracciones previsionales aplican por trabajador y por período fiscal mensual devengado, no por recibo aislado; topear por separado cada liquidación del mes provoca retenciones en exceso al empleado y diferencias al presentar el F.931 mensual consolidado en ARCA.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

### PROP-12 — Tipificación Impositiva por Concepto para Ganancias 4ta Categoría (Habitual, No Habitual Prorrateable, SAC, Exentos)
- **Estado:** `PENDIENTE`
- **Eje:** III — Motor de Cálculo, Auditoría Pre-Cierre y Precisión Fiscal
- **Diagnóstico actual:** El motor de Ganancias (`src/modules/income-tax/incomeTax.calculator.js`) calcula retenciones acumuladas y proyección de SAC, pero los registros de `concepts` no poseen una clasificación normativa explícita para el tratamiento de cada concepto frente a la RG 4003 y Ley de Impuesto a las Ganancias.
- **Alcance propuesto:** Agregar en el ABM de Conceptos el atributo **Tratamiento Impositivo en Ganancias 4ta Categoría**:
  - `GRAVADO_HABITUAL` (integra ganancia bruta del mes y base para cálculo de SAC presunto).
  - `GRAVADO_NO_HABITUAL` (bonos y gratificaciones extraordinarias: prorrateo automático en cuotas iguales desde el mes de pago hasta diciembre conforme RG 4003).
  - `SAC_REAL` (en junio, diciembre o baja sustituye las doceavas partes proyectadas acumuladas).
  - `EXENTO_O_NO_ALCANZADO` (indemnizaciones por antigüedad, reintegros documentados hasta topes legales, rubros exentos según normativa vigente).
- **Fundamento detallado:** Automatiza el tratamiento diferencial de gratificaciones no habituales, liquidaciones finales y conceptos exentos, asegurando consistencia plena entre la retención mensual y la generación anual/final del F.1359.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

## Eje IV — Tesorería, Contabilidad y Entregables Post-Nómina

### PROP-13 — Exportador de Archivos TXT de Acreditación Bancaria de Haberes (Multibanco e Interbanking)
- **Estado:** `PENDIENTE`
- **Eje:** IV — Tesorería, Contabilidad y Entregables Post-Nómina
- **Diagnóstico actual:** Los legajos y `pay_slips` almacenan CBU, tipo de cuenta y banco, pero el sistema no genera los archivos TXT requeridos por los bancos para el pago masivo de haberes.
- **Alcance propuesto:** Incorporar en la vista de Recibos / Liquidaciones el exportador **"Acreditación Bancaria"** con layouts parametrizados para **Interbanking (Datanet), Galicia, Santander, BBVA, Macro, Banco Nación y Banco Provincia**, ejecutando validación previa de CBUs faltantes o inválidos y emitiendo la planilla de control de netos a transferir (PDF/Excel) para Tesorería.
- **Fundamento detallado:** Completa el circuito operativo desde la liquidación hasta el pago efectivo en banco, eliminando la carga manual o transformación riesgosa de archivos en planillas intermedias.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

### PROP-14 — Generador de Asiento Contable de Sueldos y Provisiones Mensuales por Centro de Costo (`departments`)
- **Estado:** `PENDIENTE`
- **Eje:** IV — Tesorería, Contabilidad y Entregables Post-Nómina
- **Diagnóstico actual:** Cada `PaySlip` persiste el detalle completo por subsistema patronal (`sipa_contrib`, `inssjyp_contrib`, `os_contrib`, `fne_contrib`, `aaff_contrib`, `art_contrib`, `scvo_contrib`, `union_contrib`), pero no existe generación del asiento contable.
- **Alcance propuesto:** Incorporar un configurador de **Mapeo de Cuentas Contables para Nómina** (cuentas de gastos por sector/centro de costos y cuentas de pasivo por remuneraciones a pagar, SUSS, Obra Social, Sindicato, Retenciones Ganancias, Embargos) que genere el **Asiento de Devengamiento de Sueldos y Cargas Sociales** (cuadrado al centavo en Debe = Haber) y el **Asiento de Provisión Mensual de SAC (8,33%) y Vacaciones**, exportable a Excel, PDF y CSV para ERP contables.
- **Fundamento detallado:** Evita la contabilización manual mensual a partir de resúmenes externos, conectando directamente los resultados auditados de cada cierre con el área contable de la empresa.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`

---

### PROP-15 — Tablero de Conciliación Previa del F.931 ARCA y Exportadores Sindicales por Convenio
- **Estado:** `PENDIENTE`
- **Eje:** IV — Tesorería, Contabilidad y Entregables Post-Nómina
- **Diagnóstico actual:** `lsdExporter.service.js` genera los archivos planos de 195 y 370 caracteres para ARCA, y el generador de informes permite reportes a medida, pero no existe una pantalla que simule los importes totales del F.931 previo al envío ni listados sindicales preconfigurados por gremio.
- **Alcance propuesto:**
  1. Agregar en la sección de **Libro Digital (ARCA)** un **"Tablero Borrador F.931"** que totalice las Bases Imponibles 1 a 10 y detracción de todos los CUILs del período fiscal, calculando el importe estimado a ingresar por cada impuesto/concepto del F.931 (*Aportes SIPA, Contribuciones SIPA, Obra Social, FSR/ANSSAL, INSSJyP, ART fija + variable, SCVO*).
  2. Incorporar exportadores directos para los sindicatos configurados en `unions` discriminando personal afiliado vs. no afiliado (cuota sindical, aporte solidario y contribuciones convencionales).
- **Fundamento detallado:** Permite conciliar las cargas sociales a pagar antes de subir los archivos al portal Libro de Sueldos Digital de ARCA, reduciendo drásticamente rectificativas del F.931 y facilitando las declaraciones sindicales mensuales.
- **Trazabilidad:**
  - *Fase 1 (Brainstorming):* `—`
  - *Fase 2 (Ejecución):* `—`
