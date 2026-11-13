import {
  Order,
  OrderStateTransitionEvent,
  TransactionalConnection,
} from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';

const adminEmail = () =>
  process.env.ORDERS_ADMIN_EMAIL?.trim() ?? '';

function createCancellationEmailHandler(
  templateType: 'customer-order-cancelled' | 'admin-order-cancelled',
  recipientType: 'customer' | 'admin',
) {
  return new EmailEventListener(templateType)
    .on(OrderStateTransitionEvent)
    .filter(
      event =>
        event.toState === 'Cancelled' &&
        (recipientType === 'customer' || Boolean(adminEmail())),
    )
    .loadData(async ({ event, injector }) => {
      const connection = injector.get(TransactionalConnection);
      const order = await connection.getEntityOrThrow(
        event.ctx,
        Order,
        event.order.id,
        { relations: ['customer'] },
      );

      const email = order.customer?.emailAddress;
      const recipient = recipientType === 'admin' ? adminEmail() : email;

      if (!recipient) {
        throw new Error(`Email recipient missing for order ${order.code}.`);
      }
      const fields = order.customFields as unknown as {
        originalTotalBeforeCancellation?: number | null;
      };

      const originalTotal =
        fields.originalTotalBeforeCancellation ?? order.totalWithTax;
      return {
        recipient,
        order: {
          code: order.code,
          total: (originalTotal / 100).toFixed(2),
        },
        customer: {
          name:
            [order.customer?.firstName, order.customer?.lastName]
              .filter(Boolean)
              .join(' ') || 'Customer',
          email: email ?? '',
        },
      };
    })
    .setRecipient(event => event.data.recipient)
    .setFrom('{{ fromAddress }}')
    .setSubject(
      recipientType === 'admin'
        ? 'Order #{{order.code}} was cancelled'
        : 'Your order #{{order.code}} was cancelled',
    )
    .setTemplateVars(event => ({
      order: event.data.order,
      customer: event.data.customer,
    }));
}

export const orderCancellationEmailHandlers = [
  createCancellationEmailHandler('customer-order-cancelled', 'customer'),
  createCancellationEmailHandler('admin-order-cancelled', 'admin'),
];