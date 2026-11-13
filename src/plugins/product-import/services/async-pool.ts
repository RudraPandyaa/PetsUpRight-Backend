export async function forEachWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    if (!items.length) {
        return;
    }

    let nextIndex = 0;

    async function run(): Promise<void> {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;

            await worker(items[index]);
        }
    }

    const workerCount = Math.min(
        Math.max(1, concurrency),
        items.length,
    );

    await Promise.all(
        Array.from(
            { length: workerCount },
            () => run(),
        ),
    );
}

/**
 * Runs queued tasks with at most `concurrency` running at once. `add`
 * returns immediately, so the caller does not wait for the task; `drain`
 * waits until every queued task has finished. Task errors are swallowed,
 * so tasks should report their own failures.
 */
export function createTaskQueue(concurrency: number): {
    add: (task: () => Promise<void>) => void;
    drain: () => Promise<void>;
} {
    const limit = Math.max(1, concurrency);
    const waiting: Array<() => Promise<void>> = [];
    const running = new Set<Promise<void>>();

    const startNext = () => {
        while (running.size < limit && waiting.length) {
            const task = waiting.shift() as () => Promise<void>;

            const promise = task()
                .catch(() => undefined)
                .finally(() => {
                    running.delete(promise);
                    startNext();
                });

            running.add(promise);
        }
    };

    return {
        add(task) {
            waiting.push(task);
            startNext();
        },
        async drain() {
            while (running.size || waiting.length) {
                await Promise.race(running);
            }
        },
    };
}

/**
 * Calls `fn` again after a short pause when it throws an error for which
 * `shouldRetry` returns true, e.g. Google rate limits (HTTP 429) or
 * temporary server errors.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean,
    delaysMs = [1_000, 3_000],
): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (
                attempt >= delaysMs.length ||
                !shouldRetry(error)
            ) {
                throw error;
            }

            await new Promise(resolve =>
                setTimeout(resolve, delaysMs[attempt]),
            );
        }
    }
}

/** Error for an HTTP response that is worth retrying (429 or 5xx). */
export class RetryableHttpError extends Error {}

export const isRetryable = (error: unknown): boolean =>
    error instanceof RetryableHttpError ||
    (error instanceof Error &&
        /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|aborted due to timeout/i.test(
            error.message,
        ));
