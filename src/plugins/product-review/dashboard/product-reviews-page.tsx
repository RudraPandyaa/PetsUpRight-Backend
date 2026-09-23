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
import { useCallback, useEffect, useState } from 'react';

const adminReviewsQuery = graphql(`
    query AdminProductReviews(
        $options: AdminProductReviewListOptions
    ) {
        adminProductReviews(options: $options) {
            totalItems
            items {
                id
                createdAt
                updatedAt
                productId
                rating
                title
                body
                customerName
                verifiedPurchase
                status
                isFeatured
                displayOrder
                product {
                    id
                    name
                    slug
                }
            }
        }
    }
`);

const updateReviewMutation = graphql(`
    mutation UpdateProductReview(
        $input: UpdateProductReviewInput!
    ) {
        updateProductReview(input: $input) {
            id
            status
            isFeatured
            displayOrder
        }
    }
`);

const deleteReviewMutation = graphql(`
    mutation DeleteProductReview($id: ID!) {
        deleteProductReview(id: $id)
    }
`);

type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ProductReview {
    id: string;
    createdAt: string;
    updatedAt: string;
    productId: string;
    rating: number;
    title: string;
    body: string;
    customerName: string;
    verifiedPurchase: boolean;
    status: ReviewStatus;
    isFeatured: boolean;
    displayOrder: number;
    product: {
        id: string;
        name: string;
        slug: string;
    };
}

type StatusFilter = 'ALL' | ReviewStatus;

