import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import { hideAppSplash } from "./lib/appSplash";

async function bootstrap() {
  if (!(window as any).__TAURI_INTERNALS__) {
    await new Promise<void>(resolve => {
      const check = () => {
        if ((window as any).__TAURI_INTERNALS__) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }

  const isMini = window.location.hash === "#/mini";

  if (isMini) {
    hideAppSplash();
    const { default: MiniPlayer } = await import("./components/Player/MiniPlayer");
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode><MiniPlayer /></React.StrictMode>
    );
  } else {
    const { default: App } = await import("./App");
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode><App /></React.StrictMode>
    );
  }
}

bootstrap();