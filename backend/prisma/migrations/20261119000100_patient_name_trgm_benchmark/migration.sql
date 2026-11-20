-- Experimental substring search index; requires PostgreSQL pg_trgm extension.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "patients_name_trgm_idx" ON "patients" USING gin ("name" gin_trgm_ops);
