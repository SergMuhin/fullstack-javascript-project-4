import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import debug from 'debug';
import * as cheerio from 'cheerio';
import Listr from 'listr';

const log = debug('page-loader');

const generateFilename = (url) => {
  const urlObj = new URL(url);
  const { hostname, pathname } = urlObj;

  let filename = hostname + pathname;
  filename = filename.replace(/[^a-zA-Z0-9]/g, '-');
  filename = filename.replace(/-+/g, '-');
  filename = filename.replace(/^-|-$/g, '');

  return `${filename}.html`;
};

const generateResourceFilename = (url) => {
  const urlObj = new URL(url);
  const { hostname, pathname } = urlObj;

  let filename = hostname.replace(/\./g, '-') + pathname;
  filename = filename.replace(/[^a-zA-Z0-9.]/g, '-');
  filename = filename.replace(/-+/g, '-');
  filename = filename.replace(/^-|-$/g, '');

  // Limit filename length to avoid filesystem issues
  if (filename.length > 200) {
    const ext = path.extname(filename);
    const nameWithoutExt = filename.slice(0, filename.lastIndexOf(ext));
    filename = nameWithoutExt.slice(0, 200 - ext.length) + ext;
  }

  return filename;
};

const downloadResource = (resourceUrl, outputDir) => {
  log('Downloading resource: %s', resourceUrl);

  return axios
    .get(resourceUrl, { responseType: 'arraybuffer' })
    .then((response) => {
      const filename = generateResourceFilename(resourceUrl);
      const filepath = path.join(outputDir, filename);

      log(
        'Resource downloaded, size: %d bytes, saving as: %s',
        response.data.length,
        filename
      );

      return fs.writeFile(filepath, response.data).then(() => {
        log('Resource saved successfully: %s', filepath);
        return filename;
      });
    })
    .catch((error) => {
      log('Failed to download resource %s: %s', resourceUrl, error.message);
      throw new Error(
        `Failed to download resource ${resourceUrl}: ${error.message}`
      );
    });
};

const isLocalResource = (url, baseUrl) => {
  try {
    const resourceUrl = new URL(url, baseUrl);
    const baseUrlObj = new URL(baseUrl);
    return resourceUrl.hostname === baseUrlObj.hostname;
  } catch {
    return false;
  }
};

const processResources = async (html, baseUrl, filesDir) => {
  log('Processing resources for base URL: %s', baseUrl);

  const $ = cheerio.load(html);
  const resources = [];

  // Collect all local resources
  $('img').each((i, element) => {
    const src = $(element).attr('src');
    if (src && isLocalResource(src, baseUrl)) {
      const resourceUrl = new URL(src, baseUrl).href;
      log('Found local image: %s', resourceUrl);
      resources.push({
        url: resourceUrl,
        element,
        type: 'image',
        attribute: 'src',
      });
    }
  });

  $('link[href]').each((i, element) => {
    const href = $(element).attr('href');
    if (href && isLocalResource(href, baseUrl)) {
      const resourceUrl = new URL(href, baseUrl).href;
      log('Found local CSS: %s', resourceUrl);
      resources.push({
        url: resourceUrl,
        element,
        type: 'CSS',
        attribute: 'href',
      });
    }
  });

  $('script[src]').each((i, element) => {
    const src = $(element).attr('src');
    if (src && isLocalResource(src, baseUrl)) {
      const resourceUrl = new URL(src, baseUrl).href;
      log('Found local JS: %s', resourceUrl);
      resources.push({
        url: resourceUrl,
        element,
        type: 'JS',
        attribute: 'src',
      });
    }
  });

  log('Total resources to download: %d', resources.length);

  if (resources.length === 0) {
    return $.html();
  }

  // Create tasks for listr
  const tasks = resources.map((resource) => ({
    title: `Downloading ${resource.type}: ${path.basename(resource.url)}`,
    task: async (ctx, task) => {
      try {
        const filename = await downloadResource(resource.url, filesDir);
        const filesDirName = path.basename(filesDir);
        $(resource.element).attr(
          resource.attribute,
          `${filesDirName}/${filename}`
        );
        log(
          'Updated %s %s to: %s',
          resource.type,
          resource.attribute,
          `${filesDirName}/${filename}`
        );
        // eslint-disable-next-line no-param-reassign
        task.title = `✓ Downloaded ${resource.type}: ${path.basename(
          resource.url
        )}`;
      } catch (error) {
        log(
          'Failed to download %s: %s - %s',
          resource.type,
          resource.url,
          error.message
        );
        // eslint-disable-next-line no-param-reassign
        task.title = `✗ Failed ${resource.type}: ${path.basename(
          resource.url
        )}`;
        // Don't throw here, just log the error and continue
      }
    },
  }));

  // Run tasks with listr
  const listr = new Listr(tasks, {
    concurrent: true,
    exitOnError: false,
  });

  await listr.run();

  return $.html();
};

const pageLoader = async (url, outputDir = process.cwd()) => {
  log('Starting page download: %s to %s', url, outputDir);

  // Validate URL
  try {
    const urlObj = new URL(url);
    if (!urlObj) {
      throw new Error(`Invalid URL: ${url}`);
    }
  } catch (error) {
    throw new Error(`Invalid URL: ${url}`);
  }

  const filename = generateFilename(url);
  const filepath = path.join(outputDir, filename);
  const filesDirName = filename.replace('.html', '_files');
  const filesDir = path.join(outputDir, filesDirName);

  log('Generated filename: %s', filename);
  log('Output filepath: %s', filepath);
  log('Files directory: %s', filesDir);

  try {
    const response = await axios.get(url);
    log('Successfully downloaded page, size: %d bytes', response.data.length);

    const $ = cheerio.load(response.data);
    const hasLocalResources = $('img[src], link[href], script[src]')
      .toArray()
      .some((element) => {
        const $el = $(element);
        const src = $el.attr('src');
        const href = $el.attr('href');
        const resourceUrl = src || href;
        return resourceUrl && isLocalResource(resourceUrl, url);
      });

    log('Found local resources: %s', hasLocalResources);

    if (hasLocalResources) {
      log('Creating files directory: %s', filesDir);
      await fs.mkdir(filesDir, { recursive: true });
      log('Files directory created successfully');

      const updatedHtml = await processResources(response.data, url, filesDir);
      log('Resources processed, saving updated HTML');
      await fs.writeFile(filepath, updatedHtml, 'utf-8');
      log('Page saved successfully: %s', filepath);
      return filepath;
    }

    log('No local resources found, saving page directly');
    await fs.writeFile(filepath, response.data, 'utf-8');
    log('Page saved successfully: %s', filepath);
    return filepath;
  } catch (error) {
    log('Page download failed: %s', error.message);

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error(`Network error: Unable to connect to ${url}`);
    } else if (error.response) {
      const { status } = error.response;
      const statusText = error.response.statusText || 'Unknown error';
      throw new Error(`HTTP ${status}: ${statusText} - ${url}`);
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw new Error(`Permission denied: Cannot write to ${outputDir}`);
    } else if (error.code === 'ENOENT') {
      throw new Error(`Directory not found: ${outputDir}`);
    } else {
      throw new Error(`Failed to download ${url}: ${error.message}`);
    }
  }
};

export default pageLoader;
