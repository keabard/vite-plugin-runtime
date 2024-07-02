/**
 * Represents the configuration object for `vite-plugin-runtime-env`
 */
export type RuntimeEnvConfig = {
  /**
   * This is the name of the object attached to the `window` instance
   * @default env
   */
  name?: (() => string) | string;
  /**
   * Specificies whether to generate typescript types for `import.meta.env`
   * @default false
   */
  generateTypes?: boolean;
  /**
   * The path to generate typescript types. Only takes affect if @see {@link generateTypes} is `true`
   * @default process.cwd()
   */
  generatedTypesPath?: (() => string) | string;
  /**
   * Specifies whether to inject an env loading script into `index.html`
   * @default true
   */
  injectHtml?: boolean;
  /**
   * Specifies whether to create an envsubst template file at build time
   * @default false
   */
  envsubstTemplate?: boolean;
};
