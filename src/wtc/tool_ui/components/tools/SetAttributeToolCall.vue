<template>
  <ToolCard title="SetAttribute" :subtitle="record.displayName">
    <template #actions>
      <RollbackButton :record="record" />
    </template>
    <template #summary>
      <span class="toolchip"><code>{{ filePath }}</code></span>
      <span class="toolchip">字段数: {{ changes.length }}</span>
    </template>
    <ErrorCard v-if="record.error" :error="record.error" />
    <template v-else>
      <ToolDetails title="待写入属性">
        <JsonView :value="patch" />
      </ToolDetails>
      <ToolDetails title="变化列表">
        <table class="changetable">
          <thead>
            <tr>
              <th>路径</th>
              <th>旧值</th>
              <th>新值</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="change in changes" :key="change.path">
              <td><code>{{ change.path }}</code></td>
              <td><code>{{ stringify(change.before) }}</code></td>
              <td><code>{{ stringify(change.after) }}</code></td>
            </tr>
          </tbody>
        </table>
      </ToolDetails>
    </template>
  </ToolCard>
</template>

<script setup lang="ts">
import { buildSetAttributeChangeRows, prettyJson } from '@/wtc/tool_ui/model';
import type { ToolCallRecord } from '@/wtc/tool_ui/types';
import ErrorCard from '@/wtc/tool_ui/components/shared/ErrorCard.vue';
import JsonView from '@/wtc/tool_ui/components/shared/JsonView.vue';
import RollbackButton from '@/wtc/tool_ui/components/shared/RollbackButton.vue';
import ToolCard from '@/wtc/tool_ui/components/shared/ToolCard.vue';
import ToolDetails from '@/wtc/tool_ui/components/shared/ToolDetails.vue';

const props = defineProps<{ record: ToolCallRecord }>();

const filePath = computed(() => String(props.record.result?.filePath ?? props.record.parameters.file_path ?? ''));
const patch = computed(() => (props.record.parameters.attributes && typeof props.record.parameters.attributes === 'object' ? props.record.parameters.attributes : {}));
const rollbackPatch = computed(() => (props.record.result?.backup?.rollbackPatch && typeof props.record.result.backup.rollbackPatch === 'object' ? props.record.result.backup.rollbackPatch : undefined));
const attributes = computed(() => (props.record.result?.attributes && typeof props.record.result.attributes === 'object' ? props.record.result.attributes : undefined));
const changes = computed(() => buildSetAttributeChangeRows(patch.value, rollbackPatch.value, attributes.value));

function stringify(value: unknown) {
  return prettyJson(value);
}
</script>

<style scoped lang="scss">
.toolchip {
  display: inline-flex;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}

.changetable {
  width: 100%;
  border-collapse: collapse;
}

.changetable th,
.changetable td {
  padding: 0.45rem 0.5rem;
  text-align: left;
  vertical-align: top;
  border-top: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 12%, transparent);
}

.changetable th {
  border-top: 0;
}
</style>
