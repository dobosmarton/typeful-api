import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

const emit = (file: string) => {
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
  const emitted = new Map<string, string>();
  host.writeFile = (fileName, text) => emitted.set(fileName, text);

  const program = ts.createProgram([file], options, host);
  const result = program.emit();
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics].map(
    (diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );
  const name = file.split('/').pop()!.replace(/\.ts$/, '.d.ts');
  const declaration = [...emitted].find(([output]) => output.endsWith(name))?.[1];
  return { diagnostics, declaration };
};

/**
 * Contracts usually live in a shared package that is built with declarations. TypeScript must
 * then be able to name every type a route infers, so each one has to be exported from the
 * package entry. This compiles a fixture against the built dist and fails on naming errors
 * such as TS4023 ("has or is using name ... but cannot be named").
 */
describe('declaration emit for exported contracts', () => {
  it('emits declarations for a contract without diagnostics', () => {
    const { diagnostics, declaration } = emit(fixture('shared-contract.ts'));

    expect(diagnostics).toEqual([]);
    expect(declaration).toContain('export declare const api');
    expect(declaration).toContain('export declare const getProduct');
  });

  it('emits declarations for a client created through the client subpath', () => {
    const { diagnostics, declaration } = emit(fixture('shared-client.ts'));

    expect(diagnostics).toEqual([]);
    expect(declaration).toContain('export declare const client');
    expect(declaration).toContain('export declare const loadProduct');
  });
});
