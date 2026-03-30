declare module "openclaw/plugin-sdk/browser-support.js" {
  export type GatewayAuthConfig = Record<string, unknown>;

  export function resolveGatewayAuth(params: {
    authConfig?: GatewayAuthConfig | null;
    env?: NodeJS.ProcessEnv;
  }): {
    mode: string;
    token?: string;
    password?: string;
    allowTailscale?: boolean;
  };
}
