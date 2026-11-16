import {
    api,
    Button,
    Input,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    toast,
} from '@vendure/dashboard';
import { graphql } from '@/gql';
import { ReactNode, useCallback, useEffect, useState } from 'react';

const settingsQuery = graphql(`
    query OrderEmailSettingsPage {
        orderEmailSettings {
            adminEmails
            supportEmail
            supportPhone
            customerOrderReceived
            customerOrderConfirmed
            customerShipped
            customerOutForDelivery
            customerDelivered
            customerCancelled
            adminNewOrder
            adminFulfilled
            adminShipped
            adminDelivered
            adminCancelled
        }
        orders(options: { take: 15, sort: { orderPlacedAt: DESC }, filter: { active: { eq: false } } }) {
            items {
                id
                code
                state
                orderPlacedAt
                customer {
                    firstName
                    lastName
                }
            }
        }
    }
`);

const updateMutation = graphql(`
    mutation UpdateOrderEmailSettings($input: UpdateOrderEmailSettingsInput!) {
        updateOrderEmailSettings(input: $input) {
            adminEmails
        }
    }
`);

const previewMutation = graphql(`
    mutation SendOrderEmailPreview(
        $orderId: ID!
        $kind: OrderEmailKind!
        $audience: OrderEmailAudience!
        $recipients: String
    ) {
        sendOrderEmailPreview(orderId: $orderId, kind: $kind, audience: $audience, recipients: $recipients)
    }
`);

type ToggleKey =
    | 'customerOrderReceived'
    | 'customerOrderConfirmed'
    | 'customerShipped'
    | 'customerOutForDelivery'
    | 'customerDelivered'
    | 'customerCancelled'
    | 'adminNewOrder'
    | 'adminFulfilled'
    | 'adminShipped'
    | 'adminDelivered'
    | 'adminCancelled';

type Settings = { adminEmails: string; supportEmail: string; supportPhone: string } & Record<ToggleKey, boolean>;

type Kind = 'ORDER_RECEIVED' | 'ORDER_CONFIRMED' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

const STEPS: Array<{
    kind: Kind;
    title: string;
    when: string;
    customer: ToggleKey;
    customerText: string;
    admin?: ToggleKey;
    adminText?: string;
}> = [
    {
        kind: 'ORDER_RECEIVED',
        title: 'Payment received',
        when: 'The customer pays for the order.',
        customer: 'customerOrderReceived',
        customerText: 'Payment successful, order received',
        admin: 'adminNewOrder',
        adminText: 'New order to prepare + how to fulfill it',
    },
    {
        kind: 'ORDER_CONFIRMED',
        title: 'Order fulfilled',
        when: 'You click "Fulfill order" in the dashboard.',
        customer: 'customerOrderConfirmed',
        customerText: 'Order confirmed, on its way within 24 hours',
        admin: 'adminFulfilled',
        adminText: 'Start packing, courier pickup booked',
    },
    {
        kind: 'SHIPPED',
        title: 'Picked up / shipped',
        when: 'The courier picks up the parcel (Shiprocket update) or you mark it shipped.',
        customer: 'customerShipped',
        customerText: 'Your order is on its way + tracking',
        admin: 'adminShipped',
        adminText: 'Handed over to the courier',
    },
    {
        kind: 'OUT_FOR_DELIVERY',
        title: 'Out for delivery',
        when: 'Shiprocket reports the parcel is out for delivery.',
        customer: 'customerOutForDelivery',
        customerText: 'Arriving today',
    },
    {
        kind: 'DELIVERED',
        title: 'Delivered',
        when: 'Shiprocket reports delivery, or you mark it delivered.',
        customer: 'customerDelivered',
        customerText: 'Your order has been delivered',
        admin: 'adminDelivered',
        adminText: 'Order delivered',
    },
    {
        kind: 'CANCELLED',
        title: 'Cancelled',
        when: 'The order is cancelled.',
        customer: 'customerCancelled',
        customerText: 'Order cancelled + refund information',
        admin: 'adminCancelled',
        adminText: 'Order cancelled, check the refund',
    },
];

const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message.replace(/^\[GraphQL\]\s*/, '') : fallback;

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
    return (
        <label className="block space-y-1">
            <span className="text-sm font-medium">{label}</span>
            {children}
            {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </label>
    );
}

