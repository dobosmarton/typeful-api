import path from 'node:path';
import pc from 'picocolors';
import { generateClientFile, isUrl } from '../client-generator';
import { watchFile } from '../watch';

type GenerateClientCommandOptions = {
  /** Local spec file or URL (e.g. a service's /api-doc) */
  spec: string;
  /** `.ts` for a typed client module, `.d.ts` for types only */
  out: string;
  /** Headers for fetching a spec URL */
  headers?: Record<string, string>;
  watch?: boolean;
};

const generate = async (options: GenerateClientCommandOptions): Promise<void> => {
  const { outPath, kind, routeCount } = await generateClientFile(options);
  const relative = path.relative(process.cwd(), outPath) || outPath;
  console.log(
    kind === 'module'
      ? pc.green(
          `✅ Typed client generated: ${relative} (${routeCount} route${routeCount === 1 ? '' : 's'})`,
        )
      : pc.green(`✅ TypeScript types generated: ${relative}`),
  );
};

/**
 * Generate a typed client module (`.ts`) or types only (`.d.ts`) from an OpenAPI spec
 */
export async function generateClientCommand(options: GenerateClientCommandOptions): Promise<void> {
  console.log(pc.cyan('🔧 Generating client from OpenAPI spec...'));
  console.log(pc.gray(`  Spec: ${options.spec}`));
  console.log(pc.gray(`  Output: ${options.out}`));

  try {
    if (options.watch && isUrl(options.spec)) {
      throw new Error('--watch needs a local spec file; it cannot watch a URL');
    }

    await generate(options);

    if (options.watch) {
      console.log(pc.yellow('\n👀 Watching for changes...'));
      watchFile(options.spec, async () => {
        console.log(pc.gray(`\n🔧 Spec changed, regenerating...`));
        try {
          await generate(options);
        } catch (error) {
          console.error(pc.red(`❌ Error regenerating client:`), error);
        }
      });
    }
  } catch (error) {
    console.error(pc.red('❌ Error generating client:'));
    if (error instanceof Error) {
      console.error(pc.red(`   ${error.message}`));
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}
