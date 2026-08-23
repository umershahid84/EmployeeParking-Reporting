import api from '../api/client';

/**
 * Downloads a file from an authenticated API endpoint (CSV/PDF exports).
 * Goes through the shared axios instance so the Authorization header is
 * attached automatically, then saves the blob via a throwaway <a download>.
 */
export async function downloadFile(url, params, filenameFallback) {
  const response = await api.get(url, { params, responseType: 'blob' });

  const disposition = response.headers['content-disposition'] || '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match ? match[1] : filenameFallback;

  const blobUrl = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
