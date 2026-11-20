import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Input, Modal } from '../../components/ui';
import { getSessionGeneration } from '../../services/api/sessionGeneration';
import { apiMode } from '../../services/mode';
import { useAuth } from '../auth/useAuth';
import { refreshPatient } from './queries';
import { PhoneInput } from './PhoneInput';
import { ResidentNumberInput } from './ResidentNumberInput';
import {
  staffErrorMessage,
  validPhoneShape,
  validResidentShape,
} from './validation';
import { useStaff } from './useStaff';
import type { StaffPatientDetail } from './types';

export function PatientForm({
  patient,
  onClose,
  onSaved,
}: {
  patient?: StaffPatientDetail;
  onClose(): void;
  onSaved(patient: StaffPatientDetail): void;
}) {
  const { service } = useStaff();
  const { user } = useAuth();
  const client = useQueryClient();
  const editing = !!patient;
  const formId = useId();
  const [name, setName] = useState(patient?.name ?? '');
  const [phone, setPhone] = useState(patient?.phone ?? '');
  const normalizedPhone = phone.trim().replaceAll('-', '');
  const [residentFront, setResidentFront] = useState('');
  const [residentBack, setResidentBack] = useState('');
  const residentNumber = residentFront + residentBack;
  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    residentNumber?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !user) return;
    if (
      patient &&
      name.trim() === patient.name &&
      normalizedPhone === patient.phone.replaceAll('-', '')
    )
      return;
    const next = {
      name: name.trim() ? undefined : '이름을 입력해 주세요.',
      phone: !phone.trim()
        ? '연락처를 입력해 주세요.'
        : !validPhoneShape(phone.trim())
          ? '연락처 형식을 확인해 주세요.'
          : undefined,
      residentNumber: editing
        ? undefined
        : !residentNumber
          ? '주민등록번호를 입력해 주세요.'
          : !validResidentShape(residentNumber)
            ? '주민등록번호 형식을 확인해 주세요.'
            : undefined,
    };
    setErrors(next);
    setError(null);
    if (Object.values(next).some(Boolean)) return;
    const generation = getSessionGeneration();
    lock.current = true;
    setPending(true);
    try {
      // Plain async writes keep raw resident numbers out of TanStack MutationCache.
      const saved = patient
        ? await service.update(patient.id, {
            ...(name.trim() !== patient.name ? { name: name.trim() } : {}),
            ...(normalizedPhone !== patient.phone.replaceAll('-', '')
              ? { phone: normalizedPhone }
              : {}),
          })
        : await service.create({
            name: name.trim(),
            phone: normalizedPhone,
            residentNumber,
          });
      if (!active.current || generation !== getSessionGeneration()) return;
      await refreshPatient(
        client,
        user.id,
        saved,
        () => active.current && generation === getSessionGeneration(),
      );
      if (active.current && generation === getSessionGeneration())
        onSaved(saved);
    } catch (reason) {
      if (active.current) setError(staffErrorMessage(reason));
    } finally {
      lock.current = false;
      if (active.current) {
        setPending(false);
        setResidentFront('');
        setResidentBack('');
      }
    }
  }
  const unchanged =
    patient &&
    patient.name === name.trim() &&
    patient.phone.replaceAll('-', '') === normalizedPhone;
  return (
    <Modal
      open
      title={editing ? '환자 정보 수정' : '환자 등록'}
      description={
        editing
          ? '변경할 환자 정보를 확인해 주세요.'
          : '환자의 기본 정보를 입력해 주세요.'
      }
      className={`staff-patient-modal${editing ? ' staff-patient-modal--edit' : ''}`}
      onClose={() => {
        if (!lock.current) onClose();
      }}
      footer={
        <>
          <Button
            className={editing ? '' : 'staff-cancel'}
            size="compact"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            size="compact"
            form={formId}
            type="submit"
            disabled={pending || !!unchanged}
          >
            {pending ? '저장 중…' : editing ? '저장' : '등록'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={submit}
        aria-busy={pending}
        data-figma-node={editing ? '37:885' : '18:194'}
      >
        <div className="staff-patient-fields">
          <FormField id={`${formId}-name`} label="이름" error={errors.name}>
            <Input
              id={`${formId}-name`}
              required
              autoComplete="off"
              placeholder="이름을 입력해 주세요"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            />
          </FormField>
          {editing ? (
            <div className="ui-form-field staff-resident-readonly">
              <span className="staff-resident-label">주민등록번호</span>
              <p>{patient.maskedResidentNumber}</p>
              <p className="ui-field-hint">
                현재 주민등록번호는 변경할 수 없습니다.
              </p>
            </div>
          ) : (
            <FormField
              id={`${formId}-resident`}
              label="주민등록번호"
              error={errors.residentNumber}
            >
              <ResidentNumberInput
                id={`${formId}-resident`}
                front={residentFront}
                back={residentBack}
                disabled={pending}
                aria-describedby={`${formId}-privacy`}
                onChange={(front, back) => {
                  setResidentFront(front);
                  setResidentBack(back);
                }}
              />
            </FormField>
          )}
          <FormField id={`${formId}-phone`} label="연락처" error={errors.phone}>
            <PhoneInput
              id={`${formId}-phone`}
              required
              placeholder="연락처를 입력해 주세요"
              value={phone}
              onChange={setPhone}
              disabled={pending}
            />
          </FormField>
        </div>
        {!editing && (
          <p id={`${formId}-privacy`} className="staff-privacy">
            {import.meta.env.DEV && apiMode === 'mock'
              ? '개발 Mock: 가상 번호(예: 900101-0000000)만 입력하세요.'
              : '주민등록번호는 저장 후 마스킹하여 표시합니다.'}
          </p>
        )}
        {error && (
          <p className="staff-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
