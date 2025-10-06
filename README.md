# Page Loader

[![Actions Status](https://github.com/SergMuhin/fullstack-javascript-project-4/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/SergMuhin/fullstack-javascript-project-4/actions)

Page loader utility that downloads web pages and saves them to the specified directory. Automatically downloads all local resources (CSS, JS, images) and updates HTML links to point to local files.

## Installation

```bash
npm install @hexlet/code
```

## Usage

```bash
# Download page to current directory
page-loader https://ru.hexlet.io/courses

# Download page to specific directory
page-loader --output /var/tmp https://ru.hexlet.io/courses
/var/tmp/ru-hexlet-io-courses.html

# Show help
page-loader --help
```

## Example

```
$ page-loader https://ru.hexlet.io/courses
/Users/user/ru-hexlet-io-courses.html

$ ls ru-hexlet-io-courses*
ru-hexlet-io-courses.html
ru-hexlet-io-courses_files/

$ ls ru-hexlet-io-courses_files/
ru-hexlet-io-assets-professions-nodejs.png
ru-hexlet-io-vite-assets-logo-ru-light.svg
ru-hexlet-io-vite-assets-application-Bq-tcDww.css
ru-hexlet-io-vite-assets-application-B9wqQAai.js
...

$ open ru-hexlet-io-courses.html
```

## Error Handling

The utility handles various error conditions gracefully:

```bash
# Network errors
$ page-loader https://nonexistent-site.com
Error: Network error: Unable to connect to https://nonexistent-site.com

# HTTP errors
$ page-loader https://httpstat.us/404
Error: HTTP 404: Not Found - https://httpstat.us/404

# File system errors
$ page-loader https://example.com --output /invalid/path
Error: Directory not found: /invalid/path

# Invalid URLs
$ page-loader not-a-valid-url
Error: Invalid URL: not-a-valid-url
```

All errors are written to STDERR and the program exits with code 1 on failure.

## Debug Logging

Enable debug logging to see detailed information about the download process:

```bash
# Enable debug logging
$ page-loader --debug https://ru.hexlet.io/courses
2025-10-05T22:33:57.333Z page-loader Starting page download: https://ru.hexlet.io/courses to /Users/user
2025-10-05T22:33:57.334Z page-loader Generated filename: ru-hexlet-io-courses.html
2025-10-05T22:33:57.340Z page-loader Successfully downloaded page, size: 329 bytes
2025-10-05T22:33:57.446Z page-loader Found local resources: true
2025-10-05T22:33:57.447Z page-loader Creating files directory: /Users/user/ru-hexlet-io-courses_files
2025-10-05T22:33:57.448Z page-loader Processing resources for base URL: https://ru.hexlet.io/courses
2025-10-05T22:33:57.450Z page-loader Found local image: https://ru.hexlet.io/assets/professions/nodejs.png
2025-10-05T22:33:57.451Z page-loader Downloading resource: https://ru.hexlet.io/assets/professions/nodejs.png
2025-10-05T22:33:57.476Z page-loader Resource downloaded, size: 15 bytes, saving as: ru-hexlet-io-assets-professions-nodejs.png
2025-10-05T22:33:57.476Z page-loader Updated image src to: ru-hexlet-io-courses_files/ru-hexlet-io-assets-professions-nodejs.png
2025-10-05T22:33:57.476Z page-loader All resources downloaded successfully
2025-10-05T22:33:57.476Z page-loader Page saved successfully: /Users/user/ru-hexlet-io-courses.html
/Users/user/ru-hexlet-io-courses.html
```

You can also enable debug logging for specific namespaces:

```bash
# Enable all debug logging
$ DEBUG=* page-loader https://example.com

# Enable only page-loader debug logging
$ DEBUG=page-loader page-loader https://example.com

# Enable axios and page-loader debug logging
$ DEBUG=axios,page-loader page-loader https://example.com
```

## Progress Display

The utility shows real-time progress when downloading resources:

```bash
$ page-loader https://example.com
[01:43:56] Downloading image: logo.png [started]
[01:43:56] Downloading CSS: style.css [started]
[01:43:56] Downloading JS: app.js [started]
[01:43:56] ✓ Downloaded image: logo.png [completed]
[01:43:56] ✓ Downloaded CSS: style.css [completed]
[01:43:56] ✓ Downloaded JS: app.js [completed]
/Users/user/example-com.html
```

Resources are downloaded in parallel for optimal performance. Failed downloads are marked with ✗ but don't stop the process.

## Features

- Downloads web pages via HTTP/HTTPS
- Saves pages as HTML files
- **Downloads all local resources automatically (CSS, JS, images)**
- **Updates HTML links to point to local files**
- **Ignores external resources (different domains)**
- Generates filenames from URLs (replaces non-alphanumeric characters with dashes)
- Supports custom output directory
- Handles network and HTTP errors gracefully
- Built with Promises (no async/await in library code)
- Creates `_files` directory for resources

## How it works

1. Downloads the main HTML page
2. Parses HTML to find resource tags (`<img>`, `<link>`, `<script>`)
3. Downloads all local resources (same domain) to a `_files` directory
4. Updates HTML links to point to local resource files
5. Saves the modified HTML file
6. Ignores external resources (different domains)

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```