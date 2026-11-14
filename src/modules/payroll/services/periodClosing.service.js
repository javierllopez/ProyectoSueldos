import crypto from 'crypto';
import { ensureTenantPayrollSchema } from '../../../services/tenantProvisioner.service.js';
import { validateLsd, validateMonthlyLsd } from './noveltiesAndLsd.service.js';
import { normalizeUtcNoonDate } from '../../../utils/dateFormat.js';

export { normalizeUtcNoonDate };

export function isFinalPeriodType(periodType) {
  const normalized = String(periodType || '').toUpperCase().trim();
  return normalized === 'FINAL' || normalized === 'LIQUIDACION_FINAL';
}

function resolveUserMeta(userContext = {}) {
  const closedBy = userContext?.id || userContext?.userId || null;
  const fullName = [userContext?.firstName, userContext?.lastName].filter(Boolean).join(' ').trim();
  const closedByName = fullName || userContext?.email || null;
  return { closedBy, closedByName };
}

function normalizeBriefTerminationReason(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 255);
}

function buildNoveltiesSummary(novelties) {
  const byConcept = new Map();
  for (const nov of novelties) {
    const code = nov.concept?.code || 'SIN_CODIGO';
    const name = nov.concept?.name || 'Concepto';
    if (!byConcept.has(code)) {
      byConcept.set(code, {
        conceptId: nov.conceptId,
        conceptCode: code,
        conceptName: name,
        count: 0,
        notesCount: 0,
      });
    }
    const entry = byConcept.get(code);
    entry.count += 1;
    if (nov.notes && String(nov.notes).trim()) {
      entry.notesCount += 1;
    }
  }
  return Array.from(byConcept.values()).sort((a, b) => a.conceptCode.localeCompare(b.conceptCode));
}

function sortSettlementsChronologically(list) {
  return [...list].sort((a, b) => {
    const dA = a.liquidationDate ? new Date(a.liquidationDate).getTime() : 0;
    const dB = b.liquidationDate ? new Date(b.liquidationDate).getTime() : 0;
    if (dA !== dB) return dA - dB;
    return (Number(a.settlementNumber) || 0) - (Number(b.settlementNumber) || 0);
  });
}

/**
 * Evalúa el impacto completo del cierre de un Período Fiscal o de una Liquidación Individual.
 * Operación de solo lectura utilizable tanto en Pre-flight (dry-run) como al iniciar la transacción.
 */
