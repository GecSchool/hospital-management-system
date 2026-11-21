CREATE FUNCTION enforce_appointment_schedule() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    seoul_start timestamp;
    slot_start_minute integer;
BEGIN
    IF NEW.status <> 'BOOKED' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'BOOKED'
            AND NEW.doctor_account_id = OLD.doctor_account_id
            AND NEW.starts_at = OLD.starts_at THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Use the same transaction lock as reservation, weekly schedule and leave services.
    PERFORM pg_advisory_xact_lock(hashtextextended('hospital:doctor-work:' || NEW.doctor_account_id, 0));

    seoul_start := NEW.starts_at AT TIME ZONE 'Asia/Seoul';
    slot_start_minute := EXTRACT(HOUR FROM seoul_start)::integer * 60
        + EXTRACT(MINUTE FROM seoul_start)::integer;

    IF slot_start_minute % 20 <> 0
        OR EXTRACT(SECOND FROM seoul_start) <> 0
        OR EXISTS (
            SELECT 1
            FROM doctor_leaves AS leave
            WHERE leave.doctor_account_id = NEW.doctor_account_id
                AND leave.date = seoul_start::date
        )
        OR NOT EXISTS (
            SELECT 1
            FROM doctor_availability AS availability
            WHERE availability.doctor_account_id = NEW.doctor_account_id
                AND availability.day_of_week = EXTRACT(DOW FROM seoul_start)::smallint
                AND availability.start_minute <= slot_start_minute
                AND availability.end_minute >= slot_start_minute + 20
        ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            CONSTRAINT = 'appointments_schedule_check',
            MESSAGE = 'appointments_schedule_check: appointment falls outside the doctor schedule';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_schedule_guard
BEFORE INSERT OR UPDATE OF status, doctor_account_id, starts_at ON appointments
FOR EACH ROW EXECUTE FUNCTION enforce_appointment_schedule();
