import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import nock from 'nock';
import pageLoader from '../src/index.js';

// Enable debug logging for tests
process.env.DEBUG = 'page-loader';

describe('pageLoader', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should download page and save to file', async () => {
    const url = 'https://ru.hexlet.io/courses';
    const expectedFilename = 'ru-hexlet-io-courses.html';
    const expectedPath = path.join(tempDir, expectedFilename);
    const htmlContent = '<html><body>Test content</body></html>';

    nock('https://ru.hexlet.io').get('/courses').reply(200, htmlContent);

    const result = await pageLoader(url, tempDir);

    expect(result).toBe(expectedPath);

    const savedContent = await fs.readFile(expectedPath, 'utf-8');
    expect(savedContent).toBe(htmlContent);
  });

  test('should use current directory as default output', async () => {
    const url = 'https://example.com';
    const expectedFilename = 'example-com.html';
    const htmlContent = '<html><body>Test</body></html>';

    nock('https://example.com').get('/').reply(200, htmlContent);

    const result = await pageLoader(url);

    expect(result).toBe(path.join(process.cwd(), expectedFilename));

    const savedContent = await fs.readFile(result, 'utf-8');
    expect(savedContent).toBe(htmlContent);

    // Clean up
    await fs.unlink(result);
  });

  test('should handle network errors', async () => {
    const url = 'https://example.com';

    nock('https://example.com').get('/').replyWithError('Network error');

    await expect(pageLoader(url, tempDir)).rejects.toThrow();
  });

  test('should handle HTTP errors', async () => {
    const url = 'https://example.com';

    nock('https://example.com').get('/').reply(404, 'Not Found');

    await expect(pageLoader(url, tempDir)).rejects.toThrow();
  });
});
