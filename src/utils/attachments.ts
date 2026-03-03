import { readFile, stat, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS
} from '../constants.js';

/** Processed attachment ready for osTicket API */
export interface ProcessedAttachment {
  filename: string;
  dataUri: string;
  sizeBytes: number;
}

/** osTicket API attachment format: [{filename: "data:mime;base64,..."}] */
export type OsTicketAttachment = Record<string, string>;

/** MIME type mapping for common file extensions */
const MIME_TYPES: Record<string, string> = {
  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',

  // Documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',

  // Text
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.log': 'text/plain',

  // Archives
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
};

const DEFAULT_MIME_TYPE = 'application/octet-stream';

/**
 * Get MIME type from file extension
 */
function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_TYPES[ext] || DEFAULT_MIME_TYPE;
}

/**
 * Read a file from disk and prepare it as an attachment
 *
 * @throws Error if file doesn't exist, is too large, or can't be read
 */
export async function readFileAsAttachment(filePath: string): Promise<ProcessedAttachment> {
  // Check file exists and get size
  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  if (fileStat.size > MAX_ATTACHMENT_SIZE_BYTES) {
    const sizeMB = (fileStat.size / (1024 * 1024)).toFixed(1);
    const limitMB = (MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    throw new Error(`File too large: ${basename(filePath)} is ${sizeMB} MB (max ${limitMB} MB)`);
  }

  if (fileStat.size === 0) {
    throw new Error(`File is empty: ${filePath}`);
  }

  const content = await readFile(filePath);
  const filename = basename(filePath);
  const mimeType = getMimeType(filename);
  const base64 = content.toString('base64');

  return {
    filename,
    dataUri: `data:${mimeType};base64,${base64}`,
    sizeBytes: fileStat.size,
  };
}

/**
 * Process multiple file paths into osTicket attachment format
 *
 * @throws Error if too many files, total size exceeded, or any file can't be read
 */
export async function processAttachments(
  filePaths: Array<{ path: string }>
): Promise<{ attachments: OsTicketAttachment[]; summary: string }> {
  if (filePaths.length > MAX_ATTACHMENTS) {
    throw new Error(`Too many attachments: ${filePaths.length} (max ${MAX_ATTACHMENTS})`);
  }

  const processed: ProcessedAttachment[] = [];
  let totalSize = 0;

  for (const { path: filePath } of filePaths) {
    const attachment = await readFileAsAttachment(filePath);
    totalSize += attachment.sizeBytes;

    if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
      const totalMB = (totalSize / (1024 * 1024)).toFixed(1);
      const limitMB = (MAX_TOTAL_ATTACHMENT_SIZE_BYTES / (1024 * 1024)).toFixed(0);
      throw new Error(`Total attachment size ${totalMB} MB exceeds limit of ${limitMB} MB`);
    }

    processed.push(attachment);
  }

  // Format for osTicket API: [{filename: "data:mime;base64,..."}]
  const attachments: OsTicketAttachment[] = processed.map(a => ({
    [a.filename]: a.dataUri
  }));

  const filenames = processed.map(a => a.filename);
  const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
  const summary = `${processed.length} file(s) attached: ${filenames.join(', ')} (${totalMB} MB total)`;

  return { attachments, summary };
}

/**
 * Save base64-encoded attachment content to a temporary file
 *
 * @param filename Original filename from the API response
 * @param base64Content Base64-encoded file content
 * @returns Absolute path to the saved file in os.tmpdir()
 */
export async function saveAttachmentToTmp(filename: string, base64Content: string): Promise<string> {
  // Sanitize filename: only allow safe characters
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Add unique prefix to avoid collisions
  const prefix = randomBytes(4).toString('hex');
  const safeName = `${prefix}_${sanitized}`;
  const filePath = join(tmpdir(), safeName);

  const buffer = Buffer.from(base64Content, 'base64');
  await writeFile(filePath, buffer);

  return filePath;
}
