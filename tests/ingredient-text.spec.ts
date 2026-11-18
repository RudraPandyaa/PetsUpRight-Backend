import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseOPNRows } from '../src/plugins/product-import/services/opn-row-parser';
import {
    parseIngredientText,
    serializeIngredientList,
} from '../src/plugins/product-import/services/ingredient-text';

test('imports the Ingredients column from the product master template as text', () => {
    const ingredients =
        'Trout (19%), ocean fish meal, sweet potatoes, potatoes';
    const row = parseOPNRows([
        {
            Brand: 'Example',
            SKU: 'Fish food',
            'Product Title': 'Fish food 1 kg',
            'UPC/EAN Code': '1234567890123',
            L2: 'Dogs-Food',
            MRP: 100,
            Ingredients: ingredients,
        },
    ])[0];

    assert.ok(row);
    assert.equal(row.ingredients, ingredients);
    assert.equal(row.source.ingredients?.value, ingredients);
});

test('parses comma-separated and legacy single-value ingredient text', () => {
    assert.deepEqual(
        parseIngredientText(' Trout (19%), ocean fish meal, sweet potatoes '),
        ['Trout (19%)', 'ocean fish meal', 'sweet potatoes'],
    );
    assert.deepEqual(
        parseIngredientText('Trout (19%) ocean fish meal sweet potatoes'),
        ['Trout (19%) ocean fish meal sweet potatoes'],
    );
    assert.deepEqual(parseIngredientText(' ,  , '), []);
    assert.deepEqual(parseIngredientText(null), []);
});

test('serializes dashboard edits back to comma-separated text', () => {
    const saved = serializeIngredientList([
        ' Trout (19%) ',
        'ocean fish meal',
        '',
        'sweet potatoes',
    ]);

    assert.equal(saved, 'Trout (19%), ocean fish meal, sweet potatoes');
    assert.deepEqual(parseIngredientText(saved), [
        'Trout (19%)',
        'ocean fish meal',
        'sweet potatoes',
    ]);
});
