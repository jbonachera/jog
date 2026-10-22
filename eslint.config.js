import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Le cœur (src/core) est pur et déterministe (ADR 0006, ADR 0007, ADR 0008).
// Seul src/core/riegel.ts peut utiliser pow : c'est l'équivalence de Riegel.
const MESSAGE_MATH = 'Interdit dans src/core (ADR 0006). Seule l\'équivalence de Riegel (riegel.ts) peut utiliser pow.';
const MESSAGE_PUISSANCE = 'Interdit dans src/core (ADR 0006) : utiliser Math.pow dans riegel.ts seulement, ou une table.';
const MESSAGE_MATH_LOG = 'Interdit dans src/core (ADR 0006) : déterminisme des calculs.';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'docs/**', 'maquettes/**', 'tests/local/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Lanceurs de scripts (Node) : ce sont des modules ES, sans DOM.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message: 'Interdit dans src/core (ADR 0007) : les dates civiles sont en arithmétique entière, sans horloge ni fuseau.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(store|ui|worker)(/|$)',
              message: 'src/core ne doit pas importer store, ui ou worker (ADR 0008).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/riegel.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'pow', message: MESSAGE_MATH },
        { object: 'Math', property: 'exp', message: MESSAGE_MATH_LOG },
        { object: 'Math', property: 'log', message: MESSAGE_MATH_LOG },
        { object: 'Math', property: 'log10', message: MESSAGE_MATH_LOG },
        { object: 'Math', property: 'log2', message: MESSAGE_MATH_LOG },
        { object: 'Math', property: 'log1p', message: MESSAGE_MATH_LOG },
        { object: 'Math', property: 'expm1', message: MESSAGE_MATH_LOG },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "BinaryExpression[operator='**']", message: MESSAGE_PUISSANCE },
        { selector: "AssignmentExpression[operator='**=']", message: MESSAGE_PUISSANCE },
      ],
    },
  },
);
