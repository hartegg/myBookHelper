'use client';

import type { BookNode } from '@/types';
import { convertFromRaw, type RawDraftContentState, type ContentState, type ContentBlock } from 'draft-js';
import { stateToHTML, type Options, type RenderConfig } from 'draft-js-export-html';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType, ImageRun, TableOfContents } from 'docx';

type DocxHeadingLevel = (typeof HeadingLevel)[keyof typeof HeadingLevel];
import { saveAs } from 'file-saver';
import { loadImage } from './db';

function draftStateToMarkdown(contentState: ContentState): string {
  let markdown = '';

  contentState.getBlocksAsArray().forEach((block) => {
    const blockType = block.getType();
    const blockText = block.getText();
    const blockKey = block.getKey();

    // Preskačemo prazne blokove
    if (!blockText.trim() && blockType === 'unstyled') {
      return;
    }

    switch (blockType) {
      case 'header-one':
        markdown += `# ${blockText} {#${generateSlug(blockText, 'h', blockKey, false)}}\n\n`;
        break;
      case 'header-two':
        markdown += `## ${blockText} {#${generateSlug(blockText, 'h', blockKey, false)}}\n\n`;
        break;
      case 'header-three':
        markdown += `### ${blockText} {#${generateSlug(blockText, 'h', blockKey, false)}}\n\n`;
        break;
      case 'header-four':
        markdown += `#### ${blockText} {#${generateSlug(blockText, 'h', blockKey, false)}}\n\n`;
        break;
      case 'header-five':
        markdown += `##### ${blockText} {#${generateSlug(blockText, 'h', blockKey, false)}}\n\n`;
        break;
      case 'header-six':
        markdown += `###### ${blockText} {#${generateSlug(blockText, 'h', blockKey, false)}}\n\n`;
        break;
      case 'blockquote':
        markdown += `> ${blockText}\n\n`;
        break;
      case 'unordered-list-item':
        const ulDepth = block.getDepth();
        markdown += `${'  '.repeat(ulDepth)}- ${blockText}\n`;
        break;
      case 'ordered-list-item':
        const olDepth = block.getDepth();
        markdown += `${'  '.repeat(olDepth)}1. ${blockText}\n`;
        break;
      case 'code-block':
        markdown += `\`\`\`\n${blockText}\n\`\`\`\n\n`;
        break;
      case 'atomic':
        // Rukovanje slikama
        const entityKey = block.getEntityAt(0);
        console.log('Atomic block found, entityKey:', entityKey);
        if (entityKey) {
          const entity = contentState.getEntity(entityKey);
          const entityType = entity.getType().toLowerCase();
          console.log('Entity type:', entityType);
          if (entityType === 'image') {
            const data = entity.getData();
            console.log('Image data:', data);
            const altText = data.alt || 'image';
            const src = data.src || data.link || '';
            console.log('Image src:', src ? src.substring(0, 50) + '...' : 'No src');

            if (src && src.startsWith('data:image')) {
              // HTML img tag za embedded slike
              markdown += `<img src="${src}" alt="${altText}" style="max-width: 100%; height: auto; display: block; margin: 1em 0;" />\n\n`;
            } else if (src) {
              // Standardni Markdown za vanjske linkove
              markdown += `![${altText}](${src})\n\n`;
            } else {
              markdown += `![${altText}](no-source-found)\n\n`;
            }
          }
        }
        break;
      default:
        if (blockText.trim()) {
          // Rukovanje inline stilovima (bold, italic, itd.)
          let processedText = blockText;

          // Jednostavno rukovanje bold i italic stilovima
          block.findStyleRanges(
            (character) => character.hasStyle('BOLD'),
            (start, end) => {
              const beforeBold = processedText.substring(0, start);
              const boldText = processedText.substring(start, end);
              const afterBold = processedText.substring(end);
              processedText = `${beforeBold}**${boldText}**${afterBold}`;
            }
          );

          block.findStyleRanges(
            (character) => character.hasStyle('ITALIC'),
            (start, end) => {
              const beforeItalic = processedText.substring(0, start);
              const italicText = processedText.substring(start, end);
              const afterItalic = processedText.substring(end);
              processedText = `${beforeItalic}_${italicText}_${afterItalic}`;
            }
          );

          markdown += `${processedText}\n\n`;
        }
        break;
    }
  });

  return markdown;
}

interface TocEntry {
  id: string;
  text: string;
  level: number; // Absolute level in the document structure
  children: TocEntry[];
}

let globalHtmlExportIdCounter = 0;
const htmlIdMapStore = new Map<string, string>();

function generateSlug(text: string, typePrefix: 'node' | 'h' | 'book', nodeOrBlockKey: string, isHtmlExportContext = false): string {
  let slug = text.toString().toLowerCase().trim();

  slug = slug.replace(/ž/g, 'z').replace(/č/g, 'c').replace(/ć/g, 'c').replace(/đ/g, 'd').replace(/š/g, 's');

  slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  slug = slug
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');

  if (typePrefix === 'book') {
    return slug || 'untitled-book';
  }

  if (isHtmlExportContext) {
    globalHtmlExportIdCounter++;
    return `export-section-${globalHtmlExportIdCounter}`;
  }

  const baseSlugPart = slug || (typePrefix === 'node' ? 'untitled-node' : 'untitled-section');
  return [baseSlugPart, typePrefix, nodeOrBlockKey].filter(Boolean).join('-');
}

