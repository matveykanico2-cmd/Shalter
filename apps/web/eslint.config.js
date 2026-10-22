// Границы слоёв FSD 2.0 (app → views → widgets → features → entities → shared) — как в
// carrier-crm: слой берёт только нижние слои, чужой слайс — только через его index.ts,
// внутри слайса — только относительные пути.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

const LAYERS = ["app", "views", "widgets", "features", "entities", "shared"];
const SLICED = ["views", "widgets", "features", "entities"];

const relativeInto = (layer) => [1, 2, 3, 4, 5].map((depth) => `${"../".repeat(depth)}${layer}/**`);

/** Правила одного слоя: свой слой — не через «@/», верхние — никак, нижние — через «@/». */
function layerRules(layer) {
  const index = LAYERS.indexOf(layer);
  const upper = LAYERS.slice(0, index);
  const lower = LAYERS.slice(index + 1);
  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [`@/${layer}/*`, `@/${layer}/*/**`],
              message: "Внутри слайса — только относительные пути; свой слой через «@/» не берётся.",
            },
            ...(upper.length
              ? [{ group: upper.flatMap((l) => [`@/${l}`, `@/${l}/**`]), message: `Слой ${layer} не может брать верхние слои (${upper.join(", ")}).` }]
              : []),
            ...lower.map((l) => ({ group: relativeInto(l), message: `Слой ${l} — через «@/${l}/…», а не относительным путём.` })),
            {
              group: SLICED.filter((l) => l !== layer).map((l) => `@/${l}/*/**`),
              message: "Чужой слайс — только через его публичный index.ts.",
            },
          ],
        },
      ],
    },
  };
}

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx,js}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    plugins: { "simple-import-sort": simpleImportSort },
    languageOptions: { globals: globals.browser },
    rules: {
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^\\u0000"],
            ["^node:", "^@?\\w"],
            ...LAYERS.map((l) => [`^@/${l}(?:/|$)`]),
            ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
            ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
    },
  },
  ...LAYERS.map(layerRules),
]);
