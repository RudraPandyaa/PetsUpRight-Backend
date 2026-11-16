import { Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';
import PDFDocument from 'pdfkit';

import { loggerCtx } from '../constants';
import { InvoiceSnapshot } from '../types';

const MARGIN = 36;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = PAGE_HEIGHT - MARGIN - 20;

const INK = '#1f2333';
const MUTED = '#6b6f80';
const LINE = '#d9dbe3';
const HEAD_BG = '#f1f2f6';
const ACCENT = '#44476f';

const LOGO_CACHE_MS = 60 * 60 * 1000;

/** Built-in PDF fonts have no rupee sign, so amounts are printed as "Rs." / plain numbers. */
const money = (paise: number) =>
    (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (iso: string | null | undefined) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
    });
};

interface Column {
    key: string;
    label: string;
    width: number;
    align: 'left' | 'right' | 'center';
}

@Injectable()
export class InvoicePdfService {
    private logoCache = new Map<string, { data: Buffer | null; at: number }>();

    async render(data: InvoiceSnapshot): Promise<Buffer> {
        const logo = await this.loadLogo(data.logoUrl);

        const doc = new PDFDocument({
            size: 'A4',
            margin: MARGIN,
            bufferPages: true,
            info: {
                Title: `${data.title} ${data.invoiceNumber}`,
                Author: data.seller.legalName,
                Subject: `Order ${data.orderCode}`,
            },
        });
        const chunks: Buffer[] = [];
        doc.on('data', chunk => chunks.push(chunk as Buffer));
        const done = new Promise<Buffer>((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
        });

        this.draw(doc, data, logo);
        doc.end();
        return done;
    }

    private draw(doc: PDFKit.PDFDocument, data: InvoiceSnapshot, logo: Buffer | null) {
        const isCredit = data.type === 'CREDIT_NOTE';
        let y = MARGIN;

        // ---------- Header: logo + seller (left), document title (right) ----------
        const leftWidth = CONTENT_WIDTH * 0.55;
        if (logo) {
            try {
                doc.image(logo, MARGIN, y, { fit: [130, 48] });
                y += 54;
            } catch (error) {
                Logger.warn(`Could not draw invoice logo: ${String(error)}`, loggerCtx);
            }
        }
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(data.seller.legalName, MARGIN, y, { width: leftWidth });
        if (data.seller.name && data.seller.name !== data.seller.legalName) {
            doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`Trading as ${data.seller.name}`, { width: leftWidth });
        }
        doc.font('Helvetica').fontSize(8.5).fillColor(INK);
        for (const line of data.seller.addressLines) {
            doc.text(line, { width: leftWidth });
        }
        const sellerFacts = [
            data.seller.gstin ? `GSTIN: ${data.seller.gstin}` : 'GSTIN: Not registered',
            data.seller.pan ? `PAN: ${data.seller.pan}` : '',
            data.seller.state ? `State: ${data.seller.state}${data.seller.stateCode ? ` (${data.seller.stateCode})` : ''}` : '',
            [data.seller.phone, data.seller.email].filter(Boolean).join('  |  '),
        ].filter(Boolean);
        for (const fact of sellerFacts) {
            doc.text(fact, { width: leftWidth });
        }
        const leftBottom = doc.y;

