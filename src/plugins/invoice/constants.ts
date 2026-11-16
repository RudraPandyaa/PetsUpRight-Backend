export const loggerCtx = 'InvoicePlugin';

/** Secret used to sign customer invoice download links. */
export const invoiceLinkSecret = () =>
    process.env.INVOICE_LINK_SECRET?.trim() || process.env.COOKIE_SECRET?.trim() || 'petsupright-invoice';
