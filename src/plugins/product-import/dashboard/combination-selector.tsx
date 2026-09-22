import { api, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, useChannel, toast, useQueryClient } from '@vendure/dashboard';
import { graphql } from '@/gql';
import { useMemo, useState } from 'react';

const createVariants = graphql(`
    mutation ImportSelectedVariants($input: [CreateProductVariantInput!]!) {
        createProductVariants(input: $input) { id }
    }
`);
type Group = { id: string; name: string; options: { id: string; name: string }[] };
type Choice = { ids: string[]; names: string[] };
type Detail = { sku: string; price: string; stock: string };

export function CombinationSelector({ productId, productName, groups }: {
    productId: string; productName: string; groups: Group[];
}) {
    const { activeChannel } = useChannel();
    const queryClient = useQueryClient();
    const choices = useMemo(() => groups.reduce<Choice[]>(
        (items, group) => items.flatMap(item => group.options.map(option => ({
            ids: [...item.ids, option.id], names: [...item.names, option.name],
        }))), [{ ids: [], names: [] }]), [groups]);
    const [selected, setSelected] = useState<string[]>([]);
    const [step, setStep] = useState<'select' | 'details'>('select');
    const [popupOpen, setPopupOpen] = useState(false);
    const [details, setDetails] = useState<Record<string, Detail>>({});
    const [busy, setBusy] = useState(false);
    const key = (choice: Choice) => choice.ids.join('|') || 'default';
    const chosen = choices.filter(c => selected.includes(key(c)));
    const toggle = (id: string) => setSelected(current => current.includes(id)
        ? current.filter(x => x !== id) : [...current, id]);
    const setField = (id: string, field: keyof Detail, value: string) => setDetails(current => ({
        ...current, [id]: { sku: '', price: '', stock: '', ...current[id], [field]: value },
    }));
    async function submit() {
        if (!activeChannel?.defaultLanguageCode || busy) return;
        const rows = chosen.map(c => ({ choice: c, ...details[key(c)] }));
        const skus = rows.map(r => r.sku?.trim());
        if (rows.some(r => !r.sku?.trim() || r.price === '' || r.price === undefined ||
            !Number.isFinite(Number(r.price)) || Number(r.price) < 0 ||
            !Number.isSafeInteger(Number(r.stock)) || r.stock === '' || Number(r.stock) < 0) ||
            new Set(skus).size !== skus.length) {
            toast.error('Enter a unique SKU, valid price and stock for each selected variant');
            return;
        }
        setBusy(true);
        try {
            await api.mutate(createVariants, { input: rows.map(r => ({
                productId, optionIds: r.choice.ids, sku: r.sku.trim(),
                price: Math.round(Number(r.price) * 100), stockOnHand: Number(r.stock),
                translations: [{ languageCode: activeChannel.defaultLanguageCode,
                    name: [productName, ...r.choice.names].join(' ') }],
            })) });
            await queryClient.invalidateQueries();
            toast.success(`Created ${rows.length} variants`);
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not create variants'); }
        finally { setBusy(false); }
    }
    if (!groups.length || groups.some(g => !g.options.length)) return <p>Add option groups with values first.</p>;
    return <div className="space-y-4">
        <Button type="button" variant="outline" onClick={() => setPopupOpen(true)}>
            {step === 'select' ? 'Select combinations' : `Change selection (${selected.length})`}
        </Button>
        <Dialog open={popupOpen} onOpenChange={setPopupOpen}><DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Select variant combinations</DialogTitle></DialogHeader>
            <p>Choose the combinations you sell. Only these will need SKU, price and stock.</p>
            <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setSelected(choices.map(key))}>Select all</Button>
                <Button type="button" variant="outline" onClick={() => setSelected([])}>Clear</Button></div>
            <div className="max-h-96 overflow-y-auto space-y-2">{choices.map(c => <label key={key(c)} className="flex gap-3 items-center border rounded p-2">
                <input type="checkbox" checked={selected.includes(key(c))} onChange={() => toggle(key(c))} />{c.names.join(' / ')}
            </label>)}</div>
            <Button type="button" disabled={!selected.length} onClick={() => { setStep('details'); setPopupOpen(false); }}>
                Continue with {selected.length} variants
            </Button>
        </DialogContent></Dialog>
        {step === 'details' && <>
            <p>Enter details for the {chosen.length} selected variants.</p>
            {chosen.map(c => <div key={key(c)} className="grid grid-cols-4 gap-2 items-center">
                <span>{c.names.join(' / ')}</span>
                {(['sku','price','stock'] as const).map(f => <Input key={f} value={details[key(c)]?.[f] ?? ''}
                    type={f === 'sku' ? 'text' : 'number'} min={f === 'sku' ? undefined : '0'}
                    step={f === 'price' ? '0.01' : f === 'stock' ? '1' : undefined}
                    placeholder={f} onChange={e => setField(key(c), f, e.target.value)} />)}
            </div>)}
            <Button type="button" disabled={busy} onClick={submit}>Create {chosen.length} variants</Button>
        </>}
    </div>;
}
