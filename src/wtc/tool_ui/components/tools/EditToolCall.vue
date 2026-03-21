<template>
  <ToolCard title="Edit" :subtitle="record.displayName">
    <template #actions>
      <div class="actions">
        <RollbackButton :record="record" />
        <button type="button" class="menu_button interactable WtcToolUiButton" @click="wrap = !wrap">
          {{ wrap ? '关闭换行' : '软换行' }}
        </button>
        <button
          type="button"
          class="menu_button interactable WtcToolUiButton"
          @click="layout = layout === 'unified' ? 'split' : 'unified'"
        >
          {{ layout === 'unified' ? 'Split' : 'Unified' }}
        </button>
      </div>
    </template>
    <template #summary>
      <span class="toolchip"><code>{{ filePath }}</code></span>
      <span class="toolchip">replace_all: {{ replaceAll ? 'true' : 'false' }}</span>
    </template>
    <ErrorCard v-if="record.error" :error="record.error" />
    <ToolDetails v-else title="差异视图">
      <div v-if="notice" class="notice">{{ notice }}</div>
      <DiffView :patches="patches" :layout="layout" :wrap="wrap" />
    </ToolDetails>
  </ToolCard>
</template>

<script setup lang="ts">
import type { ToolCallRecord } from '@/wtc/tool_ui/types';
import DiffView from '@/wtc/tool_ui/components/shared/DiffView.vue';
import ErrorCard from '@/wtc/tool_ui/components/shared/ErrorCard.vue';
import RollbackButton from '@/wtc/tool_ui/components/shared/RollbackButton.vue';
import ToolCard from '@/wtc/tool_ui/components/shared/ToolCard.vue';
import ToolDetails from '@/wtc/tool_ui/components/shared/ToolDetails.vue';

const props = defineProps<{ record: ToolCallRecord }>();
const wrap = ref(false);
const layout = ref<'unified' | 'split'>('unified');

const filePath = computed(() => String(props.record.result?.filePath ?? props.record.parameters.file_path ?? ''));
const replaceAll = computed(() => Boolean(props.record.result?.replaceAll ?? props.record.parameters.replace_all));
const patches = computed(() => (Array.isArray(props.record.result?.structuredPatch) ? props.record.result.structuredPatch : []));
const notice = computed(() => (typeof props.record.result?.originalFileNotice === 'string' ? props.record.result.originalFileNotice : ''));
</script>

<style scoped lang="scss">
.actions {
  display: flex;
  gap: 0.35rem;
  flex: 0 0 auto;
  flex-wrap: nowrap;
}

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

.notice {
  margin-bottom: 0.65rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 14%, transparent);
}
</style>
