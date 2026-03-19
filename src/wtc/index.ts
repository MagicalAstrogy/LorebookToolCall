import { registerLorebookTools } from '@/wtc/tool_registry';

$(() => {
  const stopList: Array<() => void> = [];
  stopList.push(registerLorebookTools());

  $(window).on('pagehide', () => {
    stopList.forEach(stop => stop());
  });
});
