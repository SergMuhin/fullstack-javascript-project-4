import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import nock from 'nock';
import pageLoader from '../src/index.js';

describe('pageLoader with HTML resources', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
    nock.cleanAll();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    nock.cleanAll();
  });

  test('should download HTML file from a[href] link', async () => {
    const url = 'https://site.com/blog';
    const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <title>Blog</title>
  </head>
  <body>
    <a href="/blog/about.html">About</a>
  </body>
</html>`;

    const aboutHtmlContent = '<html><body>About page</body></html>';

    nock('https://site.com')
      .get('/blog')
      .reply(200, htmlContent)
      .get('/blog/about.html')
      .reply(200, aboutHtmlContent);

    const result = await pageLoader(url, tempDir);

    expect(result).toBe(path.join(tempDir, 'site-com-blog.html'));

    // Check that main HTML file was created
    const savedHtml = await fs.readFile(result, 'utf-8');
    expect(savedHtml).toContain('site-com-blog_files');

    // Check that files directory was created
    const filesDir = path.join(tempDir, 'site-com-blog_files');
    const filesDirExists = await fs
      .access(filesDir)
      .then(() => true)
      .catch(() => false);
    expect(filesDirExists).toBe(true);

    // Check that HTML resource was downloaded
    const expectedHtmlFile = path.join(filesDir, 'site-com-blog-about.html');
    const htmlFileExists = await fs
      .access(expectedHtmlFile)
      .then(() => true)
      .catch(() => false);

    expect(htmlFileExists).toBe(true);

    // Check content of downloaded HTML file
    const downloadedHtml = await fs.readFile(expectedHtmlFile, 'utf-8');
    expect(downloadedHtml).toBe(aboutHtmlContent);

    // Check that link was updated in main HTML
    expect(savedHtml).toContain('site-com-blog_files/site-com-blog-about.html');
  });
});
