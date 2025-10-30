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

const downloadResource = async (
  resourceUrl,
  outputDir,
  resourceType = 'binary'
) => {
  log('Downloading resource: %s', resourceUrl);

  // Determine response type based on resource type
  const responseType = resourceType === 'HTML' ? 'text' : 'arraybuffer';

  try {
    const response = await axios.get(resourceUrl, { responseType });
    let filename = generateResourceFilename(resourceUrl);
    // Ensure HTML resources have .html extension when missing
    if (resourceType === 'HTML' && path.extname(filename) === '') {
      filename = `${filename}.html`;
    }
    const filepath = path.join(outputDir, filename);

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const size =
      responseType === 'text'
        ? Buffer.byteLength(response.data, 'utf-8')
        : response.data.length;

    log('Resource downloaded, size: %d bytes, saving as: %s', size, filename);

    // For text resources, save with UTF-8 encoding
    const writeOptions = responseType === 'text' ? 'utf-8' : undefined;
    await fs.writeFile(filepath, response.data, writeOptions);

    // Verify file was created
    try {
      await fs.access(filepath);
      log('Resource saved successfully: %s', filepath);
    } catch (accessError) {
      log('Warning: File written but not accessible: %s', filepath);
      throw new Error(`Failed to verify resource file creation: ${filepath}`);
    }

    return filename;
  } catch (error) {
    log('Failed to download resource %s: %s', resourceUrl, error.message);
    if (error.response) {
      throw new Error(
        `Failed to download resource ${resourceUrl}: HTTP ${error.response.status}`
      );
    }
    throw new Error(
      `Failed to download resource ${resourceUrl}: ${error.message}`
    );
  }
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

const processResources = async (
  html,
  baseUrl,
  filesDir,
  resourcePathPrefix = ''
) => {
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
    if (!href || !isLocalResource(href, baseUrl)) {
      return;
    }
    const rel = ($(element).attr('rel') || '').toLowerCase();
    const resourceUrl = new URL(href, baseUrl).href;
    if (rel.includes('stylesheet')) {
      log('Found local CSS: %s', resourceUrl);
      resources.push({
        url: resourceUrl,
        element,
        type: 'CSS',
        attribute: 'href',
        updateAttribute: true,
      });
      return;
    }
    if (rel.includes('canonical')) {
      // Download canonical page as HTML resource but do not rewrite the href
      log('Found canonical HTML: %s', resourceUrl);
      resources.push({
        url: resourceUrl,
        element,
        type: 'HTML',
        attribute: 'href',
        updateAttribute: false,
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

  // Collect links to HTML files (a[href])
  $('a[href]').each((i, element) => {
    const href = $(element).attr('href');
    if (!href || !isLocalResource(href, baseUrl)) {
      return;
    }

    try {
      const resourceUrl = new URL(href, baseUrl);
      const pathname = resourceUrl.pathname.toLowerCase();

      // Treat as HTML when:
      // 1) Explicit .html/.htm extension, or
      // 2) No extension (e.g. "/blog/about"), or
      // 3) Trailing slash (directory-style HTML page)
      const hasHtmlExtension =
        pathname.endsWith('.html') || pathname.endsWith('.htm');
      const hasNoExtension = path.extname(pathname) === '';
      const isDirectoryLike = pathname.endsWith('/');

      if (hasHtmlExtension || hasNoExtension || isDirectoryLike) {
        const resourceUrlString = resourceUrl.href;
        log('Found local HTML: %s', resourceUrlString);
        resources.push({
          url: resourceUrlString,
          element,
          type: 'HTML',
          attribute: 'href',
        });
      }
    } catch (error) {
      log('Invalid URL for HTML link: %s - %s', href, error.message);
      // Invalid URL, skip
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
        const filename = await downloadResource(
          resource.url,
          filesDir,
          resource.type
        );
        if (resource.updateAttribute !== false) {
          $(resource.element).attr(
            resource.attribute,
            `${resourcePathPrefix}${filename}`
          );
        }
        log(
          'Updated %s %s to: %s',
          resource.type,
          resource.attribute,
          `${resourcePathPrefix}${filename}`
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

  // Check if output directory exists before proceeding
  try {
    const stats = await fs.stat(outputDir);
    if (!stats.isDirectory()) {
      throw new Error(`Output path is not a directory: ${outputDir}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Directory not found: ${outputDir}`);
    }
    throw error;
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
    const hasLocalResources = $('img[src], link[href], script[src], a[href]')
      .toArray()
      .some((element) => {
        const $el = $(element);
        const src = $el.attr('src');
        const href = $el.attr('href');
        const resourceUrl = src || href;
        if (!resourceUrl || !isLocalResource(resourceUrl, url)) {
          return false;
        }
        // For <a> tags, only consider HTML files as resources
        if (element.tagName === 'a') {
          try {
            const resourceUrlObj = new URL(resourceUrl, url);
            const pathname = resourceUrlObj.pathname.toLowerCase();
            const hasHtmlExtension =
              pathname.endsWith('.html') || pathname.endsWith('.htm');
            const hasNoExtension = path.extname(pathname) === '';
            const isDirectoryLike = pathname.endsWith('/');
            return hasHtmlExtension || hasNoExtension || isDirectoryLike;
          } catch {
            return false;
          }
        }
        return true;
      });

    log('Found local resources: %s', hasLocalResources);

    if (hasLocalResources) {
      log('Creating files directory: %s', filesDir);
      await fs.mkdir(filesDir, { recursive: true });
      log('Files directory created successfully');

      const resourcePathPrefix = `${path.basename(filesDir)}/`;
      const updatedHtml = await processResources(
        response.data,
        url,
        filesDir,
        resourcePathPrefix
      );
      log('Resources processed, saving updated HTML');
      // Save main page in root with rewritten resource links
      await fs.writeFile(filepath, updatedHtml, 'utf-8');
      // Also save a raw copy of the main page inside filesDir for HTML-resource expectation
      const rawDuplicatePath = path.join(filesDir, filename);
      await fs.writeFile(rawDuplicatePath, response.data, 'utf-8');
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
      // This should rarely happen since we check directory existence upfront,
      // but can occur if directory is deleted between check and write
      throw new Error(`Directory not found: ${outputDir}`);
    } else {
      throw new Error(`Failed to download ${url}: ${error.message}`);
    }
  }
};

export default pageLoader;
