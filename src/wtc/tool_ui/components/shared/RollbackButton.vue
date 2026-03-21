<template>
  <button
    v-if="canShow"
    type="button"
    class="menu_button interactable WtcToolUiButton"
    :disabled="busy || done"
    @click="handleClick"
  >
    {{ label }}
  </button>
</template>

<script setup lang="ts">
import { canRollbackRecord, confirmRollback, executeRollback } from '@/wtc/tool_ui/rollback';
import type { ToolCallRecord } from '@/wtc/tool_ui/types';

const props = defineProps<{
  record: ToolCallRecord;
}>();

const emit = defineEmits<{
  rolledBack: [result: unknown];
}>();

const busy = ref(false);
const done = ref(false);

const canShow = computed(() => canRollbackRecord(props.record));
const label = computed(() => {
  if (busy.value) {
    return '回滚中...';
  }
  if (done.value) {
    return '已回滚';
  }
  return '回滚';
});

async function handleClick() {
  if (busy.value || done.value || !canShow.value) {
    return;
  }

  const confirmed = await confirmRollback(props.record);
  if (!confirmed) {
    return;
  }

  busy.value = true;
  try {
    const result = await executeRollback(props.record);
    done.value = true;
    toastr.success('回滚成功');
    emit('rolledBack', result);
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}
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
</style>
