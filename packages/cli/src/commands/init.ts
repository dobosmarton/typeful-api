import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { getTsConfig, getGitIgnore, getApiTs } from '../templates/shared';
import * as honoTemplate from '../templates/hono';
import * as expressTemplate from '../templates/express';
import * as fastifyTemplate from '../templates/fastify';

type Template = 'hono' | 'express' | 'fastify';

type InitCommandOptions = {
  template: string;
  dir?: string;
  name?: string;
};

const templates: Record<
  Template,
  { getPackageJson: (name: string) => string; getIndexTs: () => string }
> = {
  hono: honoTemplate,
  express: expressTemplate,
  fastify: fastifyTemplate,
};

const isValidTemplate = (template: string): template is Template => {
  return template in templates;
};

/**
 * Initialize a new typeful-api project from a template
 */
export const initCommand = async (options: InitCommandOptions): Promise<void> => {
  const template = options.template;

  if (!isValidTemplate(template)) {
    console.error(pc.red(`Invalid template: ${template}. Choose from: hono, express, fastify`));
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), options.dir ?? '.');
  const projectName = options.name ?? path.basename(targetDir);

  console.log(pc.cyan(`Initializing typeful-api project...`));
  console.log(pc.gray(`  Template: ${template}`));
  console.log(pc.gray(`  Directory: ${targetDir}`));
  console.log(pc.gray(`  Name: ${projectName}`));

  try {
    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    } else {
      // Check if directory has files (ignore hidden files and common non-project files)
      const entries = fs
        .readdirSync(targetDir)
        .filter((e) => !e.startsWith('.') && e !== 'node_modules');
      if (entries.length > 0) {
        console.error(pc.red(`Directory is not empty: ${targetDir}`));
        console.error(pc.gray('  Use an empty directory or create a new one with --dir <name>'));
        process.exit(1);
      }
    }

    // Create src directory
    const srcDir = path.join(targetDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Get template-specific files
    const tmpl = templates[template];

    // Write all project files
    const files: Record<string, string> = {
      'package.json': tmpl.getPackageJson(projectName),
      'tsconfig.json': getTsConfig(),
      '.gitignore': getGitIgnore(),
      'src/api.ts': getApiTs(),
      'src/index.ts': tmpl.getIndexTs(),
    };

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(targetDir, filePath);
      fs.writeFileSync(fullPath, content, 'utf-8');
    }

    console.log('');
    console.log(pc.green('Project created successfully!'));
    console.log('');
    console.log(pc.cyan('Next steps:'));

    if (options.dir && options.dir !== '.') {
      console.log(pc.white(`  cd ${options.dir}`));
    }
    console.log(pc.white('  npm install'));
    console.log(pc.white('  npm run dev'));
    console.log('');
  } catch (error) {
    console.error(pc.red('Error initializing project:'));
    if (error instanceof Error) {
      console.error(pc.red(`  ${error.message}`));
    } else {
      console.error(error);
    }
    process.exit(1);
  }
};
