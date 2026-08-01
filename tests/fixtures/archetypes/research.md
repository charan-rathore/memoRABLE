# Sparse Attention for Long-Context Retrieval

## Abstract
We study whether sparse attention patterns reduce latency without harming recall on long documents. Existing work evaluates dense transformers extensively, but there is little understanding of how learned sparsity behaves under long-context retrieval.

## Hypothesis
Selective token retention preserves answer quality above 92% of dense attention while cutting compute.

## Method
Experiments use the HotpotQA dataset with 8k-token contexts. We compare dense, local-window, and learned-sparse attention.

## Results
Learned-sparse attention matched dense recall within 3 points and reduced average inference time by 41%. Local-window attention dropped recall substantially on multi-hop questions.

## Discussion
These results suggest the bottleneck is attention density rather than token retention alone. Models can preserve answer quality when sparsity is learned, which implies compute savings need not collapse recall.

## Limitations
Results are limited to English QA; multilingual transfer is untested. We only evaluate three sparsity patterns and keep default model parameters.

## Future work
Evaluate sparse attention under streaming decode and multi-hop tool use. Hybrid symbolic retrieval with sparse LLMs is a promising direction.
