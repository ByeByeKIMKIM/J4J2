import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';

// pdf-parse is CJS-only — use createRequire for ESM compatibility
const require = createRequire(import.meta.url);
const pdfParseRaw = require('pdf-parse');
// Handle both `module.exports = fn` and `module.exports.default = fn`
const pdfParse = (pdfParseRaw.default ?? pdfParseRaw) as (
	buf: Buffer
) => Promise<{ text: string; numpages: number }>;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PINECONE_API_KEY = process.env.PINECONE_API_KEY!;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

if (!PINECONE_API_KEY || !PINECONE_INDEX_NAME || !OPENAI_API_KEY) {
	console.error('❌ Missing required environment variables. Check your .env file.');
	process.exit(1);
}

// ── Document Config ──────────────────────────────────────────────────────────
// Add any PDF here — just specify state, docType, and filename.
// docType is stored as metadata and helps the AI distinguish source types.

type DocType = 'policy_manual' | 'application_form' | 'reference_guide' | 'other';

interface PdfDoc {
	file: string;       // filename inside data/pdfs/
	state: 'CA' | 'NY';
	docType: DocType;
	label: string;      // human-readable label for logging & evidence cards
}

const DOCUMENTS: PdfDoc[] = [
	// ── New York SNAP ──────────────────────────────────────────────────────
	{
		file: 'snapsb.pdf',
		state: 'NY',
		docType: 'policy_manual',
		label: 'NY SNAP Source Book'
	},
	{
		file: '4826.pdf',
		state: 'NY',
		docType: 'application_form',
		label: 'NY SNAP Application Form (DSS-4826)'
	},
	{
		file: '4826-DD.pdf',
		state: 'NY',
		docType: 'application_form',
		label: 'NY SNAP Application Form (DSS-4826-DD)'
	},

	// ── California CalFresh ────────────────────────────────────────────────
	// Add your CA PDF(s) here when ready, for example:
	// { file: 'ca-calfresh.pdf', state: 'CA', docType: 'policy_manual', label: 'CA CalFresh Manual' },
];

// ── Chunking config ──────────────────────────────────────────────────────────
const CHUNK_SIZE = 1000;
const OVERLAP = 200;
const EMBED_BATCH = 96; // stay well under OpenAI's 2048 limit

function chunkText(text: string): string[] {
	const chunks: string[] = [];
	let i = 0;
	while (i < text.length) {
		const chunk = text.slice(i, i + CHUNK_SIZE).trim();
		if (chunk.length > 60) chunks.push(chunk); // skip near-empty chunks
		i += CHUNK_SIZE - OVERLAP;
	}
	return chunks;
}

// ── Process one PDF ──────────────────────────────────────────────────────────
async function processPdf(
	doc: PdfDoc,
	index: ReturnType<InstanceType<typeof Pinecone>['Index']>,
	openai: ReturnType<typeof createOpenAI>
) {
	const filePath = path.join(ROOT_DIR, 'data', 'pdfs', doc.file);

	if (!fs.existsSync(filePath)) {
		console.warn(`   ⚠️  Not found: ${doc.file} — skipping.`);
		return 0;
	}

	console.log(`\n📄 [${doc.state}] ${doc.label}`);
	console.log(`   File: ${doc.file}`);

	const dataBuffer = fs.readFileSync(filePath);
	const data = await pdfParse(dataBuffer);

	// Normalize whitespace
	const text = data.text
		.replace(/\f/g, ' ')        // form feed → space
		.replace(/\r\n|\r/g, '\n')  // normalize line endings
		.replace(/[ \t]{2,}/g, ' ') // collapse horizontal whitespace
		.replace(/\n{3,}/g, '\n\n') // collapse blank lines
		.trim();

	if (!text) {
		console.warn(`   ⚠️  No text extracted — is this a scanned PDF?`);
		return 0;
	}

	const chunks = chunkText(text);
	console.log(`   Pages: ${data.numpages} | Chunks: ${chunks.length}`);

	let totalUpserted = 0;
	const totalBatches = Math.ceil(chunks.length / EMBED_BATCH);

	for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
		const batch = chunks.slice(i, i + EMBED_BATCH);
		const batchNum = Math.floor(i / EMBED_BATCH) + 1;
		process.stdout.write(`   Embedding batch ${batchNum}/${totalBatches}… `);

		const { embeddings } = await embedMany({
			model: openai.embedding('text-embedding-3-small'),
			values: batch
		});

		const vectors = batch.map((chunkText, idx) => ({
			id: `${doc.state}-${doc.docType}-${doc.file.replace('.pdf', '')}-${i + idx}`,
			values: embeddings[idx],
			metadata: {
				state: doc.state,
				docType: doc.docType,
				label: doc.label,
				source: doc.file,
				text: chunkText
			}
		}));

		await index.upsert(vectors);
		totalUpserted += vectors.length;
		console.log(`✅ ${vectors.length} vectors upserted`);
	}

	return totalUpserted;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
	console.log('🚀 Benefits Architect — Ingestion Pipeline');
	console.log(`   Index: "${PINECONE_INDEX_NAME}"`);
	console.log(`   Documents to process: ${DOCUMENTS.length}\n`);

	const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
	const index = pc.Index(PINECONE_INDEX_NAME);
	const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

	const results: Record<string, number> = {};
	let grandTotal = 0;

	for (const doc of DOCUMENTS) {
		const count = await processPdf(doc, index, openai);
		results[doc.label] = count;
		grandTotal += count;
	}

	console.log('\n─────────────────────────────────────────');
	console.log('🎉 Ingestion complete!\n');
	for (const [label, count] of Object.entries(results)) {
		const status = count > 0 ? '✅' : '⚠️ ';
		console.log(`   ${status} ${label}: ${count} vectors`);
	}
	console.log(`\n   Total vectors upserted: ${grandTotal}`);
	console.log(`   Index: "${PINECONE_INDEX_NAME}"`);
}

main().catch((err) => {
	console.error('❌ Fatal error:', err);
	process.exit(1);
});
