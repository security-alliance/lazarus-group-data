# Contributing

Use an issue for a proposed record, a correction needing discussion, or a source question. Use a pull request when you can supply the exact change and evidence. The issue and PR templates describe the information reviewers need.

1. Read the relevant record, its identity boundary, legal posture, caveats and cited sources. Explain what the change establishes and what remains uncertain.
2. Keep stable IDs and filenames. Add a roster entry to `roster/index.json` at its intended position; preserve existing order unless the change explicitly concerns ordering. Use `curation: analyst` only for work curated and created entirely by SEAL's analysts. Work compiled with the help of AI agents uses `curation: ai-assisted`.
3. Add source metadata before citing a new source. Public-record citations resolve in `records/sources/`; roster profiles can retain their local `sources` definitions. Use exact quotations with page, paragraph or timestamp locators. Keep source publication dates separate from access dates.
4. Preserve allegations as allegations, reported personas as personas, and uncertain identity links as uncertain. A matching name, alias or handle alone does not establish identity. Do not turn historical locations into claims about current whereabouts.
5. Keep records as JSON data. Preserve the exact text inside `$date` tags unless a reviewed date correction is the purpose of the PR. Include original media and thumbnail variants together, preserving their public filenames.
6. Run `node tools/validate.cjs` and `node --test tools/validate.test.cjs`. For intentional public-record changes, review the reported content digest and update `provenance.json` with the reviewed digest and affected counts/import expectations. Do not change provenance merely to silence an unexplained mismatch.
7. Describe the evidence, affected IDs and validation results in the PR. Data maintainers review the change before a separate website sync PR consumes the new commit.

Do not add credentials, private correspondence, workstation paths or contributor contact details to the dataset. Keep sensitive correction requests out of public issues; use the contact channel on [lazarus.group/contact](https://lazarus.group/contact).

`reference-exceptions.json` records six existing unresolved citation locations preserved by the initial migration. It is not a way to admit new broken references. Corrections must establish the source through review, fix the reference or definition, and remove the corresponding exception; stale exceptions fail validation. Documentary publisher IDs and qualified route hints are not necessarily references into this repository.

AI-assisted contributions must still cite public sources. Contributors are responsible for checking the claims and citations they submit.

## What we won't accept

- Doxxing of people who are not subjects of the dataset.
- Non-public or leaked material.
- Claims without a public source.
- Unverified identity links.

## Licensing

Contributions are licensed under this repository's licences: [CC BY 4.0](LICENSE) for data and [MIT](tools/LICENSE) for code in `tools/`, subject to the third-party exclusions in the README's [Licence section](README.md#licence).
