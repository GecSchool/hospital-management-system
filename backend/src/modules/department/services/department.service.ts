// DEP-01~05 진료과 목록·등록·이름 변경·상태 변경·삭제의 업무 규칙.
import { AppError } from '../../../common/errors/index.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { getPrismaClient } from '../../../config/prisma.js';
import type { DepartmentStatus, Prisma } from '../../../generated/prisma/client.js';

const departmentSelect = { id: true, name: true, status: true } as const;

const duplicateName = () =>
  new AppError(409, 'DEPARTMENT_NAME_DUPLICATE', '이미 등록된 진료과 이름입니다.');

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/**
 * 진료과 행을 잠그고 읽는다. 같은 진료과를 바꾸는 다른 요청(이름·상태 변경, 삭제,
 * 의료진 소속 변경, 초대 수락)은 이 트랜잭션이 끝날 때까지 기다린다.
 */
async function lockDepartment(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "departments" WHERE id = ${id} FOR UPDATE`;
  const department = await tx.department.findUnique({ where: { id }, select: departmentSelect });
  if (!department) throw new AppError(404, 'NOT_FOUND', '진료과를 찾을 수 없습니다.');
  return department;
}

async function countStaff(tx: Prisma.TransactionClient, departmentId: string) {
  const [doctors, nurses] = await Promise.all([
    tx.doctor.count({ where: { departmentId } }),
    tx.nurse.count({ where: { departmentId } }),
  ]);
  return doctors + nurses;
}

/** 관리자는 전체를, 그 밖의 역할은 활성 진료과만 조회한다. 페이지 없이 이름순으로 모두 반환한다. */
export async function list(actor: AccountContext, query: { status?: DepartmentStatus }) {
  let { status } = query;
  if (actor.role !== 'ADMIN') {
    if (status === 'INACTIVE')
      throw new AppError(403, 'FORBIDDEN', '활성 진료과만 조회할 수 있습니다.');
    status = 'ACTIVE';
  }
  return getPrismaClient().department.findMany({
    where: status ? { status } : {},
    select: departmentSelect,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

export async function create(name: string) {
  const database = getPrismaClient();
  if (await database.department.findUnique({ where: { name }, select: { id: true } }))
    throw duplicateName();
  try {
    return await database.department.create({ data: { name }, select: departmentSelect });
  } catch (error) {
    // 같은 이름을 동시에 등록하면 DB의 유일 제약(P2002)이 한쪽을 막는다.
    throw hasPrismaCode(error, 'P2002') ? duplicateName() : error;
  }
}

/** 과거 접수·예약은 진료과 ID를 가리키므로, 이름을 바꾸면 과거 기록에도 새 이름이 표시된다. */
export async function rename(id: string, name: string) {
  try {
    return await getPrismaClient().$transaction(async (tx) => {
      const department = await lockDepartment(tx, id);
      if (department.name === name) return department;
      const sameName = await tx.department.findUnique({ where: { name }, select: { id: true } });
      if (sameName && sameName.id !== id) throw duplicateName();
      return tx.department.update({ where: { id }, data: { name }, select: departmentSelect });
    });
  } catch (error) {
    throw hasPrismaCode(error, 'P2002') ? duplicateName() : error;
  }
}

/** 소속 의료진이 남아 있는 진료과는 비활성화할 수 없다. 먼저 의료진의 소속을 옮겨야 한다. */
export async function changeStatus(id: string, status: DepartmentStatus) {
  return getPrismaClient().$transaction(async (tx) => {
    const department = await lockDepartment(tx, id);
    if (department.status === status) return department;
    if (status === 'INACTIVE' && (await countStaff(tx, id)) > 0)
      throw new AppError(
        409,
        'DEPARTMENT_HAS_STAFF',
        '소속 의료진이 있는 진료과는 비활성화할 수 없습니다.',
      );
    return tx.department.update({ where: { id }, data: { status }, select: departmentSelect });
  });
}

/** 의료진·예약·접수 중 하나라도 이 진료과를 가리키면 삭제할 수 없다. 취소된 예약도 이력으로 본다. */
export async function remove(id: string) {
  const inUse = () =>
    new AppError(
      409,
      'DEPARTMENT_IN_USE',
      '소속 의료진 또는 예약·접수 이력이 있는 진료과는 삭제할 수 없습니다.',
    );
  try {
    await getPrismaClient().$transaction(async (tx) => {
      await lockDepartment(tx, id);
      const [staff, appointments, receptions] = await Promise.all([
        countStaff(tx, id),
        tx.appointment.count({ where: { departmentId: id } }),
        tx.reception.count({ where: { departmentId: id } }),
      ]);
      if (staff + appointments + receptions > 0) throw inUse();
      await tx.department.delete({ where: { id } });
    });
  } catch (error) {
    // 확인 뒤에 새 참조가 생겼다면 DB의 외래키 제약(P2003)이 삭제를 막는다.
    throw hasPrismaCode(error, 'P2003') ? inUse() : error;
  }
}
