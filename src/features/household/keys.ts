// Cache keys that the household hooks share with the household's realtime handler, kept apart from
// both so the (app) layout can import the handler without the API layer (specs/meals/2-design.md
// §11.3).

/** The prefix of the provider's membership query key, which holds the household. */
export const MEMBERSHIP_KEY = ['membership'] as const;

/** The prefix of every start-of-the-week mutation key, which the realtime handler defers to. */
export const WEEK_START_MUTATION = 'week-start-mutation';
