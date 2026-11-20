import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';

// GET /api/v1/img?url=<image url>&w=400
// Returns a small WebP copy of an image (cached on disk) so phones do not download multi-MB originals.
// Only images from our own hosts / Cloudinary are allowed (no open proxy).
const CACHE_DIR = path.join(process.env.IMG_CACHE_DIR || os.tmpdir(), 'eqosy-img-cache');
const MAX_BYTES = 25 * 1024 * 1024;

const allowedHosts = () => {
    const hosts = new Set(['res.cloudinary.com']);
    for (const v of [process.env.UPLOAD_BASE_URL, process.env.BACKEND_URL, process.env.API_ORIGIN, 'https://eqosy.com']) {
        try { if (v) hosts.add(new URL(v).host); } catch { /* ignore bad env value */ }
    }
    return hosts;
};

const router = Router();

router.get('/', async (req, res) => {
    try {
        const raw = String(req.query.url || '');
        const width = Math.min(1200, Math.max(48, Number.parseInt(String(req.query.w || '400'), 10) || 400));
        let u;
        try { u = new URL(raw); } catch { return res.status(400).end(); }
        if (!/^https?:$/.test(u.protocol) || !allowedHosts().has(u.host)) return res.status(403).end();

        const key = crypto.createHash('sha1').update(`${u.href}|${width}`).digest('hex');
        const file = path.join(CACHE_DIR, `${key}.webp`);
        res.set('Cache-Control', 'public, max-age=2592000, immutable');
        res.type('image/webp');
        try {
            await fs.access(file);
            return res.sendFile(file);
        } catch { /* not cached yet */ }

        const upstream = await fetch(u.href, { signal: AbortSignal.timeout(15000) });
        if (!upstream.ok) return res.status(502).end();
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.length > MAX_BYTES) return res.status(413).end();
        const { default: sharp } = await import('sharp');
        const out = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
        await fs.mkdir(CACHE_DIR, { recursive: true });
        await fs.writeFile(file, out);
        return res.send(out);
    } catch {
        return res.status(500).end();
    }
});

export default router;
