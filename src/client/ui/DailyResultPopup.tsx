import { useEffect } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { METRIC_LABEL, DailyMetric } from "../game/daily";

/**
 * YOUR SCORE — the daily board's result, shown for a beat BEFORE the end card.
 *
 * Five of the six daily metrics never reach the game summary at all (only
 * `score` and `nebulite` do), so a player finished a run with no idea how they
 * had done on the thing the board actually ranks. This gives that number its own
 * moment. `score` is the one metric that never gets this pop-up — the end card
 * already leads with it; `nebulite` DOES, because the summary lists it without
 * celebrating it.
 *
 * FORFEIT: a bust-out zeroes every metric (the 2026-08-04 ruling). Rather than
 * flash a bare 0 — which reads as a bug — the reached value is shown struck
 * through beside the 0 that was actually submitted, so the rule teaches itself.
 */

export interface DailyResult {
  metric: DailyMetric;
  /** what the run actually reached, ignoring the forfeit */
  reached: number;
  /** what counts for the board — 0 after a bust-out */
  submitted: number;
  forfeited: boolean;
}

/** Auto-dismiss delay. Long enough to read a number and a label, short enough
 *  that it never feels like a gate in front of the end card. */
const HOLD_MS = 2800;

export function DailyResultPopup({ result, onDone }: { result: DailyResult; onDone: () => void }) {
  const C = CONTENT.dailyResult;
  useEffect(() => {
    sfx.rewardReveal();
    const t = window.setTimeout(onDone, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    // NOT a MiniPopup: this one auto-dismisses and must never trap a tap on its
    // way to the end card, so it carries no buttons and the whole overlay is the
    // dismiss target.
    <div style={scrim} className="gl-fade" onClick={() => { sfx.click(); onDone(); }}>
      <div style={card} className="gl-screen-in" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <MetricGlyph metric={result.metric} />
        </div>
        <div style={kicker}>{C.title}</div>
        <div style={label}>{METRIC_LABEL[result.metric]}</div>
        {result.forfeited ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 12, marginTop: 6 }}>
              <span style={{ ...value, fontSize: 34, color: theme.color.faint, textDecoration: "line-through", opacity: 0.75 }}>
                {result.reached.toLocaleString()}
              </span>
              <span style={{ color: theme.color.faint, fontSize: 20 }}>→</span>
              <span style={{ ...value, color: theme.color.bad }}>{result.submitted.toLocaleString()}</span>
            </div>
            <div style={forfeitTag}>{C.forfeitTag}</div>
            <div style={forfeitNote}>{C.forfeitNote}</div>
          </>
        ) : (
          <div style={value}>{result.submitted.toLocaleString()}</div>
        )}
      </div>
    </div>
  );
}

/** One glyph per metric, in the badge language the other board pop-ups use. */
function MetricGlyph({ metric }: { metric: DailyMetric }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const art: Record<DailyMetric, React.ReactNode> = {
    // a rising bar chart — the raw score
    score: (<><path d="M4 20V13" {...stroke} /><path d="M10 20V8" {...stroke} /><path d="M16 20V4" {...stroke} /><path d="M3 20h18" {...stroke} /></>),
    // a vault door — the single biggest bank
    bankscore: (<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" {...stroke} /><circle cx="12" cy="12" r="3.6" {...stroke} /><path d="M12 8.4V6M12 18v-2.4M8.4 12H6M18 12h-2.4" {...stroke} /></>),
    // a crucible pouring — refining
    refined: (<><path d="M6 5h12l-2.4 7.5a4 4 0 0 1-7.2 0Z" {...stroke} /><path d="M12 15.5V20" {...stroke} /><path d="M8 20h8" {...stroke} /></>),
    // the Nebulite diamond, banked
    nebulite: (<><rect x="6.2" y="6.2" width="11.6" height="11.6" rx="2.6" transform="rotate(45 12 12)" {...stroke} /><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" /></>),
    // stacked coins — the count of banks
    banks: (<><ellipse cx="12" cy="6.5" rx="7" ry="2.6" {...stroke} /><path d="M5 6.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" {...stroke} /><path d="M5 11.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" {...stroke} /></>),
    // interlocking links — chains
    chains: (<><rect x="2.8" y="9" width="9" height="6" rx="3" {...stroke} /><rect x="12.2" y="9" width="9" height="6" rx="3" {...stroke} /></>),
  };
  return (
    <div style={disc}>
      <svg width="34" height="34" viewBox="0 0 24 24">{art[metric]}</svg>
    </div>
  );
}

const scrim: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 97, background: "rgba(6,7,14,0.78)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "pointer",
};
const card: React.CSSProperties = {
  position: "relative", width: 320, maxWidth: "92vw", padding: "26px 28px 24px",
  borderRadius: 22, textAlign: "center", cursor: "default",
  background: `radial-gradient(420px 240px at 50% -10%, rgba(157,123,255,0.18), transparent 60%), ${theme.color.panel}`,
  border: "1px solid rgba(157,123,255,0.45)", boxShadow: theme.color.shadow,
};
const disc: React.CSSProperties = {
  width: 62, height: 62, borderRadius: 18, display: "grid", placeItems: "center",
  background: "rgba(157,123,255,0.14)", border: "1px solid rgba(157,123,255,0.45)",
  color: theme.color.accent, filter: "drop-shadow(0 0 18px rgba(157,123,255,0.45))",
};
const kicker: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.24em", color: theme.color.dim };
const label: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 15, color: theme.color.text, marginTop: 7 };
const value: React.CSSProperties = {
  fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 46, lineHeight: 1.1, marginTop: 6,
  color: theme.color.gold, fontVariantNumeric: "tabular-nums", textShadow: "0 2px 26px rgba(232,181,63,0.45)",
};
const forfeitTag: React.CSSProperties = {
  display: "inline-block", marginTop: 12, padding: "3px 11px", borderRadius: 999,
  fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.2em", color: theme.color.bad,
  border: `1px solid ${theme.color.bad}55`, background: "rgba(255,90,118,0.1)",
};
const forfeitNote: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 11.5, lineHeight: 1.5, color: theme.color.faint, marginTop: 9 };
