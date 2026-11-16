import { EmailEventListener } from '@vendure/email-plugin';

import { OrderEmailEvent } from './events';

/**
 * One template per audience. The content for each order step (received,
 * confirmed, shipped, out for delivery, delivered, cancelled) is prepared by
 * OrderEmailService and passed in as template variables.
 */
const customerOrderEmailHandler = new EmailEventListener('customer-order-update')
    .on(OrderEmailEvent)
    .filter(event => event.audience === 'customer')
    .setRecipient(event => event.recipients)
    .setFrom('{{ fromAddress }}')
    .setSubject(event => event.subject)
    .setOptionalAddressFields(event => (event.replyTo ? { replyTo: event.replyTo } : {}))
    .setTemplateVars(event => event.templateVars);

const adminOrderEmailHandler = new EmailEventListener('admin-order-update')
    .on(OrderEmailEvent)
    .filter(event => event.audience === 'admin')
    .setRecipient(event => event.recipients)
    .setFrom('{{ fromAddress }}')
    .setSubject(event => event.subject)
    .setTemplateVars(event => event.templateVars);

export const orderEmailHandlers = [customerOrderEmailHandler, adminOrderEmailHandler];
