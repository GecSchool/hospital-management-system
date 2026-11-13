-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Required for the doctor/day equality operators in the schedule exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STAFF', 'DOCTOR', 'NURSE', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceptionStatus" AS ENUM ('REGISTERED', 'CALLED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "account_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "nurses" (
    "account_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,

    CONSTRAINT "nurses_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "doctor_availability" (
    "doctor_account_id" TEXT NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,

    CONSTRAINT "doctor_availability_pkey" PRIMARY KEY ("doctor_account_id","day_of_week","start_minute"),
    CONSTRAINT "doctor_availability_minutes_check" CHECK (
      "day_of_week" BETWEEN 0 AND 6
      AND "start_minute" BETWEEN 0 AND 1420
      AND "end_minute" BETWEEN 20 AND 1440
      AND "start_minute" < "end_minute"
      AND "start_minute" % 20 = 0 AND "end_minute" % 20 = 0
    ),
    CONSTRAINT "doctor_availability_no_overlap" EXCLUDE USING gist (
      "doctor_account_id" WITH =,
      "day_of_week" WITH =,
      int4range("start_minute"::integer, "end_minute"::integer, '[)') WITH &&
    )
);

-- CreateTable
CREATE TABLE "doctor_leaves" (
    "doctor_account_id" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "doctor_leaves_pkey" PRIMARY KEY ("doctor_account_id","date")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "patient_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resident_number_ciphertext" BYTEA NOT NULL,
    "resident_number_lookup" BYTEA NOT NULL,
    "birth_date" DATE NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "patients_resident_number_storage_check" CHECK (
      octet_length("resident_number_ciphertext") > 0 AND octet_length("resident_number_lookup") = 32
    )
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_account_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "registered_by_account_id" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_account_id" TEXT,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointments_cancellation_check" CHECK (
      ("status" = 'BOOKED' AND "cancelled_at" IS NULL AND "cancelled_by_account_id" IS NULL)
      OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancelled_by_account_id" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "receptions" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_account_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReceptionStatus" NOT NULL DEFAULT 'REGISTERED',

    CONSTRAINT "receptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "reception_id" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "visits_completion_check" CHECK (
      ("status" = 'IN_PROGRESS' AND "completed_at" IS NULL)
      OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "completed_at" >= "started_at")
    )
);

-- CreateTable
CREATE TABLE "clinical_records" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,

    CONSTRAINT "clinical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_record_versions" (
    "record_id" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "symptoms" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "opinion" TEXT NOT NULL,
    "correction_reason" TEXT,
    "author_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_record_versions_pkey" PRIMARY KEY ("record_id","version_no"),
    CONSTRAINT "clinical_record_versions_reason_check" CHECK (
      ("version_no" = 1 AND "correction_reason" IS NULL)
      OR ("version_no" >= 2 AND "correction_reason" IS NOT NULL AND length(trim("correction_reason")) > 0)
    )
);

-- CreateTable
CREATE TABLE "nursing_records" (
    "id" TEXT NOT NULL,
    "reception_id" TEXT NOT NULL,
    "original_author_account_id" TEXT NOT NULL,

    CONSTRAINT "nursing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nursing_record_versions" (
    "record_id" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "correction_reason" TEXT,
    "author_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nursing_record_versions_pkey" PRIMARY KEY ("record_id","version_no"),
    CONSTRAINT "nursing_record_versions_reason_check" CHECK (
      ("version_no" = 1 AND "correction_reason" IS NULL)
      OR ("version_no" >= 2 AND "correction_reason" IS NOT NULL AND length(trim("correction_reason")) > 0)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "doctors_department_id_idx" ON "doctors"("department_id");

-- CreateIndex
CREATE INDEX "nurses_department_id_idx" ON "nurses"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_patient_number_key" ON "patients"("patient_number");

-- CreateIndex
CREATE UNIQUE INDEX "patients_resident_number_lookup_key" ON "patients"("resident_number_lookup");

-- CreateIndex
CREATE INDEX "patients_name_birth_date_idx" ON "patients"("name", "birth_date");

-- CreateIndex
CREATE INDEX "appointments_patient_id_starts_at_idx" ON "appointments"("patient_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_department_id_starts_at_idx" ON "appointments"("department_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_booked_doctor_time_key" ON "appointments"("doctor_account_id", "starts_at") WHERE ("status" = 'BOOKED');

-- CreateIndex
CREATE UNIQUE INDEX "receptions_appointment_id_key" ON "receptions"("appointment_id");

-- CreateIndex
CREATE INDEX "receptions_patient_id_received_at_idx" ON "receptions"("patient_id", "received_at");

-- CreateIndex
CREATE INDEX "receptions_department_id_received_at_idx" ON "receptions"("department_id", "received_at");

-- CreateIndex
CREATE INDEX "receptions_doctor_account_id_received_at_idx" ON "receptions"("doctor_account_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "visits_reception_id_key" ON "visits"("reception_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_records_visit_id_key" ON "clinical_records"("visit_id");

-- CreateIndex
CREATE INDEX "nursing_records_reception_id_idx" ON "nursing_records"("reception_id");

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nurses" ADD CONSTRAINT "nurses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nurses" ADD CONSTRAINT "nurses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_availability" ADD CONSTRAINT "doctor_availability_doctor_account_id_fkey" FOREIGN KEY ("doctor_account_id") REFERENCES "doctors"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_leaves" ADD CONSTRAINT "doctor_leaves_doctor_account_id_fkey" FOREIGN KEY ("doctor_account_id") REFERENCES "doctors"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_account_id_fkey" FOREIGN KEY ("doctor_account_id") REFERENCES "doctors"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_registered_by_account_id_fkey" FOREIGN KEY ("registered_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelled_by_account_id_fkey" FOREIGN KEY ("cancelled_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_doctor_account_id_fkey" FOREIGN KEY ("doctor_account_id") REFERENCES "doctors"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_reception_id_fkey" FOREIGN KEY ("reception_id") REFERENCES "receptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_record_versions" ADD CONSTRAINT "clinical_record_versions_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "clinical_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_record_versions" ADD CONSTRAINT "clinical_record_versions_author_account_id_fkey" FOREIGN KEY ("author_account_id") REFERENCES "doctors"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nursing_records" ADD CONSTRAINT "nursing_records_reception_id_fkey" FOREIGN KEY ("reception_id") REFERENCES "receptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nursing_records" ADD CONSTRAINT "nursing_records_original_author_account_id_fkey" FOREIGN KEY ("original_author_account_id") REFERENCES "nurses"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nursing_record_versions" ADD CONSTRAINT "nursing_record_versions_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "nursing_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nursing_record_versions" ADD CONSTRAINT "nursing_record_versions_author_account_id_fkey" FOREIGN KEY ("author_account_id") REFERENCES "nurses"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
