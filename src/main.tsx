import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { printConsoleEgg } from "@/lib/console-egg";
import { applyClientBranding } from "@/clients";

applyClientBranding();
printConsoleEgg();

createRoot(document.getElementById("root")!).render(<App />);