function Check({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
}) {
    return (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
                type="checkbox"
                checked={checked}
                onChange={event => onChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{label}</span>
        </label>
    );
}

const selectClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm';

export function OrderEmailSettingsPage() {
    const [form, setForm] = useState<Settings | null>(null);
    const [saved, setSaved] = useState<Settings | null>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState({
        orderId: '',
        kind: 'ORDER_RECEIVED' as Kind,
        audience: 'CUSTOMER' as 'CUSTOMER' | 'ADMIN',
        recipients: '',
    });
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        try {
            const result: any = await api.query(settingsQuery, {});
            setForm(result.orderEmailSettings);
            setSaved(result.orderEmailSettings);
            setOrders(result.orders.items);
            setPreview(current => ({
                ...current,
                orderId: current.orderId || result.orders.items[0]?.id || '',
            }));
        } catch (error) {
            toast.error(errorMessage(error, 'Could not load email settings'));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    if (!form) {
        return (
            <Page pageId="order-email-settings">
                <PageTitle>Email notifications</PageTitle>
                <PageLayout>
                    <PageBlock column="main" blockId="order-email-loading">
                        <p className="text-sm text-muted-foreground">Loading…</p>
                    </PageBlock>
                </PageLayout>
            </Page>
        );
    }

    const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
        setForm(current => (current ? { ...current, [key]: value } : current));
    const dirty = JSON.stringify(form) !== JSON.stringify(saved);

    async function save() {
        if (!form) return;
        setSaving(true);
        try {
            await api.mutate(updateMutation, { input: form });
            toast.success('Email settings saved');
            await load();
        } catch (error) {
            toast.error(errorMessage(error, 'Could not save email settings'));
        } finally {
            setSaving(false);
        }
    }

    async function sendPreview() {
        if (!preview.orderId) return;
        setSending(true);
        try {
            const result: any = await api.mutate(previewMutation, {
                orderId: preview.orderId,
                kind: preview.kind,
                audience: preview.audience,
                recipients: preview.recipients.trim() || undefined,
            });
            toast.success(`Preview sent to ${result.sendOrderEmailPreview}`);
        } catch (error) {
            toast.error(errorMessage(error, 'Could not send the preview'));
        } finally {
            setSending(false);
        }
    }

    const previewStep = STEPS.find(step => step.kind === preview.kind);

    return (
        <Page pageId="order-email-settings">
            <PageTitle>Email notifications</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Button disabled={!dirty || saving} onClick={save}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="order-email-recipients" title="Who gets the emails">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <Field
                                label="Admin email(s)"
                                hint="New orders, fulfilments, pickups, deliveries and cancellations are sent here. Separate several addresses with commas."
                            >
                                <Input
                                    value={form.adminEmails}
                                    onChange={event => set('adminEmails', event.target.value)}
                                    placeholder="orders.petsupright@gmail.com"
                                />
                            </Field>
                        </div>
                        <Field
                            label="Customer support email"
                            hint="Shown to customers in every order email; customer replies go here."
                        >
                            <Input
                                type="email"
                                value={form.supportEmail}
                                onChange={event => set('supportEmail', event.target.value)}
                            />
                        </Field>
                        <Field label="Customer support phone (optional)">
                            <Input
                                value={form.supportPhone}
                                onChange={event => set('supportPhone', event.target.value)}
                                placeholder="+91 …"
                            />
                        </Field>
                    </div>
                </PageBlock>

                <PageBlock column="main" blockId="order-email-steps" title="Emails at each step">
                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-left">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Step</th>
                                    <th className="px-3 py-2 font-medium">Customer email</th>
                                    <th className="px-3 py-2 font-medium">Admin email</th>
                                </tr>
                            </thead>
                            <tbody>
                                {STEPS.map(step => (
                                    <tr key={step.kind} className="border-t align-top">
                                        <td className="px-3 py-3">
                                            <div className="font-medium">{step.title}</div>
                                            <div className="text-xs text-muted-foreground">{step.when}</div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <Check
                                                checked={form[step.customer]}
                                                onChange={value => set(step.customer, value)}
                                                label={step.customerText}
                                            />
                                        </td>
                                        <td className="px-3 py-3">
                                            {step.admin ? (
                                                <Check
                                                    checked={form[step.admin]}
                                                    onChange={value => set(step.admin as ToggleKey, value)}
                                                    label={step.adminText ?? ''}
                                                />
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                        Invoice emails are set separately in Settings › Invoice settings. Account emails (verify
                        email, password reset) are always sent.
                    </p>
                </PageBlock>

                <PageBlock column="main" blockId="order-email-preview" title="Send a preview">
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Sends one email for a real order to you, so you can check how it looks. It is never sent
                            to the customer.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field label="Order">
                                <select
                                    className={selectClass}
                                    value={preview.orderId}
                                    onChange={event => setPreview(p => ({ ...p, orderId: event.target.value }))}
                                >
                                    {orders.map(order => (
                                        <option key={order.id} value={order.id}>
                                            #{order.code} ·{' '}
                                            {[order.customer?.firstName, order.customer?.lastName]
                                                .filter(Boolean)
                                                .join(' ') || 'Guest'}{' '}
                                            · {order.state}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Email">
                                <select
                                    className={selectClass}
                                    value={preview.kind}
                                    onChange={event => {
                                        const kind = event.target.value as Kind;
                                        const step = STEPS.find(s => s.kind === kind);
                                        setPreview(p => ({
                                            ...p,
                                            kind,
                                            audience: step?.admin ? p.audience : 'CUSTOMER',
                                        }));
                                    }}
                                >
                                    {STEPS.map(step => (
                                        <option key={step.kind} value={step.kind}>
                                            {step.title}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Version">
                                <select
                                    className={selectClass}
                                    value={preview.audience}
                                    onChange={event =>
                                        setPreview(p => ({ ...p, audience: event.target.value as 'CUSTOMER' | 'ADMIN' }))
                                    }
                                >
                                    <option value="CUSTOMER">Customer</option>
                                    {previewStep?.admin && <option value="ADMIN">Admin</option>}
                                </select>
                            </Field>
                        </div>
                        <Field label="Send to" hint="Leave empty to use the admin email(s).">
                            <Input
                                value={preview.recipients}
                                onChange={event => setPreview(p => ({ ...p, recipients: event.target.value }))}
                                placeholder={saved?.adminEmails}
                            />
                        </Field>
                        <Button variant="outline" disabled={sending || !preview.orderId} onClick={sendPreview}>
                            {sending ? 'Sending…' : 'Send preview'}
                        </Button>
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}
