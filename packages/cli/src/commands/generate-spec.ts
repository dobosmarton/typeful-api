import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
import pc from 'picocolors';
import { generateSpecJson, type ApiContract, type GenerateSpecOptions } from '@typeful-api/core';

type GenerateSpecCommandOptions = {
  contract: string;
  out: string;
  title: string;
  apiVersion: string;
  description?: string;
  server?: string | string[];
  pretty: boolean;
  watch?: boolean;
};

/**
 * Load the API contract from a TypeScript/JavaScript file
 * Uses jiti to handle TypeScript files at runtime without requiring pre-compilation
 */
async function loadContract(contractPath: string): Promise<ApiContract> {
  const absolutePath = path.resolve(process.cwd(), contractPath);

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Contract file not found: ${absolutePath}`);
  }

  try {
    // Use jiti to load TypeScript/ESM files at runtime
    const jiti = createJiti(import.meta.url, {
      interopDefault: true,
      moduleCache: false, // Disable cache for watch mode support
    });

    const module = await jiti.import(absolutePath);

    // Look for common export patterns
    if (module && typeof module === 'object') {
      const mod = module as Record<string, unknown>;
      if (mod.api) {
        return mod.api as ApiContract;
      }
      if (mod.default) {
        return mod.default as ApiContract;
      }
      if (mod.contract) {
        return mod.contract as ApiContract;
      }

      // If the module itself looks like a contract, return it
      if (Object.keys(mod).some((k) => k.startsWith('v'))) {
        return mod as ApiContract;
      }
    }

    throw new Error(
      'Could not find API contract export. Export it as "api", "contract", or default.',
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load contract: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Generate OpenAPI spec from contract file
 */
export async function generateSpecCommand(options: GenerateSpecCommandOptions): Promise<void> {
  console.log(pc.cyan('📝 Generating OpenAPI spec...'));
  console.log(pc.gray(`  Contract: ${options.contract}`));
  console.log(pc.gray(`  Output: ${options.out}`));

  try {
    // Load the contract
    const contract = await loadContract(options.contract);

    // Build spec options
    const specOptions: GenerateSpecOptions = {
      info: {
        title: options.title,
        version: options.apiVersion,
        description: options.description,
      },
    };

    // Add servers if specified
    if (options.server) {
      const servers = Array.isArray(options.server) ? options.server : [options.server];
      specOptions.servers = servers.map((url) => ({ url }));
    }

    // Generate the spec
    const specJson = generateSpecJson(contract, specOptions, options.pretty);

    // Ensure output directory exists
    const outDir = path.dirname(path.resolve(process.cwd(), options.out));
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Write the spec
    const outPath = path.resolve(process.cwd(), options.out);
    fs.writeFileSync(outPath, specJson, 'utf-8');

    console.log(pc.green(`✅ OpenAPI spec generated: ${outPath}`));

    // Watch mode
    if (options.watch) {
      console.log(pc.yellow('\n👀 Watching for changes...'));
      const contractPath = path.resolve(process.cwd(), options.contract);

      fs.watch(contractPath, async (eventType) => {
        if (eventType === 'change') {
          console.log(pc.gray(`\n📝 Contract changed, regenerating...`));
          try {
            // Clear module cache for hot reload
            delete require.cache[contractPath];

            const updatedContract = await loadContract(options.contract);
            const updatedSpec = generateSpecJson(updatedContract, specOptions, options.pretty);
            fs.writeFileSync(outPath, updatedSpec, 'utf-8');
            console.log(pc.green(`✅ Spec regenerated`));
          } catch (error) {
            console.error(pc.red(`❌ Error regenerating spec:`), error);
          }
        }
      });
    }
  } catch (error) {
    console.error(pc.red('❌ Error generating spec:'));
    if (error instanceof Error) {
      console.error(pc.red(`   ${error.message}`));
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}
