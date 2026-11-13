// Keep the pre-split production cascade, including cross-role selectors, stable.
// Page JS is lazy; CSS intentionally remains eager to preserve existing rendering.
import '../../components/layout/layout.css';
import '../../features/appointments/appointments.css';
import '../../features/doctor/doctor.css';
import '../../features/admin/admin.css';
import '../../features/admin/departments.css';
import '../../features/doctor/clinical.css';
import '../../features/staff/staff.css';
import '../../features/nurse/nurse.css';
import '../../features/nurse/records.css';
import '../../features/receptions/receptions.css';
import '../../features/auth/auth.css';