async function evaluateClosing(dbClient, { fiscalPeriodId = null, periodId = null, includeLsdValidation = true }) {
  let scope = null;
  let fiscalPeriod = null;
  let targetPeriod = null;
  let openSettlements = [];

  if (fiscalPeriodId) {
    scope = 'FISCAL_PERIOD';
    fiscalPeriod = await dbClient.payrollFiscalPeriod.findUnique({
      where: { id: fiscalPeriodId },
      include: {
        settlements: {
          orderBy: [{ settlementNumber: 'asc' }],
        },
      },
    });
    if (!fiscalPeriod) {
      const err = new Error('El período fiscal solicitado no existe');
      err.status = 404;
      throw err;
    }
    if (fiscalPeriod.status === 'CLOSED') {
      const err = new Error('El período fiscal ya se encuentra cerrado');
      err.status = 400;
      throw err;
    }
    openSettlements = sortSettlementsChronologically(
      (fiscalPeriod.settlements || []).filter((s) => s.status !== 'CLOSED')
    );
  } else {
    scope = 'PAYROLL_PERIOD';
    targetPeriod = await dbClient.payrollPeriod.findUnique({
      where: { id: periodId },
      include: { fiscalPeriod: true },
    });
    if (!targetPeriod) {
      const err = new Error('La liquidación solicitada no existe');
      err.status = 404;
      throw err;
    }
    if (targetPeriod.status === 'CLOSED') {
      const err = new Error('La liquidación ya se encuentra cerrada');
      err.status = 400;
      throw err;
    }
    if (targetPeriod.fiscalPeriod?.status === 'CLOSED') {
      const err = new Error('El período fiscal padre ya se encuentra cerrado');
      err.status = 400;
      throw err;
    }
    fiscalPeriod = targetPeriod.fiscalPeriod || null;
    openSettlements = [targetPeriod];
  }

  const targetYear = Number(fiscalPeriod?.year || targetPeriod?.year);
  const targetMonth = Number(fiscalPeriod?.month || targetPeriod?.month);
  const periodEndDate = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));
  const closingPeriodIds = openSettlements.map((s) => s.id);

  let validSlips = [];
  let deletedSlipsCount = 0;
  let novelties = [];
  let expiredConceptsCount = 0;
  let incomeTaxSettlements = [];
  let crossExportedIncomeTax = [];

  if (closingPeriodIds.length > 0) {
    const [fetchedSlips, fetchedDeletedCount, fetchedNovelties, fetchedCrossIt] = await Promise.all([
      dbClient.paySlip.findMany({
        where: { payrollPeriodId: { in: closingPeriodIds }, deletedAt: null },
        select: {
          id: true,
          payrollPeriodId: true,
          employeeId: true,
          status: true,
          grossSalary: true,
          netSalary: true,
          totalLaborCost: true,
          updatedAt: true,
          employee: {
            select: {
              id: true,
              fileNumber: true,
              firstName: true,
              lastName: true,
              cuil: true,
              status: true,
              terminationDate: true,
              terminationReason: true,
            },
          },
        },
      }),
      dbClient.paySlip.count({
        where: { payrollPeriodId: { in: closingPeriodIds }, deletedAt: { not: null } },
      }),
      dbClient.periodNovelty.findMany({
        where: { payrollPeriodId: { in: closingPeriodIds } },
        include: {
          concept: { select: { id: true, code: true, name: true, type: true } },
          employee: {
            select: {
              id: true,
              fileNumber: true,
              firstName: true,
              lastName: true,
              status: true,
              deletedAt: true,
            },
          },
        },
      }),
      dbClient.incomeTaxSettlement?.findMany
        ? dbClient.incomeTaxSettlement.findMany({
            where: {
              exportedPayrollPeriodId: { in: closingPeriodIds },
              OR: [{ fiscalYear: { not: targetYear } }, { month: { not: targetMonth } }],
            },
            select: {
              id: true,
              fiscalYear: true,
              month: true,
              settlementType: true,
              status: true,
              totalEmployeesWithheld: true,
              totalWithheldAmount: true,
              totalRefundAmount: true,
              exportedPayrollPeriodId: true,
            },
          })
        : Promise.resolve([]),
    ]);
    validSlips = fetchedSlips;
    deletedSlipsCount = fetchedDeletedCount;
    novelties = fetchedNovelties;
    crossExportedIncomeTax = fetchedCrossIt || [];
  }

  if (scope === 'FISCAL_PERIOD') {
    const [expCount, itRows] = await Promise.all([
      dbClient.employeeConcept?.count
        ? dbClient.employeeConcept.count({
            where: { isActive: true, validTo: { not: null, lte: periodEndDate } },
          })
        : Promise.resolve(0),
      dbClient.incomeTaxSettlement?.findMany
        ? dbClient.incomeTaxSettlement.findMany({
            where: { fiscalYear: targetYear, month: targetMonth },
            select: {
              id: true,
              fiscalYear: true,
              month: true,
              settlementType: true,
              status: true,
              description: true,
              totalEmployeesWithheld: true,
              totalWithheldAmount: true,
              totalRefundAmount: true,
              exportedPayrollPeriodId: true,
            },
          })
        : Promise.resolve([]),
    ]);
    expiredConceptsCount = expCount || 0;
    incomeTaxSettlements = itRows || [];
  }

  // Agrupar recibos por liquidación y por (liquidación, empleado)
  const slipsByPeriodId = new Map();
  const slipByPeriodAndEmp = new Map();
  for (const s of validSlips) {
    if (!slipsByPeriodId.has(s.payrollPeriodId)) slipsByPeriodId.set(s.payrollPeriodId, []);
    slipsByPeriodId.get(s.payrollPeriodId).push(s);
    slipByPeriodAndEmp.set(`${s.payrollPeriodId}::${s.employeeId}`, s);
  }

  const periodById = new Map(openSettlements.map((p) => [p.id, p]));
  const noveltiesByPeriodId = new Map();
  const staleNovelties = [];

  for (const nov of novelties) {
    if (!noveltiesByPeriodId.has(nov.payrollPeriodId)) noveltiesByPeriodId.set(nov.payrollPeriodId, []);
    noveltiesByPeriodId.get(nov.payrollPeriodId).push(nov);

    const matchingSlip = slipByPeriodAndEmp.get(`${nov.payrollPeriodId}::${nov.employeeId}`);
    const novTime = nov.updatedAt ? new Date(nov.updatedAt).getTime() : 0;
    const slipTime = matchingSlip?.updatedAt ? new Date(matchingSlip.updatedAt).getTime() : 0;

    if (!matchingSlip || novTime > slipTime) {
      const pInfo = periodById.get(nov.payrollPeriodId);
      staleNovelties.push({
        noveltyId: nov.id,
        payrollPeriodId: nov.payrollPeriodId,
        settlementName: pInfo?.settlementName || 'Liquidación',
        employeeId: nov.employeeId,
        employeeName: nov.employee ? `${nov.employee.lastName}, ${nov.employee.firstName}` : '-',
        fileNumber: nov.employee?.fileNumber || '-',
        employeeStatus: nov.employee?.status || 'UNKNOWN',
        employeeDeleted: Boolean(nov.employee?.deletedAt),
        conceptCode: nov.concept?.code || '-',
        conceptName: nov.concept?.name || '-',
        conceptType: nov.concept?.type || null,
        units: nov.units !== null && nov.units !== undefined ? Number(nov.units) : null,
        amount: nov.amount !== null && nov.amount !== undefined ? Number(nov.amount) : null,
        notes: nov.notes || null,
        noveltyUpdatedAt: nov.updatedAt ? new Date(nov.updatedAt).toISOString() : null,
        slipUpdatedAt: matchingSlip?.updatedAt ? new Date(matchingSlip.updatedAt).toISOString() : null,
        reason: !matchingSlip ? 'SIN_RECIBO_CALCULADO' : 'MODIFICADA_TRAS_CALCULO',
      });
    }
  }

  staleNovelties.sort((a, b) => {
    const settlementCmp = String(a.settlementName || '').localeCompare(String(b.settlementName || ''), 'es', {
      numeric: true,
      sensitivity: 'base',
    });
    if (settlementCmp !== 0) return settlementCmp;

    const legajoCmp = String(a.fileNumber || '').localeCompare(String(b.fileNumber || ''), 'es', {
      numeric: true,
      sensitivity: 'base',
    });
    if (legajoCmp !== 0) return legajoCmp;

    return String(a.conceptCode || '').localeCompare(String(b.conceptCode || ''), 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  });

  const blockingErrors = [];
  const warnings = [];

  if (staleNovelties.length > 0) {
    blockingErrors.push({
      code: 'STALE_NOVELTIES',
      message: `Existen ${staleNovelties.length} novedad(es) no persistente(s) cargadas o modificadas sin recalcular los recibos correspondientes. Revisá el detalle por legajo y concepto debajo para recalcular o eliminar esas novedades antes de cerrar.`,
      count: staleNovelties.length,
    });
  }

  const emptyDraftSettlements = [];
  const settlementsSummary = openSettlements.map((p) => {
    const pSlips = slipsByPeriodId.get(p.id) || [];
    const pNovs = noveltiesByPeriodId.get(p.id) || [];
    if (pSlips.length === 0) {
      emptyDraftSettlements.push({ id: p.id, settlementName: p.settlementName, periodType: p.periodType });
    }
    return {
      id: p.id,
      settlementName: p.settlementName,
      settlementNumber: p.settlementNumber,
      periodType: p.periodType,
      status: p.status,
      liquidationDate: p.liquidationDate,
      slipsCount: pSlips.length,
      noveltiesCount: pNovs.length,
      totalGross: Number(p.totalGross || 0),
      totalNet: Number(p.totalNet || 0),
      totalEmployerCost: Number(p.totalEmployerCost || 0),
    };
  });

  if (emptyDraftSettlements.length > 0) {
    warnings.push({
      code: 'EMPTY_DRAFT_SETTLEMENTS',
      message: `${emptyDraftSettlements.length} liquidación(es) sin recibos generados se cerrarán vacías.`,
      count: emptyDraftSettlements.length,
    });
  }

  // Evaluar bajas por liquidaciones FINAL
  const terminationsMap = new Map();
  for (const p of openSettlements) {
    if (!isFinalPeriodType(p.periodType)) continue;
    const finalSlips = slipsByPeriodId.get(p.id) || [];
    if (finalSlips.length === 0) continue;

    const normalizedDate = normalizeUtcNoonDate(p.liquidationDate);
    if (!normalizedDate) {
      blockingErrors.push({
        code: 'FINAL_MISSING_LIQUIDATION_DATE',
        message: `La liquidación final "${p.settlementName}" no tiene definida la Fecha de Liquidación requerida para asignar la fecha de baja del personal.`,
        payrollPeriodId: p.id,
      });
      continue;
    }

    for (const s of finalSlips) {
      const emp = s.employee;
      if (!emp) continue;
      terminationsMap.set(emp.id, {
        employeeId: emp.id,
        fileNumber: emp.fileNumber,
        fullName: `${emp.lastName}, ${emp.firstName}`,
        cuil: emp.cuil,
        previousStatus: emp.status,
        previousTerminationDate: emp.terminationDate || null,
        existingTerminationReason: emp.terminationReason || null,
        proposedTerminationDate: normalizedDate,
        proposedTerminationReason:
          emp.terminationReason && String(emp.terminationReason).trim()
            ? String(emp.terminationReason).trim()
            : `Baja por Liquidación Final (${p.settlementName || `${String(targetMonth).padStart(2, '0')}/${targetYear}`})`,
        sourcePeriodId: p.id,
        sourceSettlementName: p.settlementName,
        activeEmbargoesCount: 0,
      });
    }
  }

  const terminationsPreview = Array.from(terminationsMap.values()).sort((a, b) =>
    String(a.fileNumber || '').localeCompare(String(b.fileNumber || ''), 'es', {
      numeric: true,
      sensitivity: 'base',
    })
  );
  let activeEmbargoesOnTerminated = 0;

  if (terminationsPreview.length > 0) {
    const termEmpIds = terminationsPreview.map((t) => t.employeeId);
    const activeEmbargoes = dbClient.employeeEmbargo?.findMany
      ? await dbClient.employeeEmbargo.findMany({
          where: { employeeId: { in: termEmpIds }, status: 'ACTIVE' },
          select: { id: true, employeeId: true },
        })
      : [];

    const embCountByEmp = new Map();
    for (const emb of activeEmbargoes) {
      embCountByEmp.set(emb.employeeId, (embCountByEmp.get(emb.employeeId) || 0) + 1);
    }

    let alreadyInactiveCount = 0;
    for (const t of terminationsPreview) {
      const cnt = embCountByEmp.get(t.employeeId) || 0;
      t.activeEmbargoesCount = cnt;
      if (cnt > 0) activeEmbargoesOnTerminated += cnt;
      if (t.previousStatus !== 'ACTIVE') alreadyInactiveCount += 1;
    }

    if (alreadyInactiveCount > 0) {
      warnings.push({
        code: 'ALREADY_INACTIVE_IN_FINAL',
        message: `${alreadyInactiveCount} empleado(s) incluido(s) en Liquidación Final ya figuraban inactivos; se actualizará su fecha de baja según la liquidación final.`,
        count: alreadyInactiveCount,
      });
    }
    if (activeEmbargoesOnTerminated > 0) {
      warnings.push({
        code: 'ACTIVE_EMBARGOES_ON_TERMINATED',
        message: `Se detectaron ${activeEmbargoesOnTerminated} embargo(s) judicial(es) activo(s) sobre personal que pasará a baja; podrán suspenderse automáticamente al cierre (recuerde notificar el cese al juzgado).`,
        count: activeEmbargoesOnTerminated,
      });
    }
  }

  // Ganancias 4ta Categoría
  const hasIncomeTaxBalance = (it) =>
    Number(it.totalWithheldAmount || 0) !== 0 ||
    Number(it.totalRefundAmount || 0) !== 0 ||
    Number(it.totalEmployeesWithheld || 0) > 0;

  const formatItAmt = (val) =>
    Number(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatIncomeTaxLabel = (it) => {
    const typeMap = { MONTHLY: 'Mensual', FINAL: 'Final', ANNUAL: 'Anual' };
    const typeLabel = typeMap[it.settlementType] || it.settlementType || 'Mensual';
    const ret = Number(it.totalWithheldAmount || 0);
    const reint = Number(it.totalRefundAmount || 0);
    const parts = [];
    if (ret !== 0 || Number(it.totalEmployeesWithheld || 0) > 0) {
      parts.push(`${Number(it.totalEmployeesWithheld || 0)} ret. ($${formatItAmt(ret)})`);
    }
    if (reint !== 0) {
      parts.push(`reintegros $${formatItAmt(reint)}`);
    }
    return parts.length > 0 ? `${typeLabel} (${parts.join(', ')})` : typeLabel;
  };

  const openIncomeTax = incomeTaxSettlements.filter((it) => it.status !== 'CLOSED');
  const unexportedIncomeTax = openIncomeTax.filter(
    (it) => it.status === 'CALCULATED' && hasIncomeTaxBalance(it)
  );
  const zeroBalanceIncomeTax = openIncomeTax.filter(
    (it) => it.status === 'CALCULATED' && !hasIncomeTaxBalance(it)
  );

  if (unexportedIncomeTax.length > 0) {
    const detailsText = unexportedIncomeTax.map(formatIncomeTaxLabel).join('; ');
    warnings.push({
      code: 'INCOME_TAX_NOT_EXPORTED',
      message: `Existen ${unexportedIncomeTax.length} liquidación(es) de Ganancias 4ta Categoría calculada(s) para ${String(targetMonth).padStart(2, '0')}/${targetYear} sin exportar a nómina: ${detailsText}.`,
      count: unexportedIncomeTax.length,
    });
  }

  if (crossExportedIncomeTax.length > 0) {
    const crossDetails = crossExportedIncomeTax
      .map((it) => {
        const src = `${String(it.month).padStart(2, '0')}/${it.fiscalYear}`;
        const pName = periodById.get(it.exportedPayrollPeriodId)?.settlementName || 'Nómina del período';
        return `${src} → "${pName}" (${formatIncomeTaxLabel(it)})`;
      })
      .join('; ');
    warnings.push({
      code: 'INCOME_TAX_CROSS_PERIOD_EXPORT',
      message: `Se detectó exportación de Ganancias 4ta Categoría correspondiente a otro mes fiscal aplicada sobre este cierre: ${crossDetails}.`,
      count: crossExportedIncomeTax.length,
    });
  }

  if (expiredConceptsCount > 0) {
    warnings.push({
      code: 'EXPIRED_CONCEPTS_TO_DEACTIVATE',
      message: `${expiredConceptsCount} concepto(s) persistente(s) por empleado cumplen su vigencia (validTo) en este período y pueden desactivarse al cerrar.`,
      count: expiredConceptsCount,
    });
  }

  // Validación ARCA LSD (solo en pre-flight con recibos existentes)
  let lsdValidationSummary = null;
  if (includeLsdValidation && validSlips.length > 0) {
    try {
      const lsdRes =
        scope === 'FISCAL_PERIOD'
          ? await validateMonthlyLsd(dbClient, targetYear, targetMonth)
          : await validateLsd(dbClient, periodId);
      const errs = (lsdRes?.issues || lsdRes?.errors || []).filter((i) => !i.severity || i.severity === 'ERROR');
      const warns = (lsdRes?.warnings || []).concat(
        (lsdRes?.issues || []).filter((i) => i.severity === 'WARNING')
      );
      lsdValidationSummary = {
        isValid: lsdRes?.isValid !== false && errs.length === 0,
        errorsCount: errs.length,
        warningsCount: warns.length,
        sampleMessages: [...errs, ...warns].slice(0, 4).map((x) => x.message || String(x)),
      };
      if (errs.length > 0) {
        warnings.push({
          code: 'LSD_VALIDATION_ERRORS',
          message: `La auditoría ARCA LSD reportó ${errs.length} observación(es) crítica(s) en ${String(targetMonth).padStart(2, '0')}/${targetYear}. Verifíquelas antes de presentar F.931.`,
          count: errs.length,
        });
      }
    } catch (_) {
      lsdValidationSummary = null;
    }
  }

  const totalGross = validSlips.reduce((sum, s) => sum + Number(s.grossSalary || 0), 0);
  const totalNet = validSlips.reduce((sum, s) => sum + Number(s.netSalary || 0), 0);
  const totalEmployerCost = validSlips.reduce((sum, s) => sum + Number(s.totalLaborCost || 0), 0);

  return {
    scope,
    fiscalPeriod: fiscalPeriod
      ? {
          id: fiscalPeriod.id,
          year: fiscalPeriod.year,
          month: fiscalPeriod.month,
          status: fiscalPeriod.status,
        }
      : null,
    targetPeriod: targetPeriod
      ? {
          id: targetPeriod.id,
          settlementName: targetPeriod.settlementName,
          periodType: targetPeriod.periodType,
          status: targetPeriod.status,
          liquidationDate: targetPeriod.liquidationDate,
        }
      : null,
    targetYear,
    targetMonth,
    periodEndDate,
    openSettlements,
    closingPeriodIds,
    settlementsToClose: settlementsSummary,
    totalSlipsToLock: validSlips.length,
    deletedSlipsToClean: deletedSlipsCount,
    totals: {
      totalGross: Math.round(totalGross * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      totalEmployerCost: Math.round(totalEmployerCost * 100) / 100,
    },
    noveltiesToPurgeCount: novelties.length,
    noveltiesByConceptSummary: buildNoveltiesSummary(novelties),
    staleNovelties,
    terminationsPreview,
    expiredConceptsCount,
    activeEmbargoesOnTerminated,
    incomeTaxSummary: {
      totalForPeriod: incomeTaxSettlements.length,
      openToCloseCount: openIncomeTax.length,
      unexportedCount: unexportedIncomeTax.length,
      zeroBalanceCount: zeroBalanceIncomeTax.length,
      crossPeriodExportsCount: crossExportedIncomeTax.length,
    },
    lsdValidationSummary,
    blockingErrors,
    warnings,
    canClose: blockingErrors.length === 0,
  };
}

export async function getFiscalPeriodClosePreview(tenantPrisma, fiscalPeriodId) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const evaluation = await evaluateClosing(tenantPrisma, {
    fiscalPeriodId,
    includeLsdValidation: true,
  });
  return {
    ...evaluation,
    openSettlements: undefined,
  };
}

export async function getPeriodClosePreview(tenantPrisma, periodId) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const evaluation = await evaluateClosing(tenantPrisma, {
    periodId,
    includeLsdValidation: true,
  });
  return {
    ...evaluation,
    openSettlements: undefined,
  };
}

