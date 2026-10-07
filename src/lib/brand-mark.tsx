/** CodeMind mark (Lucide "brain" on an indigo→violet tile). Shared by generated icons and social images. */
export function BrainMark({ size, radius }: { size: number; radius?: number }) {
  const r = radius ?? Math.round(size * 0.25);
  const glyph = Math.round(size * 0.62);
  return (
    <div style={{ width: size, height: size, borderRadius: r, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #6674ee, #9d7cf6)" }}>
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 18V5" />
        <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
        <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
        <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
        <path d="M18 18a4 4 0 0 0 2-7.464" />
        <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
        <path d="M6 18a4 4 0 0 1-2-7.464" />
        <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
      </svg>
    </div>
  );
}
