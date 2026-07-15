import { hydrateSave } from "./game/saveSync";
import "./index.css";

// REDDIT SAVE SYNC: pull the account's save into localStorage BEFORE anything
// reads it — then mount the app. Outside Reddit this resolves instantly and
// the game stays local-only. The app module is imported dynamically so no
// module-scope code can read localStorage before hydration.
void (async () => {
  await hydrateSave();
  const [{ default: React }, ReactDOM, { default: App }, { applySettings, loadSettings }, { ErrorBoundary }] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("./App"),
    import("./ui/settings"),
    import("./ui/ErrorBoundary"),
  ]);
  // apply the saved theme / motion / volume BEFORE first paint (no flash of dark
  // when the player has chosen light mode)
  applySettings(loadSettings());
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
})();
