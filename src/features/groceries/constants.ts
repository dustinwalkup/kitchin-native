// Ported verbatim from kitchin-app/src/lib/constants.ts (design §3.5.1). The legacy `color` classes
// are left out: badge colours come from `theme.category` (§3.10).

/** A grocery category, as stored in `grocery_items.category` (R4.1). */
export type CategoryKey = 'produce' | 'meat' | 'dairy' | 'pantry' | 'frozen' | 'bakery' | 'other';

export interface Category {
  key: CategoryKey;
  label: string;
  emoji: string;
}

/** Every category, in the fixed section order (R4.1). */
export const CATEGORIES: readonly Category[] = [
  { key: 'produce', label: 'Produce', emoji: '🥬' },
  { key: 'meat', label: 'Meat & Fish', emoji: '🥩' },
  { key: 'dairy', label: 'Dairy & Eggs', emoji: '🥛' },
  { key: 'pantry', label: 'Pantry', emoji: '🥫' },
  { key: 'frozen', label: 'Frozen', emoji: '🧊' },
  { key: 'bakery', label: 'Bakery', emoji: '🍞' },
  { key: 'other', label: 'Other', emoji: '🛒' },
];

/** The quick-add chips, by category (R6.1). Also the lookup behind `suggestCategory` (R5.2). */
export const COMMON_ITEMS: Readonly<Record<CategoryKey, readonly string[]>> = {
  produce: [
    'Bananas',
    'Apples',
    'Spinach',
    'Tomatoes',
    'Onions',
    'Garlic',
    'Carrots',
    'Broccoli',
    'Avocado',
    'Lemons',
    'Limes',
    'Bell Peppers',
    'Cucumber',
    'Lettuce',
    'Potatoes',
  ],
  meat: [
    'Chicken Breast',
    'Ground Beef',
    'Salmon',
    'Bacon',
    'Pork Chops',
    'Turkey',
    'Shrimp',
    'Steak',
    'Sausage',
    'Tuna',
    'Ham',
    'Deli Meat',
  ],
  dairy: [
    'Milk',
    'Eggs',
    'Cheese',
    'Butter',
    'Yogurt',
    'Cream',
    'Sour Cream',
    'Cottage Cheese',
    'Heavy Cream',
    'Half & Half',
  ],
  pantry: [
    'Rice',
    'Pasta',
    'Olive Oil',
    'Salt',
    'Pepper',
    'Flour',
    'Sugar',
    'Canned Tomatoes',
    'Beans',
    'Broth',
    'Soy Sauce',
    'Vinegar',
    'Honey',
    'Peanut Butter',
    'Jelly',
  ],
  frozen: [
    'Frozen Vegetables',
    'Ice Cream',
    'Frozen Pizza',
    'Frozen Fish',
    'Frozen Fruit',
    'Frozen Waffles',
    'Frozen French Fries',
  ],
  bakery: [
    'Bread',
    'Bagels',
    'Croissants',
    'Muffins',
    'Tortillas',
    'English Muffins',
    'Buns',
    'Cake',
    'Cookies',
  ],
  other: [
    'Paper Towels',
    'Toilet Paper',
    'Dish Soap',
    'Laundry Detergent',
    'Trash Bags',
    'Aluminum Foil',
    'Plastic Wrap',
    'Ziploc Bags',
    'Batteries',
    'Light Bulbs',
  ],
};

/** The empty list (R4.8). */
export const EMPTY_STATE = {
  title: 'No items yet',
  description: 'Add some items to get started',
} as const;
