import { streamText, embed, stepCountIs } from 'ai';
import { tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { getPineconeIndex } from '$lib/pinecone';
import { OPENAI_API_KEY } from '$env/static/private';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const openaiClient = createOpenAI({ apiKey: OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are "Agent A" — an expert eligibility analyst for government food assistance programs.
You help applicants in either California (CalFresh) or New York (SNAP) determine their eligibility.

## Your Core Rules
- You MUST follow the strict logic tree below, one step at a time.
- You MUST use the search_policy_manual tool to retrieve the official policy text before making ANY eligibility determination.
- You may ONLY base eligibility decisions on what the tool returns. Never invent rules.
- Be professional but warm. You are a trusted guide.

## Logic Tree (always in this order)
1. **Household**: Ask how many people live and buy/prepare food together.
2. **Income**: Ask for total monthly gross income before taxes. Search the policy for the income limit for their household size.
3. **Housing**: Ask for monthly housing costs (rent or mortgage). Search for housing deduction rules.
4. **Utilities**: Ask if they pay separately for heating or cooling. Search for Standard Utility Allowance (SUA) rules.
5. **Final Determination**: Based ONLY on the retrieved policy context, state whether the applicant appears to qualify. Be clear and cite the source.

## Behavior Rules
- After each user response, call search_policy_manual with a precise query to verify the relevant rule before responding.
- When you have all the information, provide a final eligibility summary with citations.
- Never ask for more than one piece of information at a time.
- Do NOT reveal your internal tool calls to the user; present information naturally.`;

const searchSchema = z.object({
	query: z.string().describe('A precise natural-language search query about the policy rule you need to verify.'),
	state: z.enum(['CA', 'NY']).describe('The applicant state — CA for CalFresh, NY for SNAP.')
});

type SearchInput = z.infer<typeof searchSchema>;

export const POST: RequestHandler = async ({ request }) => {
	const { messages, state } = await request.json();

	if (!state || !['CA', 'NY'].includes(state)) {
		return new Response(JSON.stringify({ error: 'Invalid state' }), { status: 400 });
	}

	const result = streamText({
		model: openaiClient('gpt-4o-mini'),
		system: SYSTEM_PROMPT,
		messages,
		tools: {
			search_policy_manual: tool<SearchInput, ReturnType<typeof searchPolicyManual>>({
				description:
					'Search the official policy manual for the given state to retrieve relevant rules, income limits, deduction criteria, and eligibility requirements. Always call this before making an eligibility determination.',
				inputSchema: searchSchema,
				execute: async ({ query, state: searchState }: SearchInput) => {
					return searchPolicyManual(query, searchState);
				}
			})
		},
		stopWhen: stepCountIs(10)
	});

	return result.toUIMessageStreamResponse();
};

// async function searchPolicyManual(query: string, searchState: 'CA' | 'NY') {
// 	try {
// 		const pineconeIndex = getPineconeIndex();

// 		// const { embedding } = await embed({
// 		// 	model: openaiClient.embedding('text-embedding-3-small'),
// 		// 	value: query
// 		// });

// 		const { embedding } = await embed({
// 			model: openaiClient.embedding('text-embedding-3-small', {
// 				dimensions: 1024
// 			}),
// 			value: query
// 		});

// 		const results = await pineconeIndex.query({
// 			vector: embedding,
// 			topK: 3,
// 			filter: { state: { $eq: searchState } },
// 			includeMetadata: true
// 		});

// 		if (!results.matches || results.matches.length === 0) {
// 			return {
// 				found: false as const,
// 				message: 'No relevant policy text found. PDF ingestion may not have been run yet.'
// 			};
// 		}

// 		const chunks = results.matches.map((match, i) => ({
// 			rank: i + 1,
// 			text: (match.metadata?.text as string) ?? '',
// 			source: (match.metadata?.label as string) ?? (match.metadata?.source as string) ?? 'Policy Manual',
// 			docType: (match.metadata?.docType as string) ?? 'other',
// 			score: match.score ?? 0
// 		}));

// 		return { found: true as const, state: searchState, query, chunks };
// 	} catch (err) {
// 		console.error('Pinecone search error:', err);
// 		return { found: false as const, message: 'Policy search temporarily unavailable.' };
// 	}
// }

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
