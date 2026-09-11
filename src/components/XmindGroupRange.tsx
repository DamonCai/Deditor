import type { Command, Group, Topic } from "../lib/xmind/document";
import { useT } from "../lib/i18n";

export default function XmindGroupRange({
  group,
  owner,
  readonly,
  onCommand,
}: {
  group: Group;
  owner: Topic;
  readonly: boolean;
  onCommand: (command: Command) => void;
}) {
  const t = useT(),
    match = /^\((\d+),(\d+)\)$/.exec(group.range ?? "");
  if(group.range==='master')return <p className="xm-help">{t('xmind.rangeWholeTopic')}</p>;
  if (!match) return null;
  const start = Number(match[1]),
    end = Number(match[2]),
    topics = owner.children?.attached ?? [];
  return (
    <>
      {(["start", "end"] as const).map((which) => {
        const label = t(
          which === "start" ? "xmind.rangeStart" : "xmind.rangeEnd",
        );
        return (
          <label className="xm-field" key={which}>
            {label}
            <select
              disabled={readonly}
              aria-label={label}
              value={which === "start" ? start : end}
              onChange={(e) =>
                onCommand({
                  type: "group-update",
                  parent: owner.id,
                  id: group.id,
                  range: { start, end, [which]: Number(e.target.value) },
                })
              }
            >
              {topics.map((topic, i) => (
                <option
                  key={topic.id}
                  value={i}
                  disabled={which === "start" ? i > end : i < start}
                >
                  {topic.title || t("xmind.topic")}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </>
  );
}
