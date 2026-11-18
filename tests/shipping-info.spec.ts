import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getFreeDeliveryThreshold } from '../src/plugins/shipping-info/shipping-info.plugin';

function freeDeliveryMethod(orderMinimum: unknown) {
    return {
        code: 'free-delivery',
        checker: {
            args: [{ name: 'orderMinimum', value: orderMinimum }],
        },
    };
}

test('reads the current free-delivery minimum from the shipping method', () => {
    assert.equal(
        getFreeDeliveryThreshold([freeDeliveryMethod('125000')]),
        125000,
    );
});

test('returns null when the channel has no free-delivery method', () => {
    assert.equal(
        getFreeDeliveryThreshold([
            {
                code: 'standard-delivery',
                checker: {
                    args: [{ name: 'orderMinimum', value: '0' }],
                },
            },
        ]),
        null,
    );
});

test('reports invalid free-delivery minimum configuration', () => {
    for (const minimum of ['invalid', null]) {
        assert.throws(
            () => getFreeDeliveryThreshold([freeDeliveryMethod(minimum)]),
            /invalid minimum order value/,
        );
    }
});
