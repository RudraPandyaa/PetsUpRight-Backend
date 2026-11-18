import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';

import { DeliverablePincode } from '../entities/deliverable-pincode.entity';
import { IndiaPostPincodeService } from './india-post-pincode.service';
import { ShiprocketService } from './shiprocket.service';

export type PincodeDeliverability = {
    pincode: string;
    deliverable: boolean;
    message: string;
};

export type AddDeliverablePincodesResult = {
    added: DeliverablePincode[];
    alreadyExisting: string[];
    invalid: string[];
};

/** Removes spaces, e.g. "380 052" -> "380052". */
export function normalizePincode(value: string | null | undefined): string {
    return String(value ?? '').replace(/\s+/g, '').trim();
}

export function isValidPincode(code: string): boolean {
    return /^[1-9][0-9]{5}$/.test(code);
}

@Injectable()
export class DeliverablePincodeService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly shiprocket: ShiprocketService,
        private readonly indiaPost: IndiaPostPincodeService,
    ) {}

    private repository(ctx: RequestContext) {
        return this.connection.getRepository(ctx, DeliverablePincode);
    }

    findAll(ctx: RequestContext): Promise<DeliverablePincode[]> {
        return this.repository(ctx).find({ order: { code: 'ASC' } });
    }

    async isValidIndianPincode(
        pincode: string | null | undefined,
    ): Promise<boolean> {
        const code = normalizePincode(pincode);

        if (!isValidPincode(code)) {
            return false;
        }

        return this.indiaPost.isValidIndianPincode(code);
    }

    async isManualDeliveryPincode(
        ctx: RequestContext,
        pincode: string | null | undefined,
    ): Promise<boolean> {
        const code = normalizePincode(pincode);

        if (!isValidPincode(code)) {
            return false;
        }

        if (!(await this.indiaPost.isValidIndianPincode(code))) {
            return false;
        }

        return (await this.repository(ctx).count({ where: { code } })) > 0;
    }

    async checkDeliverability(
        ctx: RequestContext,
        pincode: string,
    ): Promise<PincodeDeliverability> {
        const code = normalizePincode(pincode);

        if (!isValidPincode(code)) {
            return {
                pincode: code,
                deliverable: false,
                message: 'Please enter a valid Indian 6-digit pincode.',
            };
        }

        if (!(await this.indiaPost.isValidIndianPincode(code))) {
            return {
                pincode: code,
                deliverable: false,
                message: 'Please enter a valid Indian 6-digit pincode.',
            };
        }

        if (await this.isManualDeliveryPincode(ctx, code)) {
            return {
                pincode: code,
                deliverable: true,
                message: `Manual delivery is available to ${code}.`,
            };
        }

        const defaultWeightGrams = Number(
            process.env.SHIPROCKET_DEFAULT_WEIGHT_GRAMS ?? 500,
        );

        if (!Number.isFinite(defaultWeightGrams) || defaultWeightGrams <= 0) {
            throw new Error(
                'SHIPROCKET_DEFAULT_WEIGHT_GRAMS must be a positive number.',
            );
        }

        const couriers = await this.shiprocket.getCourierOptions({
            deliveryPincode: code,
            weightKg: defaultWeightGrams / 1000,
            cod: false,
        });
        const deliverable = couriers.length > 0;

        return {
            pincode: code,
            deliverable,
            message: deliverable
                ? `Shiprocket delivery is available to ${code}; final availability is checked at checkout.`
                : `Shiprocket does not currently serve ${code}.`,
        };
    }

    /**
     * Adds pincodes given as one string or several, separated by commas,
     * spaces or new lines. Existing and invalid pincodes are reported, not
     * added.
     */
    async add(
        ctx: RequestContext,
        input: string[],
        area?: string | null,
    ): Promise<AddDeliverablePincodesResult> {
        const codes = [
            ...new Set(
                input
                    .flatMap(value => String(value).split(/[\s,;]+/))
                    .map(normalizePincode)
                    .filter(Boolean),
            ),
        ];

        const invalid = codes.filter(code => !isValidPincode(code));
        const valid = codes.filter(code => isValidPincode(code));

        const existing = valid.length
            ? await this.repository(ctx).find({ where: { code: In(valid) } })
            : [];
        const existingCodes = new Set(existing.map(pincode => pincode.code));

        const toAdd = valid.filter(code => !existingCodes.has(code));
        const added = toAdd.length
            ? await this.repository(ctx).save(
                  toAdd.map(
                      code =>
                          new DeliverablePincode({
                              code,
                              area: area?.trim() || null,
                          }),
                  ),
              )
            : [];

        return {
            added,
            alreadyExisting: [...existingCodes],
            invalid,
        };
    }

    async delete(ctx: RequestContext, id: ID): Promise<boolean> {
        const result = await this.repository(ctx).delete(id);

        return Boolean(result.affected);
    }
}
