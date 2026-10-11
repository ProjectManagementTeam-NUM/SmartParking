-- CreateEnum
CREATE TYPE "SlotState" AS ENUM ('FREE', 'OCCUPIED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SlotSource" AS ENUM ('LIVE', 'SIMULATED');

-- CreateEnum
CREATE TYPE "GatePosition" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "GateDecision" AS ENUM ('OPENED', 'DENIED');

-- CreateTable
CREATE TABLE "Parking" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Parking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "parkingId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "state" "SlotState" NOT NULL DEFAULT 'UNKNOWN',
    "source" "SlotSource" NOT NULL,
    "deviceId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "parkingId" TEXT,
    "apiKeyHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "firmwareVersion" TEXT,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gate" (
    "parkingId" TEXT NOT NULL,
    "position" "GatePosition" NOT NULL DEFAULT 'CLOSED',
    "lastDecision" "GateDecision",
    "lastDecisionAt" TIMESTAMP(3),

    CONSTRAINT "Gate_pkey" PRIMARY KEY ("parkingId")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parkingId" TEXT,
    "slotId" TEXT,
    "deviceId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "siteCount" INTEGER,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Slot_parkingId_idx" ON "Slot"("parkingId");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_parkingId_fkey" FOREIGN KEY ("parkingId") REFERENCES "Parking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_parkingId_fkey" FOREIGN KEY ("parkingId") REFERENCES "Parking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gate" ADD CONSTRAINT "Gate_parkingId_fkey" FOREIGN KEY ("parkingId") REFERENCES "Parking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
