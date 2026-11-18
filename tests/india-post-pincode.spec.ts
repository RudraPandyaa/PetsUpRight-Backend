import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { IndiaPostPincodeService } from '../src/plugins/delivery-pincode/services/india-post-pincode.service';

test('rejects pincodes India Post does not recognize', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
        new Response(
            JSON.stringify([
                {
                    Status: 'Error',
                    Message: 'No records found',
                    PostOffice: null,
                },
            ]),
            { status: 200 },
        );

    try {
        const service = new IndiaPostPincodeService();
        assert.equal(await service.isValidIndianPincode('111111'), false);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('accepts a pincode returned by India Post', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
        new Response(
            JSON.stringify([
                {
                    Status: 'Success',
                    PostOffice: [{ Pincode: '110001' }],
                },
            ]),
            { status: 200 },
        );

    try {
        const service = new IndiaPostPincodeService();
        assert.equal(await service.isValidIndianPincode('110001'), true);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
