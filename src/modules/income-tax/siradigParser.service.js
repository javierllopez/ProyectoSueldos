import crypto from 'crypto';
import { ensureTenantIncomeTaxSchema } from '../../services/tenantProvisioner.service.js';

// Mapeo oficial de códigos de deducción de SiRADIG (F. 572 Web) a códigos internos
export const SIRADIG_DEDUCTION_CODE_MAP = {
  // Códigos numéricos oficiales ARCA (RG AFIP 4003/2017 y modif. Ley 27.743)
  '1': 'PREPAGA',
  '2': 'SEGURO_VIDA',
  '3': 'DONACIONES',
  '4': 'HIPOTECARIO',
  '5': 'SEPELIO',
  '6': 'VIATICOS',
  '7': 'DOMESTICO',
  '8': 'DOMESTICO',          // Personal de Casas Particulares (Ley 26.844 - F. 102/RT)
  '9': 'ALQUILER_INQUILINO',
  '10': 'SEGURO_RETIRO',
  '11': 'SEGURO_RETIRO',
  '12': 'INDUMENTARIA',
  '13': 'GASTOS_EDUCATIVOS',
  '14': 'HONORARIOS_MEDICOS',
  '15': 'ALQUILER_DUENO',
  '21': 'GASTOS_EDUCATIVOS', // Gastos de guardería y jardines materno-infantiles
  '22': 'GASTOS_EDUCATIVOS', // Herramientas educativas y cursos
  '32': 'GASTOS_EDUCATIVOS', // Servicios con fines educativos (Ley 27.701 / RG 5314)
  '99': 'OTRO',              // Otras deducciones (Cajas previsionales provinciales / profesionales con motivo 2)

  // Denominaciones textuales y claves comunes en XML de SiRADIG
  'PREPAGA': 'PREPAGA',
  'MEDICINA_PREPAGA': 'PREPAGA',
  'CUOTA_MEDICO_ASISTENCIAL': 'PREPAGA',
  'MEDICOS': 'HONORARIOS_MEDICOS',
  'HONORARIOS_MEDICOS': 'HONORARIOS_MEDICOS',
  'HONORARIOS': 'HONORARIOS_MEDICOS',
  'ASISTENCIA_SANITARIA': 'HONORARIOS_MEDICOS',
  'SERVICIOS_MEDICOS': 'HONORARIOS_MEDICOS',
  'CAJA_PREVISIONAL': 'CAJA_PREVISIONAL',
  'CAJAS_PREVISIONALES': 'CAJA_PREVISIONAL',
  'APORTES_CAJAS': 'CAJA_PREVISIONAL',
  'SGR': 'CAJA_PREVISIONAL',
  'CAJA_PROFESIONAL': 'CAJA_PREVISIONAL',
  'SEGURO_VIDA': 'SEGURO_VIDA',
  'VIDA': 'SEGURO_VIDA',
  'SEGUROS_VIDA': 'SEGURO_VIDA',
  'DONACIONES': 'DONACIONES',
  'DONACION': 'DONACIONES',
  'HIPOTECARIO': 'HIPOTECARIO',
  'CREDITO_HIPOTECARIO': 'HIPOTECARIO',
  'INTERESES_HIPOTECARIOS': 'HIPOTECARIO',
  'SEPELIO': 'SEPELIO',
  'GASTOS_SEPELIO': 'SEPELIO',
  'VIATICOS': 'VIATICOS',
  'MOVILIDAD': 'VIATICOS',
  'DOMESTICO': 'DOMESTICO',
  'CASAS_PARTICULARES': 'DOMESTICO',
  'SERVICIO_DOMESTICO': 'DOMESTICO',
  'ALQUILER': 'ALQUILER_INQUILINO',
  'ALQUILER_INQUILINO': 'ALQUILER_INQUILINO',
  'ALQUILER_CASA_HABITACION': 'ALQUILER_INQUILINO',
  'ALQUILER_DUENO': 'ALQUILER_DUENO',
  'ALQUILER_PROPIETARIO': 'ALQUILER_DUENO',
  'ALQUILER_LOCADOR': 'ALQUILER_DUENO',
  'SEGURO_RETIRO': 'SEGURO_RETIRO',
  'RETIRO': 'SEGURO_RETIRO',
  'FCI_RETIRO': 'SEGURO_RETIRO',
  'INDUMENTARIA': 'INDUMENTARIA',
  'EQUIPAMIENTO': 'INDUMENTARIA',
  'INDUMENTARIA_EQUIPAMIENTO': 'INDUMENTARIA',
  'EDUCACION': 'GASTOS_EDUCATIVOS',
  'GASTOS_EDUCATIVOS': 'GASTOS_EDUCATIVOS',
  'HERRAMIENTAS_EDUCATIVAS': 'GASTOS_EDUCATIVOS',
};

// Mapeo oficial de códigos de parentesco en SiRADIG
export const SIRADIG_KINSHIP_MAP = {
  '1': 'SPOUSE',           // Cónyuge
  '2': 'SPOUSE',           // Conviviente
  '3': 'CHILD',            // Hijo / Hija
  '30': 'DISABLED_CHILD',  // Hijo / Hija incapacitado/a para el trabajo
  '31': 'DISABLED_CHILD',  // Hijastro / Hijastra incapacitado/a para el trabajo
  '32': 'CHILD',           // Hijastro / Hijastra
  'CONYUGE': 'SPOUSE',
  'CONVIVIENTE': 'SPOUSE',
  'HIJO': 'CHILD',
  'HIJA': 'CHILD',
  'HIJO_INCAPACITADO': 'DISABLED_CHILD',
};

