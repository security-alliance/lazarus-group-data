# Lazarus Group data

SEAL's data for [lazarus.group](https://lazarus.group): a registry of reported DPRK IT workers, employment personas and facilitators, plus public records about related people, organizations, cases, infrastructure and tradecraft. A persona is not necessarily a verified legal identity. Allegations, sanctions, findings and unresolved research assessments retain their distinct legal status.

The collection contains two kinds of data:

- **Analyst curated:** 72 registry profiles curated and created entirely by SEAL's analysts. Their roster files have `"curation": "analyst"`.
- **AI assisted:** 31 further registry profiles and the public-records collection were compiled from public sources with the help of AI agents. Mistakes are possible. Their roster files have `"curation": "ai-assisted"`; public records retain citations, quotations, uncertainty and identity boundaries. Check the underlying publications before relying on a claim.

The initial snapshot contains 103 roster profiles, 913 public-record entities and 986 source records. A source record is a citation entry; multiple entries can cite the same publication. Public contributions are welcome.

## Layout

| Path | Contents |
| --- | --- |
| `roster/<slug>.json` | One registry profile per stable route slug, with its curation field |
| `roster/index.json` | Ordered roster slugs; this preserves the registry's original order |
| `records/entities/<type>/<id>.json` | Public records, including sourced claims and identity boundaries |
| `records/sources/<id>.json` | Public-source metadata referenced by entity records |
| `schema/` | Entity, source and roster JSON schemas |
| `team-images/`, `team-thumbnails/` | Original profile media and generated thumbnail variants, preserving filenames |
| `provenance.json` | Reviewed public-record byte digest, counts and website import expectations |
| `reference-exceptions.json` | Six exact inherited citation locations awaiting source review |
| `tools/` | Dependency-free validation and validator tests |

Roster `sources` entries are local citation definitions with their original IDs. Public-record source IDs resolve under `records/sources/`. Those are separate citation namespaces. Entity IDs, source IDs and roster route slugs are also separate namespaces; duplicate IDs within a namespace fail validation. Claim IDs are unique within their containing entity or roster profile.

The migration preserves every roster field and its array order. Original date values use an explicit tag, for example `{"$date": "2024-12-01"}`. The tag distinguishes dates from ordinary strings and retains the exact original literal, including significant whitespace. Do not normalize tagged dates during an unrelated correction. The website converts these tags back to dates during its build.

Six evidence references in `angelo-cruz-recruiter-persona` and `shaorun-zhang` have inherited date-suffixed citation IDs without matching source definitions. Their exact paths and IDs are listed in `reference-exceptions.json` so the migration remains lossless. Every other source reference must resolve. Exceptions cannot match new paths or different IDs, and validation fails if an exception becomes stale. Correct these through a source-reviewed PR; do not guess their intended source. Roster facts remain independent assertions and need not duplicate the claims in their linked public record.

## Validate locally

Use Node.js 24 or newer. No installation, API access or credentials are needed:

```sh
node tools/validate.cjs
```

The validator checks every entity, source and roster file against its schema, filenames, entity directories, roster index coverage, duplicate IDs, calendar dates, source URLs, nested source references, explicit record references and roster `research_id` links. Publisher-owned `entity_id` values, free-text organization labels and qualified route hints remain source text rather than enforced local links. Symlinks and unknown schema keywords fail validation. The validator supports the schema vocabulary used in this repository, including local `$defs` references; it never fetches remote schemas.

Run its regression tests with:

```sh
node --test tools/validate.test.cjs
```

The same commands run in GitHub Actions for pushes to `main` and pull requests. Public-record bytes are hashed in sorted record-path order as `data/<relative-path>`, NUL, original file bytes, NUL. Intentional record changes require a reviewed update to `provenance.json.data_sha256` and any affected counts/import expectations; a mismatch prints the new digest without changing it. The initial entity and source schemas retain their original bytes and schema IDs.

## Propose a record or correction

Open an issue using the **Correction** or **New record** template, or send a pull request using [CONTRIBUTING.md](CONTRIBUTING.md). Identify the existing record or proposed stable ID, cite the public source, and explain exactly what it establishes. Preserve uncertainty, publication dates, quotations and legal posture. A shared name, handle or photograph does not establish a shared identity.

Data changes belong in this repository. After a data PR merges, the website fetches the resulting `main` commit during its build; no website data copy or follow-up website commit is needed. Media updates include original files and the corresponding thumbnail variants.

## Licence

Except for `tools/` and the third-party material below, repository data is licensed under [CC BY 4.0](LICENSE). Attribute it as: "Security Alliance (SEAL), Lazarus Group data, https://lazarus.group".

Code in `tools/` is licensed under [MIT](tools/LICENSE).

Profile photos in `team-images/` and `team-thumbnails/` and quoted excerpts from cited publications remain the property of their respective owners and are included for identification and reference. They are not licensed under CC BY 4.0.

## After a merge

The deploy workflow repeats validation and, when `SITE_DEPLOY_HOOK` is configured, POSTs the Cloudflare Workers Builds deploy hook. A missing hook secret is reported and skips deployment.
