import { getTrace, traceText, clearTrace, isTraceEnabled } from "../game/trace";

/**
 * DEV move-tracer panel — a small fixed pill shown only when tracing is on
 * (?debug=1 in the URL, or localStorage glint.debug="1"). Downloads / copies the
 * full play-by-play so a run can be checked move-by-move afterwards. The `moves`
 * prop (state.moves) drives the re-render so the count stays live.
 */
export function DebugTracePanel({ moves }: { moves: number }) {
  if (!isTraceEnabled()) return null;
  const count = getTrace().length;

  const download = () => {
    const blob = new Blob([traceText() || "(no moves yet)"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `glint-trace-${count}moves.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const copy = () => {
    try {
      navigator.clipboard?.writeText(traceText());
    } catch {
      /* clipboard blocked — the download button always works */
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        bottom: 8,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        borderRadius: 10,
        background: "rgba(10,10,18,0.82)",
        border: "1px solid rgba(157,123,255,0.5)",
        color: "#cdbcff",
        font: "600 10px/1 ui-monospace, monospace",
        letterSpacing: "0.06em",
        backdropFilter: "blur(4px)",
        pointerEvents: "auto",
      }}
      // moves drives the live re-render; not otherwise used
      data-moves={moves}
    >
      <span>TRACE · {count}</span>
      <button style={btn} onClick={download}>⭳ .txt</button>
      <button style={btn} onClick={copy}>copy</button>
      <button style={btn} onClick={() => clearTrace()}>clear</button>
    </div>
  );
}

const btn: React.CSSProperties = {
  cursor: "pointer",
  padding: "3px 7px",
  borderRadius: 7,
  border: "1px solid rgba(157,123,255,0.4)",
  background: "rgba(157,123,255,0.14)",
  color: "#e2dcff",
  font: "600 10px/1 ui-monospace, monospace",
};
