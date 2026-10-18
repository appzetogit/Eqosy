import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';

// Local (VPS disk) image storage. Active only when UPLOAD_STORAGE_ROOT is set.
//   UPLOAD_STORAGE_ROOT=/var/www/uploads        -> where files are written (served by Nginx /uploads/)
//   UPLOAD_BASE_URL=https://appzeto.com/uploads -> public URL prefix
// Importing this module also redirects cloudinary.uploader.upload_stream / upload / destroy to disk,
// so every existing Cloudinary call site keeps working unchanged.

const storageRoot = () => (process.env.UPLOAD_STORAGE_ROOT || '').trim();
const baseUrl = () => (process.env.UPLOAD_BASE_URL || '').trim().replace(/\/+$/, '');

export const isLocalStorageEnabled = () => Boolean(storageRoot() && baseUrl());

const sanitizeFolder = (folder = 'uploads') => {
    const parts = String(folder)
        .split(/[\\/]+/)
        .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, ''))
        .filter(Boolean);
    return parts.length ? parts.join('/') : 'uploads';
};

const detectExtension = (buffer) => {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
    if (buffer.length >= 4 && buffer.toString('hex', 0, 4) === '89504e47') return 'png';
    if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'GIF8') return 'gif';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return 'jpg';
};

const resolveInsideRoot = (publicId) => {
    const root = path.resolve(storageRoot());
    const target = path.resolve(root, publicId);
    return target.startsWith(root + path.sep) ? target : null;
};

/**
 * Writes an image buffer to disk. Returns a Cloudinary-shaped result.
 */
export const saveBufferLocally = async (buffer, folder = 'uploads') => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('File buffer is required');
    }
    const safeFolder = sanitizeFolder(folder);
    let ext = detectExtension(buffer);
    if (['jpg', 'png', 'webp'].includes(ext)) {
        // Downscale + WebP: phone photos are several MB, which makes pages slow to load.
        try {
            const { default: sharp } = await import('sharp');
            buffer = await sharp(buffer)
                .rotate()
                .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer();
            ext = 'webp';
        } catch {
            // sharp unavailable or unreadable image: store the original bytes
        }
    }
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const publicId = `${safeFolder}/${fileName}`;
    const target = resolveInsideRoot(publicId);
    if (!target) {
        throw new Error('Invalid upload path');
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer, { mode: 0o644 });

    const url = `${baseUrl()}/${publicId}`;
    return { secure_url: url, url, public_id: publicId, format: ext, bytes: buffer.length, resource_type: 'image' };
};

export const deleteLocalFile = async (publicId) => {
    const target = publicId ? resolveInsideRoot(String(publicId)) : null;
    if (!target) return { result: 'not found' };
    try {
        await fs.unlink(target);
        return { result: 'ok' };
    } catch {
        return { result: 'not found' };
    }
};

const uploader = cloudinary.uploader;
const original = {
    upload_stream: uploader.upload_stream.bind(uploader),
    upload: uploader.upload.bind(uploader),
    destroy: uploader.destroy.bind(uploader),
};

// upload_stream(options, callback) -> writable stream; on end() the buffer is saved to disk.
uploader.upload_stream = (options, callback) => {
    if (!isLocalStorageEnabled()) return original.upload_stream(options, callback);
    const chunks = [];
    return new Writable({
        write(chunk, _enc, done) {
            chunks.push(chunk);
            done();
        },
        final(done) {
            saveBufferLocally(Buffer.concat(chunks), options?.folder)
                .then((result) => callback?.(undefined, result))
                .catch((err) => callback?.(err))
                .finally(() => done());
        },
    });
};

// upload(urlOrDataUri, options) -> downloads/decodes and saves to disk.
uploader.upload = async (source, options = {}) => {
    if (!isLocalStorageEnabled()) return original.upload(source, options);
    let buffer;
    if (typeof source === 'string' && source.startsWith('data:')) {
        buffer = Buffer.from(source.split(',')[1] || '', 'base64');
    } else {
        const response = await fetch(source, { signal: AbortSignal.timeout(options.timeout || 20000) });
        if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
        buffer = Buffer.from(await response.arrayBuffer());
    }
    return saveBufferLocally(buffer, options.folder);
};

uploader.destroy = async (publicId, ...rest) => {
    if (isLocalStorageEnabled() && typeof publicId === 'string' && !publicId.startsWith('http')) {
        // Local files live under UPLOAD_STORAGE_ROOT; legacy Cloudinary ids fall through to Cloudinary.
        const target = resolveInsideRoot(publicId);
        if (target) {
            try {
                await fs.access(target);
                return deleteLocalFile(publicId);
            } catch {
                // not a local file
            }
        }
    }
    return original.destroy(publicId, ...rest);
};
