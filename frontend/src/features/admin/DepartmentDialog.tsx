import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, FormField, Input, Select, Modal } from '../../components/ui';
import { Loading, ErrorState } from '../../components/common';
import type { DepartmentSummary } from '../../types/auth';
import { roleLabels } from '../../types/auth';
import type { AccountSummary } from './service';
import { useAdmin, useAdminWrite, adminError } from './AdminWorkspace';

export type DepartmentAction =
  | { kind: 'create' }
  | { kind: 'rename'; department: DepartmentSummary }
  | { kind: 'status'; department: DepartmentSummary }
  | { kind: 'delete'; department: DepartmentSummary }
  | { kind: 'move'; department: DepartmentSummary; account: AccountSummary };
export function DepartmentDialog({
  action,
  onClose,
  onSaved,
}: {
  action: DepartmentAction;
  onClose(): void;
  onSaved(message: string, department?: DepartmentSummary): void;
}) {
  const { departments: service, base } = useAdmin();
  const write = useAdminWrite(true);
  const id = useId();
  const [name, setName] = useState(
    action.kind === 'rename' ? action.department.name : '',
  );
  const [target, setTarget] = useState('');
  const [validation, setValidation] = useState('');
  const [confirm, setConfirm] = useState(
    action.kind === 'status' || action.kind === 'delete',
  );
  const targets = useQuery({
    queryKey: [...base, 'active-departments'],
    queryFn: ({ signal }) => service.list('ACTIVE', signal),
    enabled: action.kind === 'move',
  });
  const blocked = [
    'DEPARTMENT_HAS_STAFF',
    'DEPARTMENT_IN_USE',
    'DOCTOR_HAS_PENDING_WORK',
  ].includes(write.code);
  const close = () => {
    if (!write.pending) onClose();
  };
  const back = () => {
    if (!write.pending) {
      write.clear();
      setConfirm(false);
    }
  };
  const title =
    action.kind === 'create'
      ? '진료과 등록'
      : action.kind === 'rename'
        ? '진료과 수정'
        : action.kind === 'move'
          ? '의료진 소속 변경'
          : action.kind === 'delete'
            ? '진료과를 삭제할까요?'
            : '진료과 상태를 변경할까요?';
  const submitLabel =
    action.kind === 'create'
      ? '등록'
      : action.kind === 'rename'
        ? '저장'
        : action.kind === 'move'
          ? '소속 변경'
          : action.kind === 'delete'
            ? '삭제'
            : action.department.status === 'ACTIVE'
              ? '비활성화'
              : '활성화';
  function validate() {
    if (action.kind === 'move') {
      if (
        target === action.department.id ||
        !targets.data?.some((d) => d.id === target && d.status === 'ACTIVE')
      ) {
        setValidation('변경할 활성 진료과를 선택해 주세요.');
        return;
      }
    } else if (!name.trim()) {
      setValidation('진료과명을 입력해 주세요.');
      return;
    }
    setValidation('');
    setConfirm(true);
  }
  function save() {
    void write.run(
      async () => {
        if (action.kind === 'create')
          return {
            department: await service.create(name.trim()),
            message: '진료과를 등록했습니다.',
          };
        if (action.kind === 'rename')
          return {
            department: await service.rename(action.department.id, name.trim()),
            message: '진료과 정보를 저장했습니다.',
          };
        if (action.kind === 'status')
          return {
            department: await service.changeStatus(
              action.department.id,
              action.department.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            ),
            message: '진료과 상태를 변경했습니다.',
          };
        if (action.kind === 'delete') {
          await service.remove(action.department.id);
          return { message: '진료과를 삭제했습니다.' };
        }
        await service.move(action.account.id, target);
        return { message: '의료진 소속을 변경했습니다.' };
      },
      (result) =>
        onSaved(
          result.message,
          'department' in result ? result.department : undefined,
        ),
    );
  }
  if (blocked)
    return (
      <Modal
        open
        className="admin-dialog department-confirm"
        title={
          write.code === 'DEPARTMENT_HAS_STAFF'
            ? '비활성화할 수 없습니다'
            : write.code === 'DEPARTMENT_IN_USE'
              ? '삭제할 수 없습니다'
              : '소속을 변경할 수 없습니다'
        }
        description={
          'department' in action ? action.department.name : undefined
        }
        onClose={action.kind === 'move' ? back : close}
        footer={
          <Button
            size="compact"
            onClick={action.kind === 'move' ? back : close}
          >
            확인
          </Button>
        }
      >
        <p role="alert">{write.error}</p>
      </Modal>
    );
  if (confirm)
    return (
      <Modal
        open
        className="admin-dialog department-confirm"
        title={
          action.kind === 'status' || action.kind === 'delete'
            ? title
            : `${submitLabel}할까요?`
        }
        description={
          action.kind === 'move'
            ? `${action.account.name} · ${roleLabels[action.account.role]}`
            : action.kind === 'create' || action.kind === 'rename'
              ? name.trim()
              : action.department.name
        }
        onClose={
          action.kind === 'status' || action.kind === 'delete' ? close : back
        }
        footer={
          <>
            <Button
              variant="secondary"
              size="compact"
              disabled={write.pending}
              onClick={
                action.kind === 'status' || action.kind === 'delete'
                  ? close
                  : back
              }
            >
              취소
            </Button>
            <Button size="compact" disabled={write.pending} onClick={save}>
              {write.pending ? '처리 중…' : submitLabel}
            </Button>
          </>
        }
      >
        <p>
          {action.kind === 'delete'
            ? '삭제 후에는 진료과 목록에서 사라집니다. 소속 의료진이나 업무 참조가 있으면 삭제할 수 없습니다.'
            : action.kind === 'move'
              ? `${action.department.name} → ${targets.data?.find((d) => d.id === target)?.name ?? ''}`
              : action.kind === 'status'
                ? '과거 업무 기록과 의료진 소속은 강제로 변경하지 않습니다.'
                : '입력한 진료과 정보를 저장합니다.'}
        </p>
        {write.error && <p role="alert">{write.error}</p>}
      </Modal>
    );
  return (
    <Modal
      open
      className={`admin-dialog department-form ${action.kind === 'move' ? 'department-move-form' : ''}`}
      title={title}
      description={
        action.kind === 'move'
          ? `${action.account.name} · ${roleLabels[action.account.role]}`
          : action.kind === 'create'
            ? '새 진료과 정보를 입력해 주세요.'
            : '진료과 정보를 변경합니다.'
      }
      onClose={close}
      footer={
        <>
          <Button variant="secondary" size="compact" onClick={close}>
            취소
          </Button>
          <Button
            type="submit"
            form={`${id}-form`}
            size="compact"
            disabled={
              action.kind === 'move' && (targets.isPending || targets.isError)
            }
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          validate();
        }}
      >
        {action.kind === 'move' ? (
          <>
            <FormField id={`${id}-current`} label="현재 진료과">
              <Input readOnly value={action.department.name} />
            </FormField>
            <FormField
              id={`${id}-target`}
              label="변경 진료과"
              error={validation}
            >
              <Select
                required
                value={target}
                disabled={targets.isPending || targets.isError}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">활성 진료과를 선택해 주세요</option>
                {targets.data
                  ?.filter((d) => d.id !== action.department.id)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </Select>
            </FormField>
            {targets.isPending && <Loading />}
            {targets.isError && (
              <ErrorState
                message={adminError(targets.error)}
                onRetry={() => void targets.refetch()}
              />
            )}
          </>
        ) : (
          <FormField id={`${id}-name`} label="진료과명" error={validation}>
            <Input
              required
              value={name}
              placeholder="진료과명을 입력해 주세요"
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
        )}
      </form>
    </Modal>
  );
}
