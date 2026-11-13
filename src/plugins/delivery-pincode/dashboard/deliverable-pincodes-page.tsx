import {
    api,
    Button,
    Input,
    Page,
    PageBlock,
    PageLayout,
    PageTitle,
    toast,
} from '@vendure/dashboard';
import { graphql } from '@/gql';
import { useCallback, useEffect, useMemo, useState } from 'react';

const pincodesQuery = graphql(`
    query DeliverablePincodes {
        deliverablePincodes {
            id
            createdAt
            code
            area
        }
    }
`);

const addPincodesMutation = graphql(`
    mutation AddDeliverablePincodes($pincodes: [String!]!, $area: String) {
        addDeliverablePincodes(pincodes: $pincodes, area: $area) {
            added {
                id
                code
            }
            alreadyExisting
            invalid
        }
    }
`);

const deletePincodeMutation = graphql(`
    mutation DeleteDeliverablePincode($id: ID!) {
        deleteDeliverablePincode(id: $id)
    }
`);

interface DeliverablePincode {
    id: string;
    createdAt: string;
    code: string;
    area?: string | null;
}

export function DeliverablePincodesPage() {
    const [pincodes, setPincodes] = useState<DeliverablePincode[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [newPincodes, setNewPincodes] = useState('');
    const [area, setArea] = useState('');
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);

        try {
            const result = await api.query(pincodesQuery, {});
            setPincodes(result.deliverablePincodes);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Could not load pincodes',
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function add() {
        if (!newPincodes.trim()) {
            return;
        }

        setBusy(true);

        try {
            const response = await api.mutate(addPincodesMutation, {
                pincodes: [newPincodes],
                area: area.trim() || null,
            });
            const result = response.addDeliverablePincodes;

            if (result.added.length) {
                toast.success(
                    `Added ${result.added.length} pincode${result.added.length === 1 ? '' : 's'}`,
                );
            }

            if (result.alreadyExisting.length) {
                toast.info(`Already in the list: ${result.alreadyExisting.join(', ')}`);
            }

            if (result.invalid.length) {
                toast.error(
                    `Not valid 6-digit pincodes: ${result.invalid.join(', ')}`,
                );
            }

            setNewPincodes(result.invalid.join(', '));
            await load();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Could not add pincodes',
            );
        } finally {
            setBusy(false);
        }
    }

    async function remove(pincode: DeliverablePincode) {
        if (
            !window.confirm(
                `Remove ${pincode.code}? Customers there will no longer be able to order.`,
            )
        ) {
            return;
        }

        setBusy(true);

        try {
            await api.mutate(deletePincodeMutation, { id: pincode.id });
            toast.success(`Removed ${pincode.code}`);
            await load();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Could not remove pincode',
            );
        } finally {
            setBusy(false);
        }
    }

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();

        return term
            ? pincodes.filter(
                  pincode =>
                      pincode.code.includes(term) ||
                      (pincode.area ?? '').toLowerCase().includes(term),
              )
            : pincodes;
    }, [pincodes, search]);

    return (
        <Page pageId="deliverable-pincodes">
            <PageTitle>Deliverable pincodes</PageTitle>

            <PageLayout>
                <PageBlock
                    column="main"
                    blockId="add-deliverable-pincodes"
                    title="Add pincodes"
                >
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Customers can only place orders for delivery to
                            these pincodes. Add one or more 6-digit pincodes,
                            separated by commas, spaces or new lines.
                        </p>

                        <textarea
                            value={newPincodes}
                            onChange={event => setNewPincodes(event.target.value)}
                            placeholder="e.g. 380052, 380009"
                            rows={3}
                            aria-label="Pincodes to add"
                            className="w-full rounded-md border px-3 py-2 text-sm"
                        />

                        <Input
                            value={area}
                            onChange={event => setArea(event.target.value)}
                            placeholder="Area (optional), e.g. Ahmedabad"
                            aria-label="Area"
                        />

                        <Button
                            type="button"
                            disabled={busy || !newPincodes.trim()}
                            onClick={add}
                        >
                            Add pincodes
                        </Button>
                    </div>
                </PageBlock>

                <PageBlock
                    column="main"
                    blockId="deliverable-pincodes-list"
                    title={`Deliverable pincodes (${pincodes.length})`}
                >
                    <div className="space-y-3">
                        <Input
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder="Search pincode or area"
                            aria-label="Search pincodes"
                        />

                        {loading && <p className="text-sm">Loading…</p>}

                        {!loading && pincodes.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                No pincodes yet. Until you add some, customers
                                cannot place orders.
                            </p>
                        )}

                        {filtered.length > 0 && (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="py-2">Pincode</th>
                                        <th className="py-2">Area</th>
                                        <th className="py-2">Added</th>
                                        <th className="py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(pincode => (
                                        <tr key={pincode.id} className="border-b">
                                            <td className="py-2 font-mono">{pincode.code}</td>
                                            <td className="py-2">{pincode.area || '—'}</td>
                                            <td className="py-2">
                                                {new Date(pincode.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="py-2 text-right">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    disabled={busy}
                                                    onClick={() => remove(pincode)}
                                                >
                                                    Remove
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}
