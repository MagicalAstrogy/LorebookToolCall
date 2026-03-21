<template>
  <details class="WtcToolUiDetails" :open="open">
    <summary class="WtcToolUiDetails__summary">
      <span>{{ title }}</span>
      <slot name="summary-actions"></slot>
    </summary>
    <div class="WtcToolUiDetails__body">
      <slot></slot>
    </div>
  </details>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    open?: boolean;
  }>(),
  {
    open: true,
  },
);
</script>

<style scoped lang="scss">
.WtcToolUiDetails {
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}

.WtcToolUiDetails__summary {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  cursor: pointer;
  list-style: none;
  padding: 0.72rem 0.9rem;
  font-weight: 600;
}

.WtcToolUiDetails__summary::-webkit-details-marker {
  display: none;
}

.WtcToolUiDetails__body {
  padding: 0 0.75rem 0.75rem;
}
</style>
