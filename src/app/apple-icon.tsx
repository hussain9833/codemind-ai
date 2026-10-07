import { ImageResponse } from "next/og";
import { BrainMark } from "@/lib/brand-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon: the same brain mark as the app header. */
export default function AppleIcon() {
  return new ImageResponse(<BrainMark size={180} />, size);
}
