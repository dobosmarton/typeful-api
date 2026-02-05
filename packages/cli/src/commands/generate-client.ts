import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';

type GenerateClientCommandOptions = {
  spec: string;
  out: string;
  watch?: boolean;
};

/**
 * Generate TypeScript client types from OpenAPI spec using openapi-typescript
 */
export async function generateClientCommand(
  options: GenerateClientCommandOptions,
): Promise<void> {
  console.log(pc.cyan('🔧 Generating TypeScript client types...'));
  console.log(pc.gray(`  Spec: ${options.spec}`));
  console.log(pc.gray(`  Output: ${options.out}`));

  try {
    const specPath = path.resolve(process.cwd(), options.spec);

    // Check if spec file exists
    if (!fs.existsSync(specPath)) {
      throw new Error(`OpenAPI spec file not found: ${specPath}`);
    }

    // Read the spec
    const specContent = fs.readFileSync(specPath, 'utf-8');
    let spec: object;
    try {
      spec = JSON.parse(specContent);
    } catch {
      throw new Error('Invalid JSON in OpenAPI spec file');
    }

    // Dynamically import openapi-typescript
    let openapiTS: typeof import('openapi-typescript').default;
    let astToString: typeof import('openapi-typescript').astToString;
    try {
      const module = await import('openapi-typescript');
      openapiTS = module.default;
      astToString = module.astToString;
    } catch {
      throw new Error(
        'openapi-typescript is required for client generation. ' +
        'It should be installed as a dependency of @typefulapi/cli.',
      );
    }

    // Generate types (v7 returns AST nodes)
    const ast = await openapiTS(spec as Parameters<typeof openapiTS>[0]);
    const output = astToString(ast);

    // Ensure output directory exists
    const outDir = path.dirname(path.resolve(process.cwd(), options.out));
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Write the types
    const outPath = path.resolve(process.cwd(), options.out);
    fs.writeFileSync(outPath, output, 'utf-8');

    console.log(pc.green(`✅ TypeScript types generated: ${outPath}`));

    // Watch mode
    if (options.watch) {
      console.log(pc.yellow('\n👀 Watching for changes...'));

      fs.watch(specPath, async (eventType) => {
        if (eventType === 'change') {
          console.log(pc.gray(`\n🔧 Spec changed, regenerating types...`));
          try {
            const updatedSpecContent = fs.readFileSync(specPath, 'utf-8');
            const updatedSpec = JSON.parse(updatedSpecContent);
            const updatedAst = await openapiTS(updatedSpec);
            const updatedOutput = astToString(updatedAst);
            fs.writeFileSync(outPath, updatedOutput, 'utf-8');
            console.log(pc.green(`✅ Types regenerated`));
          } catch (error) {
            console.error(pc.red(`❌ Error regenerating types:`), error);
          }
        }
      });
    }
  } catch (error) {
    console.error(pc.red('❌ Error generating client types:'));
    if (error instanceof Error) {
      console.error(pc.red(`   ${error.message}`));
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}
