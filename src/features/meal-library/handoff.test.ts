import type { IsoDate } from '@/lib/calendar';

import { lastSaved, mealPick, newMealName } from './handoff';

const THURSDAY = '2026-10-22' as IsoDate;

beforeEach(() => {
  newMealName.clear();
  lastSaved.clear();
  mealPick.clear();
});

describe('a hand-off', () => {
  it('U-LHOF-01 reads back what was set, without consuming it, and gives each set a new id', () => {
    expect(newMealName.read()).toBeNull();

    newMealName.set('Tacos');
    const first = newMealName.read();
    expect(first).toEqual({ id: expect.any(Number), value: 'Tacos' });
    expect(newMealName.read()).toEqual(first);

    newMealName.set('Tacos');
    const second = newMealName.read();
    expect(second?.value).toBe('Tacos');
    expect(second?.id).not.toBe(first?.id);
  });

  it('U-LHOF-01 never reuses an id after a clear, or across hand-offs', () => {
    lastSaved.set({ mealId: 'meal-1', kind: 'saved' });
    const saved = lastSaved.read()?.id;
    lastSaved.clear();
    lastSaved.set({ mealId: 'meal-1', kind: 'saved' });
    mealPick.set({ date: THURSDAY, mealType: 'dinner', text: 'Tacos' });

    const ids = [saved, lastSaved.read()?.id, mealPick.read()?.id];
    expect(new Set(ids).size).toBe(3);
  });

  it('U-LHOF-02 clear makes read return null', () => {
    mealPick.set({ date: THURSDAY, mealType: 'dinner', text: 'Tacos' });
    mealPick.clear();
    expect(mealPick.read()).toBeNull();
  });

  it('U-LHOF-02 keeps the three hand-offs independent', () => {
    lastSaved.set({ mealId: 'meal-1', kind: 'deleted' });
    mealPick.set({ date: THURSDAY, mealType: 'lunch', text: 'Soup' });
    const saved = lastSaved.read();
    const pick = mealPick.read();

    newMealName.set('Tacos');
    expect(lastSaved.read()).toBe(saved);
    expect(mealPick.read()).toBe(pick);

    newMealName.clear();
    expect(lastSaved.read()).toBe(saved);
    expect(mealPick.read()).toBe(pick);

    lastSaved.clear();
    expect(mealPick.read()).toBe(pick);
    expect(newMealName.read()).toBeNull();
  });
});
