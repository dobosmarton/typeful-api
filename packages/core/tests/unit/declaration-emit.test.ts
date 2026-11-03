import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const fixture = fileURLToPath(new URL('../fixtures/shared-contract.ts', import.meta.url));

/**
 * Contracts usually live in a shared package that is built with declarations. TypeScript must
 * then be able to name every type a route infers, so each one has to be exported from the
 * package entry. This compiles a fixture against the built dist and fails on naming errors
 * such as TS4023 ("has or is using name ... but cannot be named").
 */
describe('declaration emit for exported contracts', () => {
  it('emits declarations without diagnostics', () => {
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

    const program = ts.createProgram([fixture], options, host);
    const result = program.emit();
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics].map(
      (diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    );

    expect(diagnostics).toEqual([]);
    const declaration = [...emitted].find(([file]) => file.endsWith('shared-contract.d.ts'))?.[1];
    expect(declaration).toContain('export declare const api');
    expect(declaration).toContain('export declare const getProduct');
  });
});
