const path = require('path');
const { session, dialog, app } = require('electron');
const settingsManager = require('./settings');

class VideoDownloader {
  constructor() {
    this.mediaByTab = new Map(); // tabId -> Array<{ id, url, title, format, size, resolution, duration }>
    this.activeDownloads = new Map(); // downloadId -> { id, filename, totalBytes, receivedBytes, percent, state }
    this.onMediaDetectedCallback = null;
    this.onDownloadProgressCallback = null;
  }

  setCallbacks(onMediaDetected, onDownloadProgress) {
    this.onMediaDetectedCallback = onMediaDetected;
    this.onDownloadProgressCallback = onDownloadProgress;
  }

  init() {
    const ses = session.defaultSession;

    // 1. Intercept HTTP response headers to detect streaming media
    ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
      if (settingsManager.get('videoDownloaderEnabled', true)) {
        this.inspectHeaders(details);
      }
      callback({ cancel: false });
    });

    // 2. Monitor Electron downloads
    ses.on('will-download', (event, item, webContents) => {
      const downloadId = 'dl_' + Date.now();
      const filename = item.getFilename();
      const totalBytes = item.getTotalBytes();

      const dlRecord = {
        id: downloadId,
        filename: filename,
        totalBytes: totalBytes,
        receivedBytes: 0,
        percent: 0,
        state: 'progressing',
        savePath: item.getSavePath()
      };
      this.activeDownloads.set(downloadId, dlRecord);

      item.on('updated', (evt, state) => {
        if (state === 'interrupted') {
          dlRecord.state = 'interrupted';
        } else if (state === 'progressing') {
          dlRecord.receivedBytes = item.getReceivedBytes();
          if (totalBytes > 0) {
            dlRecord.percent = Math.round((dlRecord.receivedBytes / totalBytes) * 100);
          }
        }
        if (this.onDownloadProgressCallback) {
          this.onDownloadProgressCallback(dlRecord);
        }
      });

      item.once('done', (evt, state) => {
        dlRecord.state = state === 'completed' ? 'completed' : 'cancelled';
        dlRecord.receivedBytes = item.getReceivedBytes();
        dlRecord.percent = 100;
        dlRecord.savePath = item.getSavePath() || dlRecord.savePath;
        if (this.onDownloadProgressCallback) {
          this.onDownloadProgressCallback(dlRecord);
        }
        // Keep the finished entry visible for a moment, then release it
        setTimeout(() => this.activeDownloads.delete(downloadId), 30000).unref?.();
      });
    });
  }

  inspectHeaders(details) {
    const headers = details.responseHeaders || {};
    const getHeader = (name) => {
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === name.toLowerCase()) {
          return headers[k][0];
        }
      }
      return null;
    };

    const contentType = getHeader('content-type') || '';
    const contentLength = parseInt(getHeader('content-length') || '0', 10);
    const contentDisposition = getHeader('content-disposition') || '';

    const url = details.url;
    const tabId = details.webContentsId;

    if (!tabId || !url) return;

    // Check if this is media
    const isVideoMime = /video\/(mp4|webm|ogg|quicktime|x-matroska)/i.test(contentType);
    const isHlsMime = /(application\/vnd\.apple\.mpegurl|application\/x-mpegurl)/i.test(contentType);
    const isDashMime = /application\/dash\+xml/i.test(contentType);
    const isAudioMime = /audio\/(mpeg|mp4|ogg|webm|wav)/i.test(contentType);

    let format = '';
    if (isVideoMime) {
      format = contentType.split('/')[1].split(';')[0].toUpperCase();
    } else if (isHlsMime || url.includes('.m3u8')) {
      format = 'HLS (m3u8)';
    } else if (isDashMime || url.includes('.mpd')) {
      format = 'DASH (mpd)';
    } else if (isAudioMime) {
      format = 'AUDIO (' + contentType.split('/')[1].split(';')[0].toUpperCase() + ')';
    } else {
      // NOTE: ".ts" is intentionally excluded - HLS streams consist of hundreds of .ts segments
      // (and .ts is also TypeScript) which would flood the detected media list.
      const extMatch = url.match(/\.(mp4|webm|m3u8|mpd|mkv|mov)(\?.*)?$/i);
      if (extMatch) {
        format = extMatch[1].toUpperCase();
      }
    }

    if (!format) return;

    // Filter tiny chunks/beeps (< 200KB) unless it's HLS/DASH manifest
    if (contentLength > 0 && contentLength < 200 * 1024 && !format.includes('HLS') && !format.includes('DASH')) {
      return;
    }

    // Determine filename
    let filename = '';
    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].replace(/['"]/g, '');
    } else {
      try {
        const u = new URL(url);
        filename = path.basename(u.pathname) || 'video_' + Date.now() + '.' + format.toLowerCase();
      } catch (e) {
        filename = 'video_' + Date.now() + '.' + format.toLowerCase();
      }
    }

    this.registerMedia(tabId, {
      url: url,
      title: decodeURIComponent(filename),
      format: format,
      size: contentLength > 0 ? this.formatBytes(contentLength) : 'Stream',
      rawBytes: contentLength
    });
  }

  registerMedia(tabId, mediaInfo) {
    const list = this.mediaByTab.get(tabId) || [];
    // Deduplicate by URL
    if (list.some(m => m.url === mediaInfo.url)) {
      return;
    }

    const item = {
      id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      url: mediaInfo.url,
      title: mediaInfo.title || 'Video stream',
      format: mediaInfo.format || 'MP4',
      size: mediaInfo.size || 'Neznámá velikost',
      resolution: mediaInfo.resolution || '',
      duration: mediaInfo.duration || ''
    };

    list.push(item);
    // Bound memory use on pages that expose lots of media URLs
    if (list.length > 100) list.shift();
    this.mediaByTab.set(tabId, list);

    if (this.onMediaDetectedCallback) {
      this.onMediaDetectedCallback(tabId, item, list.length);
    }
  }

  getMediaForTab(tabId) {
    return this.mediaByTab.get(tabId) || [];
  }

  clearTab(tabId) {
    this.mediaByTab.delete(tabId);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  startDownload(targetUrl) {
    if (!targetUrl) return;
    session.defaultSession.downloadURL(targetUrl);
  }

  getActiveDownloads() {
    return Array.from(this.activeDownloads.values());
  }
}

module.exports = new VideoDownloader();
