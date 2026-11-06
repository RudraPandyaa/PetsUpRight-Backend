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

export interface ShiprocketCreatedOrder {
    order_id: number;
    shipment_id: number;
    status: string;
    awb_code?: string | null;
    courier_company_id?: number | null;
    courier_name?: string | null;
}

@Injectable()
export class ShiprocketService {
    private token: string | null = null;
    private tokenExpiresAt = 0;
    private tokenRequest: Promise<string> | null = null;
    private isMockMode(): boolean {
        const enabled =
            process.env.SHIPROCKET_MOCK_MODE?.trim().toLowerCase() === 'true';

        if (enabled && process.env.NODE_ENV === 'production') {
            throw new Error('SHIPROCKET_MOCK_MODE cannot be enabled in production');
        }

        return enabled;
    }
    async getCourierOptions(input: {
        deliveryPincode: string;
        weightKg: number;
        cod: boolean;
    }): Promise<ShiprocketCourierOption[]> {
        if (this.isMockMode()) {
            return [{
                courierId: 999999,
                courierName: 'MOCK Courier',
                rate: 177.72,
                estimatedDelivery: 'Mock ETA',
                estimatedDeliveryDays: 3,
            }];
        }

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

    async createAdhocOrder(
        payload: Record<string, unknown>,
    ): Promise<ShiprocketCreatedOrder> {
        if (this.isMockMode()) {
            return {
                order_id: 900000001,
                shipment_id: 800000001,
                status: 'MOCK_NEW',
                awb_code: null,
                courier_company_id: null,
                courier_name: null,
            };
        }
        const token = await this.getToken();

        const response = await this.fetchWithTimeout(
            `${SHIPROCKET_API}/orders/create/adhoc`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            },
        );

        const body = (await response.json()) as
            Partial<ShiprocketCreatedOrder> & { message?: string };

        if (!response.ok || !body.order_id || !body.shipment_id) {
            throw new Error(
                `Shiprocket order creation failed (${response.status}): ${
                    body.message ?? JSON.stringify(body)
                }`,
            );
        }

        return body as ShiprocketCreatedOrder;
    }

    

    async assignAwb(
    shipmentId: number,
    courierId: number,
): Promise<Record<string, unknown>> {
    if (this.isMockMode()) {
        return {
            awb_assign_status: 1,
            response: {
                data: {
                    shipment_id: shipmentId,
                    awb_code: `MOCK-AWB-${shipmentId}-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 8)}`,
                    courier_company_id: courierId,
                    courier_name: 'MOCK Courier',
                },
            },
        };
    }

    return this.postJson('/courier/assign/awb', {
        shipment_id: shipmentId,
        courier_id: courierId,
    });
    }

    async requestPickup(shipmentId: number): Promise<Record<string, unknown>> {
        if (this.isMockMode()) {
            return {
                pickup_status: 1,
                shipment_id: shipmentId,
                status: 'MOCK_PICKUP_SCHEDULED',
            };
        }

        return this.postJson('/courier/generate/pickup', {
            shipment_id: [shipmentId],
        });
    }

    async getTracking(shipmentId: number): Promise<Record<string, unknown>> {
        if (this.isMockMode()) {
            return {
                shipment_id: shipmentId,
                status: 'MOCK_IN_TRANSIT',
                isMock: true,
            };
        }

        const token = await this.getToken();
        const response = await this.fetchWithTimeout(
            `${SHIPROCKET_API}/courier/track/shipment/${shipmentId}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            },
        );

        const body = (await response.json()) as Record<string, unknown>;

        if (!response.ok) {
            throw new Error(
                `Shiprocket tracking failed (${response.status}): ${JSON.stringify(body)}`,
            );
        }

        return body;
    }

    private async postJson(
        path: string,
        payload: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const token = await this.getToken();
        const response = await this.fetchWithTimeout(`${SHIPROCKET_API}${path}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const body = (await response.json()) as Record<string, unknown>;

        if (!response.ok) {
            throw new Error(
                `Shiprocket request failed (${response.status}): ${JSON.stringify(body)}`,
            );
        }

        return body;
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