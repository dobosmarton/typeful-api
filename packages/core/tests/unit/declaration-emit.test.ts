import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const fixtures = [fixture('shared-contract.ts'), fixture('shared-client.ts')];

// Building a TypeScript program takes a few seconds, more when test files run in parallel
const COMPILE_TIMEOUT_MS = 30_000;

/**
 * Contracts usually live in a shared package that is built with declarations. TypeScript must
 * then be able to name every type a route infers, so each one has to be exported from the
 * package entry. This compiles fixtures against the built dist and fails on naming errors
 * such as TS4023 ("has or is using name ... but cannot be named").
 */
describe('declaration emit for exported contracts', () => {
  let diagnostics: string[];
  const emitted = new Map<string, string>();

  beforeAll(() => {
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      declaration: true,
      emitDeclarationOnly: true,
      skipLibCheck: true,
      types: [],
    };
    const host = ts.createCompilerHost(options);
    host.writeFile = (fileName, text) => emitted.set(fileName, text);

    const program = ts.createProgram(fixtures, options, host);
    const result = program.emit();
    diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics].map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    );
  }, COMPILE_TIMEOUT_MS);

  const declarationOf = (name: string) =>
    [...emitted].find(([file]) => file.endsWith(name.replace(/\.ts$/, '.d.ts')))?.[1];

  it('reports no diagnostics', () => {
    expect(diagnostics).toEqual([]);
  });

  it('emits declarations for a contract', () => {
    const declaration = declarationOf('shared-contract.ts');

    expect(declaration).toContain('export declare const api');
    expect(declaration).toContain('export declare const getProduct');
  });

  it('emits declarations for a client created through the client subpath', () => {
    const declaration = declarationOf('shared-client.ts');

    expect(declaration).toContain('export declare const client');
    expect(declaration).toContain('export declare const loadProduct');
  });
});
