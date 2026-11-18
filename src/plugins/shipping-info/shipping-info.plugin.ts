import { Query, Resolver } from '@nestjs/graphql';
import {
    Ctx,
    PluginCommonModule,
    RequestContext,
    ShippingMethod,
    ShippingMethodService,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';

const shopApiExtensions = gql`
    extend type Query {
        freeDeliveryThreshold: Int
    }
`;

type ShippingMethodConfiguration = Pick<ShippingMethod, 'code' | 'checker'>;

export function getFreeDeliveryThreshold(
    shippingMethods: readonly ShippingMethodConfiguration[],
): number | null {
    const freeDeliveryMethod = shippingMethods.find(
        method => method.code === 'free-delivery',
    );

    if (!freeDeliveryMethod) {
        return null;
    }

    const configuredMinimum = freeDeliveryMethod.checker.args.find(
        argument => argument.name === 'orderMinimum',
    )?.value;
    const threshold = Number(configuredMinimum);

    if (
        configuredMinimum === undefined ||
        configuredMinimum === null ||
        !Number.isSafeInteger(threshold) ||
        threshold < 0
    ) {
        throw new Error(
            'The free-delivery shipping method has an invalid minimum order value.',
        );
    }

    return threshold;
}

@Resolver()
class ShippingInfoShopResolver {
    constructor(
        private readonly shippingMethodService: ShippingMethodService,
    ) {}

    @Query()
    async freeDeliveryThreshold(
        @Ctx() ctx: RequestContext,
    ): Promise<number | null> {
        const shippingMethods =
            await this.shippingMethodService.getActiveShippingMethods(ctx);

        return getFreeDeliveryThreshold(shippingMethods);
    }
}

@VendurePlugin({
    imports: [PluginCommonModule],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [ShippingInfoShopResolver],
    },
    compatibility: '^3.0.0',
})
export class ShippingInfoPlugin {}
