// Configuración única de ESLint para todo el monorepo (shared, backend y frontend).
// ESLint se ocupa de errores y malas prácticas; el formato lo maneja Prettier (ver .prettierrc.json).
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    'backend/src/generated/', // cliente de Prisma (generado)
    'docs/',
  ]),

  // Base: reglas recomendadas de JS y TypeScript con información de tipos
  // (detecta, por ejemplo, promesas sin await o sin manejar).
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Parámetros obligatorios que no se usan (p. ej. _next en el errorHandler de Express) se marcan con "_"
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Archivos JS sueltos (como este): no pertenecen a ningún tsconfig, se analizan sin tipos
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Backend: Node
  {
    files: ['backend/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // Express 5 maneja los handlers async (si la promesa falla, va al errorHandler)
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false } },
      ],
    },
  },

  // Demo de R2: el JavaScript de public/ corre en el navegador, no en Node
  {
    files: ['backend/src/dev/**/public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },

  // Frontend: navegador + React
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['frontend/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Siempre al final: apaga las reglas de ESLint que chocan con Prettier
  prettier,
])
