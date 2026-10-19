/**
 * Phase 11.3 — Async Points Queue
 *
 * A lightweight Redis-backed queue for points operations.
 *
 * Architecture:
 *  - Cashier enqueues a points job → immediate ACK to UI (fast response)
 *  - Background worker (Edge Function or cron) dequeues & processes the job
 *  - Idempotency key from Phase 4.5.1 prevents double-processing on retry
 *
 * Queue Keys:
 *  - `pq:pending`          — Redis LIST (LPUSH/BRPOP) of pending job IDs
 *  - `pq:job:{jobId}`      — Redis HASH storing job details (TTL 24h)
 *  - `pq:result:{jobId}`   — Redis STRING storing processing result (TTL 2h)
 *  - `pq:dlq`              — Dead Letter Queue for failed jobs (LIST)
 *
 * NOTE: This queue handles SERVER-SIDE load distribution (Phase 11.3).
 *       It is SEPARATE from the client-side offline queue in lib/offline-queue.ts
 *       which handles NETWORK outages on the cashier device (Phase 32).
 */

import { redis } from './redis';

// ─── Config ───────────────────────────────────────────────────────────────────
const QUEUE_KEY = 'pq:pending';
const DLQ_KEY = 'pq:dlq';
const JOB_TTL_SECONDS = 24 * 60 * 60;      // 24 hours
const RESULT_TTL_SECONDS = 2 * 60 * 60;     // 2 hours
const MAX_RETRY_ATTEMPTS = 3;

// ─── Types ────────────────────────────────────────────────────────────────────
export type PointsJobType = 'earn' | 'redeem' | 'expire' | 'transfer';

export interface PointsJob {
  /** Unique job identifier */
  jobId: string;
  /** Idempotency key — same as used in the atomic stored procedure (Phase 4.5.1) */
  idempotencyKey: string;
  type: PointsJobType;
  businessId: string;
  branchId: string | null;
  customerId: string;
  pointsChange: number;
  reason: string;
  createdBy: string | null;
  /** ISO 8601 timestamp */
  enqueuedAt: string;
  /** Number of processing attempts so far */
  attempts: number;
  /** Optional invoice reference (Phase 15.10) */
  invoiceReference?: string | null;
  /** ISO 8601 expiry for points (Phase 14) */
  expiresAt?: string | null;
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

export interface JobResult {
  jobId: string;
  status: 'completed' | 'failed';
  processedAt: string;
  /** New customer balance after operation */
  newBalance?: number;
  /** Error message if failed */
  error?: string;
}

// ─── Key Helpers ──────────────────────────────────────────────────────────────
function jobKey(jobId: string) {
  return `pq:job:${jobId}`;
}
function resultKey(jobId: string) {
  return `pq:result:${jobId}`;
}

// ─── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * 11.3: Enqueue a points operation for async processing.
 *
 * Returns immediately with the jobId — the actual DB write happens
 * when the worker processes this job.
 *
 * Design: Uses LPUSH (left-push) on the pending list so workers can
 * use RPOP (right-pop / FIFO) for fair ordering.
 */
export async function enqueuePointsJob(params: Omit<PointsJob, 'jobId' | 'enqueuedAt' | 'attempts'>): Promise<{
  jobId: string;
  queued: boolean;
}> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const job: PointsJob = {
    ...params,
    jobId,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  };

  try {
    // Store job details as a JSON string in Redis
    await redis.setex(jobKey(jobId), JOB_TTL_SECONDS, JSON.stringify(job));
    // Push the jobId onto the pending queue (LPUSH = left/head)
    await redis.lpush(QUEUE_KEY, jobId);

    console.log(`[points-queue] Enqueued job ${jobId} (type=${params.type}, customer=${params.customerId})`);
    return { jobId, queued: true };
  } catch (err) {
    console.error('[points-queue] Failed to enqueue job:', err);
    return { jobId, queued: false };
  }
}

// ─── Dequeue ──────────────────────────────────────────────────────────────────

/**
 * Pop the next pending job from the queue (RPOP = right/tail → FIFO).
 * Returns null if the queue is empty.
 */
export async function dequeuePointsJob(): Promise<PointsJob | null> {
  try {
    // RPOP for FIFO processing (items were LPUSH'd)
    const jobId = await redis.rpop<string>(QUEUE_KEY);
    if (!jobId) return null;

    const raw = await redis.get<string>(jobKey(jobId));
    if (!raw) {
      console.warn(`[points-queue] Job ${jobId} not found in Redis (expired?)`);
      return null;
    }

    const job: PointsJob = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return job;
  } catch (err) {
    console.error('[points-queue] Failed to dequeue job:', err);
    return null;
  }
}

// ─── Acknowledge / Complete ───────────────────────────────────────────────────

/**
 * Mark a job as completed and store its result.
 */
