import { ImageResponse } from "next/og";
import { BrainMark } from "@/lib/brand-mark";

export const alt = "CodeMind AI — Investigate. Understand. Fix. Validate.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card (Open Graph + Twitter). */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "radial-gradient(circle at 15% 0%, #1d2250 0%, #090a0f 60%)", color: "#eceef7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <BrainMark size={72} />
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>CodeMind AI</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, display: "flex", flexWrap: "wrap" }}>
            <span>Investigate. Understand.&nbsp;</span>
            <span style={{ color: "#a2adff" }}>Fix. Validate.</span>
          </div>
          <div style={{ fontSize: 30, color: "#a3aac0", maxWidth: 900 }}>The AI engineering investigation platform. Every conclusion is tied to evidence in your repository.</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 24, color: "#747c95" }}>
          {["Problem", "Evidence", "Root cause", "Fix", "Validation", "Pull request"].map((s, i) => (
            <div key={s} style={{ display: "flex", gap: 14 }}>{i > 0 && <span>→</span>}<span>{s}</span></div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
