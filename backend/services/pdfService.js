const fs = require("fs").promises;
const path = require("path");
const formatters = require("../utils/formatters");

class PDFService {
    constructor() {
        this.isLibraryAvailable = false;
        this.puppeteer = null;
        this.browserPromise = null;
        this.checkLibraryAvailability();
        this.setupProcessCleanup();
    }

    checkLibraryAvailability() {
        try {
            // Lazy require so the service fails fast if the dependency is missing
            this.puppeteer = require("puppeteer");
            this.isLibraryAvailable = true;
        } catch (error) {
            console.warn("PDF library not available:", error.message);
            this.isLibraryAvailable = false;
        }
    }

    setupProcessCleanup() {
        const closeBrowser = () => {
            if (this.browserPromise) {
                this.browserPromise
                    .then((browser) => browser && browser.close && browser.close())
                    .catch(() => {
                        // ignore - shutting down
                    });
                this.browserPromise = null;
            }
        };

        process.once("exit", closeBrowser);
        process.once("SIGINT", () => {
            closeBrowser();
            process.exit(0);
        });
        process.once("SIGTERM", closeBrowser);
    }

    async ensureBrowser() {
        if (!this.isLibraryAvailable) {
            throw new Error("PDF generation library not available. Please install puppeteer dependency.");
        }

        if (!this.browserPromise) {
            const launchOptions = {
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"]
            };

            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            }

            this.browserPromise = this.puppeteer.launch(launchOptions).catch((error) => {
                this.browserPromise = null;
                throw error;
            });
        }

        return this.browserPromise;
    }

    async generatePDF(htmlContent, options = {}) {
        if (!this.isLibraryAvailable) {
            throw new Error("PDF generation library not available. Please install puppeteer dependency.");
        }

        const browser = await this.ensureBrowser();
        const page = await browser.newPage();

        try {
            await page.setContent(htmlContent, {
                waitUntil: ["domcontentloaded", "networkidle0"]
            });

            const defaultOptions = {
                format: "A4",
                printBackground: true,
                preferCSSPageSize: true,
                margin: {
                    top: "20mm",
                    right: "20mm",
                    bottom: "20mm",
                    left: "20mm"
                }
            };

            const pdfOptions = {
                ...defaultOptions,
                ...options,
                margin: {
                    ...defaultOptions.margin,
                    ...(options.margin || {})
                }
            };

            return await page.pdf(pdfOptions);
        } catch (error) {
            throw new Error(`PDF generation failed: ${error.message}`);
        } finally {
            await page.close();
        }
    }

    async savePDFToFile(htmlContent, filePath, options = {}) {
        try {
            if (!this.isLibraryAvailable) {
                throw new Error("PDF generation library not available. Please install puppeteer dependency.");
            }

            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });

            const pdfBuffer = await this.generatePDF(htmlContent, options);
            await fs.writeFile(filePath, pdfBuffer);

            return {
                success: true,
                filePath,
                type: "pdf",
                message: "PDF generated successfully"
            };
        } catch (error) {
            throw new Error(`Failed to save PDF: ${error.message}`);
        }
    }

    async createKyotakuReportPDF(reportData, patientId) {
        try {
            const { patientDir, fullPath } = formatters.buildFilePath(
                patientId,
                formatters.generateFileName()
            );

            const htmlContent = this.generateKyotakuReportHTML(reportData);
            const result = await this.savePDFToFile(htmlContent, fullPath);

            return {
                ...result,
                fileName: path.basename(fullPath),
                patientDir,
                fullPath: result.filePath
            };
        } catch (error) {
            throw new Error(`Failed to create Kyotaku report PDF: ${error.message}`);
        }
    }

    async createPdfFromHtml(htmlContent, patientId) {
        try {
            const { patientDir, fullPath } = formatters.buildFilePath(
                patientId,
                formatters.generateFileName()
            );

            // HTMLを直接PDF化
            const result = await this.savePDFToFile(htmlContent, fullPath);

            return {
                ...result,
                fileName: path.basename(fullPath),
                patientDir,
                fullPath: result.filePath
            };
        } catch (error) {
            throw new Error(`Failed to create PDF from HTML: ${error.message}`);
        }
    }

    escapeHtml(value) {
        if (value === undefined || value === null) {
            return "N/A";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    formatMultilineText(value) {
        if (!value) {
            return "N/A";
        }

        return this.escapeHtml(value).replace(/\r?\n/g, "<br>");
    }

    generateKyotakuReportHTML(reportData = {}) {
        const safeData = {
            patientId: this.escapeHtml(reportData.patientId) || "N/A",
            patientName: this.escapeHtml(reportData.patientName) || "N/A",
            address: this.escapeHtml(reportData.address) || "N/A",
            content: this.formatMultilineText(reportData.content),
            observations: this.formatMultilineText(reportData.observations || " "),
            nextPlan: this.formatMultilineText(reportData.nextPlan || " "),
            author: this.escapeHtml(reportData.author || "医療従事者"),
            facility: this.escapeHtml(reportData.facility || "医療機関")
        };

        const issuedDate = new Date().toLocaleDateString("ja-JP");

        return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>居宅療養管理指導報告書</title>
    <style>
        @page {
            margin: 20mm;
        }
        body {
            font-family: "Noto Sans JP", "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
            font-size: 12px;
            line-height: 1.6;
            margin: 0;
            color: #333;
        }
        .container {
            padding: 0;
        }
        .header {
            text-align: center;
            margin-bottom: 24px;
            border-bottom: 2px solid #333;
            padding-bottom: 12px;
        }
        .title {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.08em;
            margin-bottom: 8px;
        }
        .patient-info {
            margin-bottom: 20px;
            border: 1px solid #ccc;
            padding: 12px;
            border-radius: 4px;
        }
        .patient-info strong {
            display: inline-block;
            margin-bottom: 6px;
        }
        .section {
            margin-bottom: 18px;
        }
        .section-title {
            font-weight: 700;
            background-color: #f5f5f5;
            padding: 6px 10px;
            border-left: 4px solid #333;
            margin-bottom: 6px;
        }
        .section-content {
            padding: 0 10px;
        }
        .footer {
            margin-top: 30px;
            text-align: right;
            border-top: 1px solid #ccc;
            padding-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="title">居宅療養管理指導報告書</div>
            <div>作成日: ${issuedDate}</div>
        </div>

        <div class="patient-info">
            <strong>患者情報</strong><br>
            患者ID: ${safeData.patientId}<br>
            患者名: ${safeData.patientName}<br>
            住所: ${safeData.address}
        </div>

        <div class="section">
            <div class="section-title">報告内容</div>
            <div class="section-content">${safeData.content}</div>
        </div>

        <div class="section">
            <div class="section-title">所見・特記事項</div>
            <div class="section-content">${safeData.observations}</div>
        </div>

        <div class="section">
            <div class="section-title">次回予定</div>
            <div class="section-content">${safeData.nextPlan}</div>
        </div>

        <div class="footer">
            <div>作成者: ${safeData.author}</div>
            <div>所属: ${safeData.facility}</div>
        </div>
    </div>
</body>
</html>`;
    }
}

module.exports = new PDFService();