function getContentState(rawContent: RawDraftContentState): ContentState | null {
  try {
    if (rawContent && Array.isArray(rawContent.blocks) && rawContent.blocks.length > 0 && typeof rawContent.entityMap === 'object' && rawContent.entityMap !== null) {
      return convertFromRaw(rawContent);
    }
  } catch (error) {
    console.error('[exportUtils] Error converting RawDraftContentState to ContentState:', error, rawContent);
  }
  return null;
}

function populateHtmlIdMap(nodes: BookNode[], map: Map<string, string>): void {
  for (const node of nodes) {
    if (node.title.trim()) {
      const nodeKey = `node-${node.id}`;
      if (!map.has(nodeKey)) {
        map.set(nodeKey, generateSlug(node.title, 'node', node.id, true));
      }
    }

    const contentState = getContentState(node.content);
    if (contentState) {
      contentState.getBlocksAsArray().forEach((block) => {
        const blockType = block.getType();
        const blockText = block.getText();
        if (['header-two', 'header-three', 'header-four', 'header-five', 'header-six'].includes(blockType) && blockText.trim()) {
          const blockKeyContent = `block-${block.getKey()}`;
          if (!map.has(blockKeyContent)) {
            map.set(blockKeyContent, generateSlug(blockText, 'h', block.getKey(), true));
          }
        }
      });
    }

    if (node.children && node.children.length > 0) {
      populateHtmlIdMap(node.children, map);
    }
  }
}

function buildGlobalTocStructure(bookDataNodes: BookNode[], htmlIdMap: Map<string, string> | null, initialTocLevel: number): TocEntry[] {
  const toc: TocEntry[] = [];
  const seenTitles = new Set<string>(); // Track seen titles to avoid duplicates

  function processNode(node: BookNode, currentAbsoluteLevel: number): TocEntry | null {
    const nodeHasActualTitle = node.title.trim() !== '';
    const nodeHasChildren = node.children && node.children.length > 0;

    const contentHeadings: TocEntry[] = [];
    const contentState = getContentState(node.content);
    if (contentState) {
      contentState.getBlocksAsArray().forEach((block) => {
        const blockType = block.getType();
        const blockText = block.getText();
        let headingTocLevelOffset = 0;
        if (blockType === 'header-two') headingTocLevelOffset = 1;
        else if (blockType === 'header-three') headingTocLevelOffset = 2;
        else if (blockType === 'header-four') headingTocLevelOffset = 3;
        else if (blockType === 'header-five') headingTocLevelOffset = 4;
        else if (blockType === 'header-six') headingTocLevelOffset = 5;

        if (headingTocLevelOffset > 0 && blockText.trim()) {
          // Check for duplicate titles and skip if already seen
          const normalizedText = blockText.trim().toLowerCase();
          if (seenTitles.has(normalizedText)) {
            console.log(`[ToC] Skipping duplicate title: "${blockText}"`);
            return;
          }
          seenTitles.add(normalizedText);

          const blockKeyContent = `block-${block.getKey()}`;
          const idForContentHeading = htmlIdMap ? htmlIdMap.get(blockKeyContent) || generateSlug(blockText, 'h', block.getKey(), true) : generateSlug(blockText, 'h', block.getKey(), false);

          contentHeadings.push({
            id: idForContentHeading,
            text: blockText,
            level: currentAbsoluteLevel + headingTocLevelOffset,
            children: [],
          });
        }
      });
    }

    if (!nodeHasActualTitle && !nodeHasChildren && contentHeadings.length === 0) {
      return null;
    }

    const nodeKey = `node-${node.id}`;
    const idForToc = htmlIdMap ? htmlIdMap.get(nodeKey) || generateSlug(node.title || 'untitled', 'node', node.id, true) : generateSlug(node.title || 'untitled', 'node', node.id, false);

    const entry: TocEntry = {
      id: idForToc,
      text: nodeHasActualTitle ? node.title.trim() : contentHeadings.length > 0 || nodeHasChildren ? 'Untitled Section' : 'Untitled Item',
      level: currentAbsoluteLevel,
      children: contentHeadings,
    };

    if (node.children && Array.isArray(node.children) && node.children.length > 0) {
      node.children.forEach((childNode) => {
        const childEntry = processNode(childNode, currentAbsoluteLevel + 1);
        if (childEntry) entry.children.push(childEntry);
      });
    }

    if (entry.text === 'Untitled Section' && entry.children.length === 0 && !nodeHasActualTitle) {
      return null;
    }

    return entry;
  }

  bookDataNodes.forEach((rootChild) => {
    const rootChildEntry = processNode(rootChild, initialTocLevel);
    if (rootChildEntry) toc.push(rootChildEntry);
  });
  return toc;
}

function renderTocHtml(tocEntries: TocEntry[], currentDepth = 0): string {
  if (tocEntries.length === 0) return '';
  let html = `<ul class="${currentDepth === 0 ? 'exported-html-toc-list' : 'toc-nested-list'}">\n`;
  tocEntries.forEach((entry) => {
    html += `<li><a href="#${entry.id}">${entry.text}</a>`;
    if (entry.children && entry.children.length > 0) {
      html += renderTocHtml(entry.children, currentDepth + 1);
    }
    html += `</li>\n`;
  });
  html += `</ul>\n`;
  return html;
}

function renderTocMarkdown(tocEntries: TocEntry[], currentDepth = 0): string {
  let markdown = '';
  tocEntries.forEach((entry) => {
    markdown += `${'  '.repeat(currentDepth)}- [${entry.text}](#${entry.id})\n`;
    if (entry.children && entry.children.length > 0) {
      markdown += renderTocMarkdown(entry.children, currentDepth + 1);
    }
  });
  return markdown;
}

