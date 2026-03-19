import { put, del, head, getDownloadUrl } from '@vercel/blob';
import type { BlobStorageProvider } from './interface';

export class VercelBlobAdapter implements BlobStorageProvider {
  async upload(params: {
    path: string;
    data: Buffer | ReadableStream;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<{ url: string; path: string }> {
    const blob = await put(params.path, params.data, {
      access: 'private',
      contentType: params.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return { url: blob.url, path: params.path };
  }

  async download(path: string): Promise<{
    data: ReadableStream;
    contentType: string;
    size: number;
  }> {
    const blobMeta = await head(path);

    // For private blobs, fetch with the read-write token
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const response = await fetch(blobMeta.url, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download blob (status ${response.status}): ${path}`);
    }

    return {
      data: response.body,
      contentType: blobMeta.contentType,
      size: blobMeta.size,
    };
  }

  async getSignedUrl(path: string, _expiresIn?: number): Promise<string> {
    // For Vercel Blob, the URL from put() is already accessible.
    // In production you'd use token-based access.
    // For now, fetch the blob metadata and return its url.
    const blobMeta = await head(path);
    return blobMeta.url;
  }

  async delete(path: string): Promise<void> {
    await del(path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await head(path);
      return true;
    } catch {
      return false;
    }
  }
}
