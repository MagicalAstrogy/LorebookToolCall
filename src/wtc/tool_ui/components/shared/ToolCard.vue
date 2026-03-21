<template>
  <section class="WtcToolUiCard">
    <header class="WtcToolUiCard__header">
      <div class="WtcToolUiCard__titleBlock">
        <span class="WtcToolUiCard__title">{{ title }}</span>
        <span v-if="subtitle" class="WtcToolUiCard__subtitle">{{ subtitle }}</span>
      </div>
      <slot name="actions"></slot>
    </header>
    <div v-if="$slots.summary" class="WtcToolUiCard__summary">
      <slot name="summary"></slot>
    </div>
    <div class="WtcToolUiCard__body">
      <slot></slot>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<style scoped lang="scss">
.WtcToolUiCard {
  border-radius: 0.95rem;
  border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 42%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--SmartThemeBlurTintColor) 84%, transparent),
      color-mix(in srgb, var(--black30a) 70%, transparent)
    );
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent),
    0 16px 36px color-mix(in srgb, var(--SmartThemeShadowColor) 36%, transparent);
  overflow: hidden;
}

.WtcToolUiCard__header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem 1rem 0.7rem;
  border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}

.WtcToolUiCard__titleBlock {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.WtcToolUiCard__title {
  font-weight: 700;
  line-height: 1.2;
}

.WtcToolUiCard__subtitle {
  font-size: 0.82em;
  opacity: 0.72;
  overflow-wrap: anywhere;
}

.WtcToolUiCard__summary,
.WtcToolUiCard__body {
  padding: 0.85rem 1rem 1rem;
}

.WtcToolUiCard__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding-bottom: 0;
}
</style>
