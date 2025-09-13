/// <reference types="vite/client" />
/** biome-ignore-all lint/nursery/useConsistentTypeDefinitions: see https://vite.dev/guide/env-and-mode.html#intellisense-for-typescript */

interface ViteTypeOptions {
  // By adding this line, you can make the type of ImportMetaEnv strict
  // to disallow unknown keys.
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  /**
   * Convex API URL
   */
  readonly VITE_CONVEX_URL: string;

  readonly VITE_CONVEX_SITE_URL: string;

  readonly VITE_AUTH_GITHUB_ID: string | undefined;
  readonly VITE_AUTH_GITHUB_SECRET: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
