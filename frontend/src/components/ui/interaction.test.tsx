import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';
import { FormField } from './FormField';
import { Input } from './Input';
import { Modal } from './Modal';
import { Pagination } from './Pagination';
import { Tabs } from './Tabs';

afterEach(cleanup);

describe('shared controls', () => {
  it('associates input labels, hints, and errors with their control', () => {
    const { rerender } = render(
      <FormField id="email" label="이메일" hint="병원 계정을 사용해 주세요.">
        <Input type="email" />
      </FormField>,
    );
    const input = screen.getByLabelText('이메일');
    expect(input.getAttribute('aria-describedby')).toBe('email-hint');
    expect(screen.getByText('병원 계정을 사용해 주세요.').id).toBe(
      'email-hint',
    );
    rerender(
      <FormField id="email" label="이메일" error="이메일을 확인해 주세요.">
        <Input type="email" />
      </FormField>,
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('email-error');
    expect(screen.getByRole('alert').textContent).toBe(
      '이메일을 확인해 주세요.',
    );
  });

  it('prevents a disabled button from submitting actions', () => {
    const action = vi.fn();
    render(
      <Button disabled onClick={action}>
        저장
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(action).not.toHaveBeenCalled();
  });

  it('moves focus and visible content with tab keyboard navigation', () => {
    function Example() {
      const [value, setValue] = useState('appointments');
      return (
        <Tabs
          label="환자 이력"
          value={value}
          onChange={setValue}
          items={[
            { id: 'appointments', label: '예약 이력', content: '예약 내역' },
            { id: 'visits', label: '진료 이력', content: '진료 내역' },
          ]}
        />
      );
    }
    render(<Example />);
    const first = screen.getByRole('tab', { name: '예약 이력' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(
      screen
        .getByRole('tab', { name: '진료 이력' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: '진료 이력' }),
    );
    expect(screen.getByRole('tabpanel').textContent).toBe('진료 내역');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByRole('tabpanel').textContent).toBe('예약 내역');
  });

  it('keeps pagination actions inside bounds and shows the final page window', () => {
    const navigate = vi.fn();
    const { rerender } = render(
      <Pagination page={1} totalPages={9} onPageChange={navigate} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '이전 페이지' }));
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(navigate).toHaveBeenCalledWith(2);
    rerender(<Pagination page={9} totalPages={9} onPageChange={navigate} />);
    expect(
      screen
        .getByRole('button', { name: '9페이지' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen
        .getByRole('button', { name: '다음 페이지' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: '5페이지' })).toBeTruthy();
  });

  it('requests a controlled close on escape and hides after parent state changes', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open title="확인" onClose={onClose}>
        선택한 항목을 처리합니다.
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent(
      dialog,
      new Event('cancel', { bubbles: false, cancelable: true }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <Modal open={false} title="확인" onClose={onClose}>
        선택한 항목을 처리합니다.
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
