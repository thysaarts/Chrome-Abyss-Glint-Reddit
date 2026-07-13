import React from "react";

/**
 * Top-level crash guard. A render-time throw anywhere below would otherwise
 * white-screen the whole app — tolerable on the web (reload), but a hard,
 * unrecoverable crash inside a native webview. This catches it and offers a
 * reload. Styles are self-contained inline literals (no theme/CSS import) so the
 * fallback still renders even if a style/theme module is what failed.
 */
interface Props {
  children: React.ReactNode;
  /** optional label so a nested boundary (e.g. the board) can name what failed */
  label?: string;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // surface it for logging/telemetry (a native crash reporter can hook here)
    console.error("Uncaught error" + (this.props.label ? ` in ${this.props.label}` : ""), error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={wrap} role="alert">
        <div style={card}>
          <div style={glyph} aria-hidden>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ff5a76" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <div style={title}>Something broke</div>
          <div style={sub}>The game hit an unexpected error. Your progress is saved.</div>
          <button style={btn} onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

const wrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "#07080f",
  color: "#f1f0f8",
  fontFamily: "'Saira', system-ui, sans-serif",
};
const card: React.CSSProperties = {
  width: 340,
  maxWidth: "92vw",
  textAlign: "center",
  padding: "34px 28px 26px",
  borderRadius: 20,
  background: "linear-gradient(180deg,#161a2b,#0e1120)",
  border: "1px solid #2c2f4a",
  boxShadow: "0 20px 60px -20px rgba(0,0,0,0.8)",
};
const glyph: React.CSSProperties = { display: "grid", placeItems: "center", marginBottom: 14 };
const title: React.CSSProperties = { fontWeight: 700, fontSize: 22, letterSpacing: "0.01em" };
const sub: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.5, color: "#b7b0d4", margin: "8px 0 22px" };
const btn: React.CSSProperties = {
  width: "100%",
  padding: "13px 30px",
  borderRadius: 14,
  border: "none",
  borderBottom: "3px solid #7d3fc4",
  background: "linear-gradient(180deg,#e2c8ff,#b06bf5)",
  color: "#1a0b2e",
  fontFamily: "'Chakra Petch', system-ui, sans-serif",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
};
