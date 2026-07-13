import { useEffect, useRef, useState } from "react";
import { theme } from "../theme/theme";
import { sfx } from "../audio/sfx";
import { gameOptions } from "./settings";

/**
 * The timed BANK prompt — a full-width gold button above the hand (per the design
 * handoff). A countdown ring + number, "BANK NOW", and a draining bar.
 *
 * Timing trick: the visible countdown + ring/bar drain only START after a 1s
 * grace, so a 3s window FEELS tight while giving the player a beat longer to
 * react. The hook owns the auto-dismiss (window + grace). The window length
 * (3s or 5s) comes from Settings › Game.
 */
const RING_R = 13;
const RING_C = 2 * Math.PI * RING_R; // ≈ 81.68

export function EarlyBankButton({ onBank }: { onBank: () => void }) {
  const [count, setCount] = useState<number | null>(null); // null during grace
  const [drain, setDrain] = useState(false);
  const mounted = useRef(true);
  // read once per offer (the button mounts fresh each time the offer opens)
  const windowSec = useRef(gameOptions.bankWindow).current;

  useEffect(() => {
    mounted.current = true;
    const graceTimer = setTimeout(() => {
      if (!mounted.current) return;
      setCount(windowSec);
      setDrain(true);
      sfx.countdownTick(windowSec); // very subtle tick per countdown step
      let n = windowSec;
      const tick = setInterval(() => {
        n -= 1;
        if (!mounted.current) { clearInterval(tick); return; }
        if (n <= 0) { setCount(null); clearInterval(tick); }
        else { setCount(n); sfx.countdownTick(n); }
      }, 1000);
    }, 1000);
    return () => {
      mounted.current = false;
      clearTimeout(graceTimer);
    };
  }, [windowSec]);

  return (
    <button onClick={onBank} style={wrap} className="gl-pulse">
      {/* draining bar behind */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: drain ? "0%" : "100%",
          background: "rgba(232,181,63,0.18)",
          transition: drain ? `width ${windowSec * 1000}ms linear` : "none",
        }}
      />
      {/* countdown ring + digit */}
      <span style={{ position: "relative", width: 30, height: 30, display: "grid", placeItems: "center" }}>
        <svg width="30" height="30" viewBox="0 0 30 30" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
          <circle cx="15" cy="15" r={RING_R} fill="none" stroke="rgba(232,181,63,0.25)" strokeWidth="2.5" />
          <circle
            cx="15"
            cy="15"
            r={RING_R}
            fill="none"
            stroke={theme.color.gold}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={drain ? RING_C : 0}
            style={{ transition: drain ? `stroke-dashoffset ${windowSec * 1000}ms linear` : "none" }}
          />
        </svg>
        <span style={{ position: "relative", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 14, color: theme.color.gold }}>
          {count ?? "✦"}
        </span>
      </span>

      <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 18, letterSpacing: "0.08em", color: theme.color.gold }}>
        BANK NOW
      </span>
      <span style={{ fontFamily: theme.fonts.sans, fontWeight: 500, fontSize: 11, color: theme.color.gold, opacity: 0.7 }}>
        tap to lock points
      </span>
    </button>
  );
}

const wrap: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  width: "100%",
  height: "100%", // fills the reserved band (App's bankSlotOverlay)
  padding: "0 16px",
  borderRadius: 16,
  border: "1px solid rgba(232,181,63,0.5)",
  background: "linear-gradient(180deg, rgba(232,181,63,0.22), rgba(232,181,63,0.1))",
  overflow: "hidden",
};
