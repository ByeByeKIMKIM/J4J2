import { Pinecone } from '@pinecone-database/pinecone';
import { PINECONE_API_KEY, PINECONE_INDEX_NAME } from '$env/static/private';

let _client: Pinecone | null = null;

export function getPineconeIndex() {
	if (!_client) {
		_client = new Pinecone({ apiKey: PINECONE_API_KEY });
	}
	return _client.Index(PINECONE_INDEX_NAME);
}
