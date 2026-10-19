# Kitchin Meal Library — Owner's Brief

> The owner's brief for the Meal Library, given on 2026-10-19 and kept as given. [1-requirements.md](./1-requirements.md) cites it by section ("Brief §6"). It's a record, not a spec: where it and the requirements disagree, the requirements win, and [the differences are listed there](./1-requirements.md#differences-from-the-brief).

---

# Kitchen: Meal Library — Implementation Checklist

## Objective
Add a shared Meal Library where household members can save, organize, search, and reuse common meals when planning breakfast, lunch, and dinner.

Keep the implementation simple while establishing a foundation for future AI-powered grocery list generation.

## 1. Meal Library Screen
- [ ] Create a dedicated screen named "Meal Library," separate from the Meal Planner.
- [ ] Display saved meals in a clean, scannable list.
- [ ] Display each meal's name and associated tags.
- [ ] Include a search field.
- [ ] Include a tag-filtering control.
- [ ] Provide an obvious action to add a new meal.
- [ ] Support loading, empty, and error states.

## 2. Add and Edit Meals

Create a full-screen form for adding and editing meals.

### Fields
- [ ] Meal name — required, single-line text.
- [ ] Description — optional, multiline text.
- [ ] Ingredients — optional, multiline free text.
- [ ] Tags — optional, multi-select tag picker.

### Behavior
- [ ] Validate that the meal name is not empty.
- [ ] Allow description and ingredients to remain blank.
- [ ] Display available tags as selectable chips.
- [ ] Allow multiple tags per meal.
- [ ] Allow users to create custom tags from the form.
- [ ] Prepopulate the initial tag set listed below.
- [ ] When editing, populate the existing values and select the meal's existing tags.
- [ ] Preserve entered information if saving fails.
- [ ] After a successful save, return to the Meal Library.
- [ ] Show an appropriate error message if saving fails.

### Initial Tags
- Quick & Easy
- Family Favorite
- High Protein
- Breakfast
- Lunch
- Dinner
- Meal Prep

Tags are optional. A meal can have multiple tags or none.

## 3. Shared Household Access
- [ ] Meals belong to the household rather than an individual user.
- [ ] Both household members can view, create, edit, and delete meals.
- [ ] Both household members can create and use custom tags.
- [ ] Enforce household access permissions on the backend.
- [ ] Follow existing authentication and household data-access patterns.

## 4. Delete Meals
- [ ] Provide a delete action for saved meals.
- [ ] Require confirmation before deletion.
- [ ] Deleting a meal removes it from the Meal Library.
- [ ] Deleting a meal must not erase existing meal-plan entries populated from it.
- [ ] Handle failures without silently removing the meal from the library.

## 5. Search and Tag Filtering

### Text Search
- [ ] Allow users to search meals by name.
- [ ] Update displayed results based on the search query.

### Tag Filtering
- [ ] Provide a "Filter by Tags" control.
- [ ] Allow multiple tags to be selected simultaneously.
- [ ] When multiple tags are selected, show meals matching ALL selected tags (AND behavior).
- [ ] Combine text search and tag filters.
- [ ] Provide a clear-filters action.
- [ ] With no tags selected, display all meals matching the search query.
- [ ] Show a helpful empty state when no meals match.

Keep the filtering interface compact rather than permanently displaying every tag.

## 6. Meal Planner Integration

Integrate the Meal Library into the existing meal-planning experience without redesigning the entire planner.

### Selection Flow
- [ ] The user opens the Meal Planner.
- [ ] The user selects a breakfast, lunch, or dinner field.
- [ ] A "Choose from Meal Library" button appears beneath the field.
- [ ] Tapping the button opens a selection interface displaying saved meals.
- [ ] The user selects a meal.
- [ ] The app returns to the planner and populates the existing meal text field with the saved meal's name and description.
- [ ] The user can edit the populated text independently.

### Additional Requirements
- [ ] Preserve existing free-text meal entry.
- [ ] Allow users to choose saved meals without requiring tags.
- [ ] Include a "+ Add New Meal" action in the selection interface.
- [ ] After creating a meal from that flow, return to the selection interface so the user can select it.
- [ ] If the user cancels selection, preserve existing meal-plan content.

### Important Data Behavior
Selecting a saved meal copies its name and description into the existing planner text field.

The planned entry must not remain dependent on the library record.

Editing or deleting a library entry must not automatically modify existing meal-plan entries.

## 7. Data Model Considerations

Follow the existing Kitchen app architecture and database conventions. Do not introduce a new framework or restructure unrelated functionality.

### Meals
Each meal should support:
- [ ] Unique identifier.
- [ ] Household identifier.
- [ ] Name.
- [ ] Optional description.
- [ ] Optional ingredients stored as free text.
- [ ] Created and updated timestamps, following existing conventions.
- [ ] Creator or updater metadata if consistent with existing patterns.

### Tags
Tags should be separate records associated with meals through a many-to-many relationship.

Each tag should support:
- [ ] Unique identifier.
- [ ] Household identifier.
- [ ] Tag name.
- [ ] Normalized name for duplicate detection.
- [ ] Created timestamp, if consistent with existing conventions.

### Relationships and Integrity
- [ ] A meal can have zero or more tags.
- [ ] A tag can belong to multiple meals.
- [ ] Tags are shared across the household.
- [ ] Prevent duplicate tags within a household, including differences caused by capitalization or surrounding whitespace.
- [ ] Removing a tag must not delete associated meals.
- [ ] Deleting a meal should remove its tag associations.
- [ ] Do not delete or modify existing meal-plan entries when a library meal changes.

### Future Compatibility
Keep the ingredient field easy to extend into structured ingredients and quantities later.

Do not implement structured ingredients or grocery-list generation in this release.

## 8. User Experience Requirements
- [ ] Follow the existing Kitchen app design system and navigation conventions.
- [ ] Keep the Meal Library visually separate from the Meal Planner.
- [ ] Make buttons and selection controls comfortable to use on a phone.
- [ ] Use clear labels rather than relying on unfamiliar icons alone.
- [ ] Provide feedback for successful saves and destructive actions.
- [ ] Preserve unsaved form data when an operation fails.
- [ ] Keep the add/edit form reusable rather than implementing separate forms.
- [ ] Avoid unnecessary complexity, including nutrition tracking, serving sizes, and recipe management.

## 9. Out of Scope

Do not implement these features in this release:
- [ ] AI grocery-list generation.
- [ ] Automatic ingredient inference.
- [ ] Structured ingredient entry or quantity management.
- [ ] Nutrition calculations.
- [ ] Serving-size management.
- [ ] Recipe instructions.
- [ ] Advanced filtering or sorting beyond text search and tag filtering.
- [ ] A dedicated tag-management screen.

These can be considered in future iterations.

## 10. Acceptance Criteria

- [ ] A household member can create a meal with only a name.
- [ ] A household member can create a meal with a description, ingredients, and multiple tags.
- [ ] Both household members can access and manage the same Meal Library.
- [ ] A user can create a custom tag and reuse it on another meal.
- [ ] Duplicate tags are prevented within the household.
- [ ] A user can edit a meal and its tags.
- [ ] A user can delete a meal after confirming the action.
- [ ] Existing meal-plan entries remain intact when a library meal is edited or deleted.
- [ ] Searching by meal name returns matching results.
- [ ] Filtering by multiple tags returns meals matching all selected tags.
- [ ] Search and tag filters work together.
- [ ] A user can select a saved meal for breakfast, lunch, or dinner.
- [ ] Selecting a saved meal populates the existing text field without creating a live dependency on the library record.
- [ ] A user can modify a planned meal without changing the saved template.
- [ ] A user can add a new meal from the selection interface and select it afterward.
- [ ] Saving failures and empty results are handled gracefully.
- [ ] Existing meal-planning functionality continues to work.

## 11. Implementation Instructions for the Coding Agent

Before implementing:

1. Inspect the existing Kitchen app structure, navigation, database schema, authentication, household relationships, and meal-planning implementation.
2. Identify the existing meal-plan text fields and determine how to integrate meal selection without disrupting them.
3. Follow established project conventions for database access, validation, error handling, and UI components.
4. Reuse existing components and services where appropriate.
5. Identify required database migrations and implement them using the project's existing migration workflow.
6. Implement the feature in small, coherent changes.
7. Add or update tests for household access, meal CRUD operations, tag management, filtering, and meal-planner integration.
8. Run the relevant tests and available project checks.
9. Report the files changed, migrations created, tests run, and any remaining limitations.

Do not assume existing architecture or invent new infrastructure.

If a requirement conflicts with the current implementation, explain the conflict and recommend the smallest compatible change before making a significant architectural change.

## Recommended Implementation Order

1. Database schema and access controls.
2. Meal CRUD operations.
3. Tag management and relationships.
4. Search and tag filtering.
5. Meal Planner selection integration.
6. Tests and verification.

The first release should establish the Meal Library while preserving the future path toward AI-generated grocery lists.
