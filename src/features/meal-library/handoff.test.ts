import { lastSaved, newMealName, newMealType } from './handoff';

beforeEach(() => {
  newMealName.clear();
  newMealType.clear();
  lastSaved.clear();
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
    newMealType.set('dinner');

    const ids = [saved, lastSaved.read()?.id, newMealType.read()?.id];
    expect(new Set(ids).size).toBe(3);
  });

  it('U-LHOF-02 clear makes read return null', () => {
    newMealType.set('dinner');
    newMealType.clear();
    expect(newMealType.read()).toBeNull();
  });

  it('U-LHOF-02 keeps the three hand-offs independent', () => {
    lastSaved.set({ mealId: 'meal-1', kind: 'deleted' });
    newMealType.set('lunch');
    const saved = lastSaved.read();
    const type = newMealType.read();

    newMealName.set('Tacos');
    expect(lastSaved.read()).toBe(saved);
    expect(newMealType.read()).toBe(type);

    newMealName.clear();
    expect(lastSaved.read()).toBe(saved);
    expect(newMealType.read()).toBe(type);

    lastSaved.clear();
    expect(newMealType.read()).toEqual({ id: expect.any(Number), value: 'lunch' });
    expect(newMealName.read()).toBeNull();
  });
});
