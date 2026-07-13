import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DemoApp } from "./DemoApp";
import { ThumbApp } from "./ThumbApp";

// ?thumb=<element name> → the in-situ thumbnail framing mode (see ThumbApp)
const thumb = new URLSearchParams(location.search).get("thumb");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{thumb ? <ThumbApp name={thumb} /> : <DemoApp />}</StrictMode>
);
