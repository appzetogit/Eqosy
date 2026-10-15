// Generates the SVG artwork for the Indore demo data into Frontend/public/demo/**.
// Dish photos reuse the existing Frontend/public/food/*.png files, so only grocery categories/items,
// store banners and rider avatars are drawn here. Usage: node scripts/generate-demo-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORE_CATEGORIES, STORE_ITEMS, STORES, DELIVERY_PARTNERS } from '../src/modules/food/admin/data/demoSeedData.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(here, '../../Frontend/public/demo');

const write = (relative, content) => {
  const file = path.join(outRoot, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
};

const escapeXml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const tile = ({ emoji, bg, label, size = 512 }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <circle cx="256" cy="236" r="150" fill="#ffffff" fill-opacity="0.55"/>
  <text x="256" y="${label ? 286 : 300}" font-size="190" text-anchor="middle" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${emoji}</text>
  ${label ? `<text x="256" y="446" font-size="40" font-weight="700" text-anchor="middle" fill="#1f2937" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${escapeXml(label)}</text>` : ''}
</svg>
`;

const palette = [
  ['#fee2e2', '#fecaca'],
  ['#dcfce7', '#bbf7d0'],
  ['#e0f2fe', '#bae6fd'],
  ['#fef3c7', '#fde68a'],
  ['#ede9fe', '#ddd6fe'],
  ['#ffedd5', '#fed7aa'],
];

const categoryByName = new Map(STORE_CATEGORIES.map((c) => [c.name, c]));

for (const category of STORE_CATEGORIES) {
  write(`grocery/cat-${category.slug}.svg`, tile({ emoji: category.emoji, bg: category.bg }));
}

STORE_ITEMS.forEach((item, index) => {
  const bg = categoryByName.get(item.cat)?.bg || palette[index % palette.length];
  write(`grocery/${item.slug}.svg`, tile({ emoji: item.emoji, bg }));
});

STORES.forEach((store, index) => {
  write(`stores/${store.slug}.svg`, tile({ emoji: store.emoji, bg: palette[(index + 1) % palette.length], label: store.restaurantName }));
});

DELIVERY_PARTNERS.forEach((rider, index) => {
  const initials = rider.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const colour = ['#0f172a', '#1d4ed8', '#047857', '#b45309'][index % 4];
  write(
    `riders/rider-${index + 1}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="128" fill="${colour}"/>
  <text x="128" y="156" font-size="96" font-weight="700" text-anchor="middle" fill="#ffffff" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${initials}</text>
</svg>
`,
  );
});

console.log(`Demo assets written to ${outRoot}`);
