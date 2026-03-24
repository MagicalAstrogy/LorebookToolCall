import { createScriptIdDiv, teleportStyle } from '@util/script';
import { createApp } from 'vue';
import Panel from '@/wtc/panel/Panel.vue';

export function initPanel() {
  const $settings = $('#extensions_settings2');
  if ($settings.length === 0) {
    return () => {};
  }

  const app = createApp(Panel);
  const $app = createScriptIdDiv().appendTo($settings);
  app.mount($app[0]);

  const { destroy: destroyStyle } = teleportStyle();

  return () => {
    app.unmount();
    $app.remove();
    destroyStyle();
  };
}
