
# TODO Actions

## Agenda

- `src/core/DirectoryProcessor.ts` is doing too much (orchestration + business logic)
- Refactor everywhere to use new `src/core/di/Container.ts`
- No clear error handling strategy
- No unit tests visible yet

## Immediate Action Items

- [ ] Implement parallel file processing in `src/core/DirectoryProcessor.ts`
- [ ] Implement basic PDF file reader with pdf.js `src/core/processor/readers/PdfReader.ts`
- [ ] Add unit tests for core services
- [ ] Knowledge graph has duplicate/weird observations (data quality issue) – find a test file sets for predictable testing
- [ ] Remove `any` types where possible
- [ ] Add proper return type annotations
- [ ] Add JSDoc comments to all public methods
- [ ] Fix optional chaining overuse (`??=`)
