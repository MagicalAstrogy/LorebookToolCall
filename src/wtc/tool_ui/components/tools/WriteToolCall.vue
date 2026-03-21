<template>
  <ToolCard title="Write" :subtitle="record.displayName">
    <template #actions>
      <RollbackButton :record="record" />
    </template>
    <template #summary>
      <span class="toolchip"><code>{{ filePath }}</code></span>
      <span class="toolchip">mode: {{ mode }}</span>
    </template>
    <ErrorCard v-if="record.error" :error="record.error" />
    <template v-else>
      <ToolDetails v-if="mode === 'update'" title="旧内容">
        <CodeView :rows="oldRows" :copy-text-value="oldContent" wrap />
      </ToolDetails>
      <ToolDetails :title="mode === 'create' ? '新内容' : '新内容'">
        <CodeView :rows="newRows" :copy-text-value="newContent" wrap />
      </ToolDetails>
    </template>
  </ToolCard>
</template>

<script setup lang="ts">
import { codeLinesFromText } from '@/wtc/tool_ui/model';
import type { ToolCallRecord } from '@/wtc/tool_ui/types';
import CodeView from '@/wtc/tool_ui/components/shared/CodeView.vue';
import ErrorCard from '@/wtc/tool_ui/components/shared/ErrorCard.vue';
import RollbackButton from '@/wtc/tool_ui/components/shared/RollbackButton.vue';
import ToolCard from '@/wtc/tool_ui/components/shared/ToolCard.vue';
import ToolDetails from '@/wtc/tool_ui/components/shared/ToolDetails.vue';

const props = defineProps<{ record: ToolCallRecord }>();

const filePath = computed(() => String(props.record.result?.filePath ?? props.record.parameters.file_path ?? ''));
const mode = computed(() => String(props.record.result?.type ?? 'update'));
const oldContent = computed(() => String(props.record.result?.originalFile ?? ''));
const newContent = computed(() => String(props.record.result?.content ?? props.record.parameters.content ?? ''));
const oldRows = computed(() => codeLinesFromText(oldContent.value));
const newRows = computed(() => codeLinesFromText(newContent.value));
</script>

<style scoped lang="scss">
.toolchip {
  display: inline-flex;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}
</style>
