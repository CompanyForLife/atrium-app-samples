#!/usr/bin/env node
// Reads the real spec doc straight from the repo (single source of truth -
// see the plan discussion for why this isn't hand-transcribed into the app)
// and generates src/app/content/spec-content.generated.json: one entry per
// numbered top-level section, with its HTML body and its own sub-heading
// list for the page TOC. Runs before every build/serve (see package.json).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dirname, '../../docs/atrium-app-developer-spec.md');
const OUTPUT_PATH = join(__dirname, '../src/app/content/spec-content.generated.json');

function slugify(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

// The real spec doc numbers sub-headings inconsistently (3.1, 5.1, ... in
// some sections, plain titles in others) - stripped here so every section
// renders the same way regardless of the source doc's own numbering.
function stripLeadingNumber(text) {
    return text.replace(/^\d+(?:\.\d+)*\s+/, '');
}

// marked doesn't add id attributes to headings by default - without this,
// the TOC entries built below would link to #anchors nothing on the page
// actually has.
const renderer = new marked.Renderer();
renderer.heading = ({ tokens, depth }) => {
    const plain = stripLeadingNumber(tokens.map(t => ('text' in t ? t.text : '')).join(''));
    const id = slugify(plain.replace(/`/g, ''));
    const text = marked.parseInline(plain);
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};
marked.use({ renderer });

function wrapTables(html) {
    return html
        .replace(/<table>/g, '<div class="doc-page__table-wrap"><table>')
        .replace(/<\/table>/g, '</table></div>');
}

function extractHeadings(markdown) {
    const headings = [];
    const lines = markdown.split('\n');
    let inCodeFence = false;

    for (const line of lines) {
        if (line.trim().startsWith('```')) {
            inCodeFence = !inCodeFence;
            continue;
        }
        if (inCodeFence) {
            continue;
        }

        const match = /^(#{3,4})\s+(.+)$/.exec(line);
        if (match) {
            const level = match[1].length;
            const text = stripLeadingNumber(match[2].replace(/`/g, ''));
            headings.push({ level, text, id: slugify(text) });
        }
    }

    return headings;
}

function run() {
    const raw = readFileSync(SPEC_PATH, 'utf-8');

    // Split on top-level "## N. Title" headings, keeping the number/title.
    const sectionPattern = /^## (\d+)\. (.+)$/gm;
    const matches = [...raw.matchAll(sectionPattern)];

    if (matches.length === 0) {
        throw new Error(`No "## N. Title" sections found in ${SPEC_PATH}`);
    }

    const sections = matches.map((match, index) => {
        const number = Number(match[1]);
        const title = match[2].trim();
        const start = match.index + match[0].length;
        const end = index + 1 < matches.length ? matches[index + 1].index : raw.length;
        const body = raw.slice(start, end).trim();

        return {
            number,
            title,
            slug: slugify(title),
            headings: extractHeadings(body),
            html: wrapTables(marked.parse(body))
        };
    });

    writeFileSync(OUTPUT_PATH, JSON.stringify(sections, null, 2));
    console.log(`Generated ${sections.length} sections -> ${OUTPUT_PATH}`);
}

run();
