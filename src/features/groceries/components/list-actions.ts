import { Alert } from 'react-native';

// Uncheck all and Clear checked, from the progress panel (specs/redesign/design.md §4.1), each behind
// the native confirmation it has always had.

/**
 * Removes every checked item after a native confirmation that states how many (R10.2). Cancel
 * changes nothing (R10.5).
 */
export function confirmClearChecked(checkedCount: number, onClear: () => void): void {
  const items = checkedCount === 1 ? 'item' : 'items';
  Alert.alert(`Clear ${checkedCount} checked ${items}?`, "They'll be removed from the list.", [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: onClear },
  ]);
}

/**
 * Puts checked items back on the list, for the ones bought every week, after a native confirmation
 * that states how many (R10.8). Cancel changes nothing.
 */
export function confirmUncheckAll(uncheckCount: number, onUncheck: () => void): void {
  const items = uncheckCount === 1 ? 'item' : 'items';
  Alert.alert(`Uncheck ${uncheckCount} ${items}?`, "They'll go back on the list to buy again.", [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Uncheck', onPress: onUncheck },
  ]);
}
