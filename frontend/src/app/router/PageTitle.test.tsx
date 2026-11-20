import { expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router';
import { PageTitle } from './PageTitle';

it('updates the title on navigation without exposing patient identifiers', () => {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <PageTitle />
      <Link to="/staff/patients/private-id?name=private">환자 상세로</Link>
      <Link to="/missing">없는 화면으로</Link>
    </MemoryRouter>,
  );
  expect(document.title).toBe('로그인 | 숭실대 병원');
  fireEvent.click(screen.getByText('환자 상세로'));
  expect(document.title).toBe('환자 상세 | 숭실대 병원');
  expect(document.title).not.toContain('private');
  fireEvent.click(screen.getByText('없는 화면으로'));
  expect(document.title).toBe('페이지를 찾을 수 없음 | 숭실대 병원');
});
