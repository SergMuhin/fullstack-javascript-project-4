import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import nock from 'nock';
import pageLoader from '../src/index.js';

// Enable debug logging for tests
process.env.DEBUG = 'page-loader';

describe('pageLoader with images', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should download page with images and update HTML links', async () => {
    const url = 'https://ru.hexlet.io/courses';
    const expectedFilename = 'ru-hexlet-io-courses.html';
    const expectedPath = path.join(tempDir, expectedFilename);
    const expectedFilesDir = path.join(tempDir, 'ru-hexlet-io-courses_files');

    const htmlContent = `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <title>Курсы по программированию Хекслет</title>
  </head>
  <body>
    <img src="/assets/professions/nodejs.png" alt="Иконка профессии Node.js-программист" />
    <h3>
      <a href="/professions/nodejs">Node.js-программист</a>
    </h3>
  </body>
</html>`;

    const imageContent = Buffer.from('fake-image-data');

    nock('https://ru.hexlet.io')
      .get('/courses')
      .reply(200, htmlContent)
      .get('/assets/professions/nodejs.png')
      .reply(200, imageContent);

    const result = await pageLoader(url, tempDir);

    expect(result).toBe(expectedPath);

    // Check that HTML file was created
    const savedHtml = await fs.readFile(expectedPath, 'utf-8');
    expect(savedHtml).toContain(
      'ru-hexlet-io-courses_files/ru-hexlet-io-assets-professions-nodejs.png',
    );

    // Check that files directory was created
    const filesDirExists = await fs
      .access(expectedFilesDir)
      .then(() => true)
      .catch(() => false);
    expect(filesDirExists).toBe(true);

    // Check that image was downloaded
    const imagePath = path.join(
      expectedFilesDir,
      'ru-hexlet-io-assets-professions-nodejs.png',
    );
    const savedImage = await fs.readFile(imagePath);
    expect(savedImage).toEqual(imageContent);
  });

  test('should handle multiple images', async () => {
    const url = 'https://example.com';
    const htmlContent = `<!DOCTYPE html>
<html>
  <body>
    <img src="/image1.png" alt="Image 1" />
    <img src="/image2.jpg" alt="Image 2" />
  </body>
</html>`;

    const image1Content = Buffer.from('image1-data');
    const image2Content = Buffer.from('image2-data');

    nock('https://example.com')
      .get('/')
      .reply(200, htmlContent)
      .get('/image1.png')
      .reply(200, image1Content)
      .get('/image2.jpg')
      .reply(200, image2Content);

    const result = await pageLoader(url, tempDir);

    const savedHtml = await fs.readFile(result, 'utf-8');
    expect(savedHtml).toContain('example-com_files/example-com-image1.png');
    expect(savedHtml).toContain('example-com_files/example-com-image2.jpg');

    const filesDir = path.join(tempDir, 'example-com_files');
    const image1Path = path.join(filesDir, 'example-com-image1.png');
    const image2Path = path.join(filesDir, 'example-com-image2.jpg');

    const savedImage1 = await fs.readFile(image1Path);
    const savedImage2 = await fs.readFile(image2Path);

    expect(savedImage1).toEqual(image1Content);
    expect(savedImage2).toEqual(image2Content);
  });

  test('should handle image download errors gracefully', async () => {
    const url = 'https://example.com';
    const htmlContent = `<!DOCTYPE html>
<html>
  <body>
    <img src="/missing-image.png" alt="Missing image" />
  </body>
</html>`;

    nock('https://example.com')
      .get('/')
      .reply(200, htmlContent)
      .get('/missing-image.png')
      .reply(404, 'Not Found');

    // Should succeed even if image download fails
    const result = await pageLoader(url, tempDir);
    expect(result).toBeDefined();

    const savedContent = await fs.readFile(result, 'utf-8');
    // The image src should remain unchanged since download failed
    expect(savedContent).toContain('src="/missing-image.png"');
  });
});
