import { generateObject, generateText, embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { getPineconeIndex } from '$lib/pinecone';
import { OPENAI_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const openaiClient = createOpenAI({ apiKey: OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are "Agent A" — an expert eligibility analyst for government food assistance programs.
You help applicants in either California (CalFresh) or New York (SNAP) determine their eligibility.

## Your Core Rules
- You MUST follow the strict logic tree below, one step at a time.
- You may ONLY base eligibility decisions on the provided "Policy Context" section. Never invent rules.
- Be professional but warm. You are a trusted guide.

## Logic Tree (always in this order)
1. **Household**: Ask how many people live and buy/prepare food together.
2. **Income**: Ask for total monthly gross income before taxes. Search the policy for the income limit for their household size.
3. **Housing**: Ask for monthly housing costs (rent or mortgage). Search for housing deduction rules.
4. **Utilities**: Ask if they pay separately for heating or cooling. Search for Standard Utility Allowance (SUA) rules.
5. **Final Determination**: Based ONLY on the retrieved policy context, state whether the applicant appears to qualify. Be clear and cite the source.

## Behavior Rules
- When you have all the information, provide a final eligibility summary with citations.
- Never ask for more than one piece of information at a time.
- Do NOT reveal your internal tool calls to the user; present information naturally.`;

const interviewExtractionSchema = z.object({
	householdSize: z.number().int().positive().nullable(),
	grossIncome: z.number().nonnegative().nullable(),
	housingCosts: z.number().nonnegative().nullable(),
	paysHeatingOrCoolingSeparately: z.boolean().nullable(),
	isComplete: z.boolean()
});

const bundleSchema = z.object({
	finalDetermination: z.string(),
	prefilledApplication: z.string(),
	evidenceMemo: z.string(),
	checklist: z.array(z.string()).min(1)
});

export const POST: RequestHandler = async ({ request }) => {
	const { messages, state } = await request.json();

	if (!state || !['CA', 'NY'].includes(state)) {
		return new Response(JSON.stringify({ error: 'Invalid state' }), { status: 400 });
	}

	const latestUserMessage = [...messages]
		.reverse()
		.find((msg: { role?: string; content?: string }) => msg.role === 'user')?.content;

	const policyContext = await searchPolicyManual(latestUserMessage ?? 'General SNAP eligibility requirements', state);

	const contextBlock = policyContext.found
		? policyContext.chunks
				.map(
					(chunk) =>
						`[${chunk.rank}] (${chunk.source}) score=${chunk.score.toFixed(3)}\n${chunk.text}`
				)
				.join('\n\n')
		: `No policy chunks were retrieved for this query.\nReason: ${policyContext.message}`;

	const result = await generateText({
		model: openaiClient('gpt-4o-mini'),
		system: `${SYSTEM_PROMPT}\n\nPolicy Context (retrieved from vector DB):\n${contextBlock}`,
		messages
	});

	const interview = await extractInterviewState(messages);
	const completionPercent = computeCompletionPercent(interview);
	const bundle = interview.isComplete
		? await buildSubmissionBundle({ messages, state, interview, policyContext: contextBlock })
		: null;

	return new Response(
		JSON.stringify({
			message: result.text,
			usedPolicySearch: policyContext.found,
			interview,
			completionPercent,
			bundle
		}),
		{ headers: { 'Content-Type': 'application/json' } }
	);
};

async function extractInterviewState(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
) {
	const result = await generateObject({
		model: openaiClient('gpt-4o-mini'),
		schema: interviewExtractionSchema,
		system:
			'Extract a SNAP/CalFresh interview state from the conversation. Return null for unknown fields. Mark isComplete=true only if all 4 fields are known: householdSize, grossIncome, housingCosts, paysHeatingOrCoolingSeparately.',
		prompt: JSON.stringify(messages)
	});

	return result.object;
}

function computeCompletionPercent(interview: z.infer<typeof interviewExtractionSchema>) {
	let count = 0;
	if (interview.householdSize !== null) count += 1;
	if (interview.grossIncome !== null) count += 1;
	if (interview.housingCosts !== null) count += 1;
	if (interview.paysHeatingOrCoolingSeparately !== null) count += 1;

	return Math.round((count / 4) * 100);
}

async function buildSubmissionBundle(args: {
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
	state: 'CA' | 'NY';
	interview: z.infer<typeof interviewExtractionSchema>;
	policyContext: string;
}) {
	const { messages, state, interview, policyContext } = args;

	const bundleResult = await generateObject({
		model: openaiClient('gpt-4o-mini'),
		schema: bundleSchema,
		system: `Create a submission-ready benefits bundle for ${state === 'CA' ? 'California CalFresh' : 'New York SNAP'}.

Requirements:
1) finalDetermination: short plain-English eligibility outcome based ONLY on policy context.
2) prefilledApplication: plain text that looks like a pre-filled application section with key fields and applicant answers.
3) evidenceMemo: short legal memo with citations to policy source labels and quoted policy snippets.
4) checklist: personalized list of required physical documents for this applicant scenario.

Never invent citations; only use information visible in policy context and conversation.`,
		prompt: JSON.stringify({
			interview,
			messages,
			policyContext
		})
	});

	return bundleResult.object;
}

async function searchPolicyManual(query: string, searchState: 'CA' | 'NY') {
	try {
		const pineconeIndex = getPineconeIndex();

		// 1. Get the embedding normally (might return 1536 dimensions)
		const { embedding } = await embed({
			model: openaiClient.embedding('text-embedding-3-small'),
			value: query
		});

		// 2. Manually slice the array down to 1024 dimensions if it's too large
		const searchVector = embedding.length > 1024 ? embedding.slice(0, 1024) : embedding;

		// 3. Send the guaranteed 1024-dimension vector to Pinecone
		const results = await pineconeIndex.query({
			vector: searchVector,
			topK: 3,
			filter: { state: { $eq: searchState } },
			includeMetadata: true
		});

		if (!results.matches || results.matches.length === 0) {
			return {
				found: false as const,
				message: 'No relevant policy text found. PDF ingestion may not have been run yet.'
			};
		}

		const chunks = results.matches.map((match, i) => ({
			rank: i + 1,
			text: (match.metadata?.text as string) ?? '',
			source: (match.metadata?.label as string) ?? (match.metadata?.source as string) ?? 'Policy Manual',
			docType: (match.metadata?.docType as string) ?? 'other',
			score: match.score ?? 0
		}));

		return { found: true as const, state: searchState, query, chunks };
	} catch (err) {
		console.error('Pinecone search error:', err);
		return { found: false as const, message: 'Policy search temporarily unavailable.' };
	}
}