async function nodeToHtmlRecursive(node: BookNode, currentLevel: number, htmlIdMap: Map<string, string>): Promise<string> {
  let html = '';
  const safeTitle = node.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const chapterHtmlHeadingLevel = Math.min(currentLevel + 1, 6);

  const nodeKey = `node-${node.id}`;
  const chapterSlug = htmlIdMap.get(nodeKey) || generateSlug(node.title || 'untitled-node', 'node', node.id, true);

  if (currentLevel >= 0 && node.title.trim()) {
    html += `<h${chapterHtmlHeadingLevel} id="${chapterSlug}">${safeTitle}</h${chapterHtmlHeadingLevel}>\n`;
  }

  const contentState = getContentState(node.content);
  if (contentState) {
    const options: Options = {
      entityStyleFn: (entity: Draft.EntityInstance) => {
        const entityType = entity.getType().toLowerCase();
        if (entityType === 'image') {
          const data = entity.getData();
          let styles = 'max-width: 100%; height: auto; border-radius: var(--radius);';
          if (data.alignment === 'center' || !data.alignment) {
            styles += 'display: block; margin-left: auto; margin-right: auto;';
          } else if (data.alignment === 'left') {
            styles += 'display: block; margin-right: auto;';
          } else if (data.alignment === 'right') {
            styles += 'display: block; margin-left: auto;';
          }

          // Handle images from IndexedDB - we'll create a placeholder that gets replaced later
          const imageSrc = data.src || data.link;
          if (imageSrc && imageSrc.startsWith('img_')) {
            return {
              element: 'img',
              attributes: {
                'data-image-id': imageSrc,
                alt: data.alt || '',
                style: styles,
                src: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`, // 1x1 transparent placeholder
              },
              style: {},
              innerHTML: '',
            } as RenderConfig;
          }

          return {
            element: 'img',
            attributes: {
              src: imageSrc,
              alt: data.alt || '',
              style: styles,
            },
            style: {},
            innerHTML: '',
          } as RenderConfig;
        }
        return undefined;
      },
      blockRenderers: {
        'header-one': (block: ContentBlock) => `<h1 id="${htmlIdMap.get(`block-${block.getKey()}`) || generateSlug(block.getText(), 'h', block.getKey(), true)}">${block.getText()}</h1>`,
        'header-two': (block: ContentBlock) => `<h2 id="${htmlIdMap.get(`block-${block.getKey()}`) || generateSlug(block.getText(), 'h', block.getKey(), true)}">${block.getText()}</h2>`,
        'header-three': (block: ContentBlock) => `<h3 id="${htmlIdMap.get(`block-${block.getKey()}`) || generateSlug(block.getText(), 'h', block.getKey(), true)}">${block.getText()}</h3>`,
        'header-four': (block: ContentBlock) => `<h4 id="${htmlIdMap.get(`block-${block.getKey()}`) || generateSlug(block.getText(), 'h', block.getKey(), true)}">${block.getText()}</h4>`,
        'header-five': (block: ContentBlock) => `<h5 id="${htmlIdMap.get(`block-${block.getKey()}`) || generateSlug(block.getText(), 'h', block.getKey(), true)}">${block.getText()}</h5>`,
        'header-six': (block: ContentBlock) => `<h6 id="${htmlIdMap.get(`block-${block.getKey()}`) || generateSlug(block.getText(), 'h', block.getKey(), true)}">${block.getText()}</h6>`,
      },
    };
    html += `<div>\n${stateToHTML(contentState, options)}\n</div>\n`;
  }

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      html += await nodeToHtmlRecursive(child, currentLevel + 1, htmlIdMap);
    }
  }
  return html;
}

// Function to process HTML and replace image placeholders with actual data URIs
async function processHtmlImages(html: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const imageElements = doc.querySelectorAll('img[data-image-id]');

  for (const img of Array.from(imageElements)) {
    const imageId = img.getAttribute('data-image-id');
    if (imageId && imageId.startsWith('img_')) {
      try {
        console.log(`[HTML Export] Loading image from DB with ID: ${imageId}`);
        const imageBlob = await loadImage(imageId);
        if (imageBlob) {
          // Convert blob to data URI
          const dataUri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(imageBlob);
          });
          img.setAttribute('src', dataUri);
          img.removeAttribute('data-image-id'); // Clean up the temporary attribute
          console.log(`[HTML Export] Successfully embedded image ${imageId}`);
        } else {
          console.warn(`[HTML Export] Image blob not found for ID: ${imageId}`);
          // Replace with placeholder text
          const placeholder = doc.createElement('div');
          placeholder.style.cssText = 'padding: 20px; background: #f0f0f0; border: 2px dashed #ccc; text-align: center; margin: 1em 0; border-radius: var(--radius);';
          placeholder.textContent = `[Image: ${img.getAttribute('alt') || imageId}] - Image not found in database`;
          img.parentNode?.replaceChild(placeholder, img);
        }
      } catch (error) {
        console.error(`[HTML Export] Error loading image ${imageId} from DB:`, error);
        // Replace with error placeholder
        const placeholder = doc.createElement('div');
        placeholder.style.cssText = 'padding: 20px; background: #ffe6e6; border: 2px dashed #ff6666; text-align: center; margin: 1em 0; border-radius: var(--radius);';
        placeholder.textContent = `[Image: ${img.getAttribute('alt') || imageId}] - Error loading image`;
        img.parentNode?.replaceChild(placeholder, img);
      }
    }
  }

  return doc.documentElement.outerHTML;
}

export async function exportHtml(bookData: BookNode): Promise<void> {
  globalHtmlExportIdCounter = 0;
  htmlIdMapStore.clear();

  const effectiveBookChildren = bookData.children && bookData.children.length > 0 ? bookData.children : [bookData];
  const isSingleNodeExport = !(bookData.children && bookData.children.length > 0);

  populateHtmlIdMap(effectiveBookChildren, htmlIdMapStore);

  const bookTitle = bookData.title || 'Document';
  const bookTitleEscaped = bookTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const globalTocEntries = buildGlobalTocStructure(effectiveBookChildren, htmlIdMapStore, isSingleNodeExport ? 0 : 1);
  const tocHtmlString = globalTocEntries.length > 0 ? renderTocHtml(globalTocEntries, 0) : '';
  const tocSection =
    globalTocEntries.length > 0
      ? `
      <nav class="sticky-toc">
        <h2>Table of Contents</h2>
        ${tocHtmlString}
      </nav>`
      : '';

  let mainContentRendered = '';
  for (const child of effectiveBookChildren) {
    mainContentRendered += await nodeToHtmlRecursive(child, isSingleNodeExport ? -1 : 0, htmlIdMapStore);
  }

  const bookTitleToUse = bookData.title || 'Document';
  const filenameSlug = generateSlug(bookTitleToUse, 'book', 'export-html');

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${bookTitleEscaped}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,700;1,7..72,400&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Belleza&display=swap');
        
        :root {
            --primary-export-color: hsl(197, 44.3%, 50%);
            --accent-export-color: hsl(174, 100%, 29%); 
            --text-export-color: hsl(274, 30%, 25%); 
            --muted-text-export-color: hsl(274, 15%, 55%);
            --background-export-color: #ffffff;
            --toc-background-export-color: hsl(274, 30%, 97%); 
            --toc-border-export-color: hsl(274, 20%, 88%);
            --toc-link-hover-bg-export-color: hsl(274, 30%, 92%);
            --radius: 0.5rem;
            --toc-width: 280px; 
            --main-content-width: 720px;
            --page-gap: 30px;
        }
        html { scroll-behavior: smooth; }
        body { 
          font-family: 'Literata', serif; 
          line-height: 1.7; 
          margin: 0; 
          background-color: var(--background-export-color); 
          color: var(--text-export-color);
        }
        .page-container {
          display: flex;
          flex-direction: row;
          max-width: calc(var(--toc-width) + var(--page-gap) + var(--main-content-width)); 
          margin: 20px auto; 
          padding: 0 20px; 
          gap: var(--page-gap); 
        }
        .sticky-toc {
          width: var(--toc-width);
          font-family: "Lucida Grande", Verdana, Helvetica, sans-serif;
          flex-shrink: 0;
          align-self: flex-start; 
          position: sticky;
          top: 20px; 
          max-height: calc(100vh - 40px); 
          overflow-y: auto;
          background-color: var(--toc-background-export-color);
          border: 1px solid var(--toc-border-export-color);
          padding: 15px;
          border-radius: var(--radius);
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .sticky-toc h2 {
          margin-top: 0;
          font-family: 'Belleza', sans-serif; 
          font-size: 1.3em;
          color: var(--primary-export-color);
          border-bottom: 1px solid var(--toc-border-export-color);
          padding-bottom: 0.5em;
          margin-bottom: 0.8em;
        }
        ul.exported-html-toc-list, ul.toc-nested-list {
          list-style-type: none;
          padding-left: 0;
          margin-top: 0;
          margin-bottom: 0.3em;
        }
        ul.toc-nested-list {
          padding-left: 18px; 
          border-left: 1px solid hsla(var(--muted-text-export-color), 0.3);
          margin-left: 6px; 
          margin-top: 0.2em;
          margin-bottom: 0.2em;
        }
        .sticky-toc li {
            position: relative; 
            margin-bottom: 1px;
        }
        .sticky-toc li a {
          text-decoration: none;
          color: var(--text-export-color);
          display: block;
          padding: 5px 8px;
          font-size: 0.85em;
          border-radius: calc(var(--radius) - 3px);
          transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
        }
        .sticky-toc li a:hover, .sticky-toc li a.toc-link-active {
          color: var(--accent-export-color);
          background-color: var(--toc-link-hover-bg-export-color);
        }
        .main-content-area {
          flex: 0 0 var(--main-content-width); 
          min-width: 0; 
        }
        .content-wrapper {
          max-width: 100%; 
          margin-left: 0; 
          padding-bottom: 20px;
        }
        h1, h2, h3, h4, h5, h6 {
          font-family: 'Belleza', sans-serif;
          color: var(--primary-export-color);
          margin-top: 1.8em; 
          margin-bottom: 0.6em; 
          scroll-margin-top: 20px; 
        }
        .content-wrapper > h1:first-child { 
           margin-top: 0; 
           font-size: 2.5em;
           text-align: center;
           margin-bottom: 1em;
        }
        .content-wrapper > h1 { font-size: 2em; }
        .content-wrapper > h2 { font-size: 1.75em; }
        .content-wrapper > h3 { font-size: 1.5em; }
        .content-wrapper > h4 { font-size: 1.35em; }
        .content-wrapper > h5 { font-size: 1.2em; } 
        .content-wrapper > h6 { font-size: 1.2em; font-weight: bold; } 

        img { max-width: 100%; height: auto; display: block; margin: 1.5em auto; border-radius: var(--radius); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        hr { margin: 2.5em 0; border: 0; border-top: 1px solid var(--toc-border-export-color); }
        p, li { font-family: 'Literata', serif; color: var(--text-export-color); }
        blockquote {
            border-left: 4px solid var(--accent-export-color);
            padding-left: 1em;
            margin-left: 0;
            font-style: italic;
            color: var(--muted-text-export-color);
        }

        @media (max-width: 1024px) { 
          .page-container {
            flex-direction: column;
            padding: 15px; 
            margin: 10px auto;
            max-width: 95%; 
          }
          .sticky-toc {
            position: static; 
            width: auto; 
            max-height: none; 
            margin-bottom: 25px;
            font-family: "Lucida Grande", Verdana, Helvetica, sans-serif; 
          }
          .main-content-area {
             flex-basis: auto; 
             width: 100%;
          }
           .content-wrapper {
            max-width: 100%; 
          }
        }
      </style>
    </head>
    <body>
      <div class="page-container">
        ${tocSection}
        <main class="main-content-area">
          <div class="content-wrapper">
            ${isSingleNodeExport ? `<h1 id="${htmlIdMapStore.get('node-' + bookData.id) || 'main-title'}">${bookTitleEscaped}</h1><hr/>` : `<h1>${bookTitleEscaped}</h1><hr/>`}
            ${mainContentRendered}
          </div>
        </main>
      </div>
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          const tocLinks = Array.from(document.querySelectorAll('.sticky-toc a[href^="#"]'));
          const sections = tocLinks.map(link => {
            const id = link.getAttribute('href').substring(1);
            return document.getElementById(id);
          }).filter(section => section !== null);

          function highlightActiveTocLink() {
            let currentActiveId = null;
            const viewportHeightOffset = window.innerHeight * 0.33; 

            for (let i = sections.length - 1; i >= 0; i--) {
              const section = sections[i];
              if (section.getBoundingClientRect().top < viewportHeightOffset) {
                currentActiveId = section.id;
                break;
              }
            }

            tocLinks.forEach(link => {
              link.classList.remove('toc-link-active');
              if (link.getAttribute('href').substring(1) === currentActiveId) {
                link.classList.add('toc-link-active');
              }
            });
          }

          window.addEventListener('scroll', highlightActiveTocLink);
          window.addEventListener('resize', highlightActiveTocLink);
          highlightActiveTocLink(); 
        });
      </script>
    </body>
    </html>
  `;

  // Process images to replace placeholders with actual data URIs
  console.log('[HTML Export] Processing images from IndexedDB...');
  const processedHtml = await processHtmlImages(fullHtml);

  const blob = new Blob([processedHtml], { type: 'text/html;charset=utf-8' });
  saveAs(blob, `${filenameSlug}.html`);
}

async function nodeToMarkdownRecursive(node: BookNode, currentLevel: number): Promise<string> {
  let markdown = '';
  const chapterHeadingLevel = Math.min(currentLevel + 1, 6);
  const chapterSlug = generateSlug(node.title, 'node', node.id, false);

  if (currentLevel >= 0 && node.title.trim()) {
    markdown += `${'#'.repeat(chapterHeadingLevel)} ${node.title} {#${chapterSlug}}\n\n`;
  }

  const contentState = getContentState(node.content);
  if (contentState) {
    markdown += `${draftStateToMarkdown(contentState)}\n\n`;
  }

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      markdown += await nodeToMarkdownRecursive(child, currentLevel + 1);
    }
  }
  return markdown;
}

export async function exportMarkdown(bookData: BookNode): Promise<void> {
  const bookTitle = bookData.title || 'myBookHelper Document';
  const isSingleNodeExport = !(bookData.children && bookData.children.length > 0);
  const effectiveBookChildren = isSingleNodeExport ? [bookData] : bookData.children || [];

  const globalTocEntries = buildGlobalTocStructure(effectiveBookChildren, null, isSingleNodeExport ? 0 : 1);

  // TOC već sadrži naslov knjige
  const tocMd = globalTocEntries.length > 0 ? `# ${bookTitle}\n\n## Table of Contents\n\n${renderTocMarkdown(globalTocEntries)}\n---\n\n` : `# ${bookTitle}\n\n`;

  let mainMarkdownContent = '';
  if (effectiveBookChildren) {
    for (const child of effectiveBookChildren) {
      mainMarkdownContent += await nodeToMarkdownRecursive(child, isSingleNodeExport ? -1 : 0);
    }
  }

  const filenameSlugBase = generateSlug(bookData.title || 'document', 'book', 'export-md');

  // Dodavanje timestamp-a u formatu DD-MM-YYYY-THH-MM-SS
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0'); // getMonth() vraća 0-11
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${day}-${month}-${year}_T${hours}-${minutes}-${seconds}`;
  const filenameSlug = `${filenameSlugBase}_myBookHelper_${timestamp}`;

  // Formatiranje i spremanje u fajl
  const fullMarkdown = `# ${bookTitle}\n\n${tocMd}${mainMarkdownContent}`;
  const blob = new Blob([fullMarkdown], { type: 'text/markdown;charset=utf-8' });
  saveAs(blob, `${filenameSlug}.md`);
}

async function dataUriToBuffer(dataUri: string): Promise<ArrayBuffer> {
  const base64 = dataUri.split(',')[1];
  if (!base64) {
    console.error('[DOCX exportUtils dataUriToBuffer] Invalid data URI, no base64 part.');
    throw new Error('Invalid data URI for DOCX buffer conversion');
  }
  try {
    const byteString = atob(base64);
    const buffer = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(buffer);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return buffer;
  } catch (e: any) {
    console.error('[DOCX exportUtils dataUriToBuffer] Error in atob or buffer creation:', e.message);
    throw new Error(`Failed to convert data URI to buffer: ${e.message}`);
  }
}

function getImageDimensionsFromDataUri(dataUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        console.warn('[DOCX exportUtils getImageDimensionsFromDataUri] Image loaded but natural dimensions are zero. Src:', dataUri.substring(0, 100) + '...');
        reject(new Error('Image loaded with zero dimensions.'));
        return;
      }
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (err) => {
      console.error('[DOCX exportUtils getImageDimensionsFromDataUri] Image load error for DOCX.', err);
      reject(new Error(`Failed to load image for DOCX dimension extraction: ${err instanceof ErrorEvent ? err.message : String(err)}`));
    };
    img.src = dataUri;
  });
}

async function createDocxElementsFromContent(rawContent: RawDraftContentState, nodeIdForLog: string): Promise<Paragraph[]> {
  // Smanjeno logiranje na početku
  const elements: Paragraph[] = [];

  const contentState = getContentState(rawContent);
  if (!contentState) {
    console.warn(`[DOCX createDocxElementsFromContent] Node ID: ${nodeIdForLog} - Could not get ContentState. Returning empty elements.`);
    return elements;
  }

  const blocks = contentState.getBlocksAsArray();

  for (const [index, block] of blocks.entries()) {
    const blockType = block.getType();
    const blockText = block.getText();
    const blockKey = block.getKey();
    // Uklonjen log za svaki blok, osim ako nije greška

    const childrenRuns: TextRun[] = [];
    let currentPosition = 0;

    block.findStyleRanges(
      (character) => character.hasStyle('BOLD') || character.hasStyle('ITALIC') || character.hasStyle('UNDERLINE') || character.hasStyle('STRIKETHROUGH'),
      (start, end) => {
        if (start > currentPosition) {
          // childrenRuns.push(new TextRun(blockText.substring(currentPosition, start)));
          childrenRuns.push(
            new TextRun({
              text: blockText.substring(currentPosition, start),
              size: 24, // 12pt = 24 half-points
            })
          );
        }
        const styledText = blockText.substring(start, end);
        const style = block.getInlineStyleAt(start);
        childrenRuns.push(
          new TextRun({
            text: styledText,
            bold: style.has('BOLD'),
            italics: style.has('ITALIC'),
            underline: style.has('UNDERLINE') ? {} : undefined,
            strike: style.has('STRIKETHROUGH'),
            size: 24, // 12pt = 24 half-points
          })
        );
        currentPosition = end;
      }
    );

    let imageProcessedForBlock = false;
    if (blockType === 'atomic') {
      const entityKey = block.getEntityAt(0);
      if (entityKey) {
        const entity = contentState.getEntity(entityKey);
        const entityTypeFound = entity.getType().toUpperCase();
        if (entityTypeFound === 'IMAGE') {
          const entityAllData = entity.getData();
          const { src, alt, alignment, width, height } = entityAllData;
          const imageSrc = src || entityAllData.link;

          let imageDataUri: string | null = null;

          // Handle images from IndexedDB (stored with unique IDs)
          if (imageSrc && imageSrc.startsWith('img_')) {
            try {
              console.log(`[DOCX] Loading image from DB with ID: ${imageSrc}`);
              const imageBlob = await loadImage(imageSrc);
              if (imageBlob) {
                // Convert blob to data URI
                imageDataUri = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(imageBlob);
                });
                console.log(`[DOCX] Successfully converted image ${imageSrc} to data URI`);
              } else {
                console.warn(`[DOCX] Image blob not found for ID: ${imageSrc}`);
              }
            } catch (error) {
              console.error(`[DOCX] Error loading image ${imageSrc} from DB:`, error);
            }
          }
          // Handle data URI images (already embedded)
          else if (imageSrc && imageSrc.startsWith('data:image')) {
            imageDataUri = imageSrc;
          }

          if (imageDataUri && imageDataUri.startsWith('data:image')) {
            try {
              const imageBuffer = await dataUriToBuffer(imageDataUri);
              let naturalDims = { width: 400, height: 300 };
              try {
                if (width && height && !isNaN(Number(width)) && Number(width) > 0 && !isNaN(Number(height)) && Number(height) > 0) {
                  naturalDims = { width: Number(width), height: Number(height) };
                } else {
                  naturalDims = await getImageDimensionsFromDataUri(imageDataUri);
                }
              } catch (dimError: any) {
                console.warn(`[DOCX ImageDim] Node: ${nodeIdForLog}, Block: ${blockKey}. Error: ${dimError.message}. Using fallback 400x300.`);
              }

              const MAX_WIDTH_POINTS = 450;
              let finalWidthPt = naturalDims.width;
              let finalHeightPt = naturalDims.height;

              if (finalWidthPt > MAX_WIDTH_POINTS) {
                const ratio = MAX_WIDTH_POINTS / finalWidthPt;
                finalWidthPt = MAX_WIDTH_POINTS;
                finalHeightPt = finalHeightPt * ratio;
              }

              elements.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: imageBuffer,
                      transformation: {
                        width: Math.round(finalWidthPt),
                        height: Math.round(finalHeightPt),
                      },
                      altText: alt || undefined,
                    }),
                  ],
                  alignment: alignment === 'center' ? AlignmentType.CENTER : alignment === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                })
              );
              imageProcessedForBlock = true;
            } catch (e: any) {
              console.error(`[DOCX ImageError] Node: ${nodeIdForLog}, Block: ${blockKey}. Error: ${e.message}.`);
              childrenRuns.push(new TextRun({ text: `[Image: ${alt || 'Error loading image for DOCX'}]`, break: 1 }));
            }
          } else if (imageSrc) {
            // Handle external URLs or unknown image sources
            childrenRuns.push(
              new TextRun({
                text: `[Image: ${alt || imageSrc}] (External images not directly embedded in DOCX from URL)`,
                break: 1,
              })
            );
          } else {
            childrenRuns.push(new TextRun({ text: `[Image: ${alt || 'source missing'}]`, break: 1 }));
          }
        } else {
          // Smanjeno logiranje
        }
      } else {
        // Smanjeno logiranje
      }
    }

    if (imageProcessedForBlock) {
      // Smanjeno logiranje
      continue;
    }

    if (currentPosition < blockText.length) {
      childrenRuns.push(
        new TextRun({
          text: blockText.substring(currentPosition),
          size: 24, // 12pt = 24 half-points
        })
      );
    }

    // IZMIJENJENA LOGIKA ZA PRAZNE BLOKOVE - START
    if (childrenRuns.length === 0 && blockText.trim().length === 0) {
      // Namjerno ne dodajemo prazan paragraf ovdje, jer to rješava nodeToDocxElementsRecursive
      // console.log(`[DOCX createDocxElementsFromContent Block Key: ${blockKey}] Block is empty or only whitespace. Skipping. Node ID: ${nodeIdForLog}.`);
      continue;
    } else if (childrenRuns.length === 0 && blockText.length > 0) {
      childrenRuns.push(
        new TextRun({
          text: blockText,
          size: 24, // 12pt = 24 half-points
        })
      );
    }
    // IZMIJENJENA LOGIKA ZA PRAZNE BLOKOVE - END

    if (childrenRuns.length > 0) {
      const paragraphOptions: {
        children: TextRun[];
        style?: string;
        bullet?: any;
        numbering?: any;
        heading?: DocxHeadingLevel;
      } = { children: childrenRuns };
      let headingLevelForDocx: DocxHeadingLevel | undefined = undefined;

      switch (blockType) {
        case 'header-one':
          headingLevelForDocx = HeadingLevel.HEADING_1;
          break;
        case 'header-two':
          headingLevelForDocx = HeadingLevel.HEADING_2;
          break;
        case 'header-three':
          headingLevelForDocx = HeadingLevel.HEADING_3;
          break;
        case 'header-four':
          headingLevelForDocx = HeadingLevel.HEADING_4;
          break;
        case 'header-five':
          headingLevelForDocx = HeadingLevel.HEADING_5;
          break;
        case 'header-six':
          headingLevelForDocx = HeadingLevel.HEADING_6;
          break;
        case 'blockquote':
          paragraphOptions.style = 'IntenseQuote';
          break;
        case 'unordered-list-item':
          paragraphOptions.bullet = { level: block.getDepth() };
          break;
        case 'ordered-list-item':
          paragraphOptions.numbering = { reference: 'default-numbering', level: block.getDepth() };
          break;
      }
      if (headingLevelForDocx) {
        paragraphOptions.heading = headingLevelForDocx;
      }
      elements.push(new Paragraph(paragraphOptions));
      // Uklonjen log za svaki dodani paragraf
    }
    // Uklonjen problematični else if blok
  }
  console.log(`[DOCX createDocxElementsFromContent END] Node ID: ${nodeIdForLog}. Total elements created: ${elements.length}`);
  return elements;
}

