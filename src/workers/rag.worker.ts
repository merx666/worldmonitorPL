import { pipeline, env } from '@huggingface/transformers';

// Setup environment for browser
env.allowLocalModels = false;
env.useBrowserCache = true;

let extractor: any = null;
let tokenDatabase: any[] = [];
let tokenEmbeddings: any[] = []; // Store embeddings

// Load Model
async function initPipeline() {
  if (!extractor) {
    self.postMessage({ status: 'loading_model', progress: 0 });
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      progress_callback: (info: any) => {
        if (info.status === 'progress') {
          self.postMessage({ status: 'loading_model', progress: info.progress });
        }
      }
    });
    self.postMessage({ status: 'model_ready' });
  }
}

// Fetch tokens from LI.FI across multiple major chains to increase swap options
async function loadTokens() {
  self.postMessage({ status: 'loading_tokens' });
  try {
    // 480=World, 1=ETH, 10=OP, 8453=Base, 137=Polygon
    const res = await fetch('https://li.quest/v1/tokens?chains=480,1,10,8453,137');
    const data = await res.json();
    
    // Flatten tokens from all chains
    const allTokens = [];
    for (const chainId in data.tokens) {
      allTokens.push(...data.tokens[chainId]);
    }

    // Deduplicate by symbol
    const seen = new Set();
    const uniqueTokens = [];
    for (const t of allTokens) {
      if (!seen.has(t.symbol) && uniqueTokens.length < 250) { // Limit to 250 tokens for local RAG performance in browser
        seen.add(t.symbol);
        uniqueTokens.push(t);
      }
    }

    tokenDatabase = uniqueTokens;
    self.postMessage({ status: 'tokens_ready', count: tokenDatabase.length });

    // Pre-compute embeddings
    await computeEmbeddings();
  } catch (e) {
    self.postMessage({ status: 'error', message: 'Failed to fetch tokens' });
  }
}

// Compute embeddings for all tokens
async function computeEmbeddings() {
  self.postMessage({ status: 'embedding_tokens', progress: 0 });
  tokenEmbeddings = [];
  
  for (let i = 0; i < tokenDatabase.length; i++) {
    const t = tokenDatabase[i];
    // Rich context for RAG
    const text = `${t.name} ${t.symbol} token on chain ${t.chainId}. Crypto digital asset.`;
    
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    tokenEmbeddings.push(Array.from(output.data));
    
    if (i % 10 === 0) {
      self.postMessage({ status: 'embedding_tokens', progress: (i / tokenDatabase.length) * 100 });
    }
  }
  self.postMessage({ status: 'embedding_ready' });
}

// Cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] || 0;
    const b = vecB[i] || 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Search
async function searchTokens(query: string, topK = 6) {
  if (!extractor || tokenEmbeddings.length === 0) {
    self.postMessage({ status: 'search_results', results: [] });
    return;
  }

  const queryOutput = await extractor(query, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(queryOutput.data) as number[];

  const scores = tokenDatabase.map((t, idx) => {
    return {
      token: t,
      score: cosineSimilarity(queryEmbedding, tokenEmbeddings[idx])
    };
  });

  scores.sort((a, b) => b.score - a.score);
  
  self.postMessage({ 
    status: 'search_results', 
    results: scores.slice(0, topK) 
  });
}

// Message handler
self.addEventListener('message', async (e) => {
  const { type, query } = e.data;
  
  if (type === 'init') {
    await initPipeline();
    await loadTokens();
  } else if (type === 'search') {
    await searchTokens(query);
  }
});
