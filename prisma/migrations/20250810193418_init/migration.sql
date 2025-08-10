-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceInfo" TEXT,
    "samplingRate" INTEGER NOT NULL,
    "calibLeft" REAL NOT NULL,
    "calibCenter" REAL NOT NULL,
    "calibRight" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "Sample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "xRaw" REAL NOT NULL,
    "xFiltered" REAL,
    "confidence" REAL,
    CONSTRAINT "Sample_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Sample_sessionId_ts_idx" ON "Sample"("sessionId", "ts");
