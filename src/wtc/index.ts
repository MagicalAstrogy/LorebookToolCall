import { registerLorebookTools } from '@/wtc/tool_registry';
import { initHooks } from '@/wtc/hooks';

$(() => {
  const stopList: Array<() => void> = [];
  // 页面初始化时注册全部工具，并在页面卸载时统一撤销注册与权限缓存。
  stopList.push(registerLorebookTools());
  stopList.push(initHooks());

  $(window).on('pagehide', () => {
    stopList.forEach(stop => stop());
  });
});
