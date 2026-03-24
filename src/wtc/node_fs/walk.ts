import type { DirectoryNode, Node } from '@/wtc/node_fs/types';
import { isDirectoryNode } from '@/wtc/node_fs/types';

/** 从某个目录节点出发，以 DFS 方式递归遍历整棵子树。 */
export async function* walkDirectory(node: DirectoryNode): AsyncIterable<Node> {
  // walk 建立在 list() 之上，按 DFS 递归遍历整棵子树。
  for await (const child of node.list()) {
    yield child;
    if (isDirectoryNode(child)) {
      yield* walkDirectory(child);
    }
  }
}
