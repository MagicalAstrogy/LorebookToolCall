<template>
  <div class="WtcToolUiDiff">
    <div v-if="layout === 'unified'" class="WtcToolUiDiff__scroll">
      <div class="WtcToolUiDiff__table" :class="{ 'WtcToolUiDiff__table--wrap': wrap }">
        <div v-for="(row, index) in unifiedRows" :key="index" class="WtcToolUiDiff__row" :class="`is-${row.kind}`">
          <div class="WtcToolUiDiff__lineNo">{{ row.oldLineNumber ?? '' }}</div>
          <div class="WtcToolUiDiff__lineNo">{{ row.newLineNumber ?? '' }}</div>
          <pre class="WtcToolUiDiff__content">{{ row.kind === 'meta' ? row.content : `${prefixFor(row.kind)}${row.content}` }}</pre>
        </div>
      </div>
    </div>
    <div v-else class="WtcToolUiDiff__scroll">
      <div class="WtcToolUiDiff__split" :class="{ 'WtcToolUiDiff__split--wrap': wrap }">
        <div v-for="(row, index) in splitRows" :key="index" class="WtcToolUiDiff__splitRow" :class="`is-${row.kind}`">
          <template v-if="row.kind === 'meta'">
            <div class="WtcToolUiDiff__meta">{{ row.meta }}</div>
          </template>
          <template v-else>
            <div class="WtcToolUiDiff__cell" :class="`is-${row.left?.kind ?? 'empty'}`">
              <div class="WtcToolUiDiff__lineNo">{{ row.left?.lineNumber ?? '' }}</div>
              <pre class="WtcToolUiDiff__content">{{ row.left?.content ?? '' }}</pre>
            </div>
            <div class="WtcToolUiDiff__cell" :class="`is-${row.right?.kind ?? 'empty'}`">
              <div class="WtcToolUiDiff__lineNo">{{ row.right?.lineNumber ?? '' }}</div>
              <pre class="WtcToolUiDiff__content">{{ row.right?.content ?? '' }}</pre>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DiffSplitRow, DiffUnifiedRow, StructuredPatchLike } from '@/wtc/tool_ui/types';

const props = withDefaults(
  defineProps<{
    patches: StructuredPatchLike[];
    layout?: 'unified' | 'split';
    wrap?: boolean;
  }>(),
  {
    layout: 'unified',
    wrap: false,
  },
);

function prefixFor(kind: DiffUnifiedRow['kind']) {
  if (kind === 'add') return '+';
  if (kind === 'remove') return '-';
  if (kind === 'context') return ' ';
  return '';
}

const unifiedRows = computed<DiffUnifiedRow[]>(() => {
  const rows: DiffUnifiedRow[] = [];

  for (const patch of props.patches ?? []) {
    rows.push({
      kind: 'meta',
      content: `@@ -${patch.oldStart},${patch.oldLines} +${patch.newStart},${patch.newLines} @@`,
    });

    let oldCursor = patch.oldStart;
    let newCursor = patch.newStart;

    for (const line of patch.lines) {
      const prefix = line[0];
      const content = line.slice(1);
      if (prefix === ' ') {
        rows.push({ kind: 'context', oldLineNumber: oldCursor, newLineNumber: newCursor, content });
        oldCursor += 1;
        newCursor += 1;
      } else if (prefix === '-') {
        rows.push({ kind: 'remove', oldLineNumber: oldCursor, content });
        oldCursor += 1;
      } else if (prefix === '+') {
        rows.push({ kind: 'add', newLineNumber: newCursor, content });
        newCursor += 1;
      }
    }
  }

  return rows;
});

const splitRows = computed<DiffSplitRow[]>(() => {
  const rows: DiffSplitRow[] = [];

  for (const patch of props.patches ?? []) {
    rows.push({
      kind: 'meta',
      meta: `@@ -${patch.oldStart},${patch.oldLines} +${patch.newStart},${patch.newLines} @@`,
    });

    let oldCursor = patch.oldStart;
    let newCursor = patch.newStart;
    let pendingLeft: DiffSplitRow['left'][] = [];
    let pendingRight: DiffSplitRow['right'][] = [];

    const flushChanges = () => {
      // split 视图按“删除/新增块”配对展开，长度不一致时用空白占位补齐两侧。
      const rowCount = Math.max(pendingLeft.length, pendingRight.length);
      for (let index = 0; index < rowCount; index += 1) {
        rows.push({
          kind: 'change',
          left:
            pendingLeft[index] ??
            ({
              kind: 'empty',
              content: '',
            } as const),
          right:
            pendingRight[index] ??
            ({
              kind: 'empty',
              content: '',
            } as const),
        });
      }
      pendingLeft = [];
      pendingRight = [];
    };

    for (const line of patch.lines) {
      const prefix = line[0];
      const content = line.slice(1);

      if (prefix === ' ') {
        flushChanges();
        rows.push({
          kind: 'context',
          left: { kind: 'context', lineNumber: oldCursor, content },
          right: { kind: 'context', lineNumber: newCursor, content },
        });
        oldCursor += 1;
        newCursor += 1;
      } else if (prefix === '-') {
        pendingLeft.push({ kind: 'remove', lineNumber: oldCursor, content });
        oldCursor += 1;
      } else if (prefix === '+') {
        pendingRight.push({ kind: 'add', lineNumber: newCursor, content });
        newCursor += 1;
      }
    }

    flushChanges();
  }

  return rows;
});
</script>

<style scoped lang="scss">
.WtcToolUiDiff {
  overflow: hidden;
}

.WtcToolUiDiff__scroll {
  overflow-x: auto;
}

.WtcToolUiDiff__table,
.WtcToolUiDiff__split {
  min-width: 100%;
  border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
  border-radius: 0.7rem;
  overflow: hidden;
}

.WtcToolUiDiff__row {
  display: grid;
  grid-template-columns: 4rem 4rem minmax(0, 1fr);
  align-items: center;
}

.WtcToolUiDiff__lineNo {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 0.55rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85em;
  opacity: 0.62;
  border-right: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent);
}

.WtcToolUiDiff__content {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0 0.65rem;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
  line-height: calc(var(--mainFontSize) + 0.5rem);
}

.WtcToolUiDiff__table--wrap .WtcToolUiDiff__content,
.WtcToolUiDiff__split--wrap .WtcToolUiDiff__content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.WtcToolUiDiff__splitRow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.WtcToolUiDiff__cell {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  align-items: center;
}

.WtcToolUiDiff__cell + .WtcToolUiDiff__cell {
  border-left: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent);
}

.WtcToolUiDiff__meta {
  grid-column: 1 / -1;
  padding: 0 0.65rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

.is-meta {
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}

.is-add {
  background: color-mix(in srgb, var(--active) 16%, transparent);
}

.is-remove {
  background: color-mix(in srgb, var(--preferred) 14%, transparent);
}

.WtcToolUiDiff__cell.is-add {
  background: color-mix(in srgb, var(--active) 16%, transparent);
}

.WtcToolUiDiff__cell.is-remove {
  background: color-mix(in srgb, var(--preferred) 14%, transparent);
}

.WtcToolUiDiff__cell.is-empty {
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 5%, transparent);
}
</style>
