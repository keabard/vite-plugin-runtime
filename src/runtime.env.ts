import Path from 'path';
import type { Plugin, ResolvedConfig } from 'vite';
import dotenv from 'dotenv';
import fs from 'fs';
import prettier from 'prettier';
import type { RuntimeEnvConfig } from './runtime.env.config.js';
import { getGeneratedTypesPath, getName, getType, isViteEnv } from './helpers.js';

/**
 * Runtime environment plugin for vite
 */
export const runtimeEnv = (options: RuntimeEnvConfig = { injectHtml: true }): Plugin => {
  let envObj: Record<string, string> = {};
  let vite_config: ResolvedConfig;
  let runtimeEnvConfig: RuntimeEnvConfig;
  let vite_env_prefix: string[];

  const importMetaEnvRegex = /(import\.meta\.env)(.+)/g;
  const regexIdentifierName = /(?:[$_\p{ID_Start}])(?:[$\u200C\u200D\p{ID_Continue}])*/u;

  return {
    name: 'vite-plugin-runtime-env',
    configResolved(config) {
      vite_config = config;

      let envPrefix = vite_config.envPrefix ?? ['VITE_'];
      if (typeof envPrefix === 'string') {
        envPrefix = [envPrefix];
      }

      vite_env_prefix = envPrefix;
      runtimeEnvConfig = { ...options, ...vite_config.runtimeEnv };
    },
    buildStart() {
      const envPath = Path.resolve(vite_config.root, vite_config.envDir, '.env');
      if (fs.existsSync(envPath)) {
        envObj = { ...envObj, ...dotenv.parse(fs.readFileSync(envPath)) };
      }

      const envModePath = Path.resolve(vite_config.root, vite_config.envDir, `.env.${vite_config.mode}`);
      if (fs.existsSync(envModePath)) {
        envObj = { ...envObj, ...dotenv.parse(fs.readFileSync(envModePath)) };
      }

      const keys = Object.keys(envObj);
      keys.forEach(key => {
        if (isViteEnv(key, vite_env_prefix)) {
          delete envObj[key];
        }
      });

      if (runtimeEnvConfig.generateTypes && vite_config.command === 'serve') {
        const path = getGeneratedTypesPath(runtimeEnvConfig) ?? vite_config.root;
        const name = getName(runtimeEnvConfig);
        const typePath = Path.resolve(path, `${name}.d.ts`);
        const importMetaEnvName = name === 'env' ? 'ImportMetaEnv' : 'ImportMetaRuntimeEnv';
        let output = `/** generated by vite-plugin-runtime */\ninterface ${importMetaEnvName} {`;
        Object.entries(envObj).forEach(entry => {
          output += `readonly ${entry[0]}: ${getType(entry[1])};`;
        });
        output += `} interface ImportMeta {readonly ${name}: ${importMetaEnvName};}`;

        prettier
          .format(output, {
            semi: true,
            singleQuote: true,
            arrowParens: 'avoid',
            tabWidth: 2,
            useTabs: false,
            printWidth: 100,
            parser: 'typescript',
          })
          .then(output => fs.writeFileSync(typePath, output));
      }
    },
    transform(code) {
      const globalObject = 'window';
      const globalName = getName(runtimeEnvConfig);

      for (let match = importMetaEnvRegex.exec(code); match !== null; match = importMetaEnvRegex.exec(code)) {
        const identifierMatch = regexIdentifierName.exec(match[2]);

        if (identifierMatch === null) {
          continue;
        }

        const name = identifierMatch[0];

        if (isViteEnv(name, vite_env_prefix)) {
          continue;
        }

        const start = match.index;
        const end = start + match[1].length;

        code = code.slice(0, start) + `${globalObject}.${globalName}` + code.slice(end);
      }

      return code;
    },
    transformIndexHtml() {
      if (runtimeEnvConfig.injectHtml !== true) {
        return;
      }

      const globalObject = 'window';
      const globalName = getName(runtimeEnvConfig);

      let script: string | undefined;

      if (vite_config.command === 'serve') {
        script = `${globalObject}.${globalName} = {...${globalObject}.${globalName}, ...${JSON.stringify(envObj)}};`;
      } else {
        script = `import rtenv from '/${globalName}.js'; ${globalObject}.${globalName} = {...${globalObject}.${globalName}, ...rtenv};`;
      }

      return [
        {
          tag: 'script',
          attrs: {
            type: 'module',
          },
          children: script,
          injectTo: 'head-prepend',
        },
      ];
    },
    generateBundle() {
      const globalName = getName(runtimeEnvConfig);

      const jsonObj: Record<string, unknown> = {};
      const envsubstTemplateObj: Record<string, string> = {};

      Object.entries(envObj).forEach(entry => {
        const entryType = getType(entry[1]);
        jsonObj[entry[0]] = entryType === 'number' ? Number(entry[1]) : entryType === 'boolean' ? Boolean(entry[1]) : entry[1];
        if (runtimeEnvConfig.envsubstTemplate === true) {
          envsubstTemplateObj[entry[0]] = `$${entry[0]}`;
        }
      });

      const output = `export default ${JSON.stringify(jsonObj)} ;`;

      this.emitFile({
        type: 'asset',
        fileName: `${globalName}.js`,
        source: output,
      });

      if (runtimeEnvConfig.envsubstTemplate === true) {
        const envsubstTemplateOutput = `export default ${JSON.stringify(envsubstTemplateObj)} ;`;

        this.emitFile({
          type: 'asset',
          fileName: `${globalName}.template.js`,
          source: envsubstTemplateOutput,
        });
      }
    },
  };
};
