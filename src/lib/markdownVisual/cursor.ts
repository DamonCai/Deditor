import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import { createVirtualCursor } from "prosemirror-virtual-cursor";

/** Keep mark-boundary navigation while the browser draws its native caret.
 * The virtual caret forces layout to restart its animation on every input and
 * selection change. Native drawing leaves composition caret ownership to the IME.
 */
export const nativeMarkdownCursor = $prose(() => {
  const affinity = createVirtualCursor({ skipWarning: true });
  return new Plugin({ props: { handleKeyDown: affinity.props.handleKeyDown } });
});
