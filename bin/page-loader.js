#!/usr/bin/env node

import { Command } from 'commander';
import pageLoader from '../src/index.js';

const program = new Command();

program
  .name('page-loader')
  .description('Page loader utility')
  .version('1.0.0')
  .argument('<url>', 'URL to download')
  .option('-o, --output <dir>', 'output dir', process.cwd())
  .option('-d, --debug', 'enable debug logging')
  .action(async (url, options) => {
    if (options.debug) {
      process.env.DEBUG = 'page-loader';
    }

    try {
      const filepath = await pageLoader(url, options.output);
      console.log(filepath);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
