import {
    api,
    Button,
    defineDashboardExtension,
    Input,
    Label,
    Page,
    PageBlock,
    PageLayout,
    PageTitle,
    Switch,
    toast,
    useMutation,
    useQuery,
    useQueryClient,
    AssetPickerDialog,
} from '@vendure/dashboard';

import { useEffect, useState, type DragEvent } from 'react';

import {
    cmsPageQuery,
    cmsPagesQuery,
    createCmsPageMutation,
    createCmsSectionMutation,
    deleteCmsPageMutation,
    deleteCmsSectionMutation,
    updateCmsPageMutation,
    updateCmsSectionMutation,
} from './graphql/cms-pages';
import {
    Link, useNavigate, useParams,
} from '@tanstack/react-router';


defineDashboardExtension({
    routes: [
        {
            path: '/cms/pages',

            loader: () => ({
                breadcrumb: 'Pages',
            }),

            navMenuItem: {
                id: 'cms-pages',
                title: 'Pages',
                sectionId: 'catalog',
            },

            component: () => {
                const queryClient = useQueryClient();
                const navigate = useNavigate();
                const [createFormOpen, setCreateFormOpen] = useState(false);
                const [newPageTitle, setNewPageTitle] = useState('');
                const [newPageSlug, setNewPageSlug] = useState('');
                const [newPagePublished, setNewPagePublished] = useState(false);

                const { data, isLoading, error } = useQuery({
                    queryKey: ['cms-pages'],
                    queryFn: () => api.query(cmsPagesQuery),
                });

                const createPage = useMutation({
                    mutationFn: async () => {
                        const title = newPageTitle.trim();
                        const slug = newPageSlug.trim().toLowerCase();

                        if (!title || !slug) {
                            throw new Error('Title and slug are required');
                        }

                        return api.mutate(createCmsPageMutation, {
                            input: {
                                title,
                                slug,
                                isPublished: newPagePublished,
                            },
                        });
                    },
                    onSuccess: async () => {
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-pages'],
                        });
                        setCreateFormOpen(false);
                        setNewPageTitle('');
                        setNewPageSlug('');
                        setNewPagePublished(false);
                        toast.success('CMS page created');
                    },
                    onError: (mutationError: Error) => {
                        toast.error('Failed to create CMS page', {
                            description: mutationError.message,
                        });
                    },
                });

                const deletePage = useMutation({
                    mutationFn: (pageId: string) =>
                        api.mutate(deleteCmsPageMutation, {
                            id: pageId,
                        }),
                    onSuccess: async () => {
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-pages'],
                        });
                        toast.success('CMS page deleted');
                    },
                    onError: (mutationError: Error) => {
                        toast.error('Failed to delete CMS page', {
                            description: mutationError.message,
                        });
                    },
                });

                if (isLoading) {
                    return <p>Loading pages...</p>;
                }

                if (error) {
                    return <p>Failed to load CMS pages.</p>;
                }

                const pages = data?.cmsPages.items ?? [];

                return (
                    <Page pageId="cms-pages">
                        <PageTitle>CMS Pages</PageTitle>

                        <PageLayout>
                            <PageBlock
                                column="main"
                                blockId="cms-pages-content"
                            >
                                <div className="flex justify-between items-center mb-4">
                                    <h2>Pages</h2>

                                    <Button onClick={() => setCreateFormOpen(value => !value)}>
                                        {createFormOpen ? 'Cancel' : 'Create Page'}
                                    </Button>
                                </div>

                                {createFormOpen && (
                                    <form
                                        className="mb-6 border rounded-md p-4 space-y-4"
                                        onSubmit={event => {
                                            event.preventDefault();
                                            createPage.mutate();
                                        }}
                                    >
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div>
                                                <Label htmlFor="cms-page-title">Title</Label>
                                                <Input
                                                    id="cms-page-title"
                                                    value={newPageTitle}
                                                    placeholder="About Us"
                                                    onChange={event => setNewPageTitle(event.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="cms-page-slug">Slug</Label>
                                                <Input
                                                    id="cms-page-slug"
                                                    value={newPageSlug}
                                                    placeholder="about-us"
                                                    onChange={event => setNewPageSlug(event.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <label className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={newPagePublished}
                                                onChange={event => setNewPagePublished(event.target.checked)}
                                            />
                                            Publish immediately
                                        </label>

                                        <Button type="submit" disabled={createPage.isPending}>
                                            {createPage.isPending ? 'Creating...' : 'Create'}
                                        </Button>
                                    </form>
                                )}

                                {pages.length === 0 ? (
                                    <p>No CMS pages found.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {pages.map(page => (
                                            <Link
                                                key={page.id}
                                                to="/cms/pages/$id"
                                                params={{
                                                    id: page.id,
                                                }}
                                                className="block border rounded-md p-4 hover:bg-muted"
                                            >
                                                <div className="font-medium">
                                                    {page.title}
                                                </div>

                                                <div className="text-sm text-muted-foreground">
                                                    /{page.slug}
                                                </div>

                                                <div className="flex items-center justify-between text-sm mt-1">
                                                    <span>
                                                        {page.isPublished ? 'Published' : 'Draft'}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        onClick={event => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            if (window.confirm(`Delete ${page.title}?`)) {
                                                                deletePage.mutate(page.id);
                                                                navigate({ to: '/cms/pages' });
                                                            }
                                                        }}
                                                    >
                                                        Delete
                                                    </Button>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </PageBlock>
                        </PageLayout>
                    </Page>
                );
            },
        },
        {
            path: '/cms/pages/$id',

            loader: () => ({
                breadcrumb: 'Edit Page',
            }),

            component: () => {
                const { id } = useParams({
                    strict: false,
                }) as { id: string };

                const queryClient = useQueryClient();

                const [assetPickerOpen, setAssetPickerOpen] =
                    useState(false);
                const [assetPickerMode, setAssetPickerMode] =
                    useState<'hero' | 'happy-tails' | 'contact-hero' | 'contact-logo' | 'component-image'>('hero');
                const [componentImageId, setComponentImageId] = useState<string | null>(null);
                const [componentFormOpen, setComponentFormOpen] = useState(false);
                const [componentType, setComponentType] = useState('text');

                const { data, isLoading, error } = useQuery({
                    queryKey: ['cms-page', id],
                    queryFn: () =>
                        api.query(cmsPageQuery, {
                            id,
                        }),
                });

                // Do NOT return before useMutation()

                const page = data?.cmsPage;
                const isContactPage = ['contact', 'contact-us', 'contactus'].includes(
                    page?.slug?.toLowerCase() ?? '',
                );

                const heroSection = page?.sections.find(
                    section => section.type === 'hero',
                );

                const happyTailsSection = page?.sections.find(
                    section => section.type === 'happy-tails',
                );

                const reviewsSection = page?.sections.find(
                    section => section.type === 'pawsitive-reviews',
                );

                const contactSection = page?.sections.find(
                    section => section.type === 'contact',
                );

                const [contactEmail, setContactEmail] = useState('');
                const [contactPhone, setContactPhone] = useState('');

                useEffect(() => {
                    setContactEmail(contactSection?.data?.email ?? '');
                    setContactPhone(contactSection?.data?.phone ?? '');
                }, [contactSection?.data?.email, contactSection?.data?.phone]);

                const [reviewDrafts, setReviewDrafts] = useState<any[]>([]);
                const [draggedItem, setDraggedItem] = useState<{
                    type: 'hero' | 'video' | 'review';
                    index: number;
                } | null>(null);
                const [draggedComponentIndex, setDraggedComponentIndex] = useState<number | null>(null);
                const [genericDrafts, setGenericDrafts] = useState<Record<string, any>>({});

                useEffect(() => {
                    setReviewDrafts(reviewsSection?.data?.reviews ?? []);
                    const drafts: Record<string, any> = {};
                    page?.sections
                        .filter(section => ['image', 'text', 'products'].includes(section.type))
                        .forEach(section => {
                            drafts[section.id] = section.data ?? {};
                        });
                    setGenericDrafts(drafts);
                }, [reviewsSection?.data?.reviews, page?.sections]);

                const saveHero = useMutation({
                    mutationFn: async (assets: any[]) => {
                        if (!page) {
                            throw new Error('CMS page not loaded');
                        }

                        if (assets.length < 3 || assets.length > 5) {
                            throw new Error('Select between 3 and 5 hero images');
                        }

                        const heroData = {
                            images: assets.map(asset => ({
                                source: asset.source,
                                preview: asset.preview,
                                assetId: asset.id,
                            })),
                            publishedImages: heroSection?.data?.publishedImages,
                        };

                        if (heroSection) {
                            return api.mutate(
                                updateCmsSectionMutation,
                                {
                                    input: {
                                        id: heroSection.id,
                                        data: heroData,
                                    },
                                },
                            );
                        }

                        return api.mutate(
                            createCmsSectionMutation,
                            {
                                input: {
                                    pageId: page.id,
                                    type: 'hero',
                                    position: 1,
                                    data: heroData,
                                },
                            },
                        );
                    },

                    onSuccess: async () => {
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-page', id],
                        });

                        toast.success('Hero banner updated');
                    },

                    onError: (error: Error) => {
                        toast.error(
                            'Failed to update hero banner',
                            {
                                description: error.message,
                            },
                        );
                    },
                });

                const addComponent = useMutation({
                    mutationFn: async () => {
                        if (!page) {
                            throw new Error('CMS page not loaded');
                        }

                        const componentData: Record<string, any> = {
                            hero: { images: [], publishedImages: [] },
                            image: { image: '', preview: '', publishedImage: '' },
                            text: { text: '', publishedText: '' },
                            'happy-tails': { videos: [], publishedVideos: [] },
                            'pawsitive-reviews': { reviews: [], publishedReviews: [] },
                            products: { products: [], publishedProducts: [] },
                            contact: {
                                heroImage: '',
                                logoImage: '',
                                email: '',
                                phone: '',
                                publishedHeroImage: '',
                                publishedLogoImage: '',
                            },
                        };

                        return api.mutate(createCmsSectionMutation, {
                            input: {
                                pageId: page.id,
                                type: componentType,
                                position: (page.sections?.length ?? 0) + 1,
                                data: componentData[componentType] ?? {},
                            },
                        });
                    },
                    onSuccess: async () => {
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-page', id],
                        });
                        setComponentFormOpen(false);
                        toast.success('Component added');
                    },
                    onError: (mutationError: Error) => {
                        toast.error('Failed to add component', {
                            description: mutationError.message,
                        });
                    },
                });

                const deleteComponent = useMutation({
                    mutationFn: (sectionId: string) =>
                        api.mutate(deleteCmsSectionMutation, {
                            id: sectionId,
                        }),
                    onSuccess: async () => {
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-page', id],
                        });
                        toast.success('Component deleted');
                    },
                    onError: (mutationError: Error) => {
                        toast.error('Failed to delete component', {
                            description: mutationError.message,
                        });
                    },
                });

                const reorderHero = useMutation({
                    mutationFn: async (images: any[]) => {
                        if (!heroSection) {
                            throw new Error('Hero section not found');
                        }

                        return api.mutate(updateCmsSectionMutation, {
                            input: {
                                id: heroSection.id,
                                data: {
                                    ...heroSection.data,
                                    images,
                                },
                            },
                        });
                    },
                    onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: ['cms-page', id] });
                    },
                    onError: (error: Error) => {
                        toast.error('Failed to reorder hero images', {
                            description: error.message,
                        });
                    },
                });

                const saveHappyTails = useMutation({
                    mutationFn: async (assets: any[]) => {
                        if (!page || assets.length < 6 || assets.length > 10) {
                            throw new Error('Select between 6 and 10 video assets');
                        }

                        if (assets.some(asset => asset.mimeType && !asset.mimeType.startsWith('video/'))) {
                            throw new Error('Only video assets can be added to Happy Tails');
                        }

                        const videos = assets.map((asset, index) => ({
                            title: asset.name || `Happy tail ${index + 1}`,
                            video: asset.source,
                            thumb: asset.preview || asset.source,
                            assetId: asset.id,
                        }));

                        const data = {
                            videos,
                            publishedVideos: happyTailsSection?.data?.publishedVideos,
                        };

                        if (happyTailsSection) {
                            return api.mutate(updateCmsSectionMutation, {
                                input: { id: happyTailsSection.id, data },
                            });
                        }

                        return api.mutate(createCmsSectionMutation, {
                            input: {
                                pageId: page.id,
                                type: 'happy-tails',
                                position: 5,
                                data,
                            },
                        });
                    },
                    onSuccess: async () => {
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-page', id],
                        });
                        toast.success('Happy Tails videos updated');
                    },
                    onError: (error: Error) => {
                        toast.error('Failed to update Happy Tails videos', {
                            description: error.message,
                        });
                    },
                });

                const reorderVideos = useMutation({
                    mutationFn: async (videos: any[]) => {
                        if (!happyTailsSection) {
                            throw new Error('Happy Tails section not found');
                        }

                        return api.mutate(updateCmsSectionMutation, {
                            input: {
                                id: happyTailsSection.id,
                                data: {
                                    ...happyTailsSection.data,
                                    videos,
                                },
                            },
                        });
                    },
                    onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: ['cms-page', id] });
                    },
                    onError: (error: Error) => {
                        toast.error('Failed to reorder videos', {
                            description: error.message,
                        });
                    },
                });

                const saveReviews = useMutation({
                    mutationFn: async () => {
                        if (!page || reviewDrafts.length === 0) {
                            throw new Error('Add at least one review');
                        }

                        const reviews = reviewDrafts.map(review => ({
                            name: review.name.trim(),
                            text: review.text.trim(),
                            rating: Number(review.rating),
                        }));

                        if (reviews.some(review => !review.name || !review.text)) {
                            throw new Error('Every review needs a name and review text');
                        }

                        if (reviews.some(review => review.rating < 0 || review.rating > 5 || review.rating % 0.5 !== 0)) {
                            throw new Error('Ratings must be between 0 and 5 in half-star steps');
                        }

                        const data = {
                            reviews,
                            publishedReviews: reviewsSection?.data?.publishedReviews,
                        };

                        if (reviewsSection) {
                            return api.mutate(updateCmsSectionMutation, {
                                input: { id: reviewsSection.id, data },
                            });
                        }

                        return api.mutate(createCmsSectionMutation, {
                            input: {
                                pageId: page.id,
                                type: 'pawsitive-reviews',
                                position: 6,
                                data,
                            },
                        });
                    },
                    onSuccess: async () => {
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-page', id],
                        });
                        toast.success('Reviews updated');
                    },
                    onError: (error: Error) => {
                        toast.error('Failed to update reviews', {
                            description: error.message,
                        });
                    },
                });

                const saveContactSection = useMutation({
                    mutationFn: async (data: Record<string, any>) => {
                        if (!page) {
                            throw new Error('CMS page not loaded');
                        }

                        if (!contactSection) {
                            return api.mutate(createCmsSectionMutation, {
                                input: {
                                    pageId: page.id,
                                    type: 'contact',
                                    position: 1,
                                    data,
                                },
                            });
                        }

                        return api.mutate(updateCmsSectionMutation, {
                            input: {
                                id: contactSection.id,
                                data: {
                                    ...contactSection.data,
                                    ...data,
                                },
                            },
                        });
                    },
                    onSuccess: async () => {
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-page', id],
                        });
                        toast.success('Contact content updated');
                    },
                    onError: (mutationError: Error) => {
                        toast.error('Failed to update contact content', {
                            description: mutationError.message,
                        });
                    },
                });

                async function saveGenericComponent(section: any, data: Record<string, any>) {
                    await api.mutate(updateCmsSectionMutation, {
                        input: {
                            id: section.id,
                            data,
                        },
                    });
                    await queryClient.invalidateQueries({ queryKey: ['cms-page', id] });
                    toast.success(`${section.type} component updated`);
                }

                const reorderComponents = useMutation({
                    mutationFn: async (sections: any[]) => {
                        await Promise.all(
                            sections.map((section, index) =>
                                api.mutate(updateCmsSectionMutation, {
                                    input: {
                                        id: section.id,
                                        position: index + 1,
                                    },
                                }),
                            ),
                        );
                    },
                    onSuccess: async () => {
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-page', id],
                        });
                        toast.success('Component order updated');
                    },
                    onError: (mutationError: Error) => {
                        toast.error('Failed to reorder components', {
                            description: mutationError.message,
                        });
                    },
                });

                const publishPage = useMutation({
                    mutationFn: async () => {
                        const updates = [];

                        if (!page) {
                            throw new Error('CMS page not loaded');
                        }

                        updates.push(api.mutate(updateCmsPageMutation, {
                            input: {
                                id: page.id,
                                isPublished: true,
                            },
                        }));

                        if (heroSection) {
                            const heroImages = heroSection.data?.images ?? [];
                            if (heroImages.length > 0 && (heroImages.length < 3 || heroImages.length > 5)) {
                                throw new Error('Hero banner must contain between 3 and 5 images');
                            }

                            if (heroImages.length > 0) {
                                updates.push(api.mutate(updateCmsSectionMutation, {
                                    input: {
                                        id: heroSection.id,
                                        data: {
                                            ...heroSection.data,
                                            publishedImages: heroImages.map((image: any) => image.source),
                                        },
                                    },
                                }));
                            }
                        }

                        if (happyTailsSection) {
                            const videoCount = happyTailsSection.data?.videos?.length ?? 0;
                            if (videoCount < 6 || videoCount > 10) {
                                throw new Error('Happy Tails must contain between 6 and 10 videos');
                            }

                            updates.push(api.mutate(updateCmsSectionMutation, {
                                input: {
                                    id: happyTailsSection.id,
                                    data: {
                                        ...happyTailsSection.data,
                                        publishedVideos: happyTailsSection.data.videos,
                                    },
                                },
                            }));
                        }

                        if (reviewsSection) {
                            if (!reviewDrafts.length) {
                                throw new Error('Add at least one review before publishing');
                            }

                            updates.push(api.mutate(updateCmsSectionMutation, {
                                input: {
                                    id: reviewsSection.id,
                                    data: {
                                        ...reviewsSection.data,
                                        reviews: reviewDrafts,
                                        publishedReviews: reviewDrafts,
                                    },
                                },
                            }));
                        }

                        if (contactSection) {
                            updates.push(api.mutate(updateCmsSectionMutation, {
                                input: {
                                    id: contactSection.id,
                                    data: {
                                        ...contactSection.data,
                                        email: contactEmail,
                                        phone: contactPhone,
                                        publishedEmail: contactEmail,
                                        publishedPhone: contactPhone,
                                        publishedHeroImage: contactSection.data?.heroImage,
                                        publishedLogoImage: contactSection.data?.logoImage,
                                    },
                                },
                            }));
                        }

                        return Promise.all(updates);
                    },
                    onSuccess: async () => {
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-page', id],
                        });
                        await queryClient.invalidateQueries({
                            queryKey: ['cms-pages'],
                        });
                        toast.success('CMS page published');
                    },
                    onError: (error: Error) => {
                        toast.error('Failed to publish CMS page', {
                            description: error.message,
                        });
                    },
                });

                function moveItem<T>(items: T[], from: number, to: number) {
                    const next = [...items];
                    const [moved] = next.splice(from, 1);
                    next.splice(to, 0, moved);
                    return next;
                }

                function dropComponent(index: number, event: DragEvent<HTMLElement>) {
                    const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
                    const fromIndex = Number.isNaN(sourceIndex)
                        ? draggedComponentIndex
                        : sourceIndex;

                    if (fromIndex === null || fromIndex === index) {
                        setDraggedComponentIndex(null);
                        return;
                    }

                    const orderedSections = [...(page?.sections ?? [])]
                        .sort((first, second) => first.position - second.position);
                    reorderComponents.mutate(moveItem(orderedSections, fromIndex, index));
                    setDraggedComponentIndex(null);
                }

                function getComponentIndex(sectionId: string) {
                    return [...(page?.sections ?? [])]
                        .sort((first, second) => first.position - second.position)
                        .findIndex(section => section.id === sectionId);
                }

                function startComponentDrag(
                    sectionId: string,
                    event: DragEvent<HTMLDivElement>,
                ) {
                    const index = getComponentIndex(sectionId);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(index));
                    setDraggedComponentIndex(index);
                }

                function allowComponentDrop(event: DragEvent<HTMLDivElement>) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                }

                function renderComponentHandle(sectionId: string) {
                    return (
                        <div
                            draggable
                            aria-label="Drag to reorder component"
                            title="Drag to reorder component"
                            onDragStart={event => startComponentDrag(sectionId, event)}
                            onDragEnd={() => setDraggedComponentIndex(null)}
                            className="absolute left-3 top-3 z-10 grid cursor-grab grid-cols-2 gap-1 rounded p-1 active:cursor-grabbing"
                        >
                            {Array.from({ length: 6 }, (_, index) => (
                                <span key={index} className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                            ))}
                        </div>
                    );
                }

                function dropItem(
                    type: 'hero' | 'video' | 'review',
                    index: number,
                    event: DragEvent<HTMLDivElement>,
                ) {
                    const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
                    const fromIndex = Number.isNaN(sourceIndex)
                        ? draggedItem?.index
                        : sourceIndex;

                    if (
                        fromIndex === undefined ||
                        !draggedItem ||
                        draggedItem.type !== type ||
                        fromIndex === index
                    ) {
                        setDraggedItem(null);
                        return;
                    }

                    if (type === 'hero') {
                        const images = moveItem(heroSection?.data?.images ?? [], fromIndex, index);
                        reorderHero.mutate(images);
                    } else if (type === 'video') {
                        const videos = moveItem(happyTailsSection?.data?.videos ?? [], fromIndex, index);
                        reorderVideos.mutate(videos);
                    } else {
                        setReviewDrafts(moveItem(reviewDrafts, fromIndex, index));
                    }

                    setDraggedItem(null);
                }

                // NOW returns are safe because all hooks
                // have already executed.

                if (isLoading) {
                    return <p>Loading page...</p>;
                }

                if (error || !page) {
                    return <p>Failed to load CMS page.</p>;
                }

                return (
                    <Page pageId="cms-page-detail">
                        <PageTitle>{page.title}</PageTitle>

                        <PageLayout>
                            <PageBlock
                                column="main"
                                blockId="cms-home-content"
                            >
                                <div className="flex flex-col gap-6">
                                    <div className="order-first flex items-center justify-between gap-4">
                                        <h2 className="text-lg font-medium">
                                            Homepage Content
                                        </h2>

                                        <Button
                                            type="button"
                                            onClick={() => publishPage.mutate()}
                                            disabled={publishPage.isPending}
                                        >
                                            {publishPage.isPending ? 'Publishing...' : 'Publish'}
                                        </Button>
                                    </div>

                                    <p className="text-sm text-muted-foreground">
                                        Manage selected {isContactPage ? 'contact page' : 'homepage'} content.
                                    </p>

                                    <div className="order-0 border rounded-lg p-4 space-y-4">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <h3 className="font-medium">Page Components</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    Add reusable content components and arrange them on this page.
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={() => setComponentFormOpen(value => !value)}
                                            >
                                                {componentFormOpen ? 'Cancel' : 'Add Component'}
                                            </Button>
                                        </div>

                                        {componentFormOpen && (
                                            <div className="flex flex-wrap items-end gap-3 border-t pt-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="component-type">Component type</Label>
                                                    <select
                                                        id="component-type"
                                                        value={componentType}
                                                        onChange={event => setComponentType(event.target.value)}
                                                        className="border rounded-md px-3 py-2 bg-background"
                                                    >
                                                        <option value="hero">Hero image slider</option>
                                                        <option value="image">Image</option>
                                                        <option value="text">Text</option>
                                                        <option value="pawsitive-reviews">Reviews</option>
                                                        <option value="happy-tails">Videos</option>
                                                        <option value="products">Products</option>
                                                        <option value="contact">Contact details</option>
                                                    </select>
                                                </div>
                                                <Button
                                                    type="button"
                                                    onClick={() => addComponent.mutate()}
                                                    disabled={addComponent.isPending}
                                                >
                                                    {addComponent.isPending ? 'Adding...' : 'Add Component'}
                                                </Button>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2">
                                            {[...page.sections]
                                                .sort((first, second) => first.position - second.position)
                                                .map((section, index) => (
                                                <span
                                                    key={section.id}
                                                    draggable
                                                    onDragStart={event => {
                                                        event.dataTransfer.effectAllowed = 'move';
                                                        event.dataTransfer.setData('text/plain', String(index));
                                                        setDraggedComponentIndex(index);
                                                    }}
                                                    onDragOver={event => {
                                                        event.preventDefault();
                                                        event.dataTransfer.dropEffect = 'move';
                                                    }}
                                                    onDrop={event => {
                                                        event.preventDefault();
                                                        dropComponent(index, event);
                                                    }}
                                                    onDragEnd={() => setDraggedComponentIndex(null)}
                                                    className="inline-flex cursor-grab items-center gap-2 rounded-full border px-3 py-1 text-xs active:cursor-grabbing"
                                                >
                                                    {index + 1}. {section.type}
                                                    <button
                                                        type="button"
                                                        aria-label={`Delete ${section.type} component`}
                                                        className="font-bold text-destructive"
                                                        onClick={() => {
                                                            if (window.confirm(`Delete ${section.type} component?`)) {
                                                                deleteComponent.mutate(section.id);
                                                            }
                                                        }}
                                                    >
                                                        x
                                                    </button>
                                                </span>
                                            ))}
                                        </div>

                                        <div className="space-y-4">
                                            {page.sections
                                                .filter(section => ['image', 'text', 'products'].includes(section.type))
                                                .map(section => {
                                                    const draft = genericDrafts[section.id] ?? section.data ?? {};

                                                    return (
                                                        <div key={section.id} className="border rounded-md p-4 space-y-3">
                                                            <h4 className="font-medium">{section.type} component</h4>
                                                            {section.type === 'text' && (
                                                                <Input
                                                                    value={draft.text ?? ''}
                                                                    placeholder="Component text"
                                                                    onChange={event => setGenericDrafts({
                                                                        ...genericDrafts,
                                                                        [section.id]: { ...draft, text: event.target.value },
                                                                    })}
                                                                />
                                                            )}
                                                            {section.type === 'products' && (
                                                                <Input
                                                                    value={(draft.products ?? []).join(', ')}
                                                                    placeholder="Product IDs, separated by commas"
                                                                    onChange={event => setGenericDrafts({
                                                                        ...genericDrafts,
                                                                        [section.id]: {
                                                                            ...draft,
                                                                            products: event.target.value.split(',').map(value => value.trim()).filter(Boolean),
                                                                        },
                                                                    })}
                                                                />
                                                            )}
                                                            {section.type === 'image' && (
                                                                <div className="flex items-center gap-3">
                                                                    {draft.preview && (
                                                                        <img src={draft.preview} alt="Component" className="h-20 w-32 rounded border object-cover" />
                                                                    )}
                                                                    <Button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setComponentImageId(section.id);
                                                                            setAssetPickerMode('component-image');
                                                                            setAssetPickerOpen(true);
                                                                        }}
                                                                    >
                                                                        {draft.image ? 'Change Image' : 'Select Image'}
                                                                    </Button>
                                                                </div>
                                                            )}
                                                            <Button
                                                                type="button"
                                                                onClick={() => saveGenericComponent(section, draft)}
                                                            >
                                                                Save {section.type}
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>

                                    {heroSection && (
                                    <div
                                        onDragOver={allowComponentDrop}
                                        onDrop={event => dropComponent(getComponentIndex(heroSection.id), event)}
                                        className="relative border rounded-lg p-4 space-y-4"
                                        style={{ order: heroSection?.position ?? 1 }}
                                    >
                                        {renderComponentHandle(heroSection.id)}
                                        <div>
                                            <h3 className="ml-8 font-medium">
                                                Hero Banner
                                            </h3>

                                            <p className="text-sm text-muted-foreground">
                                                Change the main homepage banner images. Select 3 to 5 images for the automatic hero slider, then drag to reorder.
                                            </p>
                                        </div>

                                        <p className="text-sm font-medium">
                                            {heroSection?.data?.images?.length ?? 0} / 5 images selected
                                        </p>

                                        {(heroSection?.data?.images?.length || heroSection?.data?.bannerPreview) && (
                                            <div className="grid grid-cols-3 gap-3 max-w-[800px]">
                                                {(heroSection.data.images ?? [{ preview: heroSection.data.bannerPreview }]).map((image: any, index: number) => (
                                                    <div
                                                        key={image.assetId || image.preview}
                                                        draggable
                                                        onDragStart={event => {
                                                            event.dataTransfer.effectAllowed = 'move';
                                                            event.dataTransfer.setData('text/plain', String(index));
                                                            setDraggedItem({ type: 'hero', index });
                                                        }}
                                                        onDragOver={event => {
                                                            event.preventDefault();
                                                            event.dataTransfer.dropEffect = 'move';
                                                        }}
                                                        onDragEnter={event => event.preventDefault()}
                                                        onDrop={event => {
                                                            event.preventDefault();
                                                            dropItem('hero', index, event);
                                                        }}
                                                        onDragEnd={() => setDraggedItem(null)}
                                                        className="cursor-grab active:cursor-grabbing"
                                                    >
                                                        <img
                                                            src={image.preview}
                                                            alt="Hero banner"
                                                            className="aspect-video w-full rounded-md border object-cover"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {!heroSection && (
                                            <p className="text-sm text-muted-foreground">
                                                No CMS hero banner set yet.
                                                The frontend will use its
                                                default image.
                                            </p>
                                        )}

                                        <Button
                                            type="button"
                                            onClick={() => {
                                                setAssetPickerMode('hero');
                                                setAssetPickerOpen(true);
                                            }}
                                        >
                                                {heroSection ? 'Change Banners' : 'Select Banners'}
                                        </Button>
                                        
                                    </div>
                                    )}
                                    {happyTailsSection && (
                                    <div
                                        onDragOver={allowComponentDrop}
                                        onDrop={event => dropComponent(getComponentIndex(happyTailsSection.id), event)}
                                        className="relative border rounded-lg p-6 space-y-5 min-h-[520px]"
                                        style={{ order: happyTailsSection?.position ?? 1 }}
                                    >
                                        {renderComponentHandle(happyTailsSection.id)}
                                        <div>
                                            <h3 className="ml-8 font-medium">
                                                Happy Tails Videos
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                Select 6 to 10 video assets, then drag them into the order they should appear on the homepage.
                                            </p>
                                            <p className="text-sm font-medium mt-2">
                                                {happyTailsSection?.data?.videos?.length ?? 0} / 10 videos selected
                                            </p>
                                        </div>

                                        {happyTailsSection?.data?.videos?.length ? (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                                                {happyTailsSection.data.videos.map((video: any, index: number) => (
                                                    <div
                                                        key={video.assetId || video.video || video.thumb}
                                                        draggable
                                                        onDragStart={event => {
                                                            event.dataTransfer.effectAllowed = 'move';
                                                            event.dataTransfer.setData('text/plain', String(index));
                                                            setDraggedItem({ type: 'video', index });
                                                        }}
                                                        onDragOver={event => {
                                                            event.preventDefault();
                                                            event.dataTransfer.dropEffect = 'move';
                                                        }}
                                                        onDragEnter={event => event.preventDefault()}
                                                        onDrop={event => {
                                                            event.preventDefault();
                                                            dropItem('video', index, event);
                                                        }}
                                                        onDragEnd={() => setDraggedItem(null)}
                                                        className="relative aspect-[3/4] cursor-grab overflow-hidden rounded-md border bg-muted active:cursor-grabbing"
                                                    >
                                                        <video
                                                            src={video.video}
                                                            poster={video.thumb || undefined}
                                                            muted
                                                            autoPlay
                                                            loop
                                                            playsInline
                                                            preload="auto"
                                                            aria-label={video.title}
                                                             className="h-full w-full object-cover"
                                                        />
                                                        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
                                                            {video.title}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                No CMS videos set yet. The frontend will use its default videos.
                                            </p>
                                        )}

                                        <div className="flex items-center gap-3">
                                            <Button
                                                type="button"
                                                onClick={() => {
                                                    setAssetPickerMode('happy-tails');
                                                    setAssetPickerOpen(true);
                                                }}
                                            >
                                                {happyTailsSection ? 'Change Videos' : 'Select Videos'}
                                            </Button>
                                        </div>
                                    </div>
                                    )}

                                    {reviewsSection && (
                                    <div
                                        onDragOver={allowComponentDrop}
                                        onDrop={event => dropComponent(getComponentIndex(reviewsSection.id), event)}
                                        className="relative border rounded-lg p-6 space-y-5"
                                        style={{ order: reviewsSection?.position ?? 1 }}
                                    >
                                        {renderComponentHandle(reviewsSection.id)}
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <h3 className="ml-8 font-medium">
                                                    Pawsitive Reviews
                                                </h3>
                                                <p className="text-sm text-muted-foreground">
                                                    Manage reviewer names, review text, ratings, and drag to reorder.
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={() => setReviewDrafts([...reviewDrafts, { name: '', text: '', rating: 5 }])}
                                            >
                                                Add Review
                                            </Button>
                                        </div>

                                        <div className="space-y-4">
                                            {reviewDrafts.map((review, index) => (
                                                <div
                                                    key={index}
                                                    draggable
                                                    onDragStart={event => {
                                                        event.dataTransfer.effectAllowed = 'move';
                                                        event.dataTransfer.setData('text/plain', String(index));
                                                        setDraggedItem({ type: 'review', index });
                                                    }}
                                                    onDragOver={event => {
                                                        event.preventDefault();
                                                        event.dataTransfer.dropEffect = 'move';
                                                    }}
                                                    onDragEnter={event => event.preventDefault()}
                                                    onDrop={event => {
                                                        event.preventDefault();
                                                        dropItem('review', index, event);
                                                    }}
                                                    onDragEnd={() => setDraggedItem(null)}
                                                    className="grid cursor-grab gap-3 border rounded-md p-4 active:cursor-grabbing md:grid-cols-[1fr_2fr_140px_auto]"
                                                >
                                                    <Input
                                                        value={review.name}
                                                        placeholder="Reviewer name"
                                                        onChange={event => {
                                                            const next = [...reviewDrafts];
                                                            next[index] = { ...next[index], name: event.target.value };
                                                            setReviewDrafts(next);
                                                        }}
                                                    />
                                                    <Input
                                                        value={review.text}
                                                        placeholder="Review"
                                                        onChange={event => {
                                                            const next = [...reviewDrafts];
                                                            next[index] = { ...next[index], text: event.target.value };
                                                            setReviewDrafts(next);
                                                        }}
                                                    />
                                                    <select
                                                        value={review.rating}
                                                        aria-label={`Rating for review ${index + 1}`}
                                                        className="border rounded-md px-3 py-2 bg-background"
                                                        onChange={event => {
                                                            const next = [...reviewDrafts];
                                                            next[index] = { ...next[index], rating: Number(event.target.value) };
                                                            setReviewDrafts(next);
                                                        }}
                                                    >
                                                        {Array.from({ length: 11 }, (_, ratingIndex) => ratingIndex / 2).map(rating => (
                                                            <option key={rating} value={rating}>{rating} stars</option>
                                                        ))}
                                                    </select>
                                                    <Button
                                                        type="button"
                                                        onClick={() => setReviewDrafts(reviewDrafts.filter((_, reviewIndex) => reviewIndex !== index))}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>

                                        <Button
                                            type="button"
                                            onClick={() => saveReviews.mutate()}
                                            disabled={saveReviews.isPending}
                                        >
                                            {saveReviews.isPending ? 'Saving...' : 'Save Reviews'}
                                        </Button>
                                    </div>
                                    )}

                                    {isContactPage && contactSection && (
                                        <div
                                            onDragOver={allowComponentDrop}
                                            onDrop={event => dropComponent(getComponentIndex(contactSection.id), event)}
                                            className="relative border rounded-lg p-6 space-y-5"
                                            style={{ order: contactSection?.position ?? 1 }}
                                        >
                                            {renderComponentHandle(contactSection.id)}
                                            <div>
                                                <h3 className="ml-8 font-medium">Contact Page</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    Manage the contact hero image, logo, email address, and phone number.
                                                </p>
                                            </div>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor="contact-email">Contact email</Label>
                                                    <Input
                                                        id="contact-email"
                                                        type="email"
                                                        value={contactEmail}
                                                        placeholder="hello@petsupright.com"
                                                        onChange={event => setContactEmail(event.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="contact-phone">Contact number</Label>
                                                    <Input
                                                        id="contact-phone"
                                                        type="tel"
                                                        value={contactPhone}
                                                        placeholder="+91 98765 43210"
                                                        onChange={event => setContactPhone(event.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <div className="space-y-3">
                                                    <p className="text-sm font-medium">Hero image</p>
                                                    {contactSection?.data?.heroPreview && (
                                                        <img
                                                            src={contactSection.data.heroPreview}
                                                            alt="Contact hero"
                                                            className="aspect-[2/1] w-full rounded-md border object-cover"
                                                        />
                                                    )}
                                                    <Button
                                                        type="button"
                                                        onClick={() => {
                                                            setAssetPickerMode('contact-hero');
                                                            setAssetPickerOpen(true);
                                                        }}
                                                    >
                                                        {contactSection?.data?.heroImage ? 'Change Hero Image' : 'Select Hero Image'}
                                                    </Button>
                                                </div>
                                                <div className="space-y-3">
                                                    <p className="text-sm font-medium">Logo</p>
                                                    {contactSection?.data?.logoPreview && (
                                                        <img
                                                            src={contactSection.data.logoPreview}
                                                            alt="Contact logo"
                                                            className="aspect-square w-40 rounded-md border object-contain"
                                                        />
                                                    )}
                                                    <Button
                                                        type="button"
                                                        onClick={() => {
                                                            setAssetPickerMode('contact-logo');
                                                            setAssetPickerOpen(true);
                                                        }}
                                                    >
                                                        {contactSection?.data?.logoImage ? 'Change Logo' : 'Select Logo'}
                                                    </Button>
                                                </div>
                                            </div>

                                            <Button
                                                type="button"
                                                onClick={() => saveContactSection.mutate({
                                                    email: contactEmail,
                                                    phone: contactPhone,
                                                })}
                                                disabled={saveContactSection.isPending}
                                            >
                                                {saveContactSection.isPending ? 'Saving...' : 'Save Contact Details'}
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <AssetPickerDialog
                                    open={assetPickerOpen}
                                    onClose={() =>
                                        setAssetPickerOpen(false)
                                    }
                                    multiSelect={assetPickerMode === 'hero' || assetPickerMode === 'happy-tails'}
                                    title={
                                        assetPickerMode === 'happy-tails'
                                            ? 'Select Happy Tails Videos'
                                            : assetPickerMode === 'contact-hero'
                                                ? 'Select Contact Hero Image'
                                                : assetPickerMode === 'contact-logo'
                                                    ? 'Select Contact Logo'
                                                    : assetPickerMode === 'component-image'
                                                        ? 'Select Component Image'
                                                    : 'Select Hero Banner'
                                    }
                                    onSelect={assets => {
                                        if (!assets[0]) {
                                            return;
                                        }

                                        if (assetPickerMode === 'hero') {
                                            saveHero.mutate(assets);
                                        } else if (assetPickerMode === 'contact-hero') {
                                            saveContactSection.mutate({
                                                heroImage: assets[0].source,
                                                heroPreview: assets[0].preview,
                                                heroAssetId: assets[0].id,
                                            });
                                        } else if (assetPickerMode === 'contact-logo') {
                                            saveContactSection.mutate({
                                                logoImage: assets[0].source,
                                                logoPreview: assets[0].preview,
                                                logoAssetId: assets[0].id,
                                            });
                                        } else if (assetPickerMode === 'component-image' && componentImageId) {
                                            const section = page?.sections.find(item => item.id === componentImageId);
                                            if (section) {
                                                const data = {
                                                    ...section.data,
                                                    image: assets[0].source,
                                                    preview: assets[0].preview,
                                                    assetId: assets[0].id,
                                                };
                                                setGenericDrafts({
                                                    ...genericDrafts,
                                                    [section.id]: data,
                                                });
                                                saveGenericComponent(section, data);
                                            }
                                        } else {
                                            saveHappyTails.mutate(assets);
                                        }

                                        setAssetPickerOpen(false);
                                    }}
                                />
                            </PageBlock>
                        </PageLayout>
                    </Page>
                );
            },
        },
    ],

    pageBlocks: [],
    navSections: [],
    actionBarItems: [],
    alerts: [],
    widgets: [],
    customFormComponents: {},
    dataTables: [],
    detailForms: [],
    login: {},
    historyEntries: [],
});