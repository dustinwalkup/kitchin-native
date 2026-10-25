import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';

import { EMPTY_STATE } from '../constants';

// What Groceries shows in place of the list when it has no items to draw (§3.4).

/** Loading failed with nothing loaded yet (R4.10). */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      testID="load-error"
      symbol="exclamationmark.triangle"
      title="Couldn't load groceries"
    >
      <Button label="Retry" onPress={onRetry} />
    </EmptyState>
  );
}

/** Offline before the first load: the fetch waits for the connection (R13.1). */
export function WaitingForConnection() {
  return (
    <EmptyState
      testID="waiting-for-connection"
      symbol="wifi.slash"
      title="Waiting for connection…"
    />
  );
}

/** No items yet (R4.8), with a button that opens the add-item sheet. */
export function GroceriesEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      testID="groceries-empty"
      emoji="🧺"
      title={EMPTY_STATE.title}
      description={EMPTY_STATE.description}
    >
      <Button label="Add an item" onPress={onAdd} />
    </EmptyState>
  );
}
