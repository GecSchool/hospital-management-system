-- Experimental indexes for comparative measurements; existing integrity indexes remain unchanged.
CREATE INDEX "appointments_doctor_time_id_idx" ON "appointments" ("doctor_account_id", "starts_at", "id");
CREATE INDEX "appointments_booked_time_id_idx" ON "appointments" ("starts_at", "id") WHERE "status" = 'BOOKED';
CREATE INDEX "receptions_time_id_idx" ON "receptions" ("received_at", "id");
