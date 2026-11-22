BEGIN;

CREATE FUNCTION enforce_walk_in_reception_leave() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.appointment_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.appointment_id IS NULL
            AND NEW.doctor_account_id = OLD.doctor_account_id
            AND NEW.received_at = OLD.received_at THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Share the transaction lock used by appointments and doctor schedule writes.
    PERFORM pg_advisory_xact_lock(hashtextextended('hospital:doctor-work:' || NEW.doctor_account_id, 0));

    IF EXISTS (
        SELECT 1
        FROM doctor_leaves AS leave
        WHERE leave.doctor_account_id = NEW.doctor_account_id
            AND leave.date = (NEW.received_at AT TIME ZONE 'Asia/Seoul')::date
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            CONSTRAINT = 'receptions_doctor_leave_check',
            MESSAGE = 'receptions_doctor_leave_check: walk-in reception falls on a doctor leave date';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER receptions_walk_in_leave_guard
BEFORE INSERT OR UPDATE OF appointment_id, doctor_account_id, received_at ON receptions
FOR EACH ROW EXECUTE FUNCTION enforce_walk_in_reception_leave();

CREATE FUNCTION enforce_doctor_leave_conflicts() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    day_start timestamptz;
    day_end timestamptz;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.doctor_account_id = OLD.doctor_account_id AND NEW.date = OLD.date THEN
            RETURN NEW;
        END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('hospital:doctor-work:' || NEW.doctor_account_id, 0));

    day_start := NEW.date::timestamp AT TIME ZONE 'Asia/Seoul';
    day_end := (NEW.date + 1)::timestamp AT TIME ZONE 'Asia/Seoul';

    IF EXISTS (
        SELECT 1
        FROM appointments AS appointment
        WHERE appointment.doctor_account_id = NEW.doctor_account_id
            AND appointment.status = 'BOOKED'
            AND appointment.starts_at >= day_start AND appointment.starts_at < day_end
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            CONSTRAINT = 'doctor_leaves_booked_appointment_check',
            MESSAGE = 'doctor_leaves_booked_appointment_check: booked appointment exists on the leave date';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM receptions AS reception
        WHERE reception.doctor_account_id = NEW.doctor_account_id
            AND reception.appointment_id IS NULL
            AND reception.received_at >= day_start AND reception.received_at < day_end
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            CONSTRAINT = 'doctor_leaves_walk_in_reception_check',
            MESSAGE = 'doctor_leaves_walk_in_reception_check: walk-in reception exists on the leave date';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER doctor_leaves_conflict_guard
BEFORE INSERT OR UPDATE OF doctor_account_id, date ON doctor_leaves
FOR EACH ROW EXECUTE FUNCTION enforce_doctor_leave_conflicts();

COMMIT;
