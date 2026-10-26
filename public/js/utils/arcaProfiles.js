/**
 * Perfiles oficiales de configuración de Bases Remunerativas ARCA (Libro de Sueldos Digital).
 * Mapeo de Códigos de Concepto ARCA a subsistemas de la Seguridad Social (R1 a R10).
 *
 * Referencias normativas:
 * - RG AFIP/ARCA 3781 y modif. (Libro de Sueldos Digital - LSD Registro 01: 195 caracteres)
 * - Posiciones 168 a 186 del archivo de importación de conceptos de ARCA.
 * - Ley 24.241 (SIPA), Ley 19.032 (INSSJyP - PAMI), Leyes 23.660/23.661 (Obras Sociales y FSR)
 * - Ley 24.013 (FNE), Ley 24.714 (AAFF), Ley 25.191 (RENATRE), Ley 24.557 (LRT), Ley 27.541 (Detracción)
 */

export const ARCA_CONCEPT_PROFILES = {
  // 1. CONCEPTOS REMUNERATIVOS (110000 - 499999)
  '110000': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Sueldo / Básico: Tributa SUSS integral (SIPA, INSSJyP, OS, FSR, AAFF, FNE, LRT y Detracción)',
  },
  '110001': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Preaviso omitido remunerativo: Tributa SUSS integral',
  },
  '120000': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Sueldo Anual Complementario (SAC): Tributa SUSS integral',
  },
  '120001': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'SAC 1er Semestre (Junio): Tributa SUSS integral',
  },
  '120002': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'SAC 2do Semestre (Diciembre): Tributa SUSS integral',
  },
  '120003': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'SAC Proporcional: Tributa SUSS integral',
  },
  '130000': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Horas Extras generales: Tributa SUSS integral',
  },
  '130001': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Horas Extras al 50%: Tributa SUSS integral',
  },
  '130002': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Horas Extras al 100%: Tributa SUSS integral',
  },
  '130003': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Horas Extras al 200%: Tributa SUSS integral',
  },
  '140000': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Plus por Zona Desfavorable: Tributa SUSS integral',
  },
  '150000': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Vacaciones / Adelanto Vacacional: Tributa SUSS integral',
  },
  '160000': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Adicionales convencionales generales: Tributa SUSS integral',
  },
  '160001': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Adicional por Antigüedad: Tributa SUSS integral',
  },
  '160002': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Adicional por Título: Tributa SUSS integral',
  },
  '160003': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Adicional por Tarea / Función: Tributa SUSS integral',
  },
  '160004': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Adicional por Desarraigo: Tributa SUSS integral',
  },
  '170000': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Premios y Gratificaciones (Presentismo, etc.): Tributa SUSS integral',
  },
  '180000': {
    type: 'REMUNERATIVE',
    subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
    lockSubsystems: false,
    description: 'Rectificativa por Remuneración (Ley 27.742): Tributa SUSS integral',
  },

  // 2. CONCEPTOS NO REMUNERATIVOS (510000 - 799999)
  '510000': {
    type: 'NON_REMUNERATIVE',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: false,
    description: 'Asignaciones Familiares (Ley 24.714): Exento de SUSS y aportes',
  },
  '520000': {
    type: 'NON_REMUNERATIVE',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: false,
    description: 'Beneficios Sociales (Art. 103 bis LCT): Exento de SUSS y aportes',
  },
  '520001': {
    type: 'NON_REMUNERATIVE',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: false,
    description: 'Servicio de Comedor / Vales Alimentarios (Art. 103 bis inc. a LCT): Exento de SUSS',
  },
  '530000': {
    type: 'NON_REMUNERATIVE',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: false,
    description: 'Viáticos y Movilidad No Remunerativos c/ comprobante (Art. 106 LCT): Exento de SUSS',
  },
  '540000': {
    type: 'NON_REMUNERATIVE',
    subsystems: { r1: false, r2: false, r3: false, r4: true, r5: false, r6: false, r7: false, r8: true, r9: false, r10: false },
    lockSubsystems: false,
    description: 'Incremento No Remunerativo paritario: Sujeto a Obra Social y FSR (Aportes R4 y Contribuciones R8)',
  },
  '550000': {
    type: 'NON_REMUNERATIVE',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: true, r10: false },
    lockSubsystems: false,
    description: 'Pasantías Educativas (Ley 26.427) / Acuerdos Generales: Sujeto a alícuota LRT (R9)',
  },
  '551000': {
    type: 'NON_REMUNERATIVE',
    subsystems: { r1: false, r2: false, r3: false, r4: true, r5: false, r6: false, r7: false, r8: true, r9: true, r10: false },
    lockSubsystems: false,
    description: 'Importes No Remunerativos Especiales: Sujeto a Obra Social y FSR (R4, R8) y LRT (R9)',
  },
  '560000': {
    type: 'NON_REMUNERATIVE',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: false,
    description: 'Indemnizaciones Legales y Gratificaciones por Cese (Art. 245 LCT): Exento de SUSS',
  },

  // 3. DESCUENTOS Y RETENCIONES (810000 - 829999)
  // Regla Mandatoria ARCA LSD: Posiciones 168-186 DEBEN ser estrictamente '0'
  '810000': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Jubilación SIPA (11%): Retención legal previsional (Bases R1..R10 deshabilitadas en 0 según ARCA)',
  },
  '810001': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'INSSJyP PAMI (Ley 19.032 - 3%): Retención legal asistencial (Bases R1..R10 en 0 según ARCA)',
  },
  '810002': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Obra Social (Aporte 3% Ley 23.660): Retención de salud (Bases R1..R10 en 0 según ARCA)',
  },
  '810003': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Fondo Solidario de Redistribución (FSR): Retención (Bases R1..R10 en 0 según ARCA)',
  },
  '810004': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Cuota Sindical / Aporte Gremial: Retención convencional (Bases R1..R10 en 0 según ARCA)',
  },
  '810005': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Seguro de Vida Colectivo / Obligatorio: Retención (Bases R1..R10 en 0 según ARCA)',
  },
  '810006': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'RENATRE - UATRE: Retención trabajadores rurales (Bases R1..R10 en 0 según ARCA)',
  },
  '810007': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Fondo de Sepelio / Aportes Asistenciales: Retención convencional (Bases R1..R10 en 0 según ARCA)',
  },
  '810008': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Préstamos al Personal / Anticipos: Descuento de haberes (Bases R1..R10 en 0 según ARCA)',
  },
  '810009': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Obra Social - Adherentes: Retención familiar adicional (Bases R1..R10 en 0 según ARCA)',
  },
  '810010': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'FSR - Adherentes: Retención familiar adicional (Bases R1..R10 en 0 según ARCA)',
  },
  '810011': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Impuesto a las Ganancias (4ta Categoría): Retención tributaria (Bases R1..R10 en 0 según ARCA)',
  },
  '810012': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Embargos Judiciales: Retención legal por orden judicial (Bases R1..R10 en 0 según ARCA)',
  },
  '820000': {
    type: 'DEDUCTION',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: true,
    description: 'Otros Descuentos Generales: Retención interna (Bases R1..R10 en 0 según ARCA)',
  },
};

