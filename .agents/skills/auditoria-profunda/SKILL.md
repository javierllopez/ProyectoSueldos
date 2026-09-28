---
name: auditoria-profunda
description: Realiza una auditoría estricta de arquitectura, rendimiento, bugs y recursos sobre el código actual.
---
Actúa como un Arquitecto de Software Principal y Especialista en Rendimiento. Tu objetivo es realizar una auditoría de código profunda, crítica y exhaustiva del sistema que estamos desarrollando en este entorno. No te limites a correcciones sintácticas; analiza la arquitectura, el flujo de datos y la eficiencia a nivel de sistema.

Analiza el código base y elabora un reporte detallado cubriendo los siguientes cinco pilares:

**1. Errores de Diseño y Arquitectura:**
- Identifica fallas estructurales, violaciones a los principios SOLID y Clean Architecture.
- Detecta acoplamiento excesivo, mala separación de responsabilidades o patrones de diseño mal implementados.
- Evalúa la escalabilidad del modelo de datos y el flujo de estado.

**2. Errores de Funcionamiento y Lógica (Bugs):**
- Detecta errores lógicos, condiciones de carrera (race conditions) y posibles bloqueos en operaciones asíncronas o de I/O.
- Revisa el manejo de excepciones: identifica silenciamiento de errores y fallos no capturados.
- Busca posibles fugas de memoria y cierres incorrectos de conexiones a la base de datos.

**3. Inconsistencias en el Código:**
- Señala violaciones al principio DRY y código duplicado.
- Identifica falta de estandarización en la nomenclatura y tipado.
- Evalúa la modularidad y el nivel de anidamiento (evita el "callback hell").

**4. Rendimiento y Eficiencia en el Uso de Recursos:**
- Identifica cuellos de botella computacionales y bucles ineficientes.
- Analiza la gestión de concurrencia: bloqueos en el event loop, uso ineficiente de hilos o mala gestión de llamadas externas.
- Evalúa la eficiencia en el uso de memoria RAM y CPU.

**5. Propuestas de Mejora y Refactorización:**
- Sugiere refactorizaciones específicas y modernas para el código problemático.
- Propón mejoras arquitectónicas que aumenten la robustez y la tolerancia a fallos.

**Formato de entrega estricto:**
- Categoriza cada hallazgo por Nivel de Criticidad (CRÍTICO, ALTO, MEDIO, BAJO).
- Para cada problema, indica claramente el Archivo y/o Función afectada.
- Explica la causa raíz del problema de forma técnica y directa.
- Proporciona el código exacto de solución mostrando el enfoque sugerido.