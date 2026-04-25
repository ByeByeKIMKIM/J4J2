import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { PDFParse } from 'pdf-parse';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PINECONE_API_KEY = process.env.PINECONE_API_KEY!;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const UNSTRUCTURED_API_KEY = process.env.UNSTRUCTURED_API_KEY; // Optional, but recommended

if (!PINECONE_API_KEY || !PINECONE_INDEX_NAME || !OPENAI_API_KEY) {
	console.error('❌ Missing required environment variables. Check your .env file.');
	process.exit(1);
}

// ── Document Config ──────────────────────────────────────────────────────────
type DocType = 'policy_manual' | 'application_form' | 'reference_guide' | 'other';

interface PdfDoc {
	file: string;
	state: 'CA' | 'NY';
	docType: DocType;
	label: string;
}

const DOCUMENTS: PdfDoc[] = [
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
	}
];

// ── Parent Document Chunking Strategy ────────────────────────────────────────
const PARENT_CHUNK_SIZE = 1500;
const CHILD_CHUNK_SIZE = 300;
const CHILD_OVERLAP = 50;
const EMBED_BATCH = 96;

interface ChunkPair {
	parentText: string;
	childText: string;
}

function createParentChildChunks(fullText: string): ChunkPair[] {
	const chunks: ChunkPair[] = [];
	let i = 0;
	
	// Tier 1: Parent Document (context)
	while (i < fullText.length) {
		let parent = fullText.slice(i, i + PARENT_CHUNK_SIZE).trim();
		// Try to snap to the nearest paragraph or sentence end
		const nextNewline = fullText.indexOf('\n\n', i + PARENT_CHUNK_SIZE);
		if (nextNewline !== -1 && nextNewline - (i + PARENT_CHUNK_SIZE) < 300) {
			parent = fullText.slice(i, nextNewline).trim();
			i = nextNewline;
		} else {
			i += PARENT_CHUNK_SIZE;
		}

		if (parent.length > 100) {
			// Tier 2: Child Document (for precise embeddings)
			let j = 0;
			while (j < parent.length) {
				const child = parent.slice(j, j + CHILD_CHUNK_SIZE).trim();
				if (child.length > 40) {
					chunks.push({ parentText: parent, childText: child });
				}
				j += (CHILD_CHUNK_SIZE - CHILD_OVERLAP);
			}
		}
	}
	return chunks;
}

