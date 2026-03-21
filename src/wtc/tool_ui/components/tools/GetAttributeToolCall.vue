<template>
  <ToolCard title="GetAttribute" :subtitle="record.displayName">
    <template #summary>
      <span class="toolchip"><code>{{ filePath }}</code></span>
    </template>
    <ErrorCard v-if="record.error" :error="record.error" />
    <ToolDetails v-else title="属性结果" :open="false">
      <JsonView :value="attributes" />
    </ToolDetails>
  </ToolCard>
</template>

<script setup lang="ts">
import type { ToolCallRecord } from '@/wtc/tool_ui/types';
import ErrorCard from '@/wtc/tool_ui/components/shared/ErrorCard.vue';
import JsonView from '@/wtc/tool_ui/components/shared/JsonView.vue';
import ToolCard from '@/wtc/tool_ui/components/shared/ToolCard.vue';
import ToolDetails from '@/wtc/tool_ui/components/shared/ToolDetails.vue';

const props = defineProps<{ record: ToolCallRecord }>();
const filePath = computed(() => String(props.record.result?.filePath ?? props.record.parameters.file_path ?? ''));
const attributes = computed(() => props.record.result?.attributes ?? {});
</script>

<style scoped lang="scss">
.toolchip {
  display: inline-flex;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}
</style>
