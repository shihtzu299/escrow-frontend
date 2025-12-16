/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL: string;
  readonly VITE_FACTORY: string;
  readonly VITE_USDT: string;
  readonly VITE_USDC: string;
  readonly VITE_WC_PROJECT_ID: string;
  readonly VITE_WALLET_DEEPLINK: string;
  readonly VITE_BOT_TOKEN: string;
  readonly MINIAPP_URL: string;
  readonly VITE_BOT_ORACLE?: string;  // Optional for the new one we added
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}