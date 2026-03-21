<template>
  <ToolCard title="Unknown Tool" :subtitle="record.displayName">
    <template #summary>
      <span class="toolchip">{{ record.name }}</span>
    </template>
    <ToolDetails title="原始 JSON">
      <CodeView :rows="rows" :copy-text-value="record.prettyRaw" wrap />
    </ToolDetails>
  </ToolCard>
</template>

<script setup lang="ts">
import { codeLinesFromText } from '@/wtc/tool_ui/model';
import type { ToolCallRecord } from '@/wtc/tool_ui/types';
import CodeView from '@/wtc/tool_ui/components/shared/CodeView.vue';
import ToolCard from '@/wtc/tool_ui/components/shared/ToolCard.vue';
import ToolDetails from '@/wtc/tool_ui/components/shared/ToolDetails.vue';

const props = defineProps<{ record: ToolCallRecord }>();
const rows = computed(() => codeLinesFromText(props.record.prettyRaw));
</script>

<style scoped lang="scss">
.toolchip {
  display: inline-flex;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}
</style>
