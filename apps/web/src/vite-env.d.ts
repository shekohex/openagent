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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
