import { Input, Textarea } from '@vendure/dashboard';
import { Controller, useFormContext, useWatch } from 'react-hook-form';

const petTypes = [
    'Dog', 'Cat', 'Bird', 'Hemster', 'Guinea Pig',
    'Turtle', 'Rabbit', 'Fish', 'Horse',
];

export function ProductCustomFields() {
    const { control } = useFormContext();
    const isFood = useWatch({ control, name: 'customFields.isFood' }) === true;

    return (
        <div className="grid gap-6 @md:grid-cols-2">
            <div className="space-y-2">
                <label htmlFor="product-pet-type" className="text-sm font-medium">
                    Pet Type
                </label>
                <Controller
                    control={control}
                    name="customFields.petType"
                    render={({ field }) => (
                        <select
                            id="product-pet-type"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3"
                            value={field.value ?? ''}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                        >
                            <option value="">Select pet type</option>
                            {petTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    )}
                />
            </div>

            <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Is this a food product?</legend>
                <Controller
                    control={control}
                    name="customFields.isFood"
                    render={({ field }) => (
                        <div className="flex gap-5">
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="product-is-food"
                                    checked={field.value === true}
                                    onChange={() => field.onChange(true)}
                                />
                                Yes
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="product-is-food"
                                    checked={field.value !== true}
                                    onChange={() => field.onChange(false)}
                                />
                                No
                            </label>
                        </div>
                    )}
                />
            </fieldset>

            {isFood && (
                <>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Ingredients</label>

                        <Controller
                            control={control}
                            name="customFields.ingredients"
                            render={({ field }) => {
                                const ingredients: string[] = Array.isArray(field.value)
                                    ? field.value
                                    : [];

                                return (
                                    <div className="space-y-2">
                                        {ingredients.map((ingredient, index) => (
                                            <div key={index} className="flex gap-2">
                                                <Input
                                                    aria-label={`Ingredient ${index + 1}`}
                                                    placeholder="e.g. Chicken"
                                                    value={ingredient}
                                                    onChange={event => {
                                                        const updated = [...ingredients];
                                                        updated[index] = event.target.value;
                                                        field.onChange(updated);
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    className="rounded-md border px-3"
                                                    onClick={() => {
                                                        field.onChange(
                                                            ingredients.filter((_, i) => i !== index)
                                                        );
                                                    }}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}

                                        <button
                                            type="button"
                                            className="rounded-md border px-3 py-2"
                                            onClick={() => field.onChange([...ingredients, ''])}
                                        >
                                            + Add ingredient
                                        </button>
                                    </div>
                                );
                            }}
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="product-usage" className="text-sm font-medium">
                            Usage & Feeding
                        </label>
                        <Controller
                            control={control}
                            name="customFields.usageAndFeeding"
                            render={({ field }) => (
                                <Textarea
                                    id="product-usage"
                                    value={field.value ?? ''}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                />
                            )}
                        />
                    </div>
                </>
            )}

            <div className="space-y-2 @md:col-span-2">
                <label htmlFor="product-specifications" className="text-sm font-medium">
                    Specifications
                </label>
                <Controller
                    control={control}
                    name="customFields.specifications"
                    render={({ field }) => (
                        <Textarea
                            id="product-specifications"
                            value={field.value ?? ''}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                        />
                    )}
                />
            </div>
        </div>
    );
}