// Etiquetas descriptivas en español para visualización en UI y reportes
export const DEDUCTION_LABELS = {
  PREPAGA: 'Cuota Médico Asistencial (Prepaga)',
  HONORARIOS_MEDICOS: 'Honorarios Médicos y Asist. Sanitaria (40% computable)',
  CAJA_PREVISIONAL: 'Aportes Cajas Previsionales Provinciales / SGR',
  GASTOS_EDUCATIVOS: 'Servicios y Herramientas Educativas',
  ALQUILER_INQUILINO: 'Alquiler Casa Habitación (Inquilino)',
  ALQUILER_DUENO: 'Alquiler Casa Habitación (Propietario / Dueño)',
  DOMESTICO: 'Personal Casas Particulares (Servicio Doméstico)',
  SEGURO_VIDA: 'Seguro de Vida',
  SEGURO_RETIRO: 'Seguro de Retiro Privado',
  HIPOTECARIO: 'Intereses Crédito Hipotecario',
  SEPELIO: 'Gastos de Sepelio',
  DONACIONES: 'Donaciones a Entidades Exentas',
  INDUMENTARIA: 'Gastos de Indumentaria y Equipamiento',
  VIATICOS: 'Gastos de Movilidad y Viáticos',
  CARGA_FAMILIA_SPOUSE: 'Carga de Familia: Cónyuge / Conviviente',
  CARGA_FAMILIA_CHILD: 'Carga de Familia: Hijo/a menor de 18',
  CARGA_FAMILIA_DISABLED_CHILD: 'Carga de Familia: Hijo/a Incapacitado/a',
  OTRO: 'Otras Deducciones Generales',
};

/**
 * Helper para extraer el contenido de una etiqueta XML simple.
 */
function getTagValue(xml, tag) {
  if (!xml) return null;
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].trim() : null;
}

/**
 * Helper para extraer el valor de un atributo XML.
 */
function getAttrValue(attributesStr, attrName) {
  if (!attributesStr) return null;
  const match = attributesStr.match(new RegExp(`${attrName}=["']([^"']+)["']`, 'i'));
  return match ? match[1].trim() : null;
}

/**
 * Helper para extraer bloques repetitivos entre <tag>...</tag> o autocerrados <tag ... /> capturando atributos y contenido interno.
 */
function getTagBlocks(xml, tag) {
  if (!xml) return [];
  const regex = new RegExp(`<${tag}([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tag}>)`, 'gi');
  const blocks = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push({
      attributes: match[1] || '',
      innerXml: match[2] || '',
      fullXml: match[0],
    });
  }
  return blocks;
}

/**
 * Clasifica y normaliza exhaustivamente el tipo de deducción general a partir del XML.
 */
