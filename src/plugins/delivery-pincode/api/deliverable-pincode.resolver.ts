import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ID,
    Permission,
    RequestContext,
    Transaction,
} from '@vendure/core';

import { DeliverablePincodeService } from '../services/deliverable-pincode.service';

@Resolver()
export class DeliverablePincodeShopResolver {
    constructor(
        private readonly pincodes: DeliverablePincodeService,
    ) {}

    @Query()
    checkPincodeDeliverability(
        @Ctx() ctx: RequestContext,
        @Args('pincode') pincode: string,
    ) {
        return this.pincodes.checkDeliverability(ctx, pincode);
    }
}

@Resolver()
export class DeliverablePincodeAdminResolver {
    constructor(
        private readonly pincodes: DeliverablePincodeService,
    ) {}

    @Query()
    @Allow(Permission.ReadSettings)
    deliverablePincodes(@Ctx() ctx: RequestContext) {
        return this.pincodes.findAll(ctx);
    }

    @Query()
    @Allow(Permission.ReadSettings)
    checkPincodeDeliverability(
        @Ctx() ctx: RequestContext,
        @Args('pincode') pincode: string,
    ) {
        return this.pincodes.checkDeliverability(ctx, pincode);
    }

    @Mutation()
    @Allow(Permission.UpdateSettings)
    @Transaction()
    addDeliverablePincodes(
        @Ctx() ctx: RequestContext,
        @Args('pincodes') pincodes: string[],
        @Args('area', { nullable: true }) area?: string,
    ) {
        return this.pincodes.add(ctx, pincodes, area);
    }

    @Mutation()
    @Allow(Permission.UpdateSettings)
    @Transaction()
    deleteDeliverablePincode(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
    ) {
        return this.pincodes.delete(ctx, id);
    }
}
