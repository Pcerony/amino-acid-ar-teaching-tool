import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { AminoAcidScanner } from "../app/AminoAcidScanner";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AminoAcidScanner />
  </StrictMode>,
);
