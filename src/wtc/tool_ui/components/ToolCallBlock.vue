<template>
  <div class="WtcToolUiBlock">
    <component
      :is="resolveComponent(record.kind)"
      v-for="record in block.records"
      :key="record.key"
      :record="record"
    />
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import type { ToolCallBlockModel, ToolCallRecord } from '@/wtc/tool_ui/types';
import DeleteToolCall from '@/wtc/tool_ui/components/tools/DeleteToolCall.vue';
import EditToolCall from '@/wtc/tool_ui/components/tools/EditToolCall.vue';
import GetAttributeToolCall from '@/wtc/tool_ui/components/tools/GetAttributeToolCall.vue';
import GlobToolCall from '@/wtc/tool_ui/components/tools/GlobToolCall.vue';
import GrepToolCall from '@/wtc/tool_ui/components/tools/GrepToolCall.vue';
import ReadToolCall from '@/wtc/tool_ui/components/tools/ReadToolCall.vue';
import SetAttributeToolCall from '@/wtc/tool_ui/components/tools/SetAttributeToolCall.vue';
import UnknownToolCall from '@/wtc/tool_ui/components/tools/UnknownToolCall.vue';
import WriteToolCall from '@/wtc/tool_ui/components/tools/WriteToolCall.vue';

defineProps<{
  block: ToolCallBlockModel;
}>();

const componentMap: Record<ToolCallRecord['kind'], Component> = {
  Glob: GlobToolCall,
  Grep: GrepToolCall,
  Read: ReadToolCall,
  Write: WriteToolCall,
  Edit: EditToolCall,
  Delete: DeleteToolCall,
  GetAttribute: GetAttributeToolCall,
  SetAttribute: SetAttributeToolCall,
  unknown: UnknownToolCall,
};

function resolveComponent(kind: ToolCallRecord['kind']) {
  return componentMap[kind] ?? UnknownToolCall;
}
</script>

<style scoped lang="scss">
.WtcToolUiBlock {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.25rem;
}
</style>
