<template>
  <div class="WtcDirectoryBrowser">
    <div class="WtcDirectoryBrowser__subtitle">从 `/` 开始按层展开，选中文本文件时在下方预览内容。</div>

    <div class="WtcDirectoryBrowser__body">
      <section class="WtcDirectoryBrowser__pane WtcDirectoryBrowser__pane--tree">
        <div class="WtcDirectoryBrowser__paneTitle">文件树</div>
        <div class="WtcDirectoryBrowser__tree">
          <div v-if="treeError" class="WtcDirectoryBrowser__message WtcDirectoryBrowser__message--error">{{ treeError }}</div>
          <div v-else-if="!rootNode" class="WtcDirectoryBrowser__message">展开后加载目录树。</div>
          <FileTreeNode
            v-else
            :node="rootNode"
            :depth="0"
            :selected-path="selectedPath"
            @select="onSelect"
            @toggle="onToggle"
          />
        </div>
      </section>

      <section class="WtcDirectoryBrowser__pane WtcDirectoryBrowser__pane--preview">
        <div class="WtcDirectoryBrowser__paneTitle">内容</div>
        <div class="WtcDirectoryBrowser__previewPath">{{ preview.path }}</div>

        <div class="WtcDirectoryBrowser__previewBody">
          <div v-if="preview.status === 'loading'" class="WtcDirectoryBrowser__message">读取中...</div>
          <div v-else-if="preview.status === 'error'" class="WtcDirectoryBrowser__message WtcDirectoryBrowser__message--error">
            {{ preview.message }}
          </div>
          <div v-else-if="preview.status === 'text'" class="WtcDirectoryBrowser__previewText">
            <pre>{{ preview.content }}</pre>
          </div>
          <div v-else-if="preview.status === 'directory'" class="WtcDirectoryBrowser__previewMeta">
            <div>{{ preview.summary }}</div>
          </div>
          <div v-else-if="preview.status === 'symlink'" class="WtcDirectoryBrowser__previewMeta">
            <div>这是一个链接节点。</div>
            <div>目标：{{ preview.target }}</div>
          </div>
          <div v-else class="WtcDirectoryBrowser__message">请选择一个节点。</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RootNode } from '@/wtc/node_fs/root_node';
import { resolveNode } from '@/wtc/node_fs/resolve';
import { isDirectoryNode, isSymlinkNode, isTextFileNode, type Node } from '@/wtc/node_fs/types';
import FileTreeNode from '@/wtc/panel/FileTreeNode.vue';
import type { BrowserTreeNode } from '@/wtc/panel/types';
import { ref, watch } from 'vue';

type PreviewState =
  | { status: 'idle'; path: string }
  | { status: 'loading'; path: string }
  | { status: 'error'; path: string; message: string }
  | { status: 'directory'; path: string; summary: string }
  | { status: 'symlink'; path: string; target: string }
  | { status: 'text'; path: string; content: string };

const props = defineProps<{
  active: boolean;
}>();

const rootNode = ref<BrowserTreeNode | null>(null);
const treeError = ref<string | null>(null);
const selectedPath = ref('/');
const preview = ref<PreviewState>({ status: 'idle', path: '/' });

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function compareTreeNode(left: BrowserTreeNode, right: BrowserTreeNode) {
  const order = { directory: 0, symlink: 1, file: 2 } as const;
  const delta = order[left.kind] - order[right.kind];
  if (delta !== 0) {
    return delta;
  }
  return left.name.localeCompare(right.name, 'zh-Hans-CN');
}

async function createBrowserTreeNode(node: Node): Promise<BrowserTreeNode> {
  const stat = await node.stat();
  return {
    path: stat.path,
    name: stat.name,
    kind: stat.kind,
    readable: stat.readable,
    writable: stat.writable,
    node,
    expanded: false,
    loading: false,
    loaded: false,
    children: [],
    error: null,
  };
}

async function ensureRootNode() {
  if (rootNode.value) {
    return rootNode.value;
  }
  const nextRoot = await createBrowserTreeNode(new RootNode());
  rootNode.value = nextRoot;
  return nextRoot;
}

