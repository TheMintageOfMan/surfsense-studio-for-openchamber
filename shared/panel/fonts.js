// Studio's font inside the panel. The panel runs in a sandboxed frame with an opaque origin, so
// fetching font files is a cross-origin request the host does not allow. The two Inter faces are
// bundled into the panel script instead and used as data: URLs (allowed by the host's font-src)
// for the panel, the sandboxed previews and pictures drawn for saving.
import regular from '../fonts/Inter-Regular.woff2';
import bold from '../fonts/Inter-Bold.woff2';
import { fontFaceCss } from '../common/font.mjs';

const css = fontFaceCss({ regular, bold });
export const inlineFontCss = () => css;

export function installPanelFont() {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.prepend(style);
}
