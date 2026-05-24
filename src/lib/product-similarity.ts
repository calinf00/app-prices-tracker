// Re-export public API of the dedup similarity feature so call sites can use
// the canonical "product-similarity" path while the server function lives in
// the `.functions.ts` file (required for the Vite server-fn transformer).
export {
  findSimilarProductsFn as findSimilarProducts,
  type SimilarityCandidate,
} from "./product-similarity.functions";