import type { Command, Relationship, Sheet } from "../lib/xmind/document";
import { walkTopics } from "../lib/xmind/document";
import { relationshipStyle } from "../lib/xmind/relationship";
import { ARROW_SHAPES, RELATIONSHIP_SHAPES } from "../lib/xmind/arrows";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";

export default function XmindRelationshipInspector({
  sheet,
  relation,
  readonly,
  onCommand,
}: {
  sheet: Sheet;
  relation: Relationship;
  readonly: boolean;
  onCommand: (command: Command) => void;
}) {
  const t = useT(),
    p = relationshipStyle(sheet, relation),
    topics: { id: string; title: string }[] = [];
  walkTopics(sheet.rootTopic, (topic) =>
    topics.push({ id: topic.id, title: topic.title }),
  );
  const update = (properties: Record<string, string>) =>
    onCommand({ type: "relationship-update", id: relation.id, properties });
  const choice = (
    label: string,
    key: string,
    values: readonly string[],
    prefix: string,
    fallback: string,
    labels: string,
  ) => {
    const value = p[key] ?? fallback;
    return (
      <label className="xm-field">
        {label}
        <select
          aria-label={label}
          disabled={readonly}
          value={value}
          onChange={(e) => update({ [key]: e.target.value })}
        >
          {!values.some((v) => prefix + v === value) && (
            <option value={value}>{t("xmind.originalStyle")}</option>
          )}
          {values.map((v) => (
            <option key={v} value={prefix + v}>
              {t(`${labels}.${v}`)}
            </option>
          ))}
        </select>
      </label>
    );
  };
  return (
    <>
      <div className="xm-panel-section">{t("xmind.relationship")}</div>
      <label className="xm-field">
        {t("xmind.relationshipText")}
        <input
          key={`${relation.id}-${relation.title}`}
          aria-label={t("xmind.relationshipText")}
          defaultValue={relation.title ?? ""}
          disabled={readonly}
          onBlur={(e) => {
            if (e.target.value !== (relation.title ?? ""))
              onCommand({
                type: "relationship-update",
                id: relation.id,
                title: e.target.value,
              });
          }}
        />
      </label>
      {([0, 1] as const).map((end) => {
        const value = end === 0 ? relation.end1Id : relation.end2Id,
          other = end === 0 ? relation.end2Id : relation.end1Id;
        const label = t(end === 0 ? "xmind.startTopic" : "xmind.endTopic");
        return (
          <label className="xm-field" key={end}>
            {label}
            <select
              aria-label={label}
              disabled={readonly}
              value={value}
              onChange={(e) =>
                onCommand({
                  type: "relationship-reconnect",
                  id: relation.id,
                  end,
                  topicId: e.target.value,
                })
              }
            >
              {topics
                .filter((topic) => topic.id !== other)
                .map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title || t("xmind.topic")}
                  </option>
                ))}
            </select>
          </label>
        );
      })}
      {choice(
        t("xmind.shape"),
        "shape-class",
        RELATIONSHIP_SHAPES,
        "org.xmind.relationshipShape.",
        "org.xmind.relationshipShape.curved",
        "xmind.relationshipShape",
      )}
      {choice(
        t("xmind.startArrow"),
        "arrow-begin-class",
        ARROW_SHAPES,
        "org.xmind.arrowShape.",
        "org.xmind.arrowShape.none",
        "xmind.arrow",
      )}
      {choice(
        t("xmind.endArrow"),
        "arrow-end-class",
        ARROW_SHAPES,
        "org.xmind.arrowShape.",
        "org.xmind.arrowShape.herringbone",
        "xmind.arrow",
      )}
      {choice(
        t("xmind.linePattern"),
        "line-pattern",
        ["solid", "dash", "dot", "dash-dot"],
        "",
        "dash",
        "xmind.linePattern",
      )}
      <label className="xm-field">
        {t("xmind.lineWidth")}
        <input
          type="number"
          aria-label={t("xmind.lineWidth")}
          min={0.5}
          max={20}
          step={0.5}
          disabled={readonly}
          value={parseFloat(p["line-width"] ?? "1.5") || 1.5}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isFinite(v) && v >= 0.5 && v <= 20)
              update({ "line-width": String(v) });
          }}
        />
      </label>
      <div className="xm-color-row">
        {[
          ["line-color", "lineColor", "#348C83"],
          ["fo:color", "textColor", p["line-color"] ?? "#348C83"],
        ].map(([key, label, fallback]) => (
          <label key={key}>
            {t(`xmind.${label}`)}
            <input
              type="color"
              aria-label={t(`xmind.${label}`)}
              disabled={readonly}
              value={
                /^#[\da-f]{6}/i.test(p[key] ?? "")
                  ? p[key].slice(0, 7)
                  : fallback
              }
              onChange={(e) => update({ [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label className="xm-field">
        {t("xmind.fontSize")}
        <input
          type="number"
          aria-label={t("xmind.fontSize")}
          min={9}
          max={64}
          disabled={readonly}
          value={parseFloat(p["fo:font-size"] ?? "12") || 12}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isFinite(v) && v >= 9 && v <= 64)
              update({ "fo:font-size": `${v}pt` });
          }}
        />
      </label>
      <Button
        size="sm"
        disabled={readonly}
        onClick={() =>
          onCommand({ type: "relationship-delete", id: relation.id })
        }
      >
        {t("common.delete")}
      </Button>
    </>
  );
}