        // Right column
        const rightX = MARGIN + leftWidth + 10;
        const rightWidth = CONTENT_WIDTH - leftWidth - 10;
        doc.font('Helvetica-Bold').fontSize(18).fillColor(ACCENT).text(data.title, rightX, MARGIN, {
            width: rightWidth,
            align: 'right',
        });
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
            isCredit ? 'Issued under Section 34 of the CGST Act' : 'Original for recipient',
            rightX,
            doc.y,
            { width: rightWidth, align: 'right' },
        );
        doc.moveDown(0.6);
        const facts: Array<[string, string]> = [
            [isCredit ? 'Credit note no.' : 'Invoice no.', data.invoiceNumber],
            [isCredit ? 'Credit note date' : 'Invoice date', formatDate(data.issuedAt)],
            ...(data.reference
                ? ([
                      ['Against invoice', data.reference.invoiceNumber],
                      ['Invoice date', formatDate(data.reference.issuedAt)],
                  ] as Array<[string, string]>)
                : []),
            ['Order no.', data.orderCode],
            ['Order date', formatDate(data.orderDate)],
        ];
        for (const [label, value] of facts) {
            const rowY = doc.y;
            doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, rightX, rowY, { width: rightWidth * 0.45 });
            doc.font('Helvetica-Bold').fillColor(INK).text(value, rightX + rightWidth * 0.45, rowY, {
                width: rightWidth * 0.55,
                align: 'right',
            });
        }
        y = Math.max(leftBottom, doc.y) + 12;

        // ---------- Bill to / Ship to ----------
        doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor(LINE).lineWidth(0.8).stroke();
        y += 8;
        const half = (CONTENT_WIDTH - 16) / 2;
        const partyBlock = (title: string, party: InvoiceSnapshot['billTo'], x: number) => {
            doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(title.toUpperCase(), x, y, { width: half });
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(party.name, x, doc.y + 2, { width: half });
            doc.font('Helvetica').fontSize(8.5);
            for (const line of party.addressLines) doc.text(line, x, doc.y, { width: half });
            if (party.stateCode) doc.text(`State code: ${party.stateCode}`, x, doc.y, { width: half });
            if (party.gstin) doc.text(`GSTIN: ${party.gstin}`, x, doc.y, { width: half });
            if (party.phone) doc.text(`Phone: ${party.phone}`, x, doc.y, { width: half });
            if (party.email) doc.text(`Email: ${party.email}`, x, doc.y, { width: half });
            return doc.y;
        };
        const billBottom = partyBlock('Bill to', data.billTo, MARGIN);
        const shipBottom = partyBlock('Ship to', data.shipTo, MARGIN + half + 16);
        y = Math.max(billBottom, shipBottom) + 8;

        doc.font('Helvetica').fontSize(8.5).fillColor(INK);
        doc.text(
            `Place of supply: ${data.placeOfSupply || '-'}     Reverse charge: ${data.reverseCharge ? 'Yes' : 'No'}     Supply: ${
                data.interState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'
            }`,
            MARGIN,
            y,
            { width: CONTENT_WIDTH },
        );
        if (data.reason) {
            doc.text(`Reason: ${data.reason}`, MARGIN, doc.y + 2, { width: CONTENT_WIDTH });
        }
        y = doc.y + 10;

        // ---------- Line items ----------
        const columns: Column[] = [
            { key: 'n', label: '#', width: 18, align: 'center' },
            { key: 'item', label: 'Item', width: 147, align: 'left' },
            { key: 'hsn', label: 'HSN/SAC', width: 48, align: 'left' },
            { key: 'qty', label: 'Qty', width: 26, align: 'right' },
            { key: 'rate', label: 'Rate', width: 52, align: 'right' },
            { key: 'disc', label: 'Discount', width: 42, align: 'right' },
            { key: 'taxable', label: 'Taxable', width: 58, align: 'right' },
            { key: 'gst', label: 'GST', width: 32, align: 'right' },
            { key: 'tax', label: data.interState ? 'IGST' : 'Tax', width: 42, align: 'right' },
            { key: 'total', label: 'Amount', width: 58, align: 'right' },
        ];
        const PAD = 4;

        const drawHeader = () => {
            doc.rect(MARGIN, y, CONTENT_WIDTH, 18).fill(HEAD_BG);
            let x = MARGIN;
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
            for (const col of columns) {
                doc.text(col.label, x + PAD, y + 5.5, { width: col.width - PAD * 2, align: col.align });
                x += col.width;
            }
            y += 18;
        };
        const ensureSpace = (height: number, withHeader: boolean) => {
            if (y + height > BOTTOM) {
                doc.addPage();
                y = MARGIN;
                if (withHeader) drawHeader();
            }
        };

        drawHeader();
        data.lines.forEach((line, index) => {
            const cells: Record<string, string> = {
                n: String(index + 1),
                item: line.sku ? `${line.description}\nSKU: ${line.sku}` : line.description,
                hsn: line.hsn || '-',
                qty: String(line.quantity),
                rate: money(line.unitPrice),
                disc: line.discount ? money(line.discount) : '-',
                taxable: money(line.taxableValue),
                gst: `${line.taxRate}%`,
                tax: money(line.cgst + line.sgst + line.igst),
                total: money(line.total),
            };
            doc.font('Helvetica').fontSize(7.5);
            const itemCol = columns[1];
            const rowHeight =
                Math.max(doc.heightOfString(cells.item, { width: itemCol.width - PAD * 2 }), 9) + PAD * 2;
            ensureSpace(rowHeight, true);

            let x = MARGIN;
            for (const col of columns) {
                doc.fillColor(col.key === 'item' ? INK : INK).font(col.key === 'total' ? 'Helvetica-Bold' : 'Helvetica');
                doc.text(cells[col.key], x + PAD, y + PAD, { width: col.width - PAD * 2, align: col.align });
                x += col.width;
            }
            y += rowHeight;
            doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor(LINE).lineWidth(0.5).stroke();
        });
        y += 10;

        // ---------- Totals ----------
        const totals: Array<[string, string, boolean]> = [
            ['Taxable value', money(data.totals.taxableValue), false],
            ...(data.interState
                ? ([['IGST', money(data.totals.igst), false]] as Array<[string, string, boolean]>)
                : ([
                      ['CGST', money(data.totals.cgst), false],
                      ['SGST', money(data.totals.sgst), false],
                  ] as Array<[string, string, boolean]>)),
            ...(data.totals.roundOff
                ? ([['Round off', money(data.totals.roundOff), false]] as Array<[string, string, boolean]>)
                : []),
            [isCredit ? 'Total credit (Rs.)' : 'Grand total (Rs.)', money(data.totals.grandTotal), true],
        ];
        ensureSpace(totals.length * 15 + 40, false);
        const totalsX = MARGIN + CONTENT_WIDTH - 210;
        for (const [label, value, strong] of totals) {
            if (strong) {
                doc.rect(totalsX, y - 3, 210, 18).fill(HEAD_BG);
            }
            doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 10 : 8.5).fillColor(INK);
            doc.text(label, totalsX + 6, y, { width: 110 });
            doc.text(value, totalsX + 110, y, { width: 94, align: 'right' });
            y += strong ? 18 : 14;
        }
        y += 4;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text('Amount in words: ', MARGIN, y, {
            continued: true,
        });
        doc.font('Helvetica').text(data.totals.amountInWords, { width: CONTENT_WIDTH });
        y = doc.y + 12;

        // ---------- Tax summary by HSN ----------
        const taxCols: Column[] = [
            { key: 'hsn', label: 'HSN/SAC', width: 90, align: 'left' },
            { key: 'taxable', label: 'Taxable value', width: 95, align: 'right' },
            { key: 'rate', label: 'Rate', width: 50, align: 'right' },
            { key: 'cgst', label: 'CGST', width: 72, align: 'right' },
            { key: 'sgst', label: 'SGST', width: 72, align: 'right' },
            { key: 'igst', label: 'IGST', width: 72, align: 'right' },
            { key: 'total', label: 'Total tax', width: CONTENT_WIDTH - 451, align: 'right' },
        ];
        ensureSpace(18 + data.taxRows.length * 14 + 20, false);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text('Tax summary', MARGIN, y);
        y = doc.y + 4;
        doc.rect(MARGIN, y, CONTENT_WIDTH, 16).fill(HEAD_BG);
        let tx = MARGIN;
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
        for (const col of taxCols) {
            doc.text(col.label, tx + PAD, y + 4.5, { width: col.width - PAD * 2, align: col.align });
            tx += col.width;
        }
        y += 16;
        doc.font('Helvetica').fontSize(7.5);
        for (const row of data.taxRows) {
            const cells: Record<string, string> = {
                hsn: row.hsn || '-',
                taxable: money(row.taxableValue),
                rate: `${row.taxRate}%`,
                cgst: money(row.cgst),
                sgst: money(row.sgst),
                igst: money(row.igst),
                total: money(row.cgst + row.sgst + row.igst),
            };
            tx = MARGIN;
            for (const col of taxCols) {
                doc.text(cells[col.key], tx + PAD, y + 3, { width: col.width - PAD * 2, align: col.align });
                tx += col.width;
            }
            y += 14;
            doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor(LINE).lineWidth(0.5).stroke();
        }
        y += 12;

        // ---------- Payment, notes, signature ----------
        ensureSpace(110, false);
        const notesWidth = CONTENT_WIDTH * 0.6;
        const blockTop = y;
        doc.font('Helvetica').fontSize(8.5).fillColor(INK);
        if (data.payment) {
            doc.font('Helvetica-Bold').text('Payment', MARGIN, y, { width: notesWidth });
            doc.font('Helvetica').text(
                `${data.payment.method} - ${data.payment.status}${data.payment.reference ? ` (Ref: ${data.payment.reference})` : ''}`,
                { width: notesWidth },
            );
            doc.moveDown(0.5);
        }
        if (data.notes) {
            doc.font('Helvetica-Bold').text('Notes', MARGIN, doc.y, { width: notesWidth });
            doc.font('Helvetica').fillColor(MUTED).text(data.notes, { width: notesWidth });
        }
        const notesBottom = doc.y;

        const signX = MARGIN + notesWidth + 20;
        const signWidth = CONTENT_WIDTH - notesWidth - 20;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(`For ${data.seller.legalName}`, signX, blockTop, {
            width: signWidth,
            align: 'right',
        });
        doc.font('Helvetica').fillColor(MUTED).text(data.signatoryLabel, signX, blockTop + 48, {
            width: signWidth,
            align: 'right',
        });
        y = Math.max(notesBottom, doc.y) + 16;

        if (data.footerText) {
            ensureSpace(20, false);
            doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(MUTED).text(data.footerText, MARGIN, y, {
                width: CONTENT_WIDTH,
                align: 'center',
            });
        }

        // Page numbers
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            // Writing inside the bottom margin would otherwise start a new page.
            const bottomMargin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(
                `${data.invoiceNumber}  -  Page ${i - range.start + 1} of ${range.count}`,
                MARGIN,
                PAGE_HEIGHT - MARGIN - 6,
                { width: CONTENT_WIDTH, align: 'right', lineBreak: false },
            );
            doc.page.margins.bottom = bottomMargin;
        }
    }

    /**
     * The logo is printed about 130pt wide, so a full-size image only bloats
     * every PDF and email. Cloudinary can resize on the fly; ask for 400px PNG.
     */
    private smallLogoUrl(url: string): string {
        const match = url.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/);
        if (!match) return url;
        const [, base, rest] = match;
        // Leave URLs that already carry a transformation alone.
        if (/^[a-z]{1,3}_[^/]*\//.test(rest) && !/^v\d+\//.test(rest)) return url;
        return `${base}w_400,c_limit,f_png/${rest}`;
    }

    private async loadLogo(url: string): Promise<Buffer | null> {
        if (!url || !/^https?:\/\//i.test(url)) return null;
        const cached = this.logoCache.get(url);
        if (cached && Date.now() - cached.at < LOGO_CACHE_MS) return cached.data;

        let data: Buffer | null = null;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(this.smallLogoUrl(url), { signal: controller.signal });
            clearTimeout(timeout);
            if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
                const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
                data = isPng || isJpeg ? buffer : null;
                if (!data) Logger.warn(`Invoice logo at ${url} is not PNG or JPEG; skipped`, loggerCtx);
            }
        } catch (error) {
            Logger.warn(`Could not download invoice logo: ${String(error)}`, loggerCtx);
        }
        this.logoCache.set(url, { data, at: Date.now() });
        return data;
    }
}
