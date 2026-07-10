/*
  Warnings:

  - Added the required column `range` to the `Booking` table without a default value. This is not possible if the table is not empty.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

ALTER TABLE "Booking" ADD COLUMN "range" tsrange NOT NULL GENERATED ALWAYS AS (tsrange("startTime", "endTime")) STORED;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_no_overlap" EXCLUDE USING gist ("roomId" WITH =, "range" WITH &&) WHERE (status != 'REJECTED' AND status != 'CANCELLED');