/**
 * Obtiene el perfil de bases y comportamiento para un código ARCA dado.
 * Si no está explícito en la tabla, infiere por rango numérico oficial.
 */
export function getArcaProfile(arcaCode, currentConceptCode = '') {
  const code = String(arcaCode || '').trim();
  if (ARCA_CONCEPT_PROFILES[code]) {
    // Caso especial para Honorarios Director S.A. (Mod. 099): solo LRT
    if (code === '110000' && currentConceptCode === 'SU1002') {
      return {
        type: 'REMUNERATIVE',
        subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: true, r10: false },
        lockSubsystems: false,
        description: 'Director S.A. (SU1002): Exclusivo LRT (R9) activo',
      };
    }
    return ARCA_CONCEPT_PROFILES[code];
  }

  const num = parseInt(code, 10);
  if (!Number.isNaN(num)) {
    // Rango Remunerativos: 110000 a 499999
    if (num >= 110000 && num <= 499999) {
      if (currentConceptCode === 'SU1002') {
        return {
          type: 'REMUNERATIVE',
          subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: true, r10: false },
          lockSubsystems: false,
          description: 'Director S.A.: Exclusivo LRT (R9) activo',
        };
      }
      return {
        type: 'REMUNERATIVE',
        subsystems: { r1: true, r2: true, r3: true, r4: true, r5: true, r6: false, r7: false, r8: true, r9: true, r10: true },
        lockSubsystems: false,
        description: `Concepto Remunerativo ARCA [${code}]: Tributa SUSS integral`,
      };
    }

    // Rango Descuentos / Retenciones: 810000 a 829999
    if (num >= 810000 && num <= 899999) {
      return {
        type: 'DEDUCTION',
        subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
        lockSubsystems: true,
        description: `Retención / Descuento ARCA [${code}]: Bases R1..R10 en cero según normativa ARCA LSD`,
      };
    }

    // Rango No Remunerativos: 510000 a 799999
    if (num >= 510000 && num <= 799999) {
      return {
        type: 'NON_REMUNERATIVE',
        subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
        lockSubsystems: false,
        description: `Concepto No Remunerativo ARCA [${code}]: Exento de SUSS por defecto`,
      };
    }
  }

  // Sin código o concepto auxiliar
  return {
    type: 'AUXILIARY',
    subsystems: { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false, r9: false, r10: false },
    lockSubsystems: false,
    description: 'Sin código ARCA: Concepto auxiliar o interno',
  };
}
