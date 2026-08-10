'use client';

/**
 * Smart EDMS — Resumable upload hook (TUS protocol)
 *
 * Enterprise-grade file upload using tus-js-client for:
 *   - Resumable uploads (network interruption → resume from last chunk)
 *   - Progress tracking (percentage + bytes uploaded)
 *   - Large file support (up to 2GB via chunked upload)
 *   - Parallel uploads (multiple files simultaneously)
 *   - Automatic retry on network errors
 *
 * Usage:
 *   const { upload, progress, isUploading, error } = useTusUpload();
 *   await upload(file, { title, classificationId, ... });
 *
 * Flow:
 *   1. Client creates a TUS upload via tus-js-client → POST /api/upload/tus
 *   2. Client sends file chunks → PATCH /api/upload/tus/:id
 *   3. On completion, client calls POST /api/upload/tus-complete
 *   4. Server creates Document + Version + enqueues OCR
 *
 * Fallback: if the file is < 100MB, uses the traditional formData upload
 * for simpler error handling (no TUS overhead for small files).
 */

import { useState, useCallback, useRef } from 'react';
import * as tus from 'tus-js-client';
import { api } from '@/lib/api/client';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';

export interface TusUploadOptions {
  title?: string;
  description?: string;
  documentType?: string;
  classificationId?: string | null;
  folderId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  retentionScheduleId?: string | null;
  changeReason?: string;
}

export interface TusUploadResult {
  documentId: string;
  versionId: string;
}

export interface TusUploadState {
  isUploading: boolean;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  error: string | null;
  uploadId: string | null;
}

const SMALL_FILE_THRESHOLD = 100 * 1024 * 1024;

export function useTusUpload() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [state, setState] = useState<TusUploadState>({
    isUploading: false,
    progress: 0,
    uploadedBytes: 0,
    totalBytes: 0,
    error: null,
    uploadId: null,
  });
  const abortRef = useRef<tus.Upload | null>(null);

  const upload = useCallback(async (
    file: File,
    options: TusUploadOptions = {},
  ): Promise<TusUploadResult | null> => {
    setState({
      isUploading: true,
      progress: 0,
      uploadedBytes: 0,
      totalBytes: file.size,
      error: null,
      uploadId: null,
    });

    try {
      if (file.size < SMALL_FILE_THRESHOLD) {
        return await uploadSmallFile(file, options, setState);
      }

      const baseUrl = window.location.origin;
      const tusEndpoint = `${baseUrl}/api/upload/tus`;

      const uploadPromise = new Promise<TusUploadResult>((resolve, reject) => {
        const tusUpload = new tus.Upload(file, {
          endpoint: tusEndpoint,
          retryDelays: [0, 1000, 3000, 5000, 10000, 15000, 30000],
          chunkSize: 8 * 1024 * 1024,
          metadata: {
            filename: file.name,
            filetype: file.type,
            tenantId: (session?.user as any)?.tenantId || '',
            userId: (session?.user as any)?.id || '',
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
            setState((prev) => ({
              ...prev,
              progress: percentage,
              uploadedBytes: bytesUploaded,
              totalBytes: bytesTotal,
            }));
          },
          onSuccess: async () => {
            try {
              const result = await api.post<TusUploadResult>('/api/upload/tus-complete', {
                uploadId: tusUpload.url?.split('/').pop(),
                fileName: file.name,
                mimeType: file.type,
                ...options,
              });
              setState((prev) => ({ ...prev, isUploading: false, progress: 100 }));
              resolve(result);
            } catch (err: any) {
              setState((prev) => ({ ...prev, isUploading: false, error: err?.message }));
              reject(err);
            }
          },
          onError: (error) => {
            setState((prev) => ({ ...prev, isUploading: false, error: error.message }));
            reject(error);
          },
        });
        abortRef.current = tusUpload;
        tusUpload.start();
      });

      return await uploadPromise;
    } catch (err: any) {
      setState((prev) => ({ ...prev, isUploading: false, error: err?.message }));
      toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' });
      return null;
    }
  }, [session, toast]);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort(true);
      abortRef.current = null;
    }
    setState((prev) => ({ ...prev, isUploading: false, error: 'Upload cancelled' }));
  }, []);

  return {
    upload,
    abort,
    isUploading: state.isUploading,
    progress: state.progress,
    uploadedBytes: state.uploadedBytes,
    totalBytes: state.totalBytes,
    error: state.error,
  };
}

async function uploadSmallFile(
  file: File,
  options: TusUploadOptions,
  setState: React.Dispatch<React.SetStateAction<TusUploadState>>,
): Promise<TusUploadResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('title', options.title || file.name);
  if (options.description) fd.append('description', options.description);
  fd.append('documentType', options.documentType || 'generic');
  if (options.classificationId) fd.append('classificationId', options.classificationId);
  if (options.folderId) fd.append('folderId', options.folderId);
  fd.append('tags', JSON.stringify(options.tags || []));
  fd.append('metadata', JSON.stringify(options.metadata || {}));
  fd.append('changeReason', options.changeReason || 'Initial upload');

  setState((prev) => ({ ...prev, progress: 50 }));

  const response = await fetch('/api/documents', {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Upload failed: ${response.status}`);
  }

  const data = await response.json();
  setState((prev) => ({ ...prev, isUploading: false, progress: 100 }));
  return { documentId: data.document?.id || data.id, versionId: data.version?.id || '' };
}
