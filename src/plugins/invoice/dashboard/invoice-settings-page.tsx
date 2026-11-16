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
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { errorMessage } from './invoice-common';

const settingsQuery = graphql(`
    query InvoiceSettingsPage {
        invoiceSettings {
            enabled
            issueOn
            emailCustomer
            creditNoteOnCancel
            invoicePrefix
            invoiceSuffix
            invoiceNextNumber
            creditNotePrefix
            creditNoteSuffix
            creditNoteNextNumber
            numberPadding
            resetEachFinancialYear
            sellerLegalName
            sellerTradeName
            sellerAddress
            sellerState
            sellerGstin
            sellerPan
            sellerEmail
            sellerPhone
            logoUrl
            shippingSac
            notes
            footerText
            signatoryLabel
            stateOptions
            preview {
                financialYear
                nextInvoiceNumber
                nextCreditNoteNumber
                invoiceNumberError
                creditNoteNumberError
            }
        }
    }
`);

const previewQuery = graphql(`
    query PreviewInvoiceNumbers($input: UpdateInvoiceSettingsInput!) {
        previewInvoiceNumbers(input: $input) {
            financialYear
            nextInvoiceNumber
            nextCreditNoteNumber
            invoiceNumberError
            creditNoteNumberError
        }
    }
`);

const sampleQuery = graphql(`
    query SampleInvoicePdf($input: UpdateInvoiceSettingsInput, $interState: Boolean) {
        sampleInvoicePdf(input: $input, interState: $interState)
    }
`);

/** Live PDF preview of an invoice with the current (unsaved) settings. */
function SampleInvoice({ input }: { input: Record<string, unknown> }) {
    const [interState, setInterState] = useState(false);
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const seq = useRef(0);
    const urlRef = useRef<string | null>(null);
    const key = JSON.stringify(input);

    useEffect(() => {
        const current = ++seq.current;
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const result: any = await api.query(sampleQuery, { input: JSON.parse(key), interState });
                if (current !== seq.current) return;
                const bytes = Uint8Array.from(atob(result.sampleInvoicePdf), c => c.charCodeAt(0));
                const next = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
                if (urlRef.current) URL.revokeObjectURL(urlRef.current);
                urlRef.current = next;
                setUrl(next);
                setError('');
            } catch (err) {
                if (current === seq.current) setError(errorMessage(err, 'Could not build the sample invoice'));
            } finally {
                if (current === seq.current) setLoading(false);
            }
        }, 900);
        return () => clearTimeout(timer);
    }, [key, interState]);

    useEffect(
        () => () => {
            if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        },
        [],
    );

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={interState}
                        onChange={event => setInterState(event.target.checked)}
                        className="h-4 w-4"
                    />
                    Customer in another state (IGST)
                </label>
                <span className="text-xs text-muted-foreground">
                    {loading ? 'Updating…' : 'Updates as you edit. Sample items; nothing is issued.'}
                </span>
                {url && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener"
                        className="ml-auto text-sm font-medium text-primary hover:underline"
                    >
                        Open full size
                    </a>
                )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="overflow-hidden rounded-md border bg-muted/30">
                {url ? (
                    <iframe title="Sample invoice" src={`${url}#view=FitH&toolbar=0`} className="h-[900px] w-full" />
                ) : (
                    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                        {error ? 'No preview' : 'Building sample invoice…'}
                    </div>
                )}
            </div>
        </div>
    );
}

const updateMutation = graphql(`
    mutation UpdateInvoiceSettings($input: UpdateInvoiceSettingsInput!) {
        updateInvoiceSettings(input: $input) {
            id
        }
    }
`);

interface Settings {
    enabled: boolean;
    issueOn: 'PAYMENT_SETTLED' | 'SHIPPED' | 'DELIVERED' | 'MANUAL';
    emailCustomer: boolean;
    creditNoteOnCancel: boolean;
    invoicePrefix: string;
    invoiceSuffix: string;
    invoiceNextNumber: number;
    creditNotePrefix: string;
    creditNoteSuffix: string;
    creditNoteNextNumber: number;
    numberPadding: number;
    resetEachFinancialYear: boolean;
    sellerLegalName: string;
    sellerTradeName: string;
    sellerAddress: string;
    sellerState: string;
    sellerGstin: string;
    sellerPan: string;
    sellerEmail: string;
    sellerPhone: string;
    logoUrl: string;
    shippingSac: string;
    notes: string;
    footerText: string;
    signatoryLabel: string;
}

