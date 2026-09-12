import { invoke } from "@tauri-apps/api/core";
import { isAbsolutePath } from "./pathUtil";
export function saveMarkdownImage(base: string, name: string, data: string, folder: string) {
  return isAbsolutePath(folder)
    ? invoke<string>("save_image_to_directory", { directory: folder, name, data })
    : invoke<string>("save_image", { dir: base, name, data, folder });
}
