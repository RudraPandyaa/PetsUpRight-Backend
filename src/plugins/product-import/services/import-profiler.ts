import { Logger } from '@vendure/core';
import { performance } from 'node:perf_hooks';

export class ImportProfiler {
    private readonly startedAt = performance.now();
    private previousMark = this.startedAt;

    constructor(
        private readonly operation: string,
    ) {
        Logger.info(
            `${operation} started`,
            'OPN Import',
        );
    }

    mark(
        stage: string,
        details?: Record<string, unknown>,
    ): void {
        const now = performance.now();

        Logger.info(
            JSON.stringify({
                operation: this.operation,
                stage,
                stageSeconds: Number(
                    (
                        (now - this.previousMark) /
                        1000
                    ).toFixed(3),
                ),
                totalSeconds: Number(
                    (
                        (now - this.startedAt) /
                        1000
                    ).toFixed(3),
                ),
                ...details,
            }),
            'OPN Import',
        );

        this.previousMark = now;
    }

    finish(
        details?: Record<string, unknown>,
    ): void {
        const now = performance.now();

        Logger.info(
            JSON.stringify({
                operation: this.operation,
                stage: 'finished',
                totalSeconds: Number(
                    (
                        (now - this.startedAt) /
                        1000
                    ).toFixed(3),
                ),
                ...details,
            }),
            'OPN Import',
        );
    }
}