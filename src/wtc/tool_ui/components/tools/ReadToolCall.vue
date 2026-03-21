<template>
  <ToolCard title="Read" :subtitle="record.displayName">
    <template #actions>
      <button type="button" class="menu_button interactable WtcToolUiButton" @click="wrap = !wrap">
        {{ wrap ? '关闭换行' : '软换行' }}
      </button>
    </template>
    <template #summary>
      <span class="toolchip"><code>{{ filePath }}</code></span>
      <span class="toolchip">offset: {{ offset }}</span>
      <span class="toolchip">limit: {{ limitLabel }}</span>
    </template>
    <ErrorCard v-if="record.error" :error="record.error" />
    <ToolDetails v-else title="读取结果" :open="false">
      <CodeView :rows="rows" :wrap="wrap" :copy-text-value="content" />
    </ToolDetails>
  </ToolCard>
</template>

<script setup lang="ts">
import { parseCatNumberedText } from '@/wtc/tool_ui/model';
import type { ToolCallRecord } from '@/wtc/tool_ui/types';
import CodeView from '@/wtc/tool_ui/components/shared/CodeView.vue';
import ErrorCard from '@/wtc/tool_ui/components/shared/ErrorCard.vue';
import ToolCard from '@/wtc/tool_ui/components/shared/ToolCard.vue';
import ToolDetails from '@/wtc/tool_ui/components/shared/ToolDetails.vue';

const props = defineProps<{ record: ToolCallRecord }>();
const wrap = ref(false);

const filePath = computed(() => String(props.record.parameters.file_path ?? props.record.result?.file?.filePath ?? ''));
const offset = computed(() => Number(props.record.parameters.offset ?? 0));
const limitLabel = computed(() => props.record.parameters.limit ?? 'all');
const content = computed(() => String(props.record.result?.file?.content ?? ''));
const rows = computed(() => parseCatNumberedText(content.value));
</script>

<style scoped lang="scss">
.WtcToolUiButton {
  flex: 0 0 auto;
  min-width: max-content;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.toolchip {
  display: inline-flex;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}
</style>
