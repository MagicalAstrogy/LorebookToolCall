<template>
  <div class="WtcFileTreeNode">
    <div
      class="WtcFileTreeNode__row"
      :class="{ 'WtcFileTreeNode__row--selected': selectedPath === node.path }"
      :style="{ paddingLeft: `${depth * 18}px` }"
      @click="emit('select', node)"
    >
      <button
        v-if="node.kind === 'directory'"
        class="WtcFileTreeNode__toggle"
        type="button"
        @click.stop="emit('toggle', node)"
      >
        <i class="fa-solid" :class="node.expanded ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
      </button>
      <span v-else class="WtcFileTreeNode__toggle WtcFileTreeNode__toggle--placeholder"></span>
      <i class="fa-solid WtcFileTreeNode__icon" :class="iconClass(node.kind)"></i>
      <span class="WtcFileTreeNode__name">{{ node.name }}</span>
    </div>
    <div v-if="node.kind === 'directory' && node.expanded" class="WtcFileTreeNode__children">
      <div v-if="node.loading" class="WtcFileTreeNode__hint" :style="{ paddingLeft: `${(depth + 1) * 18}px` }">加载中...</div>
      <div v-else-if="node.error" class="WtcFileTreeNode__hint WtcFileTreeNode__hint--error" :style="{ paddingLeft: `${(depth + 1) * 18}px` }">
        {{ node.error }}
      </div>
      <div v-else-if="node.loaded && node.children.length === 0" class="WtcFileTreeNode__hint" :style="{ paddingLeft: `${(depth + 1) * 18}px` }">
        空目录
      </div>
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :selected-path="selectedPath"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BrowserTreeNode } from '@/wtc/panel/types';

defineOptions({ name: 'FileTreeNode' });

defineProps<{
  node: BrowserTreeNode;
  depth: number;
  selectedPath: string;
}>();

const emit = defineEmits<{
  select: [node: BrowserTreeNode];
  toggle: [node: BrowserTreeNode];
}>();

function iconClass(kind: BrowserTreeNode['kind']) {
  switch (kind) {
    case 'directory':
      return 'fa-folder';
    case 'symlink':
      return 'fa-link';
    case 'file':
      return 'fa-file-lines';
  }
}
</script>

<style scoped>
.WtcFileTreeNode__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding-block: 4px;
  padding-right: 10px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
}

.WtcFileTreeNode__row:hover {
  background: color-mix(in srgb, var(--SmartThemeQuoteColor, #6a8fd7) 12%, transparent);
}

.WtcFileTreeNode__row--selected {
  background: color-mix(in srgb, var(--SmartThemeQuoteColor, #6a8fd7) 22%, transparent);
}

.WtcFileTreeNode__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.WtcFileTreeNode__toggle--placeholder {
  cursor: default;
}

.WtcFileTreeNode__icon {
  width: 14px;
  text-align: center;
  opacity: 0.82;
}

.WtcFileTreeNode__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.WtcFileTreeNode__hint {
  padding-block: 4px;
  color: var(--SmartThemeBodyColor, var(--grey70));
  opacity: 0.82;
}

.WtcFileTreeNode__hint--error {
  color: var(--crimson70, #d24c63);
}
</style>
