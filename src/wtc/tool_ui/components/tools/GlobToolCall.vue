<template>
  <ToolCard title="Glob" :subtitle="record.displayName">
    <template #summary>
      <span class="toolchip">在 {{ basePath }} 下搜索 {{ pattern }}</span>
    </template>
    <ErrorCard v-if="record.error" :error="record.error" />
    <ToolDetails v-else title="匹配结果">
      <ul class="toollist">
        <li v-for="filename in filenames" :key="filename"><code>{{ filename }}</code></li>
      </ul>
    </ToolDetails>
  </ToolCard>
</template>

<script setup lang="ts">
import type { ToolCallRecord } from '@/wtc/tool_ui/types';
import ErrorCard from '@/wtc/tool_ui/components/shared/ErrorCard.vue';
import ToolCard from '@/wtc/tool_ui/components/shared/ToolCard.vue';
import ToolDetails from '@/wtc/tool_ui/components/shared/ToolDetails.vue';

const props = defineProps<{ record: ToolCallRecord }>();

const basePath = computed(() => String(props.record.parameters.path ?? '/'));
const pattern = computed(() => String(props.record.parameters.pattern ?? '*'));
const filenames = computed(() => Array.isArray(props.record.result?.filenames) ? props.record.result.filenames : []);
</script>

<style scoped lang="scss">
.toolchip {
  display: inline-flex;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}

.toollist {
  margin: 0;
  padding-left: 1rem;
}
</style>
