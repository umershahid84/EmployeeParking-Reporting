import { useState } from 'react';

// Looks for the real logo file at client/public/port-of-seattle-logo.svg
// (served at this same path). Until that file is present, the <img> 404s
// and this falls back to a plain text badge so the header never shows a
// broken-image icon.
export default function Logo({ className = 'brand-logo', placeholderClassName = 'brand-logo-placeholder' }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className={placeholderClassName}>PORT OF SEATTLE</span>;
  }

  return (
    <img
      src="/port-of-seattle-logo.svg"
      alt="Port of Seattle"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
