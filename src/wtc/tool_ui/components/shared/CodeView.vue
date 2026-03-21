<template>
  <div class="WtcToolUiCode">
    <div class="WtcToolUiCode__toolbar">
      <span class="WtcToolUiCode__meta">{{ rows.length }} 行</span>
      <button v-if="copyTextValue" type="button" class="menu_button interactable WtcToolUiButton" @click="copyBlock">
        复制
      </button>
    </div>
    <div class="WtcToolUiCode__scroll">
      <div class="WtcToolUiCode__table" :class="{ 'WtcToolUiCode__table--wrap': wrap }">
        <div v-for="(row, index) in rows" :key="index" class="WtcToolUiCode__row" :class="`is-${row.kind ?? 'plain'}`">
          <div class="WtcToolUiCode__lineNo">{{ row.lineNumber ?? '' }}</div>
          <pre class="WtcToolUiCode__content">{{ row.content }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { copyText } from '@/wtc/tool_ui/model';
import type { CodeLine } from '@/wtc/tool_ui/types';

const props = withDefaults(
  defineProps<{
    rows: CodeLine[];
    wrap?: boolean;
    copyTextValue?: string;
  }>(),
  {
    wrap: false,
    copyTextValue: '',
  },
);

function copyBlock() {
  copyText(props.copyTextValue);
}
</script>

<style scoped lang="scss">
.WtcToolUiCode {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.WtcToolUiCode__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}

.WtcToolUiCode__meta {
  font-size: 0.82em;
  opacity: 0.72;
  min-width: 0;
}

.WtcToolUiButton {
  flex: 0 0 auto;
  min-width: max-content;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.WtcToolUiCode__scroll {
  overflow-x: auto;
}

.WtcToolUiCode__table {
  min-width: 100%;
  border-radius: 0.7rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}

.WtcToolUiCode__row {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  align-items: center;
  line-height: calc(var(--mainFontSize) + 0.2rem);
}

.WtcToolUiCode__lineNo {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 0.65rem;
  user-select: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85em;
  opacity: 0.62;
  border-right: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent);
}

.WtcToolUiCode__content {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0 0.65rem;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
  line-height: calc(var(--mainFontSize) + 0.5rem);
  overflow-wrap: normal;
}

.WtcToolUiCode__table--wrap .WtcToolUiCode__content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.is-match {
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 14%, transparent);
}

.is-add {
  background: color-mix(in srgb, var(--active) 16%, transparent);
}

.is-remove {
  background: color-mix(in srgb, var(--preferred) 14%, transparent);
}

.is-meta {
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}
</style>
