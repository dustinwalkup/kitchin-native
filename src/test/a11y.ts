import type { screen } from '@testing-library/react-native';
import { type Insets, StyleSheet, type ViewStyle } from 'react-native';

type HostElement = ReturnType<typeof screen.getByRole>;

/** An element's touch target: its size (or minimum size) plus its hitSlop (N11). */
export function touchTarget(element: HostElement): { width: number; height: number } {
  const style: ViewStyle = StyleSheet.flatten(element.props.style) ?? {};
  const hitSlop = element.props.hitSlop as Insets | number | undefined;
  const slop: Insets =
    typeof hitSlop === 'number'
      ? { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop }
      : (hitSlop ?? {});

  return {
    width: Number(style.width ?? style.minWidth ?? 0) + (slop.left ?? 0) + (slop.right ?? 0),
    height: Number(style.height ?? style.minHeight ?? 0) + (slop.top ?? 0) + (slop.bottom ?? 0),
  };
}