export function classifySiradigDeduction(dBlock) {
  const innerXml = typeof dBlock === 'string' ? dBlock : dBlock.innerXml || '';
  const attributes = typeof dBlock === 'string' ? '' : dBlock.attributes || '';

  // 1. Extraer datos anidados de <detalles><detalle nombre="..." valor="..."/></detalles>
  let detailProviderName = null;
  let detailProviderCuit = null;
  let detailDesc = null;
  let detailMonth = null;
  const detalleBlocks = getTagBlocks(innerXml, 'detalle');
  for (const det of detalleBlocks) {
    const dName = (getAttrValue(det.attributes, 'nombre') || getTagValue(det.innerXml, 'nombre') || '').toLowerCase();
    const dVal = (getAttrValue(det.attributes, 'valor') || getTagValue(det.innerXml, 'valor') || '').trim();
    if (/cuit/i.test(dName) && !detailProviderCuit) {
      detailProviderCuit = dVal;
    } else if (/razonsocial|denominacion|prestador|entidad|nombre/i.test(dName) && !detailProviderName) {
      detailProviderName = dVal;
    } else if (/concepto|motivo|descripcion|tipo/i.test(dName) && !detailDesc) {
      detailDesc = dVal;
    }
    if (dName === 'mes' && !detailMonth && dVal) {
      detailMonth = parseInt(dVal, 10);
    }
  }

  // 2. Buscar código o tipo en etiquetas internas y atributos
  // NOTA CRÍTICA: Se excluye intencionalmente "tipoDoc" ya que en XML de AFIP
  // indica el tipo de documento del comprobante (80 = CUIT, 96 = DNI), NO el código de deducción.
  const rawTipo =
    getTagValue(innerXml, 'tipoDeduccion') ||
    getTagValue(innerXml, 'codigoDeduccion') ||
    getTagValue(innerXml, 'tipo') ||
    getTagValue(innerXml, 'codigo') ||
    getTagValue(innerXml, 'codDeduccion') ||
    getTagValue(innerXml, 'tipoConcepto') ||
    getTagValue(innerXml, 'concepto') ||
    getAttrValue(attributes, 'tipoDeduccion') ||
    getAttrValue(attributes, 'codigoDeduccion') ||
    getAttrValue(attributes, 'tipo') ||
    getAttrValue(attributes, 'codigo');

  const providerName =
    getTagValue(innerXml, 'denominacion') ||
    getTagValue(innerXml, 'razonSocial') ||
    getTagValue(innerXml, 'proveedor') ||
    getTagValue(innerXml, 'entidad') ||
    getTagValue(innerXml, 'nombre') ||
    detailProviderName ||
    getAttrValue(attributes, 'denominacion');

  const descTipoDeduccion = getTagValue(innerXml, 'descTipoDeduccion') || '';
  const descBasica = getTagValue(innerXml, 'descBasica') || '';
  const descAdicional = getTagValue(innerXml, 'descAdicional') || '';

  const descriptionText =
    descTipoDeduccion ||
    descBasica ||
    descAdicional ||
    detailDesc ||
    getTagValue(innerXml, 'motivo') ||
    getTagValue(innerXml, 'detalle') ||
    getTagValue(innerXml, 'descripcion') ||
    getTagValue(innerXml, 'observaciones') ||
    '';

  const cleanCode = (rawTipo || '').trim().replace(/^0+/, ''); // Normalizar '01' -> '1'
  const normalizedKey = cleanCode.toUpperCase();

  // 3. Coincidencia directa por mapa oficial de códigos
  let deductionType = SIRADIG_DEDUCTION_CODE_MAP[normalizedKey];

  // 4. Si no coincidió o vino como texto libre/código genérico (como 99), inferir por contenido semántico
  const fullText = `${descTipoDeduccion} ${descBasica} ${descAdicional} ${rawTipo || ''} ${providerName || ''} ${descriptionText}`.toLowerCase();

  if (/caja.*previs|previsional|caja.*profesional|cajas.*municipales|cajas.*provinciales/i.test(fullText)) {
    deductionType = 'CAJA_PREVISIONAL';
  } else if (!deductionType || deductionType === 'OTRO') {
    if (/honorario|asistencia\s*sanitaria|paramed|medico.*paramed/i.test(fullText)) {
      deductionType = 'HONORARIOS_MEDICOS';
    } else if (/prepaga|cuota.*medico|asistencial|osde|swiss|galeno|omint|medife|salud|hospital|clinica|sanatorio/i.test(fullText)) {
      deductionType = 'PREPAGA';
    } else if (/educa|colegio|universi|escolar|cuota\s*social.*esc|instituto|libro|material.*didactico/i.test(fullText)) {
      deductionType = 'GASTOS_EDUCATIVOS';
    } else if (/locador|dueño|propietario/i.test(fullText) && /alquiler/i.test(fullText)) {
      deductionType = 'ALQUILER_DUENO';
    } else if (/inquilino|locatario|inmueble.*inquilino/i.test(fullText) || /alquiler/i.test(fullText)) {
      deductionType = 'ALQUILER_INQUILINO';
    } else if (/domestico|casas\s*particulares|servicio\s*domestico|ley\s*26844|empleada\s*hogar/i.test(fullText)) {
      deductionType = 'DOMESTICO';
    } else if (/vida|muerte|fallecimiento/i.test(fullText)) {
      deductionType = 'SEGURO_VIDA';
    } else if (/retiro|jubilac.*privad|plan\s*pension|fci.*retiro/i.test(fullText)) {
      deductionType = 'SEGURO_RETIRO';
    } else if (/hipotec|credito.*hipo|mutuo.*hipo/i.test(fullText)) {
      deductionType = 'HIPOTECARIO';
    } else if (/sepelio|funer|cocheria/i.test(fullText)) {
      deductionType = 'SEPELIO';
    } else if (/donaci|fundacion|unicef|caritas|cruz\s*roja|entidad\s*benefica/i.test(fullText)) {
      deductionType = 'DONACIONES';
    } else if (/indumentaria|equipamiento|uniforme|herramienta.*trabajo/i.test(fullText)) {
      deductionType = 'INDUMENTARIA';
    } else if (/viatico|movilidad|kilometraje|pasaje/i.test(fullText)) {
      deductionType = 'VIATICOS';
    } else {
      deductionType = 'OTRO';
    }
  }

  // 5. Denominación por defecto si no vino nombre de entidad o prestador en el XML
  let finalProviderName = (providerName || '').trim();
  if (!finalProviderName) {
    const defaults = {
      PREPAGA: 'Entidad de Medicina Prepaga',
      HONORARIOS_MEDICOS: 'Prestador de Servicios Médicos / Sanitarios',
      CAJA_PREVISIONAL: 'Caja Previsional Provincial / Profesional',
      GASTOS_EDUCATIVOS: 'Institución / Establecimiento Educativo',
      ALQUILER_INQUILINO: 'Locador de Inmueble (Alquiler Casa Habitación)',
      ALQUILER_DUENO: 'Inquilino / Locatario (Alquiler Propietario)',
      DOMESTICO: 'Personal de Casas Particulares (Ley 26.844)',
      SEGURO_VIDA: 'Compañía de Seguros de Vida',
      SEGURO_RETIRO: 'Compañía de Seguros de Retiro Privado',
      HIPOTECARIO: 'Entidad Financiera (Crédito Hipotecario)',
      SEPELIO: 'Servicios de Sepelio',
      DONACIONES: 'Entidad Exenta Donataria',
      INDUMENTARIA: 'Equipamiento e Indumentaria Laboral',
      VIATICOS: 'Gastos de Movilidad y Viáticos',
      OTRO: 'Deducción Informada en SiRADIG',
    };
    finalProviderName = defaults[deductionType] || 'Deducción Informada';
  }

  return {
    rawTipo: rawTipo || cleanCode || 'S/D',
    deductionType,
    providerName: finalProviderName,
    providerCuit: detailProviderCuit,
    detailMonth,
    descTipoDeduccion,
  };
}

