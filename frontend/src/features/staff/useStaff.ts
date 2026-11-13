import { useContext } from 'react';
import { StaffContext } from './StaffContext';
export function useStaff() {
  const value = useContext(StaffContext);
  if (!value) throw new Error('Staff workspace is required.');
  return value;
}
