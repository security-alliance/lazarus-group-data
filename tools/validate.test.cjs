'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { validate, validateDataset, validateSchema, inspectSchema, loadDataset } = require('./validate.cjs');
const root = path.resolve(__dirname, '..');
const schemas = Object.fromEntries(['entity', 'source', 'roster'].map((name) => [name,
  JSON.parse(fs.readFileSync(path.join(root, 'schema', `${name}.schema.json`), 'utf8'))]));
function fixture() {
  return {
    entities: [{ id: 'entity-test', type: 'persona', name: 'Example persona', status: 'needs_corroboration', confidence: 'lead',
      attribution: { status: 'unverified-lead' }, sources: [{ source_id: 'source-test' }] }],
    sources: [{ id: 'source-test', publisher: 'Example publisher', url: 'https://example.org/report' }],
    roster: [{ id: 'profile-test', curation: 'analyst', images: [], research_id: 'entity-test' }],
    index: ['profile-test'],
  };
}
const check = (data, exceptions) => validateDataset(data, schemas, exceptions);

test('the committed snapshot validates with exactly the reviewed inherited exceptions', () => {
  const result = validate();
  assert.ok(result.entities > 0 && result.sources > 0 && result.roster > 0);
  assert.equal(result.roster, result.analyst + result.ai_assisted);
  assert.equal(result.reviewed_reference_exceptions, JSON.parse(fs.readFileSync(path.join(root, 'reference-exceptions.json'), 'utf8')).length);
  assert.match(result.data_sha256, /^[a-f0-9]{64}$/);
});

test('duplicates fail in entity, source, roster and claim namespaces', () => {
  for (const field of ['entities', 'sources', 'roster']) {
    const data = fixture(); data[field].push(structuredClone(data[field][0]));
    assert.throws(() => check(data), /Duplicate/);
  }
  const data = fixture();
  const claim = { id: 'claim-test', type: 'note', predicate: 'reported', confidence: 'lead', status: 'needs_corroboration', sources: [{ source_id: 'source-test' }] };
  data.entities[0].claims = [claim, structuredClone(claim)];
  assert.throws(() => check(data), /Duplicate.*claim/);
});

test('claim IDs are scoped per entity and roster IDs are a separate route namespace', () => {
  const data = fixture();
  const claim = { id: 'claim-test', type: 'note', predicate: 'reported', confidence: 'lead', status: 'needs_corroboration', sources: [{ source_id: 'source-test' }] };
  data.entities[0].claims = [claim];
  data.entities.push({ ...structuredClone(data.entities[0]), id: 'profile-test' });
  assert.equal(check(data).entities, 2);
});

test('roster index rejects duplicate, unknown and omitted IDs while preserving explicit order', () => {
  for (const index of [[], ['profile-test', 'profile-test'], ['unknown-profile']]) {
    const data = fixture(); data.index = index; assert.throws(() => check(data), /roster\/index/);
  }
  const data = fixture(); data.roster.push({ id: 'profile-second', curation: 'ai-assisted', images: [] });
  data.index = ['profile-second', 'profile-test'];
  assert.equal(check(data).roster, 2);
  assert.deepEqual(data.index, ['profile-second', 'profile-test']);
});

test('nested source references, explicit record references and research identities must resolve', () => {
  const data = fixture(); data.entities[0].infrastructure = [{ nested: { source_ids: ['absent-source'] } }];
  assert.throws(() => check(data), /unresolved source/);
  for (const key of ['candidate_record_id', 'record_id']) {
    const other = fixture(); other.entities[0].infrastructure = [{ [key]: 'absent-record' }];
    assert.throws(() => check(other), /unresolved entity/);
  }
  const other = fixture(); other.roster[0].research_id = 'absent-record';
  assert.throws(() => check(other), /unresolved research_id/);
});

test('documentary entity_id values and qualified route hints remain external source text', () => {
  const data = fixture(); data.entities[0].infrastructure = [{ entity_id: 'publisher-external-identifier' }];
  data.entities[0].lazarus_group_routes = ['unknown-route?'];
  assert.equal(check(data).entities, 1);
});

test('roster evidence resolves against local source definitions and rejects duplicate definitions', () => {
  const data = fixture(); const profile = data.roster[0];
  profile.sources = [{ id: 'local-source', title: 'Local source', publisher: 'Example publisher', url: 'https://example.org/local' }];
  profile.sourced_facts = [{ claim_id: 'local-claim', label: 'Reported statement', evidence: [{ source_id: 'local-source', locator: 'p. 1', quote: 'Exact quotation.' }] }];
  assert.equal(check(data).roster, 1);
  profile.sources.push(structuredClone(profile.sources[0]));
  assert.throws(() => check(data), /Duplicate.*source/);
});

