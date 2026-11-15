-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "announcedOnline" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Device_announcedOnline_lastSeenAt_idx" ON "Device"("announcedOnline", "lastSeenAt");