/**
 * Parsea el contenido XML de un archivo SiRADIG F. 572 Web.
 */
export function parseSiradigXml(xmlContent) {
  if (!xmlContent || typeof xmlContent !== 'string') {
    throw new Error('El contenido del archivo XML de SiRADIG es inválido o está vacío');
  }

  // Buscar bloque(s) de presentación
  let presentations = getTagBlocks(xmlContent, 'presentacion');
  if (presentations.length === 0) {
    // Si no está envuelto en <presentacion>, probar si el archivo completo es una única presentación
    presentations = [{ attributes: '', innerXml: xmlContent, fullXml: xmlContent }];
  }

  const parsedPresentations = [];

  for (const presBlock of presentations) {
    const presXml = presBlock.innerXml;
    const rawPeriodo = getTagValue(presXml, 'periodo') || getTagValue(xmlContent, 'periodo');
    const fiscalYear = parseInt(rawPeriodo || new Date().getFullYear(), 10);
    const nroPresentacion = getTagValue(presXml, 'nroPresentacion') || getTagValue(presXml, 'numeroPresentacion');
    const fechaPresentacionStr = getTagValue(presXml, 'fechaPresentacion') || getTagValue(presXml, 'fecha');
    const presentationDate = fechaPresentacionStr ? new Date(fechaPresentacionStr) : new Date();

    // Empleado / Sujeto retenido
    let employeeCuil = getTagValue(presXml, 'cuit') || getTagValue(presXml, 'cuil');
    if (!employeeCuil) {
      const empBlock = getTagValue(presXml, 'empleado');
      if (empBlock) {
        employeeCuil = getTagValue(empBlock, 'cuit') || getTagValue(empBlock, 'cuil');
      }
    }
    const cleanCuil = employeeCuil ? employeeCuil.replace(/\D/g, '') : null;

    // 1. Cargas de Familia
    const familyCharges = [];
    const cargasBlock = getTagValue(presXml, 'cargasFamilia');
    if (cargasBlock) {
      const cargaItems = getTagBlocks(cargasBlock, 'cargaFamilia');
      for (const cBlock of cargaItems) {
        const cXml = cBlock.innerXml;
        const parentescoCode = (
          getTagValue(cXml, 'parentesco') ||
          getTagValue(cXml, 'tipo') ||
          getAttrValue(cBlock.attributes, 'parentesco') ||
          getAttrValue(cBlock.attributes, 'tipo') ||
          '3'
        ).trim();

        const deductionType = SIRADIG_KINSHIP_MAP[parentescoCode] || 'CHILD';
        const docNum = (getTagValue(cXml, 'nroDoc') || getTagValue(cXml, 'documento') || '').replace(/\D/g, '');
        const lastName = getTagValue(cXml, 'apellido') || '';
        const firstName = getTagValue(cXml, 'nombre') || '';
        const rawBirthDate = getTagValue(cXml, 'fechaNac') || getTagValue(cXml, 'fechaNacimiento');
        const pctRaw = getTagValue(cXml, 'porcentajeDeduccion') || getTagValue(cXml, 'porcentaje');
        const deductionPercentage = pctRaw ? parseFloat(pctRaw.replace(',', '.')) : 100.0;
        const fromMonth = parseInt(getTagValue(cXml, 'mesDesde') || '1', 10);
        const toMonth = parseInt(getTagValue(cXml, 'mesHasta') || '12', 10);
        const isDisability = deductionType === 'DISABLED_CHILD' || getTagValue(cXml, 'incapacidad') === '1';

        familyCharges.push({
          parentescoCode,
          deductionType,
          documentNumber: docNum,
          lastName,
          firstName,
          birthDate: rawBirthDate ? new Date(rawBirthDate) : null,
          deductionPercentage,
          fromMonth,
          toMonth,
          isDisability,
        });
      }
    }

    // 2. Deducciones Generales con discriminación precisa
    const generalDeductions = [];
    const dedBlock = getTagValue(presXml, 'deducciones');
    if (dedBlock) {
      const dedItems = getTagBlocks(dedBlock, 'deduccion');
      for (const dBlock of dedItems) {
        const dXml = dBlock.innerXml;
        const classified = classifySiradigDeduction(dBlock);

        const providerCuit =
          getTagValue(dXml, 'cuit') ||
          getTagValue(dXml, 'cuitDoc') ||
          getTagValue(dXml, 'nroDoc') ||
          getTagValue(dXml, 'numeroDoc') ||
          classified.providerCuit;

        const monthRaw =
          getTagValue(dXml, 'periodoDoc') ||
          getTagValue(dXml, 'mes') ||
          getTagValue(dXml, 'mesHasta') ||
          classified.detailMonth;
        const defaultMonth = monthRaw ? parseInt(monthRaw, 10) : null;
        const totalAmountRaw = getTagValue(dXml, 'montoTotal') || getTagValue(dXml, 'monto') || getTagValue(dXml, 'importe');
        const totalAmount = totalAmountRaw ? parseFloat(totalAmountRaw.replace(',', '.')) : 0.0;
        const voucherType = getTagValue(dXml, 'tipoComprobante');
        const voucherNumber = getTagValue(dXml, 'nroComprobante');

        // Evaluar desglose mensual en <periodos><periodo .../></periodos> (Opción A aprobada)
        const periodosBlock = getTagValue(dXml, 'periodos');
        const periodoItems = periodosBlock ? getTagBlocks(periodosBlock, 'periodo') : [];

        if (periodoItems.length > 0) {
          for (const pItem of periodoItems) {
            const pXml = pItem.innerXml;
            const pAttrs = pItem.attributes;
            const pMes = getAttrValue(pAttrs, 'mes') || getTagValue(pXml, 'mes');
            const pMesDesde = getAttrValue(pAttrs, 'mesDesde') || getTagValue(pXml, 'mesDesde');
            const pMesHasta = getAttrValue(pAttrs, 'mesHasta') || getTagValue(pXml, 'mesHasta');
            const pMontoRaw =
              getAttrValue(pAttrs, 'montoMensual') ||
              getAttrValue(pAttrs, 'monto') ||
              getTagValue(pXml, 'montoMensual') ||
              getTagValue(pXml, 'monto') ||
              getAttrValue(pAttrs, 'importe') ||
              getTagValue(pXml, 'importe');
            const pAmount = pMontoRaw ? parseFloat(pMontoRaw.replace(',', '.')) : 0.0;

            if (pMes) {
              const m = parseInt(pMes, 10);
              if (pAmount > 0) {
                generalDeductions.push({
                  rawTipo: classified.rawTipo,
                  deductionType: classified.deductionType,
                  providerCuit: providerCuit ? providerCuit.replace(/\D/g, '') : null,
                  providerName: classified.providerName,
                  voucherType,
                  voucherNumber,
                  month: m,
                  amount: pAmount,
                });
              }
            } else if (pMesDesde && pMesHasta) {
              const fromM = parseInt(pMesDesde, 10);
              const toM = parseInt(pMesHasta, 10);
              if (fromM === toM) {
                if (pAmount > 0) {
                  generalDeductions.push({
                    rawTipo: classified.rawTipo,
                    deductionType: classified.deductionType,
                    providerCuit: providerCuit ? providerCuit.replace(/\D/g, '') : null,
                    providerName: classified.providerName,
                    voucherType,
                    voucherNumber,
                    month: fromM,
                    amount: pAmount,
                  });
                }
              } else {
                const countMonths = Math.max(1, toM - fromM + 1);
                const monthlyAmount = Math.round((pAmount / countMonths) * 100) / 100;
                for (let m = fromM; m <= toM; m++) {
                  if (monthlyAmount > 0) {
                    generalDeductions.push({
                      rawTipo: classified.rawTipo,
                      deductionType: classified.deductionType,
                      providerCuit: providerCuit ? providerCuit.replace(/\D/g, '') : null,
                      providerName: classified.providerName,
                      voucherType,
                      voucherNumber,
                      month: m,
                      amount: monthlyAmount,
                    });
                  }
                }
              }
            } else if (pAmount > 0) {
              generalDeductions.push({
                rawTipo: classified.rawTipo,
                deductionType: classified.deductionType,
                providerCuit: providerCuit ? providerCuit.replace(/\D/g, '') : null,
                providerName: classified.providerName,
                voucherType,
                voucherNumber,
                month: defaultMonth,
                amount: pAmount,
              });
            }
          }
        } else if (totalAmount > 0) {
          generalDeductions.push({
            rawTipo: classified.rawTipo,
            deductionType: classified.deductionType,
            providerCuit: providerCuit ? providerCuit.replace(/\D/g, '') : null,
            providerName: classified.providerName,
            voucherType,
            voucherNumber,
            month: defaultMonth,
            amount: totalAmount,
          });
        }
      }
    }

    // 3. Otros Empleadores (Pluriempleo)
    const otherIncomes = [];
    const otrosBlock = getTagValue(presXml, 'otrosEmpleadores') || getTagValue(presXml, 'pluriempleo');
    if (otrosBlock) {
      const empItems = getTagBlocks(otrosBlock, 'empleador').concat(getTagBlocks(otrosBlock, 'empresa'));
      for (const eBlock of empItems) {
        const eXml = eBlock.innerXml;
        const employerCuit = getTagValue(eXml, 'cuit');
        const employerName = getTagValue(eXml, 'denominacion') || getTagValue(eXml, 'razonSocial') || 'Otro Empleador';
        const ingresosBlock = getTagValue(eXml, 'ingresos') || eXml;
        const ingresos = getTagBlocks(ingresosBlock, 'ingreso');

        if (ingresos.length > 0) {
          for (const iBlock of ingresos) {
            const iXml = iBlock.innerXml;
            const m = parseInt(getTagValue(iXml, 'mes') || '1', 10);
            const gross = parseFloat((getTagValue(iXml, 'gananciaBruta') || getTagValue(iXml, 'bruto') || '0').replace(',', '.'));
            const sac = parseFloat((getTagValue(iXml, 'sac') || '0').replace(',', '.'));
            const pension = parseFloat((getTagValue(iXml, 'jubilacion') || '0').replace(',', '.'));
            const os = parseFloat((getTagValue(iXml, 'obraSocial') || '0').replace(',', '.'));
            const union = parseFloat((getTagValue(iXml, 'cuotaSindical') || '0').replace(',', '.'));
            const withheld = parseFloat((getTagValue(iXml, 'retencionGanancias') || getTagValue(iXml, 'retencion') || '0').replace(',', '.'));

            otherIncomes.push({
              employerCuit: employerCuit ? employerCuit.replace(/\D/g, '') : null,
              employerName,
              month: m,
              grossIncome: gross + sac,
              pensionContrib: pension,
              healthInsuranceContrib: os,
              unionContrib: union,
              withheldTax: withheld,
            });
          }
        } else {
          const gross = parseFloat(
            (
              getTagValue(eXml, 'gananciaBruta') ||
              getTagValue(eXml, 'bruto') ||
              getTagValue(eXml, 'ingresosBrutos') ||
              '0'
            ).replace(',', '.')
          );
          const withheld = parseFloat(
            (
              getTagValue(eXml, 'retencionGanancias') ||
              getTagValue(eXml, 'retGanancias') ||
              getTagValue(eXml, 'retencion') ||
              '0'
            ).replace(',', '.')
          );
          const m = parseInt(
            getTagValue(eXml, 'mes') ||
              getTagValue(eXml, 'mesHasta') ||
              getTagValue(eXml, 'mesDesde') ||
              '10',
            10
          );
          if (gross > 0) {
            otherIncomes.push({
              employerCuit: employerCuit ? employerCuit.replace(/\D/g, '') : null,
              employerName,
              month: m,
              grossIncome: gross,
              pensionContrib: 0,
              healthInsuranceContrib: 0,
              unionContrib: 0,
              withheldTax: withheld,
            });
          }
        }
      }
    }

    // 4. Pagos a Cuenta
    const paymentsOnAccount = [];
    const pagosBlock = getTagValue(presXml, 'pagosACuenta') || getTagValue(presXml, 'retenciones');
    if (pagosBlock) {
      const pagoItems = getTagBlocks(pagosBlock, 'pagoACuenta').concat(getTagBlocks(pagosBlock, 'retencion'));
      for (const pBlock of pagoItems) {
        const pXml = pBlock.innerXml;
        const paymentType = getTagValue(pXml, 'tipo') || 'PERCEPCION_DIVISAS';
        const cuitAgent = getTagValue(pXml, 'cuitAgente') || getTagValue(pXml, 'cuit');
        const agentName = getTagValue(pXml, 'denominacionAgente') || getTagValue(pXml, 'agente');
        const month = parseInt(getTagValue(pXml, 'mes') || '1', 10);
        const amount = parseFloat((getTagValue(pXml, 'monto') || getTagValue(pXml, 'importe') || '0').replace(',', '.'));

        if (amount > 0) {
          paymentsOnAccount.push({
            paymentType,
            cuitAgent: cuitAgent ? cuitAgent.replace(/\D/g, '') : null,
            agentName,
            month,
            amount,
          });
        }
      }
    }

    if (cleanCuil) {
      parsedPresentations.push({
        fiscalYear,
        nroPresentacion,
        presentationDate,
        cleanCuil,
        familyCharges,
        generalDeductions,
        otherIncomes,
        paymentsOnAccount,
      });
    }
  }

  return parsedPresentations;
}

