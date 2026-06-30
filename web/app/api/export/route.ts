/**
 * POST /api/export — stream the whole matching audience as CSV or xlsx.
 *
 * Port of the Flask /api/export handler (app/server.py). Body: { filters, columns,
 * format }. format defaults to "csv"; "xlsx" returns a native-hyperlink workbook.
 * Anything else → 400. Content-Disposition names the file audience-<YYYY-MM-DD>.<ext>.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError, errorResponse } from '../../../lib/errors';
import { buildXlsx, streamCsv } from '../../../lib/export';
import type { FilterPayload } from '../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ExportBody {
  filters?: FilterPayload;
  columns?: string[];
  format?: string;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    let body: ExportBody;
    try {
      body = ((await req.json()) as ExportBody) ?? {};
    } catch {
      body = {};
    }
    const filters = body.filters ?? {};
    const columns = body.columns ?? [];
    const fmt = (body.format ?? 'csv').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD stamp for the download filename.

    if (fmt === 'xlsx') {
      const data = await buildXlsx(columns, filters);
      return new NextResponse(new Uint8Array(data), {
        headers: {
          'Content-Type': XLSX_MIME,
          'Content-Disposition': `attachment; filename="audience-${stamp}.xlsx"`,
        },
      });
    }

    if (fmt === 'csv') {
      const encoder = new TextEncoder();
      const iterator = streamCsv(columns, filters);
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { value, done } = await iterator.next();
            if (done) {
              controller.close();
            } else {
              controller.enqueue(encoder.encode(value));
            }
          } catch (err) {
            controller.error(err);
          }
        },
        async cancel() {
          await iterator.return?.(undefined);
        },
      });
      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audience-${stamp}.csv"`,
        },
      });
    }

    throw new ValidationError(`Unsupported format: ${fmt}`);
  } catch (err) {
    return errorResponse(err);
  }
}
