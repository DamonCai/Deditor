import type { ReactNode } from "react";

interface Props<T extends string> {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  /** Settings use radio semantics; view controls retain pressed buttons. */
  radio?: boolean;
}

export function SegmentedControl<T extends string>({ value, options, onChange, label, radio }: Props<T>) {
  return (
    <div className="deditor-segments" role={radio ? "radiogroup" : "group"} aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" className="deditor-segment"
          role={radio ? "radio" : undefined}
          aria-checked={radio ? value === option.value : undefined}
          aria-pressed={radio ? undefined : value === option.value}
          data-selected={value === option.value}
          onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
