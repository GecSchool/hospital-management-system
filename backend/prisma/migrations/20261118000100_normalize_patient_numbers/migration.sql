-- Keep existing short numbers and assign new sequence values to legacy numbers.
-- References use patients.id, so reservations and receptions remain linked.
UPDATE "patients"
SET "patient_number" = DEFAULT
WHERE "patient_number" !~ '^P[0-9]{8}$';
