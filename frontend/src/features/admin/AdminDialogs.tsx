import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, Button, Input, Select, FormField } from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import { roles, roleLabels, type Role } from '../../types/auth';
import { useAuth } from '../auth/useAuth';
import { adminError, useAdmin, useAdminWrite } from './AdminWorkspace';
import type { AccountInvitation } from './service';

export function AdminAccountPanel({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: (notice: string) => void;
}) {
  const { service, base } = useAdmin();
  const { user, clearSession } = useAuth();
  const query = useQuery({
    queryKey: [...base, 'account', id],
    queryFn: ({ signal }) => service.detail(id, signal),
  });
  const [action, setAction] = useState<'status' | 'reset' | null>(null);
  const [notice, setNotice] = useState('');
  const write = useAdminWrite();
  const row = query.data;
  const blocked =
    action === 'status' &&
    ['LAST_ACTIVE_ADMIN', 'DOCTOR_HAS_PENDING_WORK'].includes(write.code);
  const back = () => {
    if (!write.pending) {
      setAction(null);
      write.clear();
    }
  };
  if (action && row)
    return (
      <Modal
        open
        className="admin-dialog admin-confirm-dialog"
        title={
          blocked
            ? '계정을 비활성화할 수 없습니다'
            : action === 'status'
              ? '계정 상태를 변경할까요?'
              : '재설정 링크를 발송할까요?'
        }
        description={`${row.name} · ${action === 'reset' ? row.email : `${roleLabels[row.role]} · ${row.department?.name ?? '소속 없음'}`}`}
        onClose={back}
        footer={
          blocked ? (
            <Button size="compact" onClick={back}>
              확인
            </Button>
          ) : (
            <>
              <Button
                size="compact"
                variant="secondary"
                disabled={write.pending}
                onClick={back}
              >
                취소
              </Button>
              <Button
                size="compact"
                disabled={write.pending}
                onClick={() => {
                  if (action === 'status')
                    void write.run(
                      async () => {
                        const result = await service.changeStatus(
                          id,
                          row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                        );
                        if (
                          result.id === user!.id &&
                          result.status === 'INACTIVE'
                        )
                          clearSession();
                        return result;
                      },
                      (result) =>
                        onChanged(
                          `${result.name} 계정을 ${result.status === 'ACTIVE' ? '활성화' : '비활성화'}했습니다.`,
                        ),
                    );
                  else
                    void write.run(
                      () => service.requestPasswordReset(id),
                      (result) => {
                        setNotice(result.message);
                        setAction(null);
                      },
                    );
                }}
              >
                {write.pending
                  ? '처리 중…'
                  : action === 'reset'
                    ? '링크 발송'
                    : row.status === 'ACTIVE'
                      ? '비활성화'
                      : '활성화'}
              </Button>
            </>
          )
        }
      >
        {blocked ? (
          <p role="alert">{write.error}</p>
        ) : (
          <>
            <p>
              {action === 'status'
                ? row.status === 'ACTIVE'
                  ? '비활성화하면 해당 계정으로 로그인할 수 없습니다.'
                  : '계정을 활성화합니다.'
                : service.mock
                  ? '개발용 Mock 요청입니다. 실제 이메일을 발송하지 않으며 계정 상태를 변경하지 않습니다.'
                  : '등록된 이메일로 비밀번호 재설정 링크를 요청합니다. 서버 요청 수락이 수신함 도착을 보장하지 않습니다.'}
            </p>
            {action === 'status' &&
              id === user!.id &&
              row.status === 'ACTIVE' && (
                <p>본인 계정을 비활성화하면 로그아웃됩니다.</p>
              )}
            {write.error && <p role="alert">{write.error}</p>}
          </>
        )}
      </Modal>
    );
  return (
    <Modal
      open
      className="admin-dialog admin-account-panel"
      title="계정 상세"
      onClose={onClose}
      footer={
        row ? (
          <>
            <Button
              variant="secondary"
              size="compact"
              onClick={() => {
                write.clear();
                setAction('status');
              }}
            >
              {row.status === 'ACTIVE' ? '비활성화' : '활성화'}
            </Button>
            <Button
              size="compact"
              onClick={() => {
                write.clear();
                setAction('reset');
              }}
            >
              비밀번호 재설정 링크 발송
            </Button>
          </>
        ) : (
          <Button size="compact" onClick={onClose}>
            목록으로 돌아가기
          </Button>
        )
      }
    >
      <button
        type="button"
        className="admin-panel-close"
        onClick={onClose}
        aria-label="계정 상세 닫기"
      >
        ×
      </button>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState
          message={adminError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        row && (
          <dl className="admin-account-info">
            <div>
              <dt>이름</dt>
              <dd>{row.name}</dd>
            </div>
            <div>
              <dt>이메일</dt>
              <dd>{row.email}</dd>
            </div>
            <div>
              <dt>역할</dt>
              <dd>{row.role === 'ADMIN' ? '관리자' : roleLabels[row.role]}</dd>
            </div>
            <div>
              <dt>소속 진료과</dt>
              <dd>{row.department?.name ?? '—'}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>{row.status === 'ACTIVE' ? '활성' : '비활성'}</dd>
            </div>
          </dl>
        )
      )}
      {notice && (
        <p role="status" className="admin-panel-notice">
          {notice}
        </p>
      )}
    </Modal>
  );
}

