import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { monadTestnet } from "./chain";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ["email"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          },
        },
        // 告诉 Privy 支持 Monad，并默认用它
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        appearance: {
          theme: "light",
          accentColor: "#4F46E5",
        },
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>
);
