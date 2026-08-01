# Sparse Attention for Long-Context Retrieval

## Abstract
We study whether sparse attention patterns reduce latency without harming recall on long documents.

## Hypothesis
Selective token retention preserves answer quality above 92% of dense attention while cutting compute.

## Method
Experiments use the HotpotQA dataset with 8k-token contexts. We compare dense, local-window, and learned-sparse attention.

## Results
Learned-sparse attention matched dense recall within 3 points and reduced average inference time by 41%.

## Limitations
Results are limited to English QA; multilingual transfer is untested.

## Future work
Evaluate sparse attention under streaming decode and multi-hop tool use.
