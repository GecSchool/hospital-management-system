import { Link } from 'react-router';
import closeIcon from './close.svg';

/** Figma 243:26860: 20px asset within a 40px keyboard-accessible target. */
export function DoctorClose({ to, label }: { to: string; label: string }) {
  return (
    <Link className="clinical-close" to={to} aria-label={label}>
      <img src={closeIcon} width={20} height={20} alt="" />
    </Link>
  );
}
