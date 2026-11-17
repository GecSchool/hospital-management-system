-- Preserve existing patient numbers and start after any already-issued short numbers.
CREATE SEQUENCE "patient_number_seq" AS bigint MINVALUE 1 MAXVALUE 99999999;

SELECT setval(
  'patient_number_seq',
  COALESCE(MAX(substring("patient_number" FROM 2)::bigint), 1),
  COUNT(*) > 0
)
FROM "patients"
WHERE "patient_number" ~ '^P[0-9]{1,8}$';

ALTER TABLE "patients"
  ALTER COLUMN "patient_number" SET DEFAULT
    ('P'::text || lpad(nextval('patient_number_seq'::regclass)::text, 8, '0'::text));
