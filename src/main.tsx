import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { printConsoleEgg } from "@/lib/console-egg";
import { applyClientBranding } from "@/clients";
import { capturarPedidoInstalacao, registarServiceWorker } from "@/lib/install-prompt";

applyClientBranding();
printConsoleEgg();
capturarPedidoInstalacao();
registarServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
