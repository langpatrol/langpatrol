## Navigate in terminal to directory langpatrol/datasets/synthetic
## Then enter command
synthetic % pnpm tsx 'datasets/synthetic/_scripts to generate synthetic data/generate-huge-prompt.ts' --tokens 50000 --outdir ./datasets/synthetic/

### Modify parameter --tokens (0-50000)    -> defines tokens length that should be generated
### Modify parameter --outdir              -> defines output directory for synthetic data files