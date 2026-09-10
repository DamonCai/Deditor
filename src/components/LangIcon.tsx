import { fileIconUrl, getFileIcon } from "../lib/fileIcons";

interface Props {
  filePath: string;
  size?: number;
}

export default function LangIcon({ filePath, size = 16 }: Props) {
  const icon = getFileIcon(filePath);
  const themed = icon.lightId !== icon.id;
  return (
    <span className="file-type-icon" title={icon.label} aria-hidden="true"
      data-file-icon={icon.id} style={{ width: size, height: size }}>
      <img src={fileIconUrl(icon.lightId)} alt="" draggable={false}
        className={themed ? "file-type-icon__light" : undefined} width={size} height={size} />
      {themed && <img src={fileIconUrl(icon.id)} alt="" draggable={false}
        className="file-type-icon__dark" width={size} height={size} />}
    </span>
  );
}