async function loadDirectory(target: BrowserTreeNode) {
  if (target.kind !== 'directory' || target.loading) {
    return;
  }

  target.loading = true;
  target.error = null;
  try {
    const resolved = target.path === '/' ? new RootNode() : await resolveNode(target.path);
    if (!resolved || !isDirectoryNode(resolved)) {
      throw new Error(`目录 '${target.path}' 不存在。`);
    }

    target.node = resolved;
    const children: BrowserTreeNode[] = [];
    for await (const child of resolved.list()) {
      children.push(await createBrowserTreeNode(child));
    }
    children.sort(compareTreeNode);

    target.children = children;
    target.loaded = true;
  } catch (error) {
    target.error = toErrorMessage(error);
  } finally {
    target.loading = false;
  }
}

async function ensureModalReady() {
  treeError.value = null;
  try {
    const root = await ensureRootNode();
    if (!root.loaded) {
      await loadDirectory(root);
    }
    if (root.error) {
      throw new Error(root.error);
    }
    await selectNode(root);
  } catch (error) {
    treeError.value = toErrorMessage(error);
  }
}

function permissionText(target: BrowserTreeNode) {
  if (target.readable && target.writable) {
    return '可读 / 可写';
  }
  if (target.readable) {
    return '只读';
  }
  if (target.writable) {
    return '仅可写';
  }
  return '无权限';
}

async function selectNode(target: BrowserTreeNode) {
  selectedPath.value = target.path;
  preview.value = { status: 'loading', path: target.path };

  try {
    const resolved = target.path === '/' ? new RootNode() : await resolveNode(target.path);
    if (!resolved) {
      throw new Error(`节点 '${target.path}' 不存在。`);
    }

    target.node = resolved;
    if (isDirectoryNode(resolved)) {
      if (!target.loaded) {
        await loadDirectory(target);
      }
      if (target.error) {
        throw new Error(target.error);
      }
      preview.value = {
        status: 'directory',
        path: target.path,
        summary: `目录，${target.children.length} 个直接子节点，${permissionText(target)}。`,
      };
      return;
    }

    if (isTextFileNode(resolved)) {
      preview.value = {
        status: 'text',
        path: target.path,
        content: await resolved.read(),
      };
      return;
    }

    if (isSymlinkNode(resolved)) {
      preview.value = {
        status: 'symlink',
        path: target.path,
        target: await resolved.readlink(),
      };
      return;
    }

    preview.value = {
      status: 'error',
      path: target.path,
      message: '当前节点不支持预览。',
    };
  } catch (error) {
    preview.value = {
      status: 'error',
      path: target.path,
      message: toErrorMessage(error),
    };
  }
}

async function onToggle(target: BrowserTreeNode) {
  if (target.kind !== 'directory') {
    return;
  }
  target.expanded = !target.expanded;
  if (target.expanded && !target.loaded) {
    await loadDirectory(target);
  }
}

async function onSelect(target: BrowserTreeNode) {
  await selectNode(target);
}

watch(
  () => props.active,
  active => {
    if (active) {
      void ensureModalReady();
    }
  },
);
</script>

<style scoped>
.WtcDirectoryBrowser {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.WtcDirectoryBrowser__subtitle {
  font-size: 12px;
  opacity: 0.8;
}

.WtcDirectoryBrowser__body {
  display: grid;
  grid-template-rows: 600px 600px;
  border: 1px solid var(--SmartThemeBorderColor, var(--grey5050a));
  border-radius: 16px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--SmartThemeBlurTintColor, #1a1d24) 92%, transparent), color-mix(in srgb, var(--black100, #0f1115) 92%, transparent));
  overflow: hidden;
}

.WtcDirectoryBrowser__pane {
  display: flex;
  flex-direction: column;
  height: 600px;
  max-height: 600px;
  min-height: 0;
  padding: 16px 20px 20px;
}

.WtcDirectoryBrowser__pane--tree {
  border-bottom: 1px solid var(--SmartThemeBorderColor, var(--grey5050a));
}

.WtcDirectoryBrowser__paneTitle {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.72;
}

.WtcDirectoryBrowser__tree,
.WtcDirectoryBrowser__previewBody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  border-radius: 12px;
  background: color-mix(in srgb, var(--black100, #0f1115) 34%, transparent);
  padding: 12px;
}

.WtcDirectoryBrowser__previewText,
.WtcDirectoryBrowser__previewMeta {
  min-height: 100%;
}

.WtcDirectoryBrowser__previewPath {
  margin-bottom: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  opacity: 0.82;
  word-break: break-all;
}

.WtcDirectoryBrowser__previewText pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
}

.WtcDirectoryBrowser__previewMeta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.WtcDirectoryBrowser__message {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  opacity: 0.84;
}

.WtcDirectoryBrowser__message--error {
  color: var(--crimson70, #d24c63);
}
</style>
