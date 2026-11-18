export function parseIngredientText(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .filter(
                (ingredient): ingredient is string =>
                    typeof ingredient === 'string',
            )
            .map(ingredient => ingredient.trim())
            .filter(Boolean);
    }

    if (typeof value !== 'string' || !value.trim()) {
        return [];
    }

    return value
        .split(',')
        .map(ingredient => ingredient.trim())
        .filter(Boolean);
}

export function serializeIngredientList(
    ingredients: readonly string[],
): string {
    return ingredients
        .map(ingredient => ingredient.trim())
        .filter(Boolean)
        .join(', ');
}
