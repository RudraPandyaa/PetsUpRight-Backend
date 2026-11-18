import { Injectable } from '@nestjs/common';

const INDIA_POST_API = 'https://api.postalpincode.in/pincode';
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 10_000;

interface IndiaPostLookup {
    Status?: string;
    PostOffice?: Array<{
        Pincode?: string | number;
    }> | null;
}

@Injectable()
export class IndiaPostPincodeService {
    private readonly cache = new Map<
        string,
        { valid: boolean; expiresAt: number }
    >();
    private readonly inFlight = new Map<string, Promise<boolean>>();

    async isValidIndianPincode(code: string): Promise<boolean> {
        const cached = this.cache.get(code);

        if (cached && cached.expiresAt > Date.now()) {
            return cached.valid;
        }

        this.cache.delete(code);

        const existingRequest = this.inFlight.get(code);

        if (existingRequest) {
            return existingRequest;
        }

        const request = this.lookup(code);
        this.inFlight.set(code, request);

        try {
            const valid = await request;
            this.cacheResult(code, valid);
            return valid;
        } finally {
            this.inFlight.delete(code);
        }
    }

    private async lookup(code: string): Promise<boolean> {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            REQUEST_TIMEOUT_MS,
        );

        try {
            const response = await fetch(
                `${INDIA_POST_API}/${encodeURIComponent(code)}`,
                {
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                },
            );

            if (!response.ok) {
                throw new Error(
                    `India Post pincode lookup failed (${response.status}).`,
                );
            }

            const payload: unknown = await response.json();

            if (!Array.isArray(payload) || payload.length === 0) {
                throw new Error(
                    'India Post returned an invalid pincode response.',
                );
            }

            const result = payload[0] as IndiaPostLookup;

            if (result.Status === 'Error') {
                return false;
            }

            if (
                result.Status !== 'Success' ||
                !Array.isArray(result.PostOffice)
            ) {
                throw new Error(
                    'India Post returned an invalid pincode response.',
                );
            }

            return result.PostOffice.some(
                postOffice => String(postOffice.Pincode ?? '') === code,
            );
        } finally {
            clearTimeout(timeout);
        }
    }

    private cacheResult(code: string, valid: boolean): void {
        if (this.cache.size >= MAX_CACHE_ENTRIES) {
            const oldestCode = this.cache.keys().next().value;

            if (oldestCode !== undefined) {
                this.cache.delete(oldestCode);
            }
        }

        this.cache.set(code, {
            valid,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });
    }
}
