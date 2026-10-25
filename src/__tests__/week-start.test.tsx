import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import type { AppVariant } from '@/lib/env-guard';
import { ApiError } from '@/lib/errors';
import { queryClient } from '@/lib/query-client';
import { touchTarget } from '@/test/a11y';
import { MEMBERSHIP, mockHouseholdApi, resetBackend } from '@/test/mock-backend';

// The Week starts on screen, C-WKS-01 to C-WKS-06 (specs/meals/4-test-plan.md §14.3), on the real
// routes with the real household hooks. The household API is the mock backend's, so a change goes
// through the membership cache as it does in the app.

let mockVariant: AppVariant = 'development';
jest.mock('@/lib/env', () => ({
  get env() {
    return { variant: mockVariant, sentryDsn: null };
  },
}));
// The root layout's auto-refresh hook would create the real Supabase client.
jest.mock('@/lib/auto-refresh', () => ({ useForegroundAutoRefresh: () => {} }));
jest.mock('@/lib/supabase', () => ({
  supabase:
    jest.requireActual<typeof import('@/test/mock-backend')>('@/test/mock-backend').mockSupabase,
}));
jest.mock(
  '@/features/household/api',
  () =>
    jest.requireActual<typeof import('@/test/mock-backend')>('@/test/mock-backend')
      .mockHouseholdApi,
);
jest.mock('@/features/auth/auth-provider', () => {
  const { SESSION } =
    jest.requireActual<typeof import('@/test/mock-backend')>('@/test/mock-backend');
  return {
    ...jest.requireActual('@/features/auth/auth-provider'),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
    useAuth: () => ({
      state: { status: 'signedIn', session: SESSION },
      signIn: jest.fn(),
      signOut: jest.fn(),
    }),
  };
});

const KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ERROR = "Couldn't change the start of the week";

const withWeekStart = (weekStart: number) => [
  { ...MEMBERSHIP, household: { ...MEMBERSHIP.household, weekStart } },
];

beforeEach(() => {
  mockVariant = 'development';
  jest.clearAllMocks();
  resetBackend();
});

afterEach(() => {
  queryClient.clear();
});

async function renderWeekStart() {
  const app = await renderRouter('./src/app', { initialUrl: '/week-start' });
  // The root guards (3.7) open the screen once the membership has loaded.
  await screen.findByTestId('week-start-mon');
  return app;
}

const day = (key: (typeof KEYS)[number]) => screen.getByTestId(`week-start-${key}`);
const selectedDays = () =>
  KEYS.filter((key) => day(key).props.accessibilityState?.selected === true);
/** The SF Symbol names a row draws: the checkmark, or nothing. */
const symbols = (key: (typeof KEYS)[number]) =>
  day(key).children.flatMap((child) =>
    typeof child === 'string' || child.props.name === undefined ? [] : [child.props.name],
  );

describe('Week starts on', () => {
  it('C-WKS-01 lists the seven days, Monday first, with the household’s day selected', async () => {
    await renderWeekStart();

    expect(screen.getAllByTestId(/^week-start-(mon|tue|wed|thu|fri|sat|sun)$/)).toHaveLength(7);
    KEYS.forEach((key, i) => {
      expect(day(key)).toHaveProp('accessibilityRole', 'button');
      expect(day(key)).toHaveTextContent(NAMES[i]!);
    });
    expect(selectedDays()).toEqual(['mon']);
    expect(symbols('mon')).toEqual(['checkmark']);
    expect(symbols('sun')).toEqual([]);
  });

  it('C-WKS-02 saves a new day for the household and moves the checkmark at once (R48.4)', async () => {
    let finish!: () => void;
    mockHouseholdApi.updateWeekStart.mockReturnValue(new Promise<void>((done) => (finish = done)));
    const app = await renderWeekStart();

    await fireEvent.press(day('sun'));

    await waitFor(() => expect(selectedDays()).toEqual(['sun']));
    expect(mockHouseholdApi.updateWeekStart).toHaveBeenCalledWith('household-1', 6);
    expect(app.getPathname()).toBe('/week-start');

    mockHouseholdApi.fetchMemberships.mockResolvedValue(withWeekStart(6));
    await act(async () => finish());
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(selectedDays()).toEqual(['sun']);
    expect(screen.queryByText(ERROR)).toBeNull();
  });

  it('C-WKS-03 does nothing for the day already selected', async () => {
    await renderWeekStart();

    await fireEvent.press(day('mon'));

    expect(mockHouseholdApi.updateWeekStart).not.toHaveBeenCalled();
    expect(selectedDays()).toEqual(['mon']);
  });

  it('C-WKS-04 puts the checkmark back and says so when the change fails (R48.10)', async () => {
    mockHouseholdApi.updateWeekStart.mockRejectedValueOnce(
      new ApiError('server', { table: 'households', operation: 'update' }),
    );
    await renderWeekStart();

    await fireEvent.press(day('sun'));

    expect(await screen.findByText(ERROR)).toBeOnTheScreen();
    expect(screen.getByTestId('week-start-error')).toBeOnTheScreen();
    await waitFor(() => expect(selectedDays()).toEqual(['mon']));

    mockHouseholdApi.fetchMemberships.mockResolvedValue(withWeekStart(1));
    await fireEvent.press(day('tue'));

    await waitFor(() => expect(screen.queryByText(ERROR)).toBeNull());
    await waitFor(() => expect(selectedDays()).toEqual(['tue']));
  });

  it('C-WKS-05 makes every row a button at least 44 pt high, with static test IDs', async () => {
    await renderWeekStart();

    for (const key of KEYS) {
      expect(touchTarget(day(key)).height).toBeGreaterThanOrEqual(44);
    }
  });

  it('C-WKS-06 moves the checkmark when the other phone changes the day (R48.5)', async () => {
    await renderWeekStart();

    // The household handler's refetch, after the other phone's change.
    mockHouseholdApi.fetchMemberships.mockResolvedValue(withWeekStart(5));
    await act(() => queryClient.invalidateQueries({ queryKey: ['membership'] }));

    await waitFor(() => expect(selectedDays()).toEqual(['sat']));
    expect(mockHouseholdApi.updateWeekStart).not.toHaveBeenCalled();
  });
});
