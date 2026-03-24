<template>
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>WTC 权限</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="WtcPermissionPanel">
        <div class="WtcPermissionPanel__toolbar">
          <div>
            <div class="WtcPermissionPanel__title">当前会话已授权</div>
            <div class="WtcPermissionPanel__subtitle">只显示已缓存的授权范围和当前最高权限。</div>
          </div>
        </div>

        <div v-if="permissions.length === 0" class="WtcPermissionPanel__empty">当前会话还没有记录到持久授权。</div>
        <div v-else class="WtcPermissionPanel__list">
          <div v-for="permission in permissions" :key="permission.cacheKey" class="WtcPermissionPanel__item">
            <div class="WtcPermissionPanel__path">{{ permission.displayPath }}</div>
            <div class="WtcPermissionPanel__meta">{{ permissionLevelText(permission.level) }}</div>
          </div>
        </div>

        <details class="WtcPermissionPanel__directory" @toggle="onDirectoryToggle">
          <summary class="WtcPermissionPanel__directorySummary">目录查看</summary>
          <div class="WtcPermissionPanel__directoryBody">
            <PermissionDirectoryBrowser :active="isDirectoryBrowserOpen" />
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PermissionDirectoryBrowser from '@/wtc/panel/PermissionDirectoryBrowser.vue';
import { grantedPermissions, permissionLevelText } from '@/wtc/permission';
import { computed, ref } from 'vue';

const permissions = computed(() => [...grantedPermissions]);
const isDirectoryBrowserOpen = ref(false);

function onDirectoryToggle(event: Event) {
  isDirectoryBrowserOpen.value = (event.currentTarget as HTMLDetailsElement | null)?.open === true;
}
</script>

<style scoped>
.WtcPermissionPanel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 0;
}

.WtcPermissionPanel__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.WtcPermissionPanel__title {
  font-size: 14px;
  font-weight: 700;
}

.WtcPermissionPanel__subtitle {
  margin-top: 2px;
  font-size: 12px;
  opacity: 0.76;
}

.WtcPermissionPanel__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.WtcPermissionPanel__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--SmartThemeBorderColor, var(--grey5050a));
  border-radius: 12px;
  background: color-mix(in srgb, var(--black100, #0f1115) 18%, transparent);
}

.WtcPermissionPanel__path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.WtcPermissionPanel__meta {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--SmartThemeQuoteColor, #6a8fd7) 18%, transparent);
  font-size: 12px;
  font-weight: 700;
}

.WtcPermissionPanel__empty {
  padding: 14px 12px;
  border: 1px dashed var(--SmartThemeBorderColor, var(--grey5050a));
  border-radius: 12px;
  opacity: 0.8;
}

.WtcPermissionPanel__directory {
  border: 1px solid var(--SmartThemeBorderColor, var(--grey5050a));
  border-radius: 12px;
  background: color-mix(in srgb, var(--black100, #0f1115) 14%, transparent);
  overflow: hidden;
}

.WtcPermissionPanel__directorySummary {
  padding: 12px 14px;
  cursor: pointer;
  font-weight: 700;
  user-select: none;
}

.WtcPermissionPanel__directoryBody {
  padding: 0 14px 14px;
}

@media (max-width: 700px) {
  .WtcPermissionPanel__toolbar,
  .WtcPermissionPanel__item {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
