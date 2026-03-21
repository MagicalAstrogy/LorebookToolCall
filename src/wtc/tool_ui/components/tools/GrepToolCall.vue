<template>
  <ToolCard title="Grep" :subtitle="record.displayName">
    <template #summary>
      <span class="toolchip"><code>{{ path }}</code></span>
      <span class="toolchip">pattern: {{ pattern }}</span>
      <span v-if="glob" class="toolchip">glob: {{ glob }}</span>
      <span v-if="typeName" class="toolchip">type: {{ typeName }}</span>
      <span class="toolchip">mode: {{ mode }}</span>
    </template>
    <ErrorCard v-if="record.error" :error="record.error" />
    <template v-else>
      <ToolDetails v-if="mode === 'files_with_matches'" title="匹配文件">
        <ul class="toollist">
          <li v-for="filename in filenames" :key="filename"><code>{{ filename }}</code></li>
        </ul>
      </ToolDetails>
      <ToolDetails v-else-if="mode === 'count'" title="计数结果">
        <CodeView :rows="countRows" :copy-text-value="countText" wrap />
      </ToolDetails>
      <ToolDetails v-else title="匹配内容">
        <div class="groupstack">
          <section v-for="group in groups" :key="group.filePath" class="groupcard">
            <div class="groupcard__title"><code>{{ group.filePath }}</code></div>
            <CodeView :rows="group.rows" :copy-text-value="group.rows.map(row => row.content).join('\n')" />
          </section>
        </div>
      </ToolDetails>
    </template>
  </ToolCard>
</template>

<script setup lang="ts">
import { codeLinesFromText, parseGrepContent } from '@/wtc/tool_ui/model';
import type { ToolCallRecord } from '@/wtc/tool_ui/types';
import CodeView from '@/wtc/tool_ui/components/shared/CodeView.vue';
import ErrorCard from '@/wtc/tool_ui/components/shared/ErrorCard.vue';
import ToolCard from '@/wtc/tool_ui/components/shared/ToolCard.vue';
import ToolDetails from '@/wtc/tool_ui/components/shared/ToolDetails.vue';

const props = defineProps<{ record: ToolCallRecord }>();

const path = computed(() => String(props.record.parameters.path ?? '/'));
const pattern = computed(() => String(props.record.parameters.pattern ?? ''));
const glob = computed(() => props.record.parameters.glob ? String(props.record.parameters.glob) : '');
const typeName = computed(() => props.record.parameters.type ? String(props.record.parameters.type) : '');
const mode = computed(() => String(props.record.result?.mode ?? props.record.parameters.output_mode ?? 'files_with_matches'));
const filenames = computed(() => Array.isArray(props.record.result?.filenames) ? props.record.result.filenames : []);
const countText = computed(() => String(props.record.result?.content ?? ''));
const countRows = computed(() => codeLinesFromText(countText.value));
const groups = computed(() => parseGrepContent(String(props.record.result?.content ?? '')));
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

.groupstack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.groupcard {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.groupcard__title {
  font-weight: 600;
}
</style>
