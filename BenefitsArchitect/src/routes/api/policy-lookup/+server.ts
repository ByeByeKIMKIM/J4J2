import { json } from '@sveltejs/kit';
import mockPolicyDb from '$lib/data/mock_policy_db.json';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { state, category } = body;

        if (!state || !category) {
            return json({ error: 'Missing state or category' }, { status: 400 });
        }

        const stateData = (mockPolicyDb as Record<string, any>)[state];
        if (!stateData) {
            return json({ error: 'State not found in DB' }, { status: 404 });
        }

        const categoryData = stateData[category];
        if (!categoryData) {
            return json({ error: 'Category not found in state DB' }, { status: 404 });
        }

        // Simulate RAG database lookup latency
        await new Promise(r => setTimeout(r, 1000));

        return json({
            limit: categoryData.limit,
            text: categoryData.text,
            citation: categoryData.citation
        });
    } catch (err: any) {
        return json({ error: err.message }, { status: 500 });
    }
};