/**
 * Previsualiza el contenido del XML de SiRADIG y detecta parientes no empadronados en Personal.
 */
export async function previewSiradigPresentation(tenantPrisma, { xmlContent, fileContent }) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);

  const content = xmlContent || fileContent;
  const presentations = parseSiradigXml(content);
  if (presentations.length === 0) {
    throw new Error('No se encontraron presentaciones de empleados válidas en el archivo XML provisto');
  }

  const fiscalYear = presentations[0].fiscalYear;
  const unregisteredRelatives = [];
  let totalDeductions = 0;
  let totalOtherIncomes = 0;
  let totalFamilyCharges = 0;
  let matchedEmployees = 0;
  const notFoundCuils = [];

  for (const pres of presentations) {
    totalDeductions += pres.generalDeductions.length;
    totalOtherIncomes += pres.otherIncomes.length;
    totalFamilyCharges += pres.familyCharges.length;

    const employee = await tenantPrisma.employee.findFirst({
      where: {
        cuil: pres.cleanCuil,
        deletedAt: null,
      },
      include: {
        relatives: {
          where: { deletedAt: null },
        },
      },
    });

    if (!employee) {
      notFoundCuils.push(pres.cleanCuil);
      continue;
    }

    matchedEmployees++;

    // Verificar cargas familiares contra los familiares ya registrados en el legajo
    for (const fc of pres.familyCharges) {
      const cleanDoc = (fc.documentNumber || '').replace(/\D/g, '');
      const exists = employee.relatives.some((r) => {
        const rDoc = (r.documentNumber || '').replace(/\D/g, '');
        const rCuil = (r.cuil || '').replace(/\D/g, '');
        return cleanDoc && (rDoc === cleanDoc || rCuil === cleanDoc);
      });

      if (!exists) {
        unregisteredRelatives.push({
          employeeId: employee.id,
          employeeName: `${employee.lastName}, ${employee.firstName}`,
          employeeCuil: employee.cuil,
          relative: {
            ...fc,
            fullName: `${fc.lastName}, ${fc.firstName}`.trim() || 'Familiar S/D',
          },
        });
      }
    }
  }

  return {
    fiscalYear,
    totalPresentations: presentations.length,
    matchedEmployees,
    notFoundCuils,
    totalFamilyCharges,
    totalDeductions,
    totalOtherIncomes,
    unregisteredRelatives,
    hasUnregisteredRelatives: unregisteredRelatives.length > 0,
  };
}

