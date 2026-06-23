const fs = require('fs/promises');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'KeyStamina-Portable.html');

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.png': return 'image/png';
        case '.jpg': case '.jpeg': return 'image/jpeg';
        case '.svg': return 'image/svg+xml';
        case '.woff': return 'font/woff';
        case '.woff2': return 'font/woff2';
        case '.ttf': return 'font/ttf';
        default: return 'application/octet-stream';
    }
}

async function fileToBase64(filePath) {
    const data = await fs.readFile(filePath);
    const mime = getMimeType(filePath);
    return `data:${mime};base64,${data.toString('base64')}`;
}

async function processCSS(cssContent, cssFilePath) {
  const cssDir = path.dirname(cssFilePath);
  const urlRegex = /url\(['"]?(.*?)['"]?\)/g;
  let match;
  let modifiedCss = cssContent;

  const replacements = [];
  while ((match = urlRegex.exec(cssContent)) !== null) {
    const urlStr = match[1];
    if (urlStr.startsWith("data:")) continue;

    const assetPath = path.join(cssDir, urlStr);
    try {
      const base64Str = await fileToBase64(assetPath);
      replacements.push({
        original: match[0],
        replacement: `url("${base64Str}")`,
      });
    } catch (err) {
      console.warn(`Could not inline asset ${assetPath}:`, err.message);
    }
  }

  for (const r of replacements) {
    // split.join handles multiple identical urls
    modifiedCss = modifiedCss.split(r.original).join(r.replacement);
  }
  return modifiedCss;
}

async function pack() {
    console.log('Packing KeyStamina...');
    await fs.mkdir(DIST_DIR, { recursive: true });
    
    let html = await fs.readFile(path.join(SRC_DIR, 'index.html'), 'utf-8');
    
    // Inline CSS
    const linkRegex = /<link\s+rel="stylesheet"\s+href="(.*?)"\s*\/?>/g;
    let match;
    const cssReplacements = [];
    while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const cssPath = path.join(SRC_DIR, href);
        try {
            const cssContent = await fs.readFile(cssPath, 'utf-8');
            const processedCss = await processCSS(cssContent, cssPath);
            cssReplacements.push({
                original: match[0],
                replacement: `<style>\n${processedCss}\n</style>`
            });
            console.log(`Inlined CSS: ${href}`);
        } catch (err) {
            console.warn(`Failed to inline CSS ${href}:`, err.message);
        }
    }
    for (const r of cssReplacements) html = html.split(r.original).join(r.replacement);
    
    // Inline images and icons
    const imgRegex = /<(img|link)([^>]*(?:src|href)="(.*?)"[^>]*)\/?>/gi;
    const imgReplacements = [];
    while ((match = imgRegex.exec(html)) !== null) {
        const tag = match[1];
        const rest = match[2];
        const urlStr = match[3];
        
        if (tag === 'link' && !rest.includes('rel="icon"')) continue;
        if (urlStr.startsWith('data:') || urlStr.startsWith('http')) continue;
        
        const assetPath = path.join(SRC_DIR, urlStr);
        try {
            const base64Str = await fileToBase64(assetPath);
            const originalTag = match[0];
            const newTag = originalTag.replace(`="${urlStr}"`, `="${base64Str}"`);
            imgReplacements.push({
                original: originalTag,
                replacement: newTag
            });
            console.log(`Inlined asset: ${urlStr}`);
        } catch (err) {
            console.warn(`Failed to inline asset ${urlStr}:`, err.message);
        }
    }
    for (const r of imgReplacements) html = html.split(r.original).join(r.replacement);
    
    // Inline JS (Process last to avoid regex matching inside JS strings)
    const scriptRegex = /<script\s+src="(.*?)"\s*(?:defer)?><\/script>/g;
    const jsReplacements = [];
    while ((match = scriptRegex.exec(html)) !== null) {
        const src = match[1];
        const jsPath = path.join(SRC_DIR, src);
        try {
            const jsContent = await fs.readFile(jsPath, 'utf-8');
            jsReplacements.push({
                original: match[0],
                replacement: `<script>\n${jsContent}\n</script>`
            });
            console.log(`Inlined JS: ${src}`);
        } catch (err) {
            console.warn(`Failed to inline JS ${src}:`, err.message);
        }
    }
    for (const r of jsReplacements) html = html.split(r.original).join(r.replacement);
    
    await fs.writeFile(OUTPUT_FILE, html);
    const stats = await fs.stat(OUTPUT_FILE);
    console.log(`\nSuccessfully packed!`);
    console.log(`Output: ${OUTPUT_FILE}`);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

pack().catch(err => {
    console.error('Fatal error during packing:', err);
    process.exit(1);
});