interface Preview {
    financialYear: string;
    nextInvoiceNumber: string;
    nextCreditNoteNumber: string;
    invoiceNumberError?: string | null;
    creditNoteNumberError?: string | null;
}

const ISSUE_OPTIONS: Array<{ value: Settings['issueOn']; label: string; hint: string }> = [
    {
        value: 'PAYMENT_SETTLED',
        label: 'When payment is received (recommended)',
        hint: 'The customer gets the invoice right after paying.',
    },
    { value: 'SHIPPED', label: 'When the order ships', hint: 'Issued when the order is marked shipped.' },
    { value: 'DELIVERED', label: 'When the order is delivered', hint: 'Issued when the order is marked delivered.' },
    { value: 'MANUAL', label: 'Only manually', hint: 'Issue each invoice from the order page.' },
];

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
    return (
        <label className="block space-y-1">
            <span className="text-sm font-medium">{label}</span>
            {children}
            {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </label>
    );
}

function Toggle({
    checked,
    onChange,
    label,
    hint,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    hint?: string;
}) {
    return (
        <label className="flex cursor-pointer items-start gap-3">
            <input
                type="checkbox"
                checked={checked}
                onChange={event => onChange(event.target.checked)}
                className="mt-0.5 h-4 w-4"
            />
            <span>
                <span className="block text-sm font-medium">{label}</span>
                {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
            </span>
        </label>
    );
}

const textareaClass = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
const selectClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm';

export function InvoiceSettingsPage() {
    const [form, setForm] = useState<Settings | null>(null);
    const [saved, setSaved] = useState<Settings | null>(null);
    const [states, setStates] = useState<string[]>([]);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [saving, setSaving] = useState(false);
    const previewSeq = useRef(0);

    const load = useCallback(async () => {
        try {
            const result: any = await api.query(settingsQuery, {});
            const { stateOptions, preview: initialPreview, ...settings } = result.invoiceSettings;
            setForm(settings);
            setSaved(settings);
            setStates(stateOptions);
            setPreview(initialPreview);
        } catch (error) {
            toast.error(errorMessage(error, 'Could not load invoice settings'));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const numbering = useMemo(
        () =>
            form && {
                invoicePrefix: form.invoicePrefix,
                invoiceSuffix: form.invoiceSuffix,
                invoiceNextNumber: Number(form.invoiceNextNumber) || 1,
                creditNotePrefix: form.creditNotePrefix,
                creditNoteSuffix: form.creditNoteSuffix,
                creditNoteNextNumber: Number(form.creditNoteNextNumber) || 1,
                numberPadding: Number(form.numberPadding) || 1,
                resetEachFinancialYear: form.resetEachFinancialYear,
            },
        [form],
    );

    // Live preview of the next numbers while typing.
    useEffect(() => {
        if (!numbering) return;
        const seq = ++previewSeq.current;
        const timer = setTimeout(async () => {
            try {
                const result: any = await api.query(previewQuery, { input: numbering });
                if (seq === previewSeq.current) setPreview(result.previewInvoiceNumbers);
            } catch {
                /* the save will report problems */
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [numbering]);

    if (!form) {
        return (
            <Page pageId="invoice-settings">
                <PageTitle>Invoice settings</PageTitle>
                <PageLayout>
                    <PageBlock column="main" blockId="invoice-settings-loading">
                        <p className="text-sm text-muted-foreground">Loading…</p>
                    </PageBlock>
                </PageLayout>
            </Page>
        );
    }

    const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
        setForm(current => (current ? { ...current, [key]: value } : current));
    const text = (key: keyof Settings) => ({
        value: String(form[key] ?? ''),
        onChange: (event: { target: { value: string } }) => set(key, event.target.value as any),
    });

    const dirty = JSON.stringify(form) !== JSON.stringify(saved);
    const sampleInput: Record<string, unknown> = {
        ...form,
        invoiceNextNumber: Number(form.invoiceNextNumber) || 1,
        creditNoteNextNumber: Number(form.creditNoteNextNumber) || 1,
        numberPadding: Number(form.numberPadding) || 1,
    };
    const numberError = preview?.invoiceNumberError || preview?.creditNoteNumberError;

    async function save() {
        if (!form) return;
        setSaving(true);
        try {
            const input: Record<string, unknown> = { ...form };
            for (const key of ['invoiceNextNumber', 'creditNoteNextNumber', 'numberPadding']) {
                input[key] = Number(input[key]);
            }
            // Only send counters when changed, so saving other fields never moves them.
            if (saved && Number(saved.invoiceNextNumber) === input.invoiceNextNumber) delete input.invoiceNextNumber;
            if (saved && Number(saved.creditNoteNextNumber) === input.creditNoteNextNumber) delete input.creditNoteNextNumber;
            await api.mutate(updateMutation, { input });
            toast.success('Invoice settings saved');
            await load();
        } catch (error) {
            toast.error(errorMessage(error, 'Could not save invoice settings'));
        } finally {
            setSaving(false);
        }
    }

    const missing = [
        !form.sellerGstin && 'GSTIN',
        !form.sellerAddress.trim() && 'business address',
        !form.sellerLegalName.trim() && 'legal name',
    ].filter(Boolean);

    return (
        <Page pageId="invoice-settings">
            <PageTitle>Invoice settings</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Button disabled={!dirty || saving || Boolean(numberError)} onClick={save}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                {missing.length > 0 && (
                    <PageBlock column="main" blockId="invoice-settings-warning">
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                            Fill in your {missing.join(', ')} below. A GST tax invoice must show the seller's
                            legal name, address and GSTIN. Automatic invoices are paused until the GSTIN and
                            address are saved.
                        </div>
                    </PageBlock>
                )}

                <PageBlock column="main" blockId="invoice-automation" title="When invoices are issued">
                    <div className="space-y-4">
                        <Toggle
                            checked={form.enabled}
                            onChange={value => set('enabled', value)}
                            label="Issue invoices automatically"
                            hint="Turn off to stop all automatic invoices and credit notes. You can still issue them from an order page."
                        />
                        <Field label="Issue the invoice" hint={ISSUE_OPTIONS.find(o => o.value === form.issueOn)?.hint}>
                            <select
                                className={selectClass}
                                value={form.issueOn}
                                disabled={!form.enabled}
                                onChange={event => set('issueOn', event.target.value as Settings['issueOn'])}
                            >
                                {ISSUE_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Toggle
                            checked={form.emailCustomer}
                            onChange={value => set('emailCustomer', value)}
                            label="Email the PDF to the customer"
                            hint="Invoices and credit notes are emailed as a PDF attachment when issued."
                        />
                        <Toggle
                            checked={form.creditNoteOnCancel}
                            onChange={value => set('creditNoteOnCancel', value)}
                            label="Issue a credit note when an invoiced order is cancelled"
                            hint="GST requires a credit note to reverse an invoice; invoices are never deleted."
                        />
                    </div>
                </PageBlock>

                <PageBlock column="main" blockId="invoice-numbering" title="Numbering">
                    <div className="space-y-4">
                        <div className="rounded-md bg-muted/50 p-3 text-sm">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                    <div className="text-xs text-muted-foreground">Next invoice number</div>
                                    <div className="font-mono text-base font-semibold">{preview?.nextInvoiceNumber ?? '…'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Next credit note number</div>
                                    <div className="font-mono text-base font-semibold">{preview?.nextCreditNoteNumber ?? '…'}</div>
                                </div>
                            </div>
                            {numberError ? (
                                <p className="mt-2 text-sm font-medium text-destructive">{numberError}</p>
                            ) : (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Financial year {preview?.financialYear}. GST allows up to 16 characters: letters,
                                    digits, "-" and "/".
                                </p>
                            )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field label="Invoice prefix">
                                <Input {...text('invoicePrefix')} placeholder="INV/{FY}/" />
                            </Field>
                            <Field label="Invoice suffix">
                                <Input {...text('invoiceSuffix')} placeholder="(optional)" />
                            </Field>
                            <Field label="Next invoice number">
                                <Input
                                    type="number"
                                    min={1}
                                    value={String(form.invoiceNextNumber)}
                                    onChange={event => set('invoiceNextNumber', event.target.value as any)}
                                />
                            </Field>
                            <Field label="Credit note prefix">
                                <Input {...text('creditNotePrefix')} placeholder="CN/{FY}/" />
                            </Field>
                            <Field label="Credit note suffix">
                                <Input {...text('creditNoteSuffix')} placeholder="(optional)" />
                            </Field>
                            <Field label="Next credit note number">
                                <Input
                                    type="number"
                                    min={1}
                                    value={String(form.creditNoteNextNumber)}
                                    onChange={event => set('creditNoteNextNumber', event.target.value as any)}
                                />
                            </Field>
                            <Field label="Digits" hint="4 → 0001">
                                <Input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={String(form.numberPadding)}
                                    onChange={event => set('numberPadding', event.target.value as any)}
                                />
                            </Field>
                        </div>
                        <Toggle
                            checked={form.resetEachFinancialYear}
                            onChange={value => set('resetEachFinancialYear', value)}
                            label="Restart numbering at 1 every financial year (1 April)"
                            hint="Keep {FY} in the prefix when this is on, so numbers stay unique."
                        />
                        <p className="text-xs text-muted-foreground">
                            Placeholders for prefix and suffix: <code>{'{FY}'}</code> 26-27,{' '}
                            <code>{'{FY_FULL}'}</code> 2026-27, <code>{'{YYYY}'}</code> 2026, <code>{'{YY}'}</code> 26,{' '}
                            <code>{'{MM}'}</code> 04. Changing the next number never re-numbers issued invoices; a
                            number that is already used is rejected.
                        </p>
                    </div>
                </PageBlock>

                <PageBlock column="main" blockId="invoice-seller" title="Your business (printed on every invoice)">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Legal name" hint="As on your GST registration.">
                            <Input {...text('sellerLegalName')} />
                        </Field>
                        <Field label="Trade name" hint="Shown as “Trading as …” when different.">
                            <Input {...text('sellerTradeName')} />
                        </Field>
                        <Field label="GSTIN">
                            <Input
                                value={form.sellerGstin}
                                onChange={event => set('sellerGstin', event.target.value.toUpperCase())}
                                placeholder="24ABCDE1234F1Z5"
                                maxLength={15}
                            />
                        </Field>
                        <Field label="PAN (optional)">
                            <Input
                                value={form.sellerPan}
                                onChange={event => set('sellerPan', event.target.value.toUpperCase())}
                                placeholder="ABCDE1234F"
                                maxLength={10}
                            />
                        </Field>
                        <div className="sm:col-span-2">
                            <Field label="Address" hint="One line per row, including city and pincode.">
                                <textarea rows={3} className={textareaClass} {...text('sellerAddress')} />
                            </Field>
                        </div>
                        <Field label="State" hint="Same state as the customer → CGST + SGST; other states → IGST.">
                            <select className={selectClass} {...text('sellerState')}>
                                {!states.includes(form.sellerState) && <option value={form.sellerState}>{form.sellerState}</option>}
                                {states.map(state => (
                                    <option key={state} value={state}>
                                        {state}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Phone">
                            <Input {...text('sellerPhone')} />
                        </Field>
                        <Field label="Email">
                            <Input type="email" {...text('sellerEmail')} />
                        </Field>
                    </div>
                </PageBlock>

                <PageBlock column="main" blockId="invoice-document" title="Document">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <Field label="Logo URL" hint="PNG or JPEG. Leave empty for no logo.">
                                <div className="flex items-center gap-3">
                                    <Input {...text('logoUrl')} placeholder="https://…/logo.png" />
                                    {form.logoUrl && (
                                        <img src={form.logoUrl} alt="Logo preview" className="h-10 max-w-32 rounded border object-contain" />
                                    )}
                                </div>
                            </Field>
                        </div>
                        <Field label="Shipping SAC code" hint="996812 = courier services.">
                            <Input {...text('shippingSac')} />
                        </Field>
                        <Field label="Signature label">
                            <Input {...text('signatoryLabel')} />
                        </Field>
                        <div className="sm:col-span-2">
                            <Field label="Notes / terms" hint="Printed at the bottom, e.g. return policy or jurisdiction.">
                                <textarea rows={3} className={textareaClass} {...text('notes')} />
                            </Field>
                        </div>
                        <div className="sm:col-span-2">
                            <Field label="Footer line">
                                <Input {...text('footerText')} />
                            </Field>
                        </div>
                    </div>
                </PageBlock>

                <PageBlock column="main" blockId="invoice-sample" title="Sample invoice">
                    <SampleInvoice input={sampleInput} />
                </PageBlock>
            </PageLayout>
        </Page>
    );
}