export function AdminInviteDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (notice: string) => void;
}) {
  const { service, base } = useAdmin();
  const id = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [departmentId, setDepartment] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [confirmedInput, setConfirmedInput] =
    useState<AccountInvitation | null>(null);
  const medical = role === 'DOCTOR' || role === 'NURSE';
  const departments = useQuery({
    queryKey: [...base, 'active-departments'],
    queryFn: ({ signal }) => service.departments(signal),
    enabled: medical,
  });
  const write = useAdminWrite();
  function submit() {
    const next = {
      name: name.trim() ? undefined : '이름을 입력해 주세요.',
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? undefined
        : '올바른 이메일을 입력해 주세요.',
      role: role ? undefined : '역할을 선택해 주세요.',
      departmentId:
        medical &&
        !departments.data?.some(
          (d) => d.id === departmentId && d.status === 'ACTIVE',
        )
          ? '활성 진료과를 선택해 주세요.'
          : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean) || !role) return;
    setConfirmedInput({
      name: name.trim(),
      email: email.trim(),
      role,
      ...(medical ? { departmentId } : {}),
    });
  }
  const close = () => {
    if (!write.pending) onClose();
  };
  if (confirmedInput)
    return (
      <Modal
        open
        className="admin-dialog admin-confirm-dialog"
        title="계정 초대를 요청할까요?"
        onClose={() => {
          if (!write.pending) setConfirmedInput(null);
        }}
        footer={
          <>
            <Button
              size="compact"
              variant="secondary"
              disabled={write.pending}
              onClick={() => setConfirmedInput(null)}
            >
              돌아가기
            </Button>
            <Button
              size="compact"
              disabled={write.pending}
              onClick={() =>
                void write.run(
                  () => service.invite(confirmedInput),
                  (result) => onSaved(result.message),
                )
              }
            >
              {write.pending ? '요청 중…' : '초대 요청 확정'}
            </Button>
          </>
        }
      >
        <p>
          {confirmedInput.name} · {confirmedInput.email} ·{' '}
          {roleLabels[confirmedInput.role]}
        </p>
        {medical && (
          <p>
            {
              departments.data?.find(
                (d) => d.id === confirmedInput.departmentId,
              )?.name
            }
          </p>
        )}
        <p>
          {service.mock
            ? '개발용 Mock 초대입니다. 실제 메일 발송 없이 요청을 등록하며, 수락 전 계정은 생성하지 않습니다.'
            : '초대 요청 수락 후 가입 링크를 발송합니다. 수신함 도착은 보장되지 않습니다.'}
        </p>
        {write.error && <p role="alert">{write.error}</p>}
      </Modal>
    );
  return (
    <Modal
      open
      className="admin-dialog admin-invite-dialog"
      title="계정 초대"
      description="초대할 사용자의 정보를 입력합니다."
      onClose={close}
      footer={
        <>
          <Button
            variant="secondary"
            size="compact"
            disabled={write.pending}
            onClick={close}
          >
            취소
          </Button>
          <Button
            type="submit"
            form={`${id}-form`}
            size="compact"
            disabled={
              write.pending ||
              (medical && (departments.isPending || departments.isError))
            }
          >
            초대 발송
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormField id={`${id}-name`} label="이름" error={errors.name}>
          <Input
            required
            value={name}
            placeholder="이름을 입력해 주세요"
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField id={`${id}-email`} label="이메일" error={errors.email}>
          <Input
            required
            type="email"
            value={email}
            placeholder="이메일을 입력해 주세요"
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField id={`${id}-role`} label="역할" error={errors.role}>
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role | '');
              setDepartment('');
              setErrors((p) => ({ ...p, departmentId: undefined }));
            }}
          >
            <option value="">역할을 선택해 주세요</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r === 'ADMIN' ? '관리자' : roleLabels[r]}
              </option>
            ))}
          </Select>
        </FormField>
        {medical && (
          <FormField
            id={`${id}-department`}
            label="소속 진료과"
            error={errors.departmentId}
          >
            <Select
              required
              value={departmentId}
              disabled={departments.isPending || departments.isError}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">진료과를 선택해 주세요</option>
              {departments.data
                ?.filter((d) => d.status === 'ACTIVE')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </Select>
          </FormField>
        )}
        {medical && departments.isPending && (
          <Loading message="활성 진료과를 조회하고 있습니다." />
        )}
        {medical && departments.isError && (
          <ErrorState
            message={adminError(departments.error)}
            onRetry={() => void departments.refetch()}
          />
        )}
        <p className="admin-invite-help">
          의사와 간호사는 활성 진료과를 선택합니다.
        </p>
      </form>
    </Modal>
  );
}