function StatusBadge({ status }: { status: ReviewStatus }) {
    const styles: Record<ReviewStatus, string> = {
        PENDING:
            'border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
        APPROVED:
            'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
        REJECTED:
            'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
    };

    return (
        <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${styles[status]}`}
        >
            {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
    );
}

function StarRating({ rating }: { rating: number }) {
    return (
        <div
            className="flex items-center gap-1"
            aria-label={`${rating} out of 5 stars`}
        >
            <span className="text-base text-yellow-500">
                {'★'.repeat(rating)}
            </span>

            <span className="text-base text-muted-foreground/40">
                {'★'.repeat(5 - rating)}
            </span>

            <span className="ml-1 text-sm text-muted-foreground">
                {rating}/5
            </span>
        </div>
    );
}

export function ProductReviewsPage() {
    const [reviews, setReviews] = useState<ProductReview[]>([]);
    const [statusFilter, setStatusFilter] =
        useState<StatusFilter>('ALL');
    const [loading, setLoading] = useState(true);
    const [busyReviewId, setBusyReviewId] =
        useState<string | null>(null);

    const loadReviews = useCallback(async () => {
        setLoading(true);

        try {
            const options: Record<string, unknown> = {
                take: 100,
                skip: 0,
            };

            if (statusFilter !== 'ALL') {
                options.status = statusFilter;
            }

            const response = await api.query(
                adminReviewsQuery,
                {
                    options,
                } as any,
            );

            setReviews(
                response.adminProductReviews.items as ProductReview[],
            );
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Could not load product reviews',
            );
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        void loadReviews();
    }, [loadReviews]);

    async function updateReview(
        reviewId: string,
        input: {
            status?: ReviewStatus;
            isFeatured?: boolean;
            displayOrder?: number;
        },
    ) {
        setBusyReviewId(reviewId);

        try {
            await api.mutate(
                updateReviewMutation,
                {
                    input: {
                        id: reviewId,
                        ...input,
                    },
                } as any,
            );

            toast.success('Review updated');
            await loadReviews();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Could not update review',
            );
        } finally {
            setBusyReviewId(null);
        }
    }

    async function deleteReview(reviewId: string) {
        const confirmed = window.confirm(
            'Are you sure you want to permanently delete this review?',
        );

        if (!confirmed) {
            return;
        }

        setBusyReviewId(reviewId);

        try {
            await api.mutate(deleteReviewMutation, {
                id: reviewId,
            });

            toast.success('Review deleted');
            await loadReviews();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Could not delete review',
            );
        } finally {
            setBusyReviewId(null);
        }
    }

    return (
        <Page pageId="product-reviews">
            <PageTitle>Product Reviews</PageTitle>

            <PageLayout>
                <PageBlock
                    column="main"
                    blockId="product-review-list"
                    title="Customer reviews"
                >
                    <div className="space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    Approve customer reviews and choose which
                                    reviews can be shown as featured reviews.
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <label
                                    htmlFor="review-status-filter"
                                    className="text-sm font-medium"
                                >
                                    Status
                                </label>

                                <select
                                    id="review-status-filter"
                                    value={statusFilter}
                                    onChange={event =>
                                        setStatusFilter(
                                            event.target
                                                .value as StatusFilter,
                                        )
                                    }
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    <option value="ALL">
                                        All reviews
                                    </option>

                                    <option value="PENDING">
                                        Pending
                                    </option>

                                    <option value="APPROVED">
                                        Approved
                                    </option>

                                    <option value="REJECTED">
                                        Rejected
                                    </option>
                                </select>

                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void loadReviews()}
                                    disabled={loading}
                                >
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
                                Loading reviews...
                            </div>
                        ) : reviews.length === 0 ? (
                            <div className="rounded-md border p-8 text-center">
                                <p className="font-medium">
                                    No reviews found
                                </p>

                                <p className="mt-1 text-sm text-muted-foreground">
                                    Reviews submitted by customers will
                                    appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-md border">
                                <table className="w-full text-left text-sm">
                                    <thead className="border-b bg-muted/40">
                                        <tr>
                                            <th className="min-w-48 px-4 py-3 font-medium">
                                                Product
                                            </th>

                                            <th className="min-w-40 px-4 py-3 font-medium">
                                                Customer
                                            </th>

                                            <th className="min-w-72 px-4 py-3 font-medium">
                                                Review
                                            </th>

                                            <th className="min-w-32 px-4 py-3 font-medium">
                                                Status
                                            </th>

                                            <th className="min-w-40 px-4 py-3 font-medium">
                                                Featured
                                            </th>

                                            <th className="min-w-32 px-4 py-3 font-medium">
                                                Order
                                            </th>

                                            <th className="min-w-64 px-4 py-3 font-medium">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {reviews.map(review => {
                                            const busy =
                                                busyReviewId === review.id;

                                            return (
                                                <tr
                                                    key={review.id}
                                                    className="border-b align-top last:border-b-0"
                                                >
                                                    <td className="px-4 py-4">
                                                        <p className="font-medium">
                                                            {
                                                                review
                                                                    .product
                                                                    .name
                                                            }
                                                        </p>

                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            {
                                                                review
                                                                    .product
                                                                    .slug
                                                            }
                                                        </p>
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <p className="font-medium">
                                                            {
                                                                review.customerName
                                                            }
                                                        </p>

                                                        {review.verifiedPurchase ? (
                                                            <span className="mt-2 inline-flex rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600 dark:text-green-400">
                                                                Verified
                                                                Purchase
                                                            </span>
                                                        ) : (
                                                            <span className="mt-2 inline-flex rounded-full border px-2 py-1 text-xs text-muted-foreground">
                                                                Not verified
                                                            </span>
                                                        )}

                                                        <p className="mt-2 text-xs text-muted-foreground">
                                                            {new Date(
                                                                review.createdAt,
                                                            ).toLocaleDateString()}
                                                        </p>
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <StarRating
                                                            rating={
                                                                review.rating
                                                            }
                                                        />

                                                        <p className="mt-2 font-semibold">
                                                            {review.title}
                                                        </p>

                                                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                                                            {review.body}
                                                        </p>
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <StatusBadge
                                                            status={
                                                                review.status
                                                            }
                                                        />
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <label className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    review.isFeatured
                                                                }
                                                                disabled={
                                                                    busy ||
                                                                    review.status !==
                                                                        'APPROVED'
                                                                }
                                                                onChange={event =>
                                                                    void updateReview(
                                                                        review.id,
                                                                        {
                                                                            isFeatured:
                                                                                event
                                                                                    .target
                                                                                    .checked,
                                                                        },
                                                                    )
                                                                }
                                                                className="h-4 w-4 rounded border-input"
                                                            />

                                                            <span className="text-sm">
                                                                {review.isFeatured
                                                                    ? 'Featured'
                                                                    : 'Not featured'}
                                                            </span>
                                                        </label>

                                                        {review.status !==
                                                            'APPROVED' && (
                                                            <p className="mt-2 text-xs text-muted-foreground">
                                                                Approve the
                                                                review first.
                                                            </p>
                                                        )}
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            defaultValue={
                                                                review.displayOrder
                                                            }
                                                            disabled={busy}
                                                            className="w-24"
                                                            onBlur={event => {
                                                                const value =
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value,
                                                                    );

                                                                if (
                                                                    Number.isInteger(
                                                                        value,
                                                                    ) &&
                                                                    value >=
                                                                        0 &&
                                                                    value !==
                                                                        review.displayOrder
                                                                ) {
                                                                    void updateReview(
                                                                        review.id,
                                                                        {
                                                                            displayOrder:
                                                                                value,
                                                                        },
                                                                    );
                                                                }
                                                            }}
                                                        />
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <div className="flex flex-wrap gap-2">
                                                            {review.status !==
                                                                'APPROVED' && (
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    disabled={
                                                                        busy
                                                                    }
                                                                    onClick={() =>
                                                                        void updateReview(
                                                                            review.id,
                                                                            {
                                                                                status: 'APPROVED',
                                                                            },
                                                                        )
                                                                    }
                                                                >
                                                                    Approve
                                                                </Button>
                                                            )}

                                                            {review.status !==
                                                                'REJECTED' && (
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="outline"
                                                                    disabled={
                                                                        busy
                                                                    }
                                                                    onClick={() =>
                                                                        void updateReview(
                                                                            review.id,
                                                                            {
                                                                                status: 'REJECTED',
                                                                            },
                                                                        )
                                                                    }
                                                                >
                                                                    Reject
                                                                </Button>
                                                            )}

                                                            {review.status !==
                                                                'PENDING' && (
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="outline"
                                                                    disabled={
                                                                        busy
                                                                    }
                                                                    onClick={() =>
                                                                        void updateReview(
                                                                            review.id,
                                                                            {
                                                                                status: 'PENDING',
                                                                            },
                                                                        )
                                                                    }
                                                                >
                                                                    Pending
                                                                </Button>
                                                            )}

                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="destructive"
                                                                disabled={busy}
                                                                onClick={() =>
                                                                    void deleteReview(
                                                                        review.id,
                                                                    )
                                                                }
                                                            >
                                                                Delete
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}