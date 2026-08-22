/**
 * THE TUTOR — the Broker fronts every pop-up at the start of and during the
 * Tutorial and the Academy (idea #3, decided 2026-08-20): she is the house,
 * and the house teaches the table. Pop-ups only — the in-script tutorial text
 * stays clean (no room, by design).
 */
import { CONTENT } from "../content/content";

export function TutorAvatar({ size = 84 }: { size?: number }) {
  const names = (CONTENT.challenges.characterNames ?? {}) as Record<string, string>;
  return (
    <img
      src="/avatars/broker-lg.webp"
      alt={names.broker ?? "The Broker"}
      className="gl-float-y"
      style={{ width: size, height: "auto", display: "block", filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.55))" }}
    />
  );
}
