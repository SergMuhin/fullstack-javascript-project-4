import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import nock from 'nock'
import pageLoader from '../src/index.js'

// Enable debug logging for tests
process.env.DEBUG = 'page-loader'

describe('pageLoader with all resources', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'))
    nock.cleanAll()
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    nock.cleanAll()
  })

  test('should download page with all local resources and update HTML links', async () => {
    const url = 'https://example.com/test'
    const expectedFilename = 'example-com-test.html'
    const expectedPath = path.join(tempDir, expectedFilename)
    const expectedFilesDir = path.join(tempDir, 'example-com-test_files')

    const htmlContent = `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <title>Test Page</title>
    <link rel="stylesheet" media="all" href="https://cdn2.example.com/assets/menu.css">
    <link rel="stylesheet" media="all" href="/assets/application.css" />
  </head>
  <body>
    <img src="/assets/professions/nodejs.png" alt="Test image" />
    <script src="https://js.stripe.com/v3/"></script>
    <script src="https://example.com/packs/js/runtime.js"></script>
  </body>
</html>`

    const cssContent = 'body { color: red; }'
    const jsContent = 'console.log("runtime");'
    const imageContent = Buffer.from('fake-image-data')

    const scope = nock('https://example.com')
      .get('/test')
      .reply(200, htmlContent)
      .get('/assets/application.css')
      .reply(200, cssContent)
      .get('/packs/js/runtime.js')
      .reply(200, jsContent)
      .get('/assets/professions/nodejs.png')
      .reply(200, imageContent)

    const result = await pageLoader(url, tempDir)

    expect(result).toBe(expectedPath)

    // Check that HTML file was created
    const savedHtml = await fs.readFile(expectedPath, 'utf-8')
    expect(savedHtml).toContain(
      'example-com-test_files/example-com-assets-application.css',
    )
    expect(savedHtml).toContain(
      'example-com-test_files/example-com-packs-js-runtime.js',
    )
    expect(savedHtml).toContain(
      'example-com-test_files/example-com-assets-professions-nodejs.png',
    )

    // External resources should remain unchanged
    expect(savedHtml).toContain('https://cdn2.example.com/assets/menu.css')
    expect(savedHtml).toContain('https://js.stripe.com/v3/')

    // Check that files directory was created
    const filesDirExists = await fs
      .access(expectedFilesDir)
      .then(() => true)
      .catch(() => false)
    expect(filesDirExists).toBe(true)

    // Check that CSS was downloaded
    const cssPath = path.join(
      expectedFilesDir,
      'example-com-assets-application.css',
    )
    const savedCss = await fs.readFile(cssPath, 'utf-8')
    expect(savedCss).toBe(cssContent)

    // Check that JS was downloaded
    const jsPath = path.join(
      expectedFilesDir,
      'example-com-packs-js-runtime.js',
    )
    const savedJs = await fs.readFile(jsPath, 'utf-8')
    expect(savedJs).toBe(jsContent)

    // Check that image was downloaded
    const imagePath = path.join(
      expectedFilesDir,
      'example-com-assets-professions-nodejs.png',
    )
    const savedImage = await fs.readFile(imagePath)
    expect(savedImage).toEqual(imageContent)

    expect(scope.isDone()).toBe(true)
  })

  test('should handle multiple resources of different types', async () => {
    const url = 'https://example.com'
    const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="/css/style.css">
    <link rel="stylesheet" href="/css/theme.css">
    <script src="/js/app.js"></script>
    <script src="/js/utils.js"></script>
  </head>
  <body>
    <img src="/images/logo.png" alt="Logo">
    <img src="/images/banner.jpg" alt="Banner">
  </body>
</html>`

    const css1Content = '.style { color: blue; }'
    const css2Content = '.theme { background: white; }'
    const js1Content = 'function app() {}'
    const js2Content = 'function utils() {}'
    const image1Content = Buffer.from('logo-data')
    const image2Content = Buffer.from('banner-data')

    nock('https://example.com')
      .get('/')
      .reply(200, htmlContent)
      .get('/css/style.css')
      .reply(200, css1Content)
      .get('/css/theme.css')
      .reply(200, css2Content)
      .get('/js/app.js')
      .reply(200, js1Content)
      .get('/js/utils.js')
      .reply(200, js2Content)
      .get('/images/logo.png')
      .reply(200, image1Content)
      .get('/images/banner.jpg')
      .reply(200, image2Content)

    const result = await pageLoader(url, tempDir)

    const savedHtml = await fs.readFile(result, 'utf-8')
    expect(savedHtml).toContain('example-com_files/example-com-css-style.css')
    expect(savedHtml).toContain('example-com_files/example-com-css-theme.css')
    expect(savedHtml).toContain('example-com_files/example-com-js-app.js')
    expect(savedHtml).toContain('example-com_files/example-com-js-utils.js')
    expect(savedHtml).toContain(
      'example-com_files/example-com-images-logo.png',
    )
    expect(savedHtml).toContain(
      'example-com_files/example-com-images-banner.jpg',
    )

    const filesDir = path.join(tempDir, 'example-com_files')

    // Check all files were downloaded
    const css1Path = path.join(filesDir, 'example-com-css-style.css')
    const css2Path = path.join(filesDir, 'example-com-css-theme.css')
    const js1Path = path.join(filesDir, 'example-com-js-app.js')
    const js2Path = path.join(filesDir, 'example-com-js-utils.js')
    const img1Path = path.join(filesDir, 'example-com-images-logo.png')
    const img2Path = path.join(filesDir, 'example-com-images-banner.jpg')

    const savedCss1 = await fs.readFile(css1Path, 'utf-8')
    const savedCss2 = await fs.readFile(css2Path, 'utf-8')
    const savedJs1 = await fs.readFile(js1Path, 'utf-8')
    const savedJs2 = await fs.readFile(js2Path, 'utf-8')
    const savedImg1 = await fs.readFile(img1Path)
    const savedImg2 = await fs.readFile(img2Path)

    expect(savedCss1).toBe(css1Content)
    expect(savedCss2).toBe(css2Content)
    expect(savedJs1).toBe(js1Content)
    expect(savedJs2).toBe(js2Content)
    expect(savedImg1).toEqual(image1Content)
    expect(savedImg2).toEqual(image2Content)
  })

  test('should ignore external resources', async () => {
    const url = 'https://example.com'
    const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="https://external.com/style.css">
    <script src="https://cdn.example.org/script.js"></script>
  </head>
  <body>
    <img src="https://images.example.net/logo.png" alt="Logo">
  </body>
</html>`

    nock('https://example.com').get('/').reply(200, htmlContent)

    const result = await pageLoader(url, tempDir)

    const savedHtml = await fs.readFile(result, 'utf-8')
    expect(savedHtml).toContain('https://external.com/style.css')
    expect(savedHtml).toContain('https://cdn.example.org/script.js')
    expect(savedHtml).toContain('https://images.example.net/logo.png')

    // No files directory should be created since no local resources
    const filesDir = path.join(tempDir, 'example-com_files')
    const filesDirExists = await fs
      .access(filesDir)
      .then(() => true)
      .catch(() => false)
    expect(filesDirExists).toBe(false)
  })
})
