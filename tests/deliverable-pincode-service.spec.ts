import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type {
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { DeliverablePincodeService } from '../src/plugins/delivery-pincode/services/deliverable-pincode.service';
import type { IndiaPostPincodeService } from '../src/plugins/delivery-pincode/services/india-post-pincode.service';
import type { ShiprocketService } from '../src/plugins/delivery-pincode/services/shiprocket.service';

function createService(
    manualPincodes: string[],
    validIndianPincodes: string[],
    getCourierOptions: (input: {
        deliveryPincode: string;
        weightKg: number;
        cod: boolean;
    }) => Promise<unknown[]>,
) {
    let shiprocketCalls = 0;
    let lastShiprocketInput: {
        deliveryPincode: string;
        weightKg: number;
        cod: boolean;
    } | undefined;

    const repository = {
        count: async ({ where }: { where: { code: string } }) =>
            manualPincodes.includes(where.code) ? 1 : 0,
    };
    const connection = {
        getRepository: () => repository,
    } as unknown as TransactionalConnection;
    const shiprocket = {
        getCourierOptions: async (input: {
            deliveryPincode: string;
            weightKg: number;
            cod: boolean;
        }) => {
            shiprocketCalls++;
            lastShiprocketInput = input;
            return getCourierOptions(input);
        },
    } as unknown as ShiprocketService;
    const indiaPost = {
        isValidIndianPincode: async (code: string) =>
            validIndianPincodes.includes(code),
    } as unknown as IndiaPostPincodeService;

    return {
        service: new DeliverablePincodeService(
            connection,
            shiprocket,
            indiaPost,
        ),
        get shiprocketCalls() {
            return shiprocketCalls;
        },
        get lastShiprocketInput() {
            return lastShiprocketInput;
        },
    };
}

const ctx = {} as RequestContext;

test('manual delivery pincodes bypass Shiprocket', async () => {
    const harness = createService(['380052'], ['380052'], async () => []);

    const result = await harness.service.checkDeliverability(ctx, '380052');

    assert.equal(result.deliverable, true);
    assert.equal(result.message, 'Manual delivery is available to 380052.');
    assert.equal(harness.shiprocketCalls, 0);
});

test('other valid pincodes use Shiprocket serviceability', async () => {
    const harness = createService(
        [],
        ['110001'],
        async () => [{ courierId: 1 }],
    );

    const result = await harness.service.checkDeliverability(ctx, '110001');

    assert.equal(result.deliverable, true);
    assert.equal(
        result.message,
        'Shiprocket delivery is available to 110001; final availability is checked at checkout.',
    );
    assert.equal(harness.shiprocketCalls, 1);
    assert.deepEqual(harness.lastShiprocketInput, {
        deliveryPincode: '110001',
        weightKg:
            Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_GRAMS ?? 500) / 1000,
        cod: false,
    });
});

test('returns unavailable when Shiprocket has no courier for a valid pincode', async () => {
    const harness = createService([], ['110001'], async () => []);

    const result = await harness.service.checkDeliverability(ctx, '110001');

    assert.equal(result.deliverable, false);
    assert.equal(result.message, 'Shiprocket does not currently serve 110001.');
});

test('rejects invalid pincodes without querying Shiprocket', async () => {
    const harness = createService([], [], async () => [{ courierId: 1 }]);

    const result = await harness.service.checkDeliverability(ctx, '012345');

    assert.equal(result.deliverable, false);
    assert.equal(harness.shiprocketCalls, 0);
});

test('rejects unregistered Indian pincodes even when Shiprocket is mocked', async () => {
    const harness = createService([], [], async () => [{ courierId: 1 }]);

    const result = await harness.service.checkDeliverability(ctx, '111111');

    assert.equal(result.deliverable, false);
    assert.equal(
        result.message,
        'Please enter a valid Indian 6-digit pincode.',
    );
    assert.equal(harness.shiprocketCalls, 0);
});
