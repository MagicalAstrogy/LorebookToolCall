<template>
  <CodeView :rows="rows" :wrap="wrap" :copy-text-value="content" />
</template>

<script setup lang="ts">
import { codeLinesFromText, prettyJson } from '@/wtc/tool_ui/model';
import CodeView from '@/wtc/tool_ui/components/shared/CodeView.vue';

const props = withDefaults(
  defineProps<{
    value: unknown;
    wrap?: boolean;
  }>(),
  {
    wrap: true,
  },
);

const content = computed(() => prettyJson(props.value));
const rows = computed(() => codeLinesFromText(content.value));
</script>
