// Очередь фоновой работы: маршрут ставит задачу (queueJob) и отвечает сразу, а
// выполняет её фоновый процесс (startJobRunner в server/worker.js). Задачи — в
// таблице background_jobs, поэтому перезапуск их не теряет.
const jobs = require("../data/backgroundJobs");
const bridge = require("./workerBridge");

const CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;
const POLL_MS = 5000;

function queueJob(kind, payload) {
  jobs.enqueueJob(kind, payload);
  bridge.wakeWorker();
}

let handlers = null;
let running = 0;

async function run(job) {
  const handler = handlers[job.kind];
  try {
    if (!handler) throw new Error(`неизвестный вид задачи ${job.kind}`);
    await handler(job.payload);
    jobs.finishJob(job.id);
  } catch (err) {
    if (job.attempts >= MAX_ATTEMPTS) {
      console.error(`[jobs] ${job.kind} #${job.id} не выполнена за ${job.attempts} попытки, снята:`, err);
      jobs.finishJob(job.id);
    } else {
      console.warn(`[jobs] ${job.kind} #${job.id}, попытка ${job.attempts}:`, err.message);
      jobs.retryJob(job.id, job.attempts * 60_000);
    }
  }
}

function drain() {
  while (handlers && running < CONCURRENCY) {
    const job = jobs.claimJob();
    if (!job) return;
    running += 1;
    run(job).finally(() => {
      running -= 1;
      drain();
    });
  }
}

function startJobRunner(jobHandlers) {
  handlers = jobHandlers;
  jobs.releaseAllJobs();
  bridge.onJobsQueued(drain);
  setInterval(drain, POLL_MS).unref();
  drain();
  return drain;
}

module.exports = { queueJob, startJobRunner };