export async function completePointsJob(jobId: string, result: Omit<JobResult, 'jobId' | 'processedAt'>): Promise<void> {
  const jobResult: JobResult = {
    jobId,
    status: result.status,
    processedAt: new Date().toISOString(),
    newBalance: result.newBalance,
    error: result.error,
  };

  try {
    await redis.setex(resultKey(jobId), RESULT_TTL_SECONDS, JSON.stringify(jobResult));
    // Remove the job details to free memory (result is kept separately)
    await redis.del(jobKey(jobId));
  } catch (err) {
    console.warn(`[points-queue] Failed to store result for job ${jobId}:`, err);
  }
}

// ─── Retry / Dead Letter ──────────────────────────────────────────────────────

/**
 * Re-queue a failed job for retry if under MAX_RETRY_ATTEMPTS.
 * Otherwise, move it to the Dead Letter Queue (DLQ).
 */
export async function retryOrDeadLetterJob(job: PointsJob, error: string): Promise<void> {
  const updatedJob: PointsJob = {
    ...job,
    attempts: job.attempts + 1,
  };

  if (updatedJob.attempts < MAX_RETRY_ATTEMPTS) {
    // Re-queue with backoff delay simulation (store updated attempt count)
    try {
      await redis.setex(jobKey(job.jobId), JOB_TTL_SECONDS, JSON.stringify(updatedJob));
      await redis.lpush(QUEUE_KEY, job.jobId);
      console.log(`[points-queue] Retrying job ${job.jobId} (attempt ${updatedJob.attempts}/${MAX_RETRY_ATTEMPTS})`);
    } catch (err) {
      console.error('[points-queue] Failed to re-queue for retry:', err);
    }
  } else {
    // Dead Letter Queue
    try {
      const dlqEntry = {
        ...updatedJob,
        failedAt: new Date().toISOString(),
        lastError: error,
      };
      await redis.lpush(DLQ_KEY, JSON.stringify(dlqEntry));
      await redis.del(jobKey(job.jobId));
      console.error(`[points-queue] Job ${job.jobId} moved to DLQ after ${updatedJob.attempts} attempts. Error: ${error}`);
    } catch (err) {
      console.error('[points-queue] Failed to move job to DLQ:', err);
    }
  }
}

// ─── Status Check ─────────────────────────────────────────────────────────────

/**
 * Check the status of a job by its ID.
 * Used by the frontend to poll for async results.
 */
export async function getJobStatus(jobId: string): Promise<{
  status: JobStatus;
  result?: JobResult;
}> {
  try {
    // Check if result exists (completed/failed)
    const resultRaw = await redis.get<string>(resultKey(jobId));
    if (resultRaw) {
      const result: JobResult = typeof resultRaw === 'string' ? JSON.parse(resultRaw) : resultRaw;
      return { status: result.status === 'completed' ? 'completed' : 'failed', result };
    }

    // Check if still pending in queue
    const jobRaw = await redis.get<string>(jobKey(jobId));
    if (jobRaw) {
      return { status: 'pending' };
    }

    // Not found — either expired or never existed
    return { status: 'failed' };
  } catch (err) {
    console.error(`[points-queue] Failed to get status for job ${jobId}:`, err);
    return { status: 'failed' };
  }
}

// ─── Queue Stats ──────────────────────────────────────────────────────────────

/**
 * Get queue depth and DLQ size for monitoring.
 */
export async function getQueueStats(): Promise<{
  pendingCount: number;
  dlqCount: number;
}> {
  try {
    const [pendingCount, dlqCount] = await Promise.all([
      redis.llen(QUEUE_KEY),
      redis.llen(DLQ_KEY),
    ]);
    return { pendingCount: pendingCount || 0, dlqCount: dlqCount || 0 };
  } catch (err) {
    console.warn('[points-queue] Failed to get queue stats:', err);
    return { pendingCount: 0, dlqCount: 0 };
  }
}

// ─── Worker Helper ────────────────────────────────────────────────────────────

/**
 * Process a single batch of pending jobs.
 * Call this from an API route at `/api/internal/queue-worker`
 * (protected by a secret token) or from a cron job.
 *
 * Returns the number of jobs processed.
 */
export async function processPendingJobs(
  processor: (job: PointsJob) => Promise<{ success: boolean; newBalance?: number; error?: string }>,
  maxBatchSize = 10
): Promise<number> {
  let processed = 0;

  for (let i = 0; i < maxBatchSize; i++) {
    const job = await dequeuePointsJob();
    if (!job) break; // Queue is empty

    try {
      const result = await processor(job);

      if (result.success) {
        await completePointsJob(job.jobId, {
          status: 'completed',
          newBalance: result.newBalance,
        });
      } else {
        await retryOrDeadLetterJob(job, result.error || 'Unknown error');
      }

      processed++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await retryOrDeadLetterJob(job, errMsg);
      processed++;
    }
  }

  if (processed > 0) {
    console.log(`[points-queue] Processed ${processed} job(s) in this batch`);
  }

  return processed;
}
