import type { DesktopBridge } from "../shared/protocol";
declare global {
  interface Window {
    dbapp: DesktopBridge;
  }
}

declare module "*.css";
