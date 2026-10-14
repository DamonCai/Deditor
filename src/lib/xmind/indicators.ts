import type { Topic } from "./document";

export interface TopicIndicator {
  kind:
    | "priority"
    | "task"
    | "star"
    | "flag"
    | "marker"
    | "notes"
    | "link";
  color?: string;
  value?: number;
}
const colors: Record<string, string> = {
  red: "#e05252",
  orange: "#dc861d",
  yellow: "#ba9000",
  green: "#32a57c",
  blue: "#477ee8",
  purple: "#9463d1",
  black: "#475569",
  gray: "#64748b",
};
const progress: Record<string, number> = {
  start: 0,
  oct: 1 / 8,
  quarter: 1 / 4,
  "3oct": 3 / 8,
  half: 1 / 2,
  "5oct": 5 / 8,
  "3quar": 3 / 4,
  "7oct": 7 / 8,
  done: 1,
};

/** Presentation data only. Raw marker IDs stay in the document for round trips. */
export function topicIndicators(topic: Topic): TopicIndicator[] {
  const icons: TopicIndicator[] = (topic.markers ?? []).map(
    ({ markerId }) => {
      const priority = /^priority-([1-9])$/.exec(markerId);
      if (priority)
        return { kind: "priority", value: +priority[1], color: "#df5555" };
      const task = /^task-(.+)$/.exec(markerId);
      if (task && Object.prototype.hasOwnProperty.call(progress, task[1]))
        return {
          kind: "task",
          value: progress[task[1]],
          color: "#32a57c",
        };
      const colored =
        /^(star|flag)-(red|orange|yellow|green|blue|purple|black|gray)$/.exec(
          markerId,
        );
      if (colored)
        return {
          kind: colored[1] as "star" | "flag",
          color: colors[colored[2]],
        };
      return { kind: "marker" };
    },
  );
  if (topic.notes) icons.push({ kind: "notes" });
  if (topic.href) icons.push({ kind: "link" });
  return icons;
}
