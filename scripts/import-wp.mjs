#!/usr/bin/env node

/**
 * WordPress XML Export → Astro Markdown Import Script
 *
 * INSTRUKCJA UŻYCIA:
 * 1. W panelu WordPress przejdź do: Narzędzia → Eksportuj → Wpisy → Pobierz plik eksportu
 * 2. Zapisz plik XML (np. wordpress-export.xml)
 * 3. Uruchom skrypt:
 *    node scripts/import-wp.mjs wordpress-export.xml
 *
 * Skrypt:
 * - Konwertuje HTML na Markdown
 * - Pobiera obrazki i zapisuje je lokalnie
 * - Tworzy pliki .md z frontmatter dla Astro
 * - Zachowuje oryginalne slugi URL
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import https from 'https';
import http from 'http';

// ===== CONFIG =====
const CONTENT_DIR = 'src/content/blog';
const IMAGES_DIR = 'public/images/blog';
const SITE_URL = 'https://www.copywriting-blog.pl';

// ===== HELPERS =====

function stripCDATA(str) {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? stripCDATA(match[1]) : '';
}

function extractAllTags(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const results = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(stripCDATA(match[1]));
  }
  return results;
}

function extractItems(xml) {
  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    items.push(match[1]);
  }
  return items;
}

function extractCategories(itemXml) {
  const tags = [];
  const regex = /<category[^>]*domain="post_tag"[^>]*>([^<]*)<\/category>/gi;
  let match;
  while ((match = regex.exec(itemXml)) !== null) {
    tags.push(stripCDATA(match[1]));
  }
  return tags;
}

function extractCategory(itemXml) {
  const regex = /<category[^>]*domain="category"[^>]*>([^<]*)<\/category>/i;
  const match = itemXml.match(regex);
  return match ? stripCDATA(match[1]) : '';
}

function getSlugFromLink(link) {
  const url = new URL(link);
  const path = url.pathname.replace(/^\/|\/$/g, '');
  return path || 'index';
}

// ===== HTML → MARKDOWN CONVERTER =====

function htmlToMarkdown(html) {
  if (!html) return '';

  let md = html;

  // Remove WordPress-specific stuff
  md = md.replace(/<!--[\s\S]*?-->/g, '');
  md = md.replace(/<\/?div[^>]*>/gi, '\n');
  md = md.replace(/<\/?span[^>]*>/gi, '');
  md = md.replace(/<\/?figure[^>]*>/gi, '\n');
  md = md.replace(/<\/?figcaption[^>]*>.*?<\/figcaption>/gi, '');

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // Bold & Italic
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

  // Lists
  md = md.replace(/<ul[^>]*>/gi, '\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    return content.split('\n').map(line => `> ${line.trim()}`).join('\n');
  });

  // Code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Horizontal rules
  md = md.replace(/<hr[^>]*\/?>/gi, '\n---\n');

  // Strip remaining HTML
  md = md.replace(/<[^>]+>/g, '');

  // HTML entities
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#039;/g, "'");
  md = md.replace(/&nbsp;/g, ' ');

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

// ===== IMAGE DOWNLOADER =====

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = require('fs').createWriteStream(destPath);

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function extractImages(html) {
  const images = [];
  const regex = /<img[^>]*src="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    images.push(match[1]);
  }
  return images;
}

// ===== MAIN =====

async function main() {
  const xmlPath = process.argv[2];

  if (!xmlPath) {
    console.log(`
╔══════════════════════════════════════════════════════╗
║  WordPress → Astro Import Script                     ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  UŻYCIE:                                             ║
║  node scripts/import-wp.mjs <plik-export.xml>       ║
║                                                      ║
║  JAK POBRAĆ EKSPORT Z WORDPRESS:                    ║
║  1. Panel WP → Narzędzia → Eksportuj                ║
║  2. Wybierz "Wpisy" → Pobierz plik eksportu         ║
║  3. Uruchom ten skrypt z pobranym plikiem            ║
║                                                      ║
║  OPCJE:                                              ║
║  --download-images  Pobiera obrazki z WP             ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
    `);
    process.exit(1);
  }

  const downloadImages = process.argv.includes('--download-images');

  console.log('📖 Czytam plik XML...');
  const xml = readFileSync(xmlPath, 'utf-8');

  // Ensure directories exist
  mkdirSync(CONTENT_DIR, { recursive: true });
  mkdirSync(IMAGES_DIR, { recursive: true });

  // Extract items
  const items = extractItems(xml);
  console.log(`📝 Znaleziono ${items.length} elementów`);

  let postsCount = 0;

  for (const item of items) {
    // Only process posts (not pages, attachments, etc.)
    const postType = extractTag(item, 'wp:post_type');
    if (postType !== 'post') continue;

    const status = extractTag(item, 'wp:status');
    if (status !== 'publish') continue;

    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link');
    const content = extractTag(item, 'content:encoded');
    const excerpt = extractTag(item, 'excerpt:encoded');
    const pubDate = extractTag(item, 'wp:post_date');
    const slug = getSlugFromLink(link);
    const tags = extractCategories(item);
    const category = extractCategory(item);

    // Convert content
    const markdown = htmlToMarkdown(content);

    // Handle hero image (first image or featured)
    const images = extractImages(content);
    let heroImage = '';

    if (images.length > 0) {
      const firstImage = images[0];
      const imgFilename = basename(new URL(firstImage).pathname);
      heroImage = `/images/blog/${imgFilename}`;

      if (downloadImages) {
        try {
          const destPath = join(IMAGES_DIR, imgFilename);
          if (!existsSync(destPath)) {
            console.log(`  📷 Pobieram: ${imgFilename}`);
            await downloadImage(firstImage, destPath);
          }
        } catch (err) {
          console.log(`  ⚠️  Nie udało się pobrać: ${firstImage}`);
        }
      }
    }

    // Build description
    const description = excerpt
      || markdown.split('\n').find(line => line.trim().length > 20)?.slice(0, 160).trim() + '...'
      || title;

    // Format date
    const dateStr = pubDate ? pubDate.split(' ')[0] : new Date().toISOString().split('T')[0];

    // Calculate reading time
    const words = markdown.split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(words / 200));

    // Build frontmatter
    const frontmatter = [
      '---',
      `title: "${title.replace(/"/g, '\\"')}"`,
      `description: "${description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      `pubDate: ${dateStr}`,
      heroImage ? `heroImage: "${heroImage}"` : null,
      heroImage ? `heroImageAlt: "${title.replace(/"/g, '\\"')}"` : null,
      category ? `category: "${category}"` : null,
      tags.length > 0 ? `tags: [${tags.map(t => `"${t}"`).join(', ')}]` : null,
      `readingTime: ${readingTime}`,
      '---',
    ].filter(Boolean).join('\n');

    // Write file
    const filePath = join(CONTENT_DIR, `${slug}.md`);
    writeFileSync(filePath, `${frontmatter}\n\n${markdown}\n`);

    postsCount++;
    console.log(`  ✅ ${slug}.md — "${title}"`);
  }

  console.log(`\n🎉 Import zakończony! Zaimportowano ${postsCount} wpisów.`);
  console.log(`📁 Wpisy zapisane w: ${CONTENT_DIR}/`);

  if (!downloadImages) {
    console.log(`\n💡 Wskazówka: Aby pobrać obrazki, dodaj flagę --download-images`);
  }
}

main().catch(console.error);
