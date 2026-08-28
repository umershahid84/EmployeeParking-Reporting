// A sliding on/off switch (click or press Space/Enter to flip), used in
// place of a plain checkbox wherever the choice reads better as a toggle
// (e.g. Save Credentials) than a checkbox.
export default function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle-switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
      {label}
    </label>
  );
}
