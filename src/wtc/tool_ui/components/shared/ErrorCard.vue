<template>
  <div class="WtcToolUiError">
    <div class="WtcToolUiError__title">
      <strong>{{ error.errorType }}</strong>
      <span>{{ error.message }}</span>
    </div>
    <ul v-if="error.details?.length" class="WtcToolUiError__list">
      <li v-for="(detail, index) in error.details" :key="index">
        <code>{{ detail.path?.join('.') || 'result' }}</code>
        <span>期望 {{ detail.expected }}，实际 {{ detail.received }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { ToolErrorResult } from '@/wtc/result';

defineProps<{
  error: ToolErrorResult;
}>();
</script>

<style scoped lang="scss">
.WtcToolUiError {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.9rem 1rem;
  border-radius: 0.8rem;
  border: 1px solid color-mix(in srgb, var(--preferred) 45%, transparent);
  background: color-mix(in srgb, var(--preferred) 10%, transparent);
}

.WtcToolUiError__title {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.WtcToolUiError__list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-left: 1rem;
  margin: 0;
}
</style>
