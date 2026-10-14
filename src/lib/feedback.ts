import { chooseAction } from "../components/ConfirmDialog";
import { tStatic } from "./i18n";

/** Non-destructive errors use the same queued, themed dialog as confirmations.
 * Callers log the original exception before presenting its localized message. */
export async function showError(message: string): Promise<void> {
  await chooseAction({
    title: tStatic("common.error"),
    message,
    tone: "error",
    buttons: [{ label: tStatic("common.close"), value: "close", primary: true }],
  });
}
