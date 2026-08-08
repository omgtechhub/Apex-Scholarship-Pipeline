-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'PAUSED');

-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScholarshipStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DRAFT', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'GENERATING', 'GENERATED', 'QUALITY_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "DuplicateResult" AS ENUM ('NEW', 'UPDATED', 'DUPLICATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "FundingType" AS ENUM ('FULL', 'PARTIAL', 'TUITION_ONLY', 'LIVING_ALLOWANCE', 'TRAVEL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DegreeLevel" AS ENUM ('UNDERGRADUATE', 'MASTERS', 'PHD', 'POSTDOCTORAL', 'SHORT_COURSE', 'ONLINE', 'ANY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "QualityStatus" AS ENUM ('PASS', 'REVIEW', 'REJECT');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('CRAWL_FAILURE', 'REPEATED_CRAWL_FAILURE', 'SCHOLARSHIP_DISCOVERED', 'ARTICLE_GENERATED', 'QUALITY_FAILURE', 'ARTICLE_APPROVED', 'ARTICLE_PUBLISHED', 'PIPELINE_FAILURE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'PAUSED');

-- CreateEnum
CREATE TYPE "PublishingStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "country" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "adapterKey" TEXT NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "crawlIntervalMin" INTEGER NOT NULL DEFAULT 30,
    "lastCrawledAt" TIMESTAMP(3),
    "nextCrawlAt" TIMESTAMP(3),
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scholarship_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarships" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "organizationId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "officialUrl" TEXT NOT NULL,
    "applicationUrl" TEXT,
    "deadline" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "country" TEXT,
    "eligibleCountries" TEXT[],
    "degreeLevel" "DegreeLevel" NOT NULL DEFAULT 'UNKNOWN',
    "fieldsOfStudy" TEXT[],
    "fundingType" "FundingType" NOT NULL DEFAULT 'UNKNOWN',
    "fundingAmount" DOUBLE PRECISION,
    "currency" TEXT,
    "benefits" TEXT[],
    "eligibility" TEXT,
    "requirements" TEXT[],
    "documents" TEXT[],
    "applicationInstructions" TEXT,
    "contentHash" TEXT NOT NULL,
    "status" "ScholarshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scholarships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_versions" (
    "id" TEXT NOT NULL,
    "scholarshipId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changedFields" TEXT[],
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholarship_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_records" (
    "id" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "duplicateId" TEXT NOT NULL,
    "result" "DuplicateResult" NOT NULL,
    "similarity" DOUBLE PRECISION,
    "matchedFields" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "scholarshipId" TEXT NOT NULL,
    "promptVersionId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "wordCount" INTEGER,
    "readingTime" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_versions" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_seo" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "seoTitle" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "keywords" TEXT[],
    "canonicalUrl" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogImage" TEXT,
    "twitterTitle" TEXT,
    "twitterDescription" TEXT,
    "jsonLd" JSONB,
    "faqSchema" JSONB,
    "breadcrumbSchema" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_seo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_checks" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "status" "QualityStatus" NOT NULL,
    "checks" JSONB NOT NULL,
    "errors" TEXT[],
    "warnings" TEXT[],
    "recommendations" TEXT[],
    "factualMismatches" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "status" "PublishingStatus" NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawler_jobs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "CrawlStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "scholarships" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawler_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawler_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "sourceId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawler_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_history" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "variables" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "labels" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_messages" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "channelId" TEXT,
    "senderId" TEXT,
    "content" TEXT NOT NULL,
    "extractedUrls" TEXT[],
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "scholarshipId" TEXT,
    "metadata" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "channel_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_name_key" ON "organizations"("name");

-- CreateIndex
CREATE INDEX "organizations_name_idx" ON "organizations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "scholarship_sources_name_key" ON "scholarship_sources"("name");

-- CreateIndex
CREATE UNIQUE INDEX "scholarship_sources_slug_key" ON "scholarship_sources"("slug");

-- CreateIndex
CREATE INDEX "scholarship_sources_slug_idx" ON "scholarship_sources"("slug");

-- CreateIndex
CREATE INDEX "scholarship_sources_status_idx" ON "scholarship_sources"("status");

-- CreateIndex
CREATE INDEX "scholarship_sources_nextCrawlAt_idx" ON "scholarship_sources"("nextCrawlAt");

-- CreateIndex
CREATE UNIQUE INDEX "scholarships_slug_key" ON "scholarships"("slug");

-- CreateIndex
CREATE INDEX "scholarships_sourceId_idx" ON "scholarships"("sourceId");

-- CreateIndex
CREATE INDEX "scholarships_status_idx" ON "scholarships"("status");

-- CreateIndex
CREATE INDEX "scholarships_deadline_idx" ON "scholarships"("deadline");

-- CreateIndex
CREATE INDEX "scholarships_officialUrl_idx" ON "scholarships"("officialUrl");

-- CreateIndex
CREATE INDEX "scholarships_applicationUrl_idx" ON "scholarships"("applicationUrl");

-- CreateIndex
CREATE INDEX "scholarships_contentHash_idx" ON "scholarships"("contentHash");

-- CreateIndex
CREATE INDEX "scholarships_slug_idx" ON "scholarships"("slug");

-- CreateIndex
CREATE INDEX "scholarships_createdAt_idx" ON "scholarships"("createdAt");

-- CreateIndex
CREATE INDEX "scholarships_updatedAt_idx" ON "scholarships"("updatedAt");

-- CreateIndex
CREATE INDEX "scholarships_country_idx" ON "scholarships"("country");

-- CreateIndex
CREATE INDEX "scholarships_degreeLevel_idx" ON "scholarships"("degreeLevel");

-- CreateIndex
CREATE INDEX "scholarships_fundingType_idx" ON "scholarships"("fundingType");

-- CreateIndex
CREATE INDEX "scholarship_versions_scholarshipId_idx" ON "scholarship_versions"("scholarshipId");

-- CreateIndex
CREATE INDEX "scholarship_versions_version_idx" ON "scholarship_versions"("version");

-- CreateIndex
CREATE INDEX "duplicate_records_originalId_idx" ON "duplicate_records"("originalId");

-- CreateIndex
CREATE INDEX "duplicate_records_duplicateId_idx" ON "duplicate_records"("duplicateId");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_scholarshipId_idx" ON "articles"("scholarshipId");

-- CreateIndex
CREATE INDEX "articles_status_idx" ON "articles"("status");

-- CreateIndex
CREATE INDEX "articles_slug_idx" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_publishedAt_idx" ON "articles"("publishedAt");

-- CreateIndex
CREATE INDEX "articles_scheduledAt_idx" ON "articles"("scheduledAt");

-- CreateIndex
CREATE INDEX "articles_createdAt_idx" ON "articles"("createdAt");

-- CreateIndex
CREATE INDEX "articles_updatedAt_idx" ON "articles"("updatedAt");

-- CreateIndex
CREATE INDEX "article_versions_articleId_idx" ON "article_versions"("articleId");

-- CreateIndex
CREATE INDEX "article_versions_version_idx" ON "article_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "article_seo_articleId_key" ON "article_seo"("articleId");

-- CreateIndex
CREATE INDEX "article_seo_articleId_idx" ON "article_seo"("articleId");

-- CreateIndex
CREATE INDEX "article_seo_slug_idx" ON "article_seo"("slug");

-- CreateIndex
CREATE INDEX "quality_checks_articleId_idx" ON "quality_checks"("articleId");

-- CreateIndex
CREATE INDEX "quality_checks_status_idx" ON "quality_checks"("status");

-- CreateIndex
CREATE INDEX "publications_articleId_idx" ON "publications"("articleId");

-- CreateIndex
CREATE INDEX "publications_status_idx" ON "publications"("status");

-- CreateIndex
CREATE INDEX "publications_provider_idx" ON "publications"("provider");

-- CreateIndex
CREATE INDEX "crawler_jobs_sourceId_idx" ON "crawler_jobs"("sourceId");

-- CreateIndex
CREATE INDEX "crawler_jobs_status_idx" ON "crawler_jobs"("status");

-- CreateIndex
CREATE INDEX "crawler_jobs_createdAt_idx" ON "crawler_jobs"("createdAt");

-- CreateIndex
CREATE INDEX "crawler_logs_jobId_idx" ON "crawler_logs"("jobId");

-- CreateIndex
CREATE INDEX "crawler_logs_sourceId_idx" ON "crawler_logs"("sourceId");

-- CreateIndex
CREATE INDEX "crawler_logs_level_idx" ON "crawler_logs"("level");

-- CreateIndex
CREATE INDEX "crawler_logs_createdAt_idx" ON "crawler_logs"("createdAt");

-- CreateIndex
CREATE INDEX "execution_logs_type_idx" ON "execution_logs"("type");

-- CreateIndex
CREATE INDEX "execution_logs_status_idx" ON "execution_logs"("status");

-- CreateIndex
CREATE INDEX "execution_logs_createdAt_idx" ON "execution_logs"("createdAt");

-- CreateIndex
CREATE INDEX "queue_history_queue_idx" ON "queue_history"("queue");

-- CreateIndex
CREATE INDEX "queue_history_jobId_idx" ON "queue_history"("jobId");

-- CreateIndex
CREATE INDEX "queue_history_status_idx" ON "queue_history"("status");

-- CreateIndex
CREATE INDEX "queue_history_createdAt_idx" ON "queue_history"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "prompts_name_key" ON "prompts"("name");

-- CreateIndex
CREATE INDEX "prompts_name_idx" ON "prompts"("name");

-- CreateIndex
CREATE INDEX "prompt_versions_promptId_idx" ON "prompt_versions"("promptId");

-- CreateIndex
CREATE INDEX "prompt_versions_version_idx" ON "prompt_versions"("version");

-- CreateIndex
CREATE INDEX "prompt_versions_active_idx" ON "prompt_versions"("active");

-- CreateIndex
CREATE INDEX "notifications_event_idx" ON "notifications"("event");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "metrics_name_idx" ON "metrics"("name");

-- CreateIndex
CREATE INDEX "metrics_recordedAt_idx" ON "metrics"("recordedAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity");

-- CreateIndex
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "system_settings_key_idx" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "channel_messages_provider_idx" ON "channel_messages"("provider");

-- CreateIndex
CREATE INDEX "channel_messages_processed_idx" ON "channel_messages"("processed");

-- CreateIndex
CREATE INDEX "channel_messages_receivedAt_idx" ON "channel_messages"("receivedAt");

-- AddForeignKey
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "scholarship_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_versions" ADD CONSTRAINT "scholarship_versions_scholarshipId_fkey" FOREIGN KEY ("scholarshipId") REFERENCES "scholarships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_records" ADD CONSTRAINT "duplicate_records_originalId_fkey" FOREIGN KEY ("originalId") REFERENCES "scholarships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_records" ADD CONSTRAINT "duplicate_records_duplicateId_fkey" FOREIGN KEY ("duplicateId") REFERENCES "scholarships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_scholarshipId_fkey" FOREIGN KEY ("scholarshipId") REFERENCES "scholarships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_seo" ADD CONSTRAINT "article_seo_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_checks" ADD CONSTRAINT "quality_checks_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawler_jobs" ADD CONSTRAINT "crawler_jobs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "scholarship_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawler_logs" ADD CONSTRAINT "crawler_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "crawler_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawler_logs" ADD CONSTRAINT "crawler_logs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "scholarship_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
