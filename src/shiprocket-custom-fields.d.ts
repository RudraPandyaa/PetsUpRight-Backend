declare module '@vendure/core/dist/entity/custom-entity-fields' {
    interface CustomFulfillmentFields {
        shiprocketOrderId?: string | null;
        shiprocketShipmentId?: string | null;
        shiprocketAwbCode?: string | null;
        shiprocketCourierName?: string | null;
        shiprocketStatus?: string | null;
    }
}