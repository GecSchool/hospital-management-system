import { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { paginationMeta } from '../../../common/utils/pagination.js';
import * as dbConfig from '../../../config/prisma.js';
import { loadResidentNumberProtector } from './resident-number.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import type {
  parsePatientCreate,
  parsePatientQuery,
  parsePatientUpdate,
} from '../validations/patient.validation.js';

const summarySelect = {
  id: true,
  patientNumber: true,
  name: true,
  birthDate: true,
  phone: true,
} as const;
type Row = Prisma.PatientGetPayload<{ select: typeof summarySelect }>;
function summary(row: Row, includeNumber: boolean) {
  return {
    id: row.id,
    ...(includeNumber && { patientNumber: row.patientNumber }),
    name: row.name,
    birthDate: row.birthDate.toISOString().slice(0, 10),
    phone: row.phone,
  };
}
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');
function isResidentNumberConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002' &&
    'meta' in error &&
    JSON.stringify(error.meta).includes('resident_number_lookup')
  );
}

export async function listPatients(
  query: ReturnType<typeof parsePatientQuery>,
  includeNumber: boolean,
) {
  const db = dbConfig.getPrismaClient();
  if (query.phone) {
    const phone = query.phone.replaceAll('-', '') || query.phone;
    const conditions = [Prisma.sql`replace(phone, '-', '') LIKE ${`%${escapeLike(phone)}%`}`];
    if (query.name) conditions.push(Prisma.sql`name ILIKE ${`%${escapeLike(query.name)}%`}`);
    if (query.patientNumber)
      conditions.push(Prisma.sql`patient_number ILIKE ${`%${escapeLike(query.patientNumber)}%`}`);
    if (query.birthDate) conditions.push(Prisma.sql`birth_date = ${query.birthDate}::date`);
    const filter = Prisma.join(conditions, ' AND ');
    const [rows, counts] = await Promise.all([
      db.$queryRaw<
        Row[]
      >`SELECT id, patient_number AS "patientNumber", name, birth_date AS "birthDate", phone FROM patients WHERE ${filter} ORDER BY name ASC, id ASC LIMIT ${query.size} OFFSET ${query.skip}`,
      db.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM patients WHERE ${filter}`,
    ]);
    return {
      data: rows.map((row) => summary(row, includeNumber)),
      meta: paginationMeta(query.page, query.size, Number(counts[0].total)),
    };
  }
  const where: Prisma.PatientWhereInput = {
    ...(query.name && { name: { contains: escapeLike(query.name), mode: 'insensitive' } }),
    ...(query.patientNumber && {
      patientNumber: { contains: escapeLike(query.patientNumber), mode: 'insensitive' },
    }),
    ...(query.birthDate && { birthDate: new Date(`${query.birthDate}T00:00:00Z`) }),
  };
  const [rows, total] = await Promise.all([
    db.patient.findMany({
      where,
      select: summarySelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: query.skip,
      take: query.size,
    }),
    db.patient.count({ where }),
  ]);
  return {
    data: rows.map((row) => summary(row, includeNumber)),
    meta: paginationMeta(query.page, query.size, total),
  };
}

export async function createPatient(input: ReturnType<typeof parsePatientCreate>) {
  const protector = loadResidentNumberProtector();
  const lookup = protector.lookup(input.normalized);
  const db = dbConfig.getPrismaClient();
  if (
    await db.patient.findUnique({ where: { residentNumberLookup: lookup }, select: { id: true } })
  )
    throw new AppError(409, 'RESIDENT_NUMBER_DUPLICATE', '이미 등록된 주민등록번호입니다.');
  try {
    const row = await db.patient.create({
      data: {
        name: input.name,
        phone: input.phone,
        birthDate: new Date(`${input.birthDate}T00:00:00Z`),
        residentNumberCiphertext: protector.encrypt(input.normalized),
        residentNumberLookup: lookup,
      },
      select: summarySelect,
    });
    return {
      ...summary(row, true),
      maskedResidentNumber: `${input.normalized.slice(0, 6)}-${input.normalized[6]}******`,
    };
  } catch (error) {
    if (isResidentNumberConflict(error))
      throw new AppError(409, 'RESIDENT_NUMBER_DUPLICATE', '이미 등록된 주민등록번호입니다.');
    throw error;
  }
}

export async function getPatient(id: string) {
  const row = await dbConfig.getPrismaClient().patient.findUnique({
    where: { id },
    select: { ...summarySelect, residentNumberCiphertext: true },
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', '환자를 찾을 수 없습니다.');
  const residentNumber = loadResidentNumberProtector().decrypt(row.residentNumberCiphertext);
  return {
    ...summary(row, true),
    maskedResidentNumber: `${residentNumber.slice(0, 6)}-${residentNumber[6]}******`,
  };
}

export async function getMedicalPatient(id: string, actor: AccountContext) {
  const db = dbConfig.getPrismaClient();
  const scope =
    actor.role === 'DOCTOR'
      ? { doctorAccountId: actor.id }
      : { departmentId: actor.departmentId ?? '' };
  const row = await db.patient.findFirst({
    where: {
      id,
      OR: [
        { appointments: { some: { ...scope, status: 'BOOKED' } } },
        { receptions: { some: scope } },
      ],
    },
    select: summarySelect,
  });
  if (!row) throw new AppError(403, 'FORBIDDEN', '환자 정보에 접근할 수 없습니다.');
  return summary(row, false);
}

export async function updatePatient(id: string, data: ReturnType<typeof parsePatientUpdate>) {
  const existing = await getPatient(id);
  if (data.name === undefined && data.phone === undefined) return existing;
  const db = dbConfig.getPrismaClient();
  const protector = loadResidentNumberProtector();
  const rows = await db.patient.updateManyAndReturn({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
    },
    select: { ...summarySelect, residentNumberCiphertext: true },
  });
  const row = rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND', '환자를 찾을 수 없습니다.');
  const residentNumber = protector.decrypt(row.residentNumberCiphertext);
  return {
    ...summary(row, true),
    maskedResidentNumber: `${residentNumber.slice(0, 6)}-${residentNumber[6]}******`,
  };
}
