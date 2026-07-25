import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { AminoAcidScanner } from "../app/AminoAcidScanner";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("アミノずかんの表示場所が見つかりません");
}

// The static shell is intentionally inline in index.html so slow networks have
// immediate feedback. React owns the root after the first module executes.
document.getElementById("bootstrap-shell")?.remove();

createRoot(rootElement).render(
  <StrictMode>
    <AminoAcidScanner />
  </StrictMode>,
);
