import { useEffect, useRef, useState } from 'react';
import { english, englishGroup, sourceCatalog } from './locale/en.ts';
import { TooltipRegistry } from './help-registry.ts';
const labels = englishGroup('help');
/** Help never reads its associated control: private input cannot enter a tooltip. */
export function ControlHelp({ controlId, label }: { readonly controlId: string; readonly label: string }) {
  const entry = TooltipRegistry.get(controlId);
  const wrapper = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null), pinned = useRef(false), suppressed = useRef(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || !entry) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const ownsFocus = wrapper.current?.contains(document.activeElement) === true;
      suppressed.current = true; pinned.current = false; setOpen(false);
      if (ownsFocus) { event.preventDefault(); event.stopPropagation(); trigger.current?.focus(); }
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [open, entry]);
  if (!entry) return null;
  const dismiss = () => { pinned.current = false; setOpen(false); };
  return <span ref={wrapper} data-control-help={controlId} onPointerEnter={() => { if (!suppressed.current) setOpen(true); }}
    onPointerLeave={() => { suppressed.current = false; if (!pinned.current && document.activeElement !== trigger.current) setOpen(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { suppressed.current = false; dismiss(); } }}
    >
    <button ref={trigger} id={`${controlId}-help-trigger`} type="button" aria-label={english('help','show',{control:label})}
      aria-expanded={open} aria-controls={open ? `${controlId}-tooltip` : undefined} aria-describedby={open ? `${controlId}-tooltip` : undefined}
      onFocus={() => { if (!suppressed.current) setOpen(true); }} onClick={() => { if (pinned.current) { suppressed.current = true; dismiss(); } else { pinned.current = true; suppressed.current = false; setOpen(true); } }}>{labels.label}</button>
    {open ? <span id={`${controlId}-tooltip`} role="tooltip">{sourceCatalog[entry.messageKey]!.source}</span> : null}
  </span>;
}
