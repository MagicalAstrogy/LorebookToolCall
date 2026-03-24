import type { ExtendedNodeKind, Node } from '@/wtc/node_fs/types';

export interface BrowserTreeNode {
  path: string;
  name: string;
  kind: ExtendedNodeKind;
  readable: boolean;
  writable: boolean;
  node: Node;
  expanded: boolean;
  loading: boolean;
  loaded: boolean;
  children: BrowserTreeNode[];
  error: string | null;
}
