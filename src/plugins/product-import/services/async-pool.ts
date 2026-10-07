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