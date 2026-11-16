import { RequestContext, VendureEvent } from '@vendure/core';

import { Invoice } from '../entities/invoice.entity';

/**
 * Published when an invoice or credit note is issued, and when an admin asks
 * to send one again. `sendEmail` says whether the customer should be emailed.
 */
export class InvoiceIssuedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public invoice: Invoice,
        public sendEmail: boolean,
    ) {
        super();
    }
}
