# Sparse Attention for Long-Context Retrieval

## Abstract
We study whether sparse attention patterns reduce latency without harming recall on long documents. Existing work evaluates dense transformers extensively, but there is little understanding of how learned sparsity behaves under long-context retrieval.

## Introduction
Long-context retrieval systems rely on dense attention, which is computationally expensive. Prior work focuses on specialized architectures, yet general sparsity patterns remain underexplored for multi-hop QA.

## Related Work
Brown et al. (2020) studied scaling laws for language models. Proceedings of NeurIPS 2020.

## 3 Methodology
Experiments use the HotpotQA dataset with 8k-token contexts. We compare dense, local-window, and learned-sparse attention.

## Experimental Setup
The benchmark includes 8k-token contexts on HotpotQA. Baselines use dense attention and a 512-token local window.

## Results
Learned-sparse attention matched dense recall within 3 points and reduced average inference time by 41%. Local-window attention dropped recall substantially on multi-hop questions.

## Discussion
These results suggest the bottleneck is attention density rather than token retention alone. Models can preserve answer quality when sparsity is learned, which implies compute savings need not collapse recall.

## Limitations
Results are limited to English QA; multilingual transfer is untested. We only evaluate three sparsity patterns and keep default model parameters.

## Conclusion
Sparse attention can cut inference cost while preserving near-dense recall on long-context retrieval. Quality holds when sparsity is learned rather than fixed locally.

## Future Work
Evaluate sparse attention under streaming decode and multi-hop tool use. Hybrid symbolic retrieval with sparse LLMs is a promising direction.

## References
Brown et al. Language Models are Few-Shot Learners. NeurIPS 2020.
Table 3 header.
Prompt template: You are an expert annotator.

## Appendix
JSON schema examples and author biographies.