async function executeClosingTransaction(tenantPrisma, { fiscalPeriodId = null, periodId = null, options = {}, userContext = {} }) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const userMeta = resolveUserMeta(userContext);
  const now = new Date();
  const deactivateExpiredConcepts = options?.deactivateExpiredConcepts !== false;
  const suspendTerminatedEmbargoes = options?.suspendTerminatedEmbargoes !== false;
  const closingNotes = options?.notes ? String(options.notes).trim().slice(0, 500) : null;
  const defaultTerminationReason = normalizeBriefTerminationReason(options?.defaultTerminationReason);
  const terminationReasonsInput = Array.isArray(options?.terminationReasons) ? options.terminationReasons : [];

  return tenantPrisma.$transaction(
    async (tx) => {
      const evaluation = await evaluateClosing(tx, {
        fiscalPeriodId,
        periodId,
        includeLsdValidation: false,
      });

      if (!evaluation.canClose) {
        const err = new Error(evaluation.blockingErrors[0]?.message || 'No es posible cerrar el período por errores de validación');
        err.status = 400;
        err.details = { blockingErrors: evaluation.blockingErrors, staleNovelties: evaluation.staleNovelties };
        throw err;
      }

      if (evaluation.warnings.length > 0 && options?.confirmWarnings === false) {
        const err = new Error('Existen advertencias activas que requieren confirmación explícita para cerrar.');
        err.status = 400;
        err.details = { warnings: evaluation.warnings };
        throw err;
      }

      const { scope, closingPeriodIds, targetYear, targetMonth, periodEndDate } = evaluation;

      // 1. Lock atómico optimista contra concurrencia / doble clic
      if (scope === 'FISCAL_PERIOD') {
        const lockRes = await tx.payrollFiscalPeriod.updateMany({
          where: { id: fiscalPeriodId, status: { not: 'CLOSED' } },
          data: {
            status: 'CLOSED',
            closedAt: now,
            closedBy: userMeta.closedBy,
          },
        });
        if (lockRes.count !== 1) {
          const err = new Error('El período fiscal ya fue cerrado por otra operación concurrente');
          err.status = 409;
          throw err;
        }
        if (closingPeriodIds.length > 0) {
          await tx.payrollPeriod.updateMany({
            where: { id: { in: closingPeriodIds }, status: { not: 'CLOSED' } },
            data: {
              status: 'CLOSED',
              closedAt: now,
              closedBy: userMeta.closedBy,
            },
          });
        }
      } else {
        const lockRes = await tx.payrollPeriod.updateMany({
          where: { id: periodId, status: { not: 'CLOSED' } },
          data: {
            status: 'CLOSED',
            closedAt: now,
            closedBy: userMeta.closedBy,
          },
        });
        if (lockRes.count !== 1) {
          const err = new Error('La liquidación ya fue cerrada por otra operación concurrente');
          err.status = 409;
          throw err;
        }
      }

      // 2. Tarea 1: Marcar PaySlips vigentes como CLOSED y limpiar borradores soft-deleted huérfanos
      let lockedSlipsCount = evaluation.totalSlipsToLock;
      if (closingPeriodIds.length > 0) {
        const slipLockRes = await tx.paySlip.updateMany({
          where: {
            payrollPeriodId: { in: closingPeriodIds },
            deletedAt: null,
          },
          data: {
            status: 'CLOSED',
            closedAt: now,
            closedBy: userMeta.closedBy,
          },
        });
        if (typeof slipLockRes?.count === 'number') {
          lockedSlipsCount = slipLockRes.count;
        }

        const deletedDrafts = await tx.paySlip.findMany({
          where: { payrollPeriodId: { in: closingPeriodIds }, deletedAt: { not: null } },
          select: { id: true },
        });
        if (deletedDrafts.length > 0) {
          const ghostIds = deletedDrafts.map((d) => d.id);
          await tx.paySlipItem.deleteMany({ where: { paySlipId: { in: ghostIds } } });
          await tx.paySlipBasis.deleteMany({ where: { paySlipId: { in: ghostIds } } });
          await tx.paySlip.deleteMany({ where: { id: { in: ghostIds } } });
        }
      }

      // 3. Tarea 2: Eliminar novedades no persistentes (PeriodNovelty) de las liquidaciones cerradas
      let purgedNoveltiesCount = evaluation.noveltiesToPurgeCount;
      if (closingPeriodIds.length > 0) {
        const delNovRes = await tx.periodNovelty.deleteMany({
          where: { payrollPeriodId: { in: closingPeriodIds } },
        });
        if (typeof delNovRes?.count === 'number') {
          purgedNoveltiesCount = delNovRes.count;
        }
      }

      // 4. Tarea 3: Dar de baja al personal incluido en liquidaciones FINAL con fecha = liquidationDate
      const allowedTermEmpIds = new Set(evaluation.terminationsPreview.map((t) => t.employeeId));
      const terminationReasonOverrideMap = new Map();
      for (const item of terminationReasonsInput) {
        if (!item || typeof item !== 'object') continue;
        const empId = item.employeeId ? String(item.employeeId).trim() : '';
        if (!empId || !allowedTermEmpIds.has(empId)) continue;
        const cleaned = normalizeBriefTerminationReason(item.terminationReason);
        if (cleaned) {
          terminationReasonOverrideMap.set(empId, cleaned);
        }
      }

      const terminatedEmployeesAudit = [];
      const terminatedEmpIds = [];
      for (let i = 0; i < evaluation.terminationsPreview.length; i += 20) {
        const chunk = evaluation.terminationsPreview.slice(i, i + 20);
        await Promise.all(
          chunk.map((t) => {
            const rowOverride = terminationReasonOverrideMap.get(t.employeeId) || '';
            const effectiveTerminationReason = normalizeBriefTerminationReason(
              rowOverride ||
                (!t.existingTerminationReason && defaultTerminationReason ? defaultTerminationReason : '') ||
                t.proposedTerminationReason
            );
            terminatedEmpIds.push(t.employeeId);
            terminatedEmployeesAudit.push({
              employeeId: t.employeeId,
              fileNumber: t.fileNumber,
              fullName: t.fullName,
              previousStatus: t.previousStatus,
              terminationDate: t.proposedTerminationDate.toISOString(),
              terminationReason: effectiveTerminationReason,
              sourcePeriodId: t.sourcePeriodId,
              sourceSettlementName: t.sourceSettlementName,
            });
            return tx.employee.update({
              where: { id: t.employeeId },
              data: {
                status: 'INACTIVE',
                terminationDate: t.proposedTerminationDate,
                terminationReason: effectiveTerminationReason,
              },
            });
          })
        );
      }

      // 5. Procesos adicionales configurados (embargos en egresados, conceptos vencidos, Ganancias)
      let suspendedEmbargoesCount = 0;
      if (suspendTerminatedEmbargoes && terminatedEmpIds.length > 0 && tx.employeeEmbargo?.updateMany) {
        const embRes = await tx.employeeEmbargo.updateMany({
          where: { employeeId: { in: terminatedEmpIds }, status: 'ACTIVE' },
          data: {
            status: 'SUSPENDED',
            endDate: now,
          },
        });
        suspendedEmbargoesCount = embRes?.count || 0;
      }

      let deactivatedConceptsCount = 0;
      if (scope === 'FISCAL_PERIOD' && deactivateExpiredConcepts && tx.employeeConcept?.updateMany) {
        const expRes = await tx.employeeConcept.updateMany({
          where: {
            isActive: true,
            validTo: { not: null, lte: periodEndDate },
          },
          data: { isActive: false },
        });
        deactivatedConceptsCount = expRes?.count || 0;
      }

      let closedIncomeTaxCount = 0;
      if (scope === 'FISCAL_PERIOD' && tx.incomeTaxSettlement?.updateMany) {
        const itRes = await tx.incomeTaxSettlement.updateMany({
          where: {
            fiscalYear: targetYear,
            month: targetMonth,
            status: { not: 'CLOSED' },
          },
          data: { status: 'CLOSED' },
        });
        closedIncomeTaxCount = itRes?.count || 0;
      }

      // 6. Registrar Acta de Cierre Inmutable (PayrollClosingAudit)
      const checksumPayload = {
        scope,
        year: targetYear,
        month: targetMonth,
        closingPeriodIds,
        lockedSlipsCount,
        totalGross: evaluation.totals.totalGross,
        totalNet: evaluation.totals.totalNet,
        totalEmployerCost: evaluation.totals.totalEmployerCost,
        purgedNoveltiesCount,
        terminatedEmpIds,
        terminatedEmployeesReasons: terminatedEmployeesAudit.map((t) => ({
          employeeId: t.employeeId,
          terminationReason: t.terminationReason,
        })),
      };
      const checksumHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(checksumPayload))
        .digest('hex');

      let closingAudit = null;
      if (tx.payrollClosingAudit?.create) {
        closingAudit = await tx.payrollClosingAudit.create({
          data: {
            id: crypto.randomUUID(),
            scope,
            fiscalPeriodId: evaluation.fiscalPeriod?.id || null,
            payrollPeriodId: scope === 'PAYROLL_PERIOD' ? periodId : null,
            year: targetYear,
            month: targetMonth,
            closedPeriodIds: closingPeriodIds,
            totalSlipsClosed: lockedSlipsCount,
            totalGross: evaluation.totals.totalGross,
            totalNet: evaluation.totals.totalNet,
            totalEmployerCost: evaluation.totals.totalEmployerCost,
            purgedNoveltiesCount,
            purgedNoveltiesSummary: evaluation.noveltiesByConceptSummary,
            terminatedEmployeesCount: terminatedEmployeesAudit.length,
            terminatedEmployees: terminatedEmployeesAudit,
            additionalActions: {
              deletedGhostSlips: evaluation.deletedSlipsToClean,
              deactivatedExpiredConcepts: deactivatedConceptsCount,
              suspendedTerminatedEmbargoes: suspendedEmbargoesCount,
              closedIncomeTaxSettlements: closedIncomeTaxCount,
            },
            warningsAccepted: evaluation.warnings,
            checksumHash,
            closedBy: userMeta.closedBy,
            closedByName: userMeta.closedByName,
            notes: closingNotes,
            closedAt: now,
          },
        });
      }

      const entity =
        scope === 'FISCAL_PERIOD'
          ? await tx.payrollFiscalPeriod.findUnique({
              where: { id: fiscalPeriodId },
              include: { settlements: { orderBy: { settlementNumber: 'asc' } } },
            })
          : await tx.payrollPeriod.findUnique({
              where: { id: periodId },
              include: { fiscalPeriod: true },
            });

      return {
        ...(entity || {}),
        closingSummary: {
          scope,
          closedPeriodsCount: closingPeriodIds.length,
          totalSlipsClosed: lockedSlipsCount,
          purgedNoveltiesCount,
          terminatedEmployeesCount: terminatedEmployeesAudit.length,
          terminatedEmployees: terminatedEmployeesAudit,
          deactivatedConceptsCount,
          suspendedEmbargoesCount,
          closedIncomeTaxCount,
          checksumHash,
        },
        closingAudit,
      };
    },
    {
      maxWait: 15000,
      timeout: 60000,
    }
  );
}

export async function closeFiscalPeriod(tenantPrisma, fiscalPeriodId, options = {}, userContext = {}) {
  return executeClosingTransaction(tenantPrisma, {
    fiscalPeriodId,
    options,
    userContext,
  });
}

export async function closePeriod(tenantPrisma, periodId, options = {}, userContext = {}) {
  return executeClosingTransaction(tenantPrisma, {
    periodId,
    options,
    userContext,
  });
}

export async function listClosingAudits(tenantPrisma, { year, month, page = 1, limit = 20 } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 20, 100));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;
  const where = {};
  if (year) where.year = Number(year);
  if (month) where.month = Number(month);

  const [total, items] = await Promise.all([
    tenantPrisma.payrollClosingAudit.count({ where }),
    tenantPrisma.payrollClosingAudit.findMany({
      where,
      skip,
      take,
      orderBy: { closedAt: 'desc' },
    }),
  ]);

  return {
    data: items,
    meta: {
      total,
      page: Number(page) || 1,
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}
