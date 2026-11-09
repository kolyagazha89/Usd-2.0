-- Additive inbox only. No historical identities, results or registrations change.
CREATE TABLE "AdminNotification" (
  "id" TEXT NOT NULL,
  "eventKey" VARCHAR(180) NOT NULL,
  "kind" VARCHAR(40) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "path" VARCHAR(300) NOT NULL,
  "sourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  "completedByUserId" TEXT,
  CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminNotification_eventKey_key" ON "AdminNotification"("eventKey");
CREATE INDEX "AdminNotification_completedAt_createdAt_idx" ON "AdminNotification"("completedAt", "createdAt");
CREATE TABLE "AdminNotificationRead" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminNotificationRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminNotificationRead_notificationId_userId_key" ON "AdminNotificationRead"("notificationId", "userId");
CREATE INDEX "AdminNotificationRead_userId_readAt_idx" ON "AdminNotificationRead"("userId", "readAt");
ALTER TABLE "AdminNotificationRead" ADD CONSTRAINT "AdminNotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "AdminNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminNotificationRead" ADD CONSTRAINT "AdminNotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