/**
 * Importa y almacena en la base de datos las presentaciones de SiRADIG F. 572 Web.
 * Si incorporateToPersonnel es true, crea los familiares no registrados en employee_relatives.
 * Si es false, crea la deducción familiar exclusivamente en employee_income_tax_deductions para el año fiscal.
 */
export async function importSiradigPresentation(
  tenantPrisma,
  { filename, xmlContent, fileContent, incorporateToPersonnel = false }
) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);

  const content = xmlContent || fileContent;
  const presentations = parseSiradigXml(content);
  if (presentations.length === 0) {
    throw new Error('No se encontraron presentaciones de empleados válidas en el archivo XML provisto');
  }

  const fiscalYear = presentations[0].fiscalYear;
  const siradigImportId = crypto.randomUUID();

  let processedCount = 0;
  let deductionsCount = 0;
  let otherIncomesCount = 0;
  let paymentsCount = 0;
  let familyChargesCount = 0;
  let incorporatedRelativesCount = 0;
  let fiscalOnlyRelativesCount = 0;
  const notFoundCuils = [];

  // Precargar o verificar parentescos en la BD
  let kinships = await tenantPrisma.kinship.findMany({ where: { deletedAt: null } });

  for (const pres of presentations) {
    // Buscar empleado por CUIL
    const employee = await tenantPrisma.employee.findFirst({
      where: {
        cuil: pres.cleanCuil,
        deletedAt: null,
      },
      include: {
        relatives: {
          where: { deletedAt: null },
        },
      },
    });

    if (!employee) {
      notFoundCuils.push(pres.cleanCuil);
      continue;
    }

    processedCount++;

    // Limpiar registros previos originados en SiRADIG para este empleado y año fiscal
    await tenantPrisma.employeeIncomeTaxDeduction.deleteMany({
      where: {
        employeeId: employee.id,
        fiscalYear,
        source: 'SIRADIG',
      },
    });

    await tenantPrisma.employeeOtherIncome.deleteMany({
      where: {
        employeeId: employee.id,
        fiscalYear,
        source: 'SIRADIG',
      },
    });

    await tenantPrisma.employeeIncomeTaxPaymentOnAccount.deleteMany({
      where: {
        employeeId: employee.id,
        fiscalYear,
        source: 'SIRADIG',
      },
    });

    // 1. Procesar Cargas de Familia
    for (const fc of pres.familyCharges) {
      familyChargesCount++;
      const cleanDoc = (fc.documentNumber || '').replace(/\D/g, '');

      // Verificar si ya existe en familiares de personal
      const existingRelative = employee.relatives.find((r) => {
        const rDoc = (r.documentNumber || '').replace(/\D/g, '');
        const rCuil = (r.cuil || '').replace(/\D/g, '');
        return cleanDoc && (rDoc === cleanDoc || rCuil === cleanDoc);
      });

      if (existingRelative) {
        // Actualizar deducción fiscal en el familiar existente
        await tenantPrisma.employeeRelative.update({
          where: { id: existingRelative.id },
          data: {
            appliesIncomeTax: true,
            incomeTaxDeductionType: fc.deductionType,
            deductionPercentage: fc.deductionPercentage,
            validFromMonth: fc.fromMonth,
            validToMonth: fc.toMonth,
            isDisability: fc.isDisability,
          },
        });
      } else {
        // Persona no registrada previamente como familiar
        if (incorporateToPersonnel) {
          // Opción SÍ: Dar de alta formalmente en la nómina de familiares de Personal
          let targetKinship = kinships.find((k) => {
            if (fc.deductionType === 'SPOUSE') {
              return k.code === 'CONYUGE' || k.code === 'CONVIVIENTE' || /c[oó]nyuge|conviv/i.test(k.name);
            }
            if (fc.deductionType === 'DISABLED_CHILD') {
              return k.code === 'HIJO_INCAPACITADO' || /incapac/i.test(k.name);
            }
            return k.code === 'HIJO_MENOR_21' || k.code === 'HIJO' || /hijo/i.test(k.name);
          });

          if (!targetKinship) {
            targetKinship = await tenantPrisma.kinship.create({
              data: {
                id: crypto.randomUUID(),
                code: fc.deductionType === 'SPOUSE' ? 'CONYUGE' : 'HIJO_MENOR_21',
                name: fc.deductionType === 'SPOUSE' ? 'Cónyuge' : 'Hijo/a menor de 21 años',
              },
            });
            kinships.push(targetKinship);
          }

          await tenantPrisma.employeeRelative.create({
            data: {
              id: crypto.randomUUID(),
              employeeId: employee.id,
              kinshipId: targetKinship.id,
              lastName: fc.lastName || employee.lastName,
              firstName: fc.firstName || 'Familiar',
              documentType: 'DNI',
              documentNumber: cleanDoc || '0',
              cuil: cleanDoc.length === 11 ? cleanDoc : null,
              birthDate: fc.birthDate || new Date(fiscalYear - 10, 0, 1),
              isAdherent: false,
              appliesIncomeTax: true,
              incomeTaxDeductionType: fc.deductionType,
              deductionPercentage: fc.deductionPercentage,
              isDisability: fc.isDisability,
              hasNoIncomeOrBelowMni: true,
              validFromMonth: fc.fromMonth,
              validToMonth: fc.toMonth,
            },
          });
          incorporatedRelativesCount++;
        } else {
          // Opción NO: Incorporar la deducción fiscal para el año pero NO agregarla como familiar en Personal
          await tenantPrisma.employeeIncomeTaxDeduction.create({
            data: {
              id: crypto.randomUUID(),
              employeeId: employee.id,
              fiscalYear,
              deductionType: `CARGA_FAMILIA_${fc.deductionType}`,
              providerName: `${fc.lastName}, ${fc.firstName} (Carga SiRADIG F.572)`.trim(),
              voucherNumber: cleanDoc || null,
              month: fc.toMonth || 12,
              amount: 0,
              source: 'SIRADIG',
              siradigPresentationId: pres.nroPresentacion || siradigImportId,
              notes: JSON.stringify({
                documentNumber: cleanDoc,
                firstName: fc.firstName,
                lastName: fc.lastName,
                birthDate: fc.birthDate ? fc.birthDate.toISOString() : null,
                deductionPercentage: fc.deductionPercentage,
                fromMonth: fc.fromMonth,
                toMonth: fc.toMonth,
                isDisability: fc.isDisability,
                kinshipCode: fc.parentescoCode,
              }),
            },
          });
          fiscalOnlyRelativesCount++;
        }
      }
    }

    // 2. Guardar Deducciones Generales correctamente discriminadas
    for (const d of pres.generalDeductions) {
      let notes = d.rawTipo ? `Código original SiRADIG: ${d.rawTipo}` : null;
      if (d.deductionType === 'HONORARIOS_MEDICOS') {
        const legal40 = Math.round(d.amount * 0.40 * 100) / 100;
        const noteText = `Facturado: $ ${Number(d.amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - Cómputo legal 40%: $ ${Number(legal40).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        notes = notes ? `${notes} · ${noteText}` : noteText;
      }

      await tenantPrisma.employeeIncomeTaxDeduction.create({
        data: {
          id: crypto.randomUUID(),
          employeeId: employee.id,
          fiscalYear,
          deductionType: d.deductionType,
          providerCuit: d.providerCuit,
          providerName: d.providerName,
          voucherType: d.voucherType,
          voucherNumber: d.voucherNumber,
          month: d.month,
          amount: d.amount,
          source: 'SIRADIG',
          siradigPresentationId: pres.nroPresentacion || siradigImportId,
          notes,
        },
      });
      deductionsCount++;
    }

    // 3. Guardar Otros Ingresos (Pluriempleo)
    for (const oi of pres.otherIncomes) {
      await tenantPrisma.employeeOtherIncome.create({
        data: {
          id: crypto.randomUUID(),
          employeeId: employee.id,
          fiscalYear,
          month: oi.month,
          employerCuit: oi.employerCuit || '00000000000',
          employerName: oi.employerName || 'Otro Empleador',
          grossIncome: oi.grossIncome,
          pensionContrib: oi.pensionContrib,
          healthInsuranceContrib: oi.healthInsuranceContrib,
          unionContrib: oi.unionContrib,
          withheldTax: oi.withheldTax,
          source: 'SIRADIG',
        },
      });
      otherIncomesCount++;
    }

    // 4. Guardar Pagos a Cuenta
    for (const p of pres.paymentsOnAccount) {
      await tenantPrisma.employeeIncomeTaxPaymentOnAccount.create({
        data: {
          id: crypto.randomUUID(),
          employeeId: employee.id,
          fiscalYear,
          paymentType: p.paymentType,
          cuitAgent: p.cuitAgent,
          agentName: p.agentName,
          month: p.month,
          amount: p.amount,
          source: 'SIRADIG',
        },
      });
      paymentsCount++;
    }
  }

  // Registrar auditoría de importación
  const importRecord = await tenantPrisma.siradigImport.create({
    data: {
      id: siradigImportId,
      fiscalYear,
      filename: filename || `siradig_${fiscalYear}.xml`,
      presentationDate: new Date(),
      totalRecords: presentations.length,
      processedEmployees: processedCount,
      status: 'PROCESSED',
      summary: {
        totalPresentations: presentations.length,
        processedEmployees: processedCount,
        deductionsCount,
        otherIncomesCount,
        paymentsCount,
        familyChargesCount,
        incorporatedRelativesCount,
        fiscalOnlyRelativesCount,
        notFoundCuils,
      },
    },
  });

  return {
    importId: importRecord.id,
    fiscalYear,
    totalPresentations: presentations.length,
    processedEmployees: processedCount,
    deductionsCount,
    otherIncomesCount,
    paymentsCount,
    familyChargesCount,
    incorporatedRelativesCount,
    fiscalOnlyRelativesCount,
    notFoundCuils,
    message: `SiRADIG procesado con éxito: ${processedCount} colaborador(es) actualizado(s), ${deductionsCount} deducción(es) discriminada(s), ${familyChargesCount} carga(s) de familia evaluada(s) y ${otherIncomesCount} pluriempleo(s) incorporado(s).`,
  };
}

/**
 * Historial de importaciones de SiRADIG.
 */
export async function listSiradigImports(tenantPrisma, { year } = {}) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);
  const where = {};
  if (year) where.fiscalYear = parseInt(year, 10);

  return tenantPrisma.siradigImport.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}
