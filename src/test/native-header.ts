import { screen } from '@testing-library/react-native';

interface HostNode {
  type: unknown;
  props: Record<string, unknown>;
  children: (HostNode | string)[];
}

/**
 * What each mounted native-stack screen hands react-native-screens for its header, such as `title`
 * and `backTitle`, in tree order, which nested stacks make different from stack order. Jest draws
 * no native header, so a stack screen's title can't be found as text.
 */
export function nativeHeaders(
  node = screen.root as unknown as HostNode,
): Record<string, unknown>[] {
  const own = node.type === 'RNSScreenStackHeaderConfig' ? [node.props] : [];
  return [
    ...own,
    ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nativeHeaders(child))),
  ];
}