test('reference exceptions match only the exact inherited path and ID and fail when stale', () => {
  const data = fixture(); data.entities[0].sources[0].source_id = 'absent-source';
  const exception = { path: 'records/entities/persona/entity-test.json.sources[0].source_id', source_id: 'absent-source', reason: 'Reviewed inherited fixture.' };
  assert.equal(check(data, [exception]).reviewed_reference_exceptions, 1);
  assert.throws(() => check(data, [{ ...exception, source_id: 'another-source' }]), /unresolved source/);
  assert.throws(() => check(data, [{ ...exception, path: exception.path + '.wrong' }]), /unresolved source/);
  data.entities[0].sources[0].source_id = 'source-test';
  assert.throws(() => check(data, [exception]), /Stale reference exception/);
});

test('strict schemas reject unknown fields, wrong nested types and unknown curation', () => {
  const data = fixture(); data.roster[0].curation = 'unknown';
  assert.throws(() => check(data), /unknown enum/);
  const other = fixture(); other.roster[0].employment = [{ managed_laptop: 'yes' }];
  assert.throws(() => check(other), /expected boolean/);
  const extra = fixture(); extra.entities[0].extra_field = true;
  assert.throws(() => check(extra), /unknown schema field/);
});

test('tagged dates retain exact text and reject impossible dates and mixed tagged objects', () => {
  const data = fixture(); data.roster[0].github = [{ gh_id: 'example', creation_date: { $date: ' 2020-05-13' } }];
  assert.equal(check(data).roster, 1);
  assert.equal(data.roster[0].github[0].creation_date.$date, ' 2020-05-13');
  data.roster[0].github[0].creation_date.$date = '2026-02-30';
  assert.throws(() => check(data), /invalid calendar date/);
  data.roster[0].github[0].creation_date = { $date: '2020-05-13', extra: true };
  assert.throws(() => check(data), /unknown schema field/);
});

test('source protocols, credentials, calendar dates and unsafe paths fail', () => {
  for (const url of ['file:///example', 'javascript:example', 'https://user:password@example.org/']) {
    const data = fixture(); data.sources[0].url = url; assert.throws(() => check(data));
  }
  const date = fixture(); date.sources[0].published_at = '2026-02-30';
  assert.throws(() => check(date), /invalid calendar date/);
  const local = fixture(); local.sources[0].local_copy = 'sources/documents/../private';
  assert.throws(() => check(local), /unsafe local_copy/);
  const image = fixture(); image.roster[0].images = [{ path: '/team-images/../private', short_description: 'Example' }];
  assert.throws(() => check(image), /unsafe media path/);
});

test('schema validation fails closed on unsupported keywords, remote references and formats', () => {
  assert.throws(() => inspectSchema({ type: 'string', unsupported: true }), /unsupported schema keyword/);
  assert.throws(() => inspectSchema({ $ref: 'https://example.org/schema' }), /only local/);
  assert.throws(() => inspectSchema({ type: 'string', format: 'executable-format' }), /unsupported format/);
  assert.throws(() => validateSchema(JSON.parse('{"constructor":{}}'), { type: 'object' }), /reserved JSON key/);
});

test('filesystem validation checks filenames, directory types and symlinks', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-validator-'));
  try {
    fs.mkdirSync(path.join(temp, 'records/entities/persona'), { recursive: true });
    fs.mkdirSync(path.join(temp, 'records/sources'), { recursive: true });
    fs.mkdirSync(path.join(temp, 'roster'));
    fs.writeFileSync(path.join(temp, 'roster/index.json'), '[]');
    const filename = path.join(temp, 'records/entities/persona/other-id.json');
    fs.writeFileSync(filename, JSON.stringify(fixture().entities[0]));
    assert.throws(() => loadDataset(temp), /Filename\/ID mismatch/);
    fs.renameSync(filename, path.join(temp, 'records/entities/persona/entity-test.json'));
    const row = fixture().entities[0]; row.type = 'worker';
    fs.writeFileSync(path.join(temp, 'records/entities/persona/entity-test.json'), JSON.stringify(row));
    assert.throws(() => loadDataset(temp), /Directory\/type mismatch/);
    fs.unlinkSync(path.join(temp, 'records/entities/persona/entity-test.json'));
    fs.symlinkSync(path.join(root, 'roster/index.json'), path.join(temp, 'roster/linked.json'));
    assert.throws(() => loadDataset(temp), /Symlinks/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