// ── Extract PDF Content ──────────────────────────────────────────────────────
async function extractText(filePath: string): Promise<string> {
	if (UNSTRUCTURED_API_KEY) {
		console.log(`   ⚡ Using Unstructured.io API for high-fidelity extraction...`);
		try {
			const formData = new FormData();
			const fileBuffer = fs.readFileSync(filePath);
			// Wrap in Blob for Fetch API FormData
			const blob = new Blob([fileBuffer], { type: 'application/pdf' });
			formData.append('files', blob, path.basename(filePath));
			formData.append('strategy', 'fast'); // Use 'hi_res' if tables get too complex
			
			const res = await fetch('https://api.unstructuredapp.io/general/v0/general', {
				method: 'POST',
				headers: {
					'accept': 'application/json',
					'unstructured-api-key': UNSTRUCTURED_API_KEY,
				},
				// node-fetch / undici FormData is supported here natively in Node 18+
				body: formData as any
			});

			if (!res.ok) throw new Error(`Unstructured HTTP ${res.status}`);
			const elements: Array<{ type: string; text: string }> = await res.json();
			
			// Reconstruct text intelligently
			return elements.map(e => {
				if (e.type === 'Title') return `\n\n# ${e.text}\n`;
				if (e.type === 'ListItem') return `- ${e.text}`;
				if (e.type === 'Table') return `\n[TABLE DATA]\n${e.text}\n[/TABLE DATA]\n`;
				return e.text;
			}).join('\n').trim();
		} catch (err) {
			console.warn(`   ⚠️  Unstructured API failed, falling back to pdf-parse. Error:`, err);
		}
	}

	// Fallback to pdf-parse
	console.log(`   📄 Using pdf-parse (fallback)...`);
	const dataBuffer = fs.readFileSync(filePath);
	
	const parser = new PDFParse({ data: dataBuffer });
	const result = await parser.getText();
	
	return result.text
		.replace(/\f/g, ' ')
		.replace(/\r\n|\r/g, '\n')
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
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
	const text = await extractText(filePath);

	if (!text) {
		console.warn(`   ⚠️  No text extracted.`);
		return 0;
	}

	const chunks = createParentChildChunks(text);
	console.log(`   Generated ${chunks.length} child vectors (Parent Document Retrieval Strategy)`);

	let totalUpserted = 0;
	const totalBatches = Math.ceil(chunks.length / EMBED_BATCH);

	for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
		const batch = chunks.slice(i, i + EMBED_BATCH);
		const batchNum = Math.floor(i / EMBED_BATCH) + 1;
		process.stdout.write(`   Embedding batch ${batchNum}/${totalBatches}… `);

		// Embed the "Child text" for precision matching
		const { embeddings } = await embedMany({
			model: openai.embedding('text-embedding-3-small', {
				dimensions: 1024
			}),
			values: batch.map(c => c.childText)
		});

		if (!embeddings || embeddings.length === 0) {
			console.error("\n❌ embedMany returned an empty or undefined embeddings array!");
			process.exit(1);
		}

		const vectors = batch.map((chunkInfo, idx) => {
			const rawEmbedding = embeddings[idx];
			
			// Extract the embedding values
			let vectorValues = Array.isArray(rawEmbedding) 
				? rawEmbedding 
				: (rawEmbedding as any)?.embedding || rawEmbedding;

			// FIX 1: Force a standard JavaScript Array. 
			// Vercel AI SDK returns Float32Arrays which fail Pinecone's Array.isArray() check.
			if (vectorValues && !Array.isArray(vectorValues)) {
				vectorValues = Array.from(vectorValues);
			}

			// FIX 1.5: Explicitly enforce dimension restriction.
			// The OpenAI SDK sometimes ignores the { dimensions: 1024 } parameter and returns full 1536.
			// v3 embeddings are explicitly designed to be safely truncated.
			if (vectorValues && vectorValues.length > 1024) {
				vectorValues = vectorValues.slice(0, 1024);
			}

			if (!vectorValues || !Array.isArray(vectorValues)) {
				console.error(`\n❌ Failed to extract vector values at index ${idx}`);
				console.log("Raw embedding structure:", JSON.stringify(rawEmbedding, null, 2));
				process.exit(1);
			}
			
			// FIX 2: Strip null bytes. 
			// pdf-parse leaves \u0000 characters which cause Pinecone to instantly drop the record.
			const sanitizeString = (str: string) => str.replace(/\0/g, '').trim();
			
			return {
				id: `${doc.state}-${doc.docType}-${doc.file.replace('.pdf', '').replace(/[^a-zA-Z0-9]/g, '_')}-pdr-${i + idx}`,
				values: vectorValues,
				metadata: {
					state: doc.state,
					docType: doc.docType,
					label: doc.label,
					source: doc.file,
					text: sanitizeString(chunkInfo.parentText),
					childTextMatch: sanitizeString(chunkInfo.childText)
				}
			};
		});

		if (vectors.length > 0) {
			console.log(`   Preparing to upsert ${vectors.length} vectors. First ID: ${vectors[0].id}`);
			
			// 1. STRICT BATCH VALIDATION 
			const invalidRecords = vectors.filter(v => 
				!v.id || 
				!Array.isArray(v.values) || 
				v.values.length !== 1024 || // Matched to Pinecone Index Dimensions
				v.values.some(val => isNaN(val) || val == null)
			);

			if (invalidRecords.length > 0) {
				console.error(`\n❌ Found ${invalidRecords.length} invalid records in batch!`);
				const firstInvalid = vectors.indexOf(invalidRecords[0]);
				console.log("   First invalid at index:", firstInvalid);
				console.dir(vectors[firstInvalid], { depth: 1 });
				process.exit(1);
			}

			try {
				await index.upsert({ records: vectors });
				totalUpserted += vectors.length;
				console.log(`✅ ${vectors.length} vectors upserted`);
			} catch (err: any) {
				console.error("\n❌ Pinecone Upsert Failed!");
				console.error("Error Message:", err.message);
				process.exit(1);
			}
		} else {
			console.error("\n❌ Vectors array is empty before upsert.");
			process.exit(1);
		}
	}

	return totalUpserted;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
	console.log('🚀 Benefits Architect — Ingestion Pipeline (v2 - Parent Doc Retrieval)');
	console.log(`   Index: "${PINECONE_INDEX_NAME}"`);
	
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
		console.log(`   ${status} ${label}: ${count} vectors (Parent Document Retrieval mappings)`);
	}
	console.log(`\n   Total vectors upserted: ${grandTotal}`);
	console.log(`   Index: "${PINECONE_INDEX_NAME}"`);
}

main().catch((err) => {
	console.error('❌ Fatal error:', err);
	process.exit(1);
});
