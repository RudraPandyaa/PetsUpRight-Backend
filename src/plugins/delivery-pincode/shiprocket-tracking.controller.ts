import * as crypto from 'crypto';
import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Headers,
    HttpCode,
    NotFoundException,
    Post,
    UnauthorizedException,
} from '@nestjs/common';
import {
    Ctx,
    Fulfillment,
    FulfillmentService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

interface ShiprocketTrackingPayload {
    awb?: string;
    current_status?: string;
    shipment_status?: string;
    courier_name?: string;
}

@Controller('shipping-events')
export class ShiprocketTrackingController {
    constructor(
        private connection: TransactionalConnection,
        private fulfillmentService: FulfillmentService,
    ) {}

    @Post('tracking')
    @HttpCode(200)
    async receiveTrackingUpdate(
        @Ctx() ctx: RequestContext,
        @Headers('x-api-key') apiKey: string | undefined,
        @Body() payload: ShiprocketTrackingPayload,
    ) {
        const expectedKey = process.env.SHIPROCKET_WEBHOOK_SECRET ?? '';
        const expected = Buffer.from(expectedKey, 'utf8');
        const received = Buffer.from(apiKey ?? '', 'utf8');

        if (
            !expected.length ||
            expected.length !== received.length ||
            !crypto.timingSafeEqual(expected, received)
        ) {
            throw new UnauthorizedException();
        }

        const awb = payload?.awb?.trim();
        const status = (
            payload?.current_status ??
            payload?.shipment_status ??
            ''
        ).trim();

        if (!awb || !status) {
            throw new BadRequestException(
                'Webhook must include awb and status.',
            );
        }

        const repo = this.connection.getRepository(ctx, Fulfillment);
        const matches = await repo
            .createQueryBuilder('fulfillment')
            .where(
                'fulfillment.customFields.shiprocketAwbCode = :awb',
                { awb },
            )
            .getMany();
            
            if (!matches.length) {
                console.warn(
                    `[Shiprocket webhook] No fulfillment found for AWB ${awb}; acknowledging event.`,
                );

                return {
                    received: true,
                    matched: false,
                    awb,
                    status,
                };
            }

        if (matches.length > 1) {
            throw new ConflictException(
                `AWB ${awb} matches multiple fulfillments; each shipment needs a unique AWB.`,
            );
        }

        let fulfillment = matches[0];

        // Vendure custom-field types are configured dynamically at runtime.
        const customFields = fulfillment.customFields as
            Fulfillment['customFields'] & {
                shiprocketStatus?: string | null;
                shiprocketCourierName?: string | null;
            };

        customFields.shiprocketStatus = status;

        if (payload.courier_name) {
            customFields.shiprocketCourierName = payload.courier_name;
        }

        await repo.save(fulfillment);

        const normalizedStatus = status.toUpperCase();

        if (
            ['IN TRANSIT', 'SHIPPED', 'OUT FOR DELIVERY', 'PICKED UP'].includes(
                normalizedStatus,
            ) &&
            fulfillment.state === 'Pending'
        ) {
            fulfillment = await this.transition(
                ctx,
                fulfillment.id,
                'Shipped',
            );
        }

        if (normalizedStatus === 'DELIVERED') {
            if (fulfillment.state === 'Pending') {
                fulfillment = await this.transition(
                    ctx,
                    fulfillment.id,
                    'Shipped',
                );
            }

            if (fulfillment.state === 'Shipped') {
                fulfillment = await this.transition(
                    ctx,
                    fulfillment.id,
                    'Delivered',
                );
            }
        }

        return {
            received: true,
            awb,
            status,
            fulfillmentState: fulfillment.state,
        };
    }

    private async transition(
        ctx: RequestContext,
        fulfillmentId: Fulfillment['id'],
        state: 'Shipped' | 'Delivered',
    ): Promise<Fulfillment> {
        const result = await this.fulfillmentService.transitionToState(
            ctx,
            fulfillmentId,
            state,
        );

        if (!('fulfillment' in result)) {
            throw new BadRequestException(
                `Vendure could not transition fulfillment to ${state}.`,
            );
        }

        return result.fulfillment;
    }
}