async function nodeToDocxElementsRecursive(node: BookNode, currentStructuralLevel: number, docxElements: any[]): Promise<void> {
  console.log(`[DOCX nodeToDocxElementsRecursive START] Node ID: ${node.id}, Title: "${node.title}", Level: ${currentStructuralLevel}`);

  const chapterHeadingStyle: DocxHeadingLevel =
    currentStructuralLevel === 0
      ? HeadingLevel.HEADING_1
      : currentStructuralLevel === 1
        ? HeadingLevel.HEADING_2
        : currentStructuralLevel === 2
          ? HeadingLevel.HEADING_3
          : currentStructuralLevel === 3
            ? HeadingLevel.HEADING_4
            : currentStructuralLevel === 4
              ? HeadingLevel.HEADING_5
              : HeadingLevel.HEADING_6;

  if (node.title.trim()) {
    console.log(`[DOCX nodeToDocxElementsRecursive] Node ID: ${node.id} - Adding title paragraph: "${node.title}" with style ${chapterHeadingStyle}`);
    docxElements.push(new Paragraph({ text: node.title, heading: chapterHeadingStyle }));
  }

  // console.log(`[DOCX nodeToDocxElementsRecursive] Node ID: ${node.id} - Calling createDocxElementsFromContent.`);
  const contentElements = await createDocxElementsFromContent(node.content, node.id);
  // console.log(`[DOCX nodeToDocxElementsRecursive] Node ID: ${node.id} - Added ${contentElements.length} content elements from createDocxElementsFromContent.`);

  if (contentElements.length > 0) {
    // Dodajemo elemente samo ako ih ima
    docxElements.push(...contentElements);
  }

  // Pojednostavljena logika za dodavanje paragrafa za razmak
  if (node.title.trim() || contentElements.length > 0) {
    docxElements.push(new Paragraph({ text: '' })); // Uvijek dodajemo prazan paragraf ako ima naslova ili sadržaja
    // console.log(`[DOCX nodeToDocxElementsRecursive] Node ID: ${node.id} - Added spacing paragraph after content/title.`);
  }

  if (node.children && node.children.length > 0) {
    // console.log(`[DOCX nodeToDocxElementsRecursive] Node ID: ${node.id} has ${node.children.length} children. Recursing...`);
    for (const child of node.children) {
      await nodeToDocxElementsRecursive(child, currentStructuralLevel + 1, docxElements);
    }
  } else {
    // console.log(`[DOCX nodeToDocxElementsRecursive] Node ID: ${node.id} - No children to recurse.`);
  }
  // console.log(`[DOCX nodeToDocxElementsRecursive END] Node ID: ${node.id}`);
}

