/** Keep intermediate digits local; commit one validated edit on blur or Enter. */
export default function XmindNumberInput({ value, min, max, label, disabled, placeholder, onCommit }: {
  value: number | undefined;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
  placeholder?: string;
  onCommit: (value: number) => void;
}) {
  return <input key={value ?? 'mixed'} type="number" aria-label={label}
    min={min} max={max} disabled={disabled} placeholder={placeholder} defaultValue={value ?? ''}
    onBlur={event => {
      const input=event.currentTarget, next=input.valueAsNumber;
      if(Number.isFinite(next)&&next>=min&&next<=max) {
        if(next!==value) onCommit(next);
      } else input.value=value===undefined?'':String(value);
    }}
    onKeyDown={event => {
      if(event.nativeEvent.isComposing||event.keyCode===229)return;
      if(event.key==='Escape'||event.key==='Enter') {
        event.preventDefault();event.stopPropagation();
        if(event.key==='Escape')event.currentTarget.value=value===undefined?'':String(value);
        event.currentTarget.blur();
      }
    }} />;
}
