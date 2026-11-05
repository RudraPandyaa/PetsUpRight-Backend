import { Injectable } from '@nestjs/common';

const SHIPROCKET_API =
    'https://apiv2.shiprocket.in/v1/external';

const TOKEN_CACHE_MS = 9 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

interface ShiprocketCourier {
    courier_company_id: number;
    courier_name: string;
    rate: number | string;
    etd?: string;
    estimated_delivery_days?: number;
}

interface ShiprocketServiceabilityResponse {
    status?: number;
    message?: string;
    data?: {
        available_courier_companies?: ShiprocketCourier[];
    };
}

export interface ShiprocketCourierOption {
    courierId: number;
    courierName: string;
    rate: number;
    estimatedDelivery: string | null;
    estimatedDeliveryDays: number | null;
}

@Injectable()
export class ShiprocketService {
    private token: string | null = null;
    private tokenExpiresAt = 0;
    private tokenRequest: Promise<string> | null = null;

    async getCourierOptions(input: {
        deliveryPincode: string;
        weightKg: number;
        cod: boolean;
    }): Promise<ShiprocketCourierOption[]> {
        const pickupPincode = this.requiredEnv(
            'SHIPROCKET_PICKUP_POSTCODE',
        );
        const deliveryPincode = input.deliveryPincode.trim();

        if (!/^[1-9]\d{5}$/.test(deliveryPincode)) {
            throw new Error('Delivery pincode must be a valid 6-digit pincode.');
        }

        if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
            throw new Error('Shipment weight must be greater than 0 kg.');
        }

        const token = await this.getToken();
        const url = new URL(`${SHIPROCKET_API}/courier/serviceability/`);

        url.searchParams.set('pickup_postcode', pickupPincode);
        url.searchParams.set('delivery_postcode', deliveryPincode);
        url.searchParams.set('cod', input.cod ? '1' : '0');
        url.searchParams.set('weight', String(input.weightKg));

        const response = await this.fetchWithTimeout(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        });

        const body =
            (await response.json()) as ShiprocketServiceabilityResponse;

        if (!response.ok) {
            throw new Error(
                `Shiprocket serviceability failed (${response.status}): ${
                    body.message ?? 'Unknown API error'
                }`,
            );
        }

        return (body.data?.available_courier_companies ?? [])
            .map(courier => ({
                courierId: Number(courier.courier_company_id),
                courierName: courier.courier_name,
                rate: Number(courier.rate),
                estimatedDelivery: courier.etd ?? null,
                estimatedDeliveryDays:
                    courier.estimated_delivery_days == null
                        ? null
                        : Number(courier.estimated_delivery_days),
            }))
            .filter(
                courier =>
                    Number.isFinite(courier.rate) && courier.rate >= 0,
            )
            .sort((a, b) => a.rate - b.rate);
    }

    private async getToken(): Promise<string> {
        if (this.token && Date.now() < this.tokenExpiresAt) {
            return this.token;
        }

        if (this.tokenRequest) {
            return this.tokenRequest;
        }

        this.tokenRequest = this.authenticate();

        try {
            return await this.tokenRequest;
        } finally {
            this.tokenRequest = null;
        }
    }

    private async authenticate(): Promise<string> {
        const email = this.requiredEnv('SHIPROCKET_EMAIL');
        const password = this.requiredEnv('SHIPROCKET_PASSWORD');

        const response = await this.fetchWithTimeout(
            `${SHIPROCKET_API}/auth/login`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            },
        );

        const body = (await response.json()) as {
            token?: string;
            message?: string;
        };

        if (!response.ok || !body.token) {
            throw new Error(
                `Shiprocket login failed (${response.status}): ${
                    body.message ?? 'Token was not returned'
                }`,
            );
        }

        this.token = body.token;
        this.tokenExpiresAt = Date.now() + TOKEN_CACHE_MS;

        return body.token;
    }

    private requiredEnv(name: string): string {
        const value = process.env[name]?.trim();

        if (!value) {
            throw new Error(`Missing required environment variable: ${name}`);
        }

        return value;
    }

    private async fetchWithTimeout(
        input: string | URL,
        init: RequestInit,
    ): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            REQUEST_TIMEOUT_MS,
        );

        try {
            return await fetch(input, {
                ...init,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeout);
        }
    }
}