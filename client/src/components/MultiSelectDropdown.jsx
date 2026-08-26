import { useEffect, useRef, useState } from 'react';

// A closed, single-line dropdown (like every other <select> on the form)
// that opens into a native multi-select listbox on click, so the familiar
// Ctrl/Cmd-click (add one) and Shift-click (select a range) behavior works
// exactly as it does in any desktop multi-select list.
export default function MultiSelectDropdown({ options, selectedIds, onChange, placeholder = 'Select…', emptyText = 'None available' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!options.length) {
    return <p className="muted">{emptyText}</p>;
  }

  const selectedLabels = options.filter((o) => selectedIds.includes(String(o.id))).map((o) => o.label);
  const summary = selectedLabels.length ? selectedLabels.join(', ') : placeholder;

  function handleSelectChange(e) {
    onChange(Array.from(e.target.selectedOptions).map((o) => o.value));
  }

  return (
    <div className="multiselect-dropdown" ref={containerRef}>
      <button
        type="button"
        className="multiselect-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="multiselect-trigger-text" title={summary}>{summary}</span>
        <span className="multiselect-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="multiselect-panel">
          <select
            multiple
            size={Math.min(options.length, 8)}
            value={selectedIds}
            onChange={handleSelectChange}
            autoFocus
          >
            {options.map((o) => <option key={o.id} value={String(o.id)}>{o.label}</option>)}
          </select>
          <div className="multiselect-hint">Hold Ctrl (⌘ on Mac) to select multiple, Shift to select a range.</div>
        </div>
      )}
    </div>
  );
}