export async function exportDocx(bookData: BookNode): Promise<void> {
  console.log('[DOCX exportDocx START] Initiating DOCX export for BookData title:', bookData.title);

  try {
    let bookTitleToUse = 'Document';

    /*  if (bookData.children && bookData.children.length > 0 && bookData.children[0].title.trim()) {
      bookTitleToUse = bookData.children[0].title.trim();
    } else if (bookData.title.trim()) {
      bookTitleToUse = bookData.title.trim();
    } */

    if (bookData.children && bookData.children.length > 0 && bookData.children[0].title.trim()) {
      bookTitleToUse = bookData.children[0].title.trim();
    } else if (bookData.title.trim()) {
      bookTitleToUse = bookData.title.trim();
    }

    const docxDocumentElements: any[] = [];
    const isSingleNodeExport = !(bookData.children && bookData.children.length > 0);

    if (!isSingleNodeExport && bookTitleToUse !== 'Document' && bookTitleToUse.trim()) {
      docxDocumentElements.push(
        new Paragraph({
          text: bookTitleToUse,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
        })
      );
      docxDocumentElements.push(new Paragraph({ children: [new TextRun({ text: '', break: 1 })] }));
    }

    const effectiveBookChildren = isSingleNodeExport ? [bookData] : bookData.children || [];

    docxDocumentElements.push(
      new TableOfContents('Table of Contents', {
        hyperlink: true,
        headingStyleRange: '1-6',
      })
    );

    docxDocumentElements.push(new Paragraph({ children: [new TextRun({ text: '', break: 1 })] }));

    if (effectiveBookChildren && effectiveBookChildren.length > 0) {
      for (const [index, child] of effectiveBookChildren.entries()) {
        console.log(`[DOCX exportDocx] Processing child ${index + 1}/${effectiveBookChildren.length}, ID: ${child.id}, Title: "${child.title}"`);
        await nodeToDocxElementsRecursive(child, 0, docxDocumentElements);
      }
    }

    const doc = new Document({
      numbering: {
        config: [
          {
            reference: 'default-numbering',
            levels: [
              { level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START },
              {
                level: 1,
                format: 'lowerLetter',
                text: '%2.',
                alignment: AlignmentType.START,
                style: { paragraph: { indent: { left: 720 } } },
              },
              {
                level: 2,
                format: 'lowerRoman',
                text: '%3.',
                alignment: AlignmentType.START,
                style: { paragraph: { indent: { left: 1440 } } },
              },
            ],
          },
        ],
      },
      sections: [
        {
          properties: {},
          children: docxDocumentElements,
        },
      ],
    });

    const filenameSlugBase = generateSlug(bookTitleToUse, 'book', 'export-docx');
    // Dodavanje timestamp-a u formatu DD-MM-YYYY-THH-MM-SS
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // getMonth() vraća 0-11
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${day}-${month}-${year}_T${hours}-${minutes}-${seconds}`;
    const filenameSlug = `${filenameSlugBase}_myBookHelper_${timestamp}`;

    Packer.toBlob(doc)
      .then((blob) => {
        saveAs(blob, `${filenameSlug}.docx`);
      })
      .catch((packErr) => {
        console.error('[DOCX exportDocx] Error packing DOCX with Packer.toBlob:', packErr);
        throw packErr;
      });
  } catch (error: any) {
    console.error('[DOCX exportDocx CATCH_ALL] General error in exportDocx function:', error.message, error.stack);
    throw error;
  }
}

export function exportProjectData(bookData: BookNode): void {
  let titleForFilename = 'untitled-book';
  if (bookData.children && bookData.children.length > 0 && bookData.children[0].title.trim()) {
    titleForFilename = bookData.children[0].title;
  } else if (bookData.title.trim()) {
    titleForFilename = bookData.title;
  }

  const bookTitleSlug = generateSlug(titleForFilename, 'book', 'export');
  const filename = `${bookTitleSlug}.myBookHelper.json`;

  let dataToExport = bookData;
  const isValidRootContent =
    typeof bookData.content === 'object' &&
    bookData.content !== null &&
    Array.isArray(bookData.content.blocks) &&
    typeof bookData.content.entityMap === 'object' &&
    bookData.content.entityMap !== null;

  if (!isValidRootContent) {
    dataToExport = {
      ...bookData,
      content: {
        blocks: [
          {
            key: 'default-root',
            text: '',
            type: 'unstyled',
            depth: 0,
            inlineStyleRanges: [],
            entityRanges: [],
            data: {},
          },
        ],
        entityMap: {},
      },
    };
  }

  const jsonString = JSON.stringify(dataToExport, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  saveAs(blob, filename);
}
