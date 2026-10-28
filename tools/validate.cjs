#!/usr/bin/env node
'use strict';

// Data is parsed as JSON only. This validator uses no dependencies, network,
// remote schema references, executable schema extensions, or generated code.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const ROOT = path.resolve(__dirname, '..');
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const reserved = new Set(['__proto__', 'constructor', 'prototype']);
const schemaKeywords = new Set(['$schema', '$id', '$ref', '$defs', 'title', 'description', 'type', 'enum', 'const',
  'properties', 'additionalProperties', 'required', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength',
  'maxLength', 'pattern', 'format', 'minimum', 'maximum', 'anyOf', 'oneOf', 'allOf']);

function validDate(value, label, precision = true) {
  ensure(typeof value === 'string' && (precision ? /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/ : /^\d{4}-\d{2}-\d{2}$/).test(value), `${label}: invalid date`);
  const full = value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
  ensure(Number.isFinite(Date.parse(full)) && new Date(full).toISOString().slice(0, 10) === full, `${label}: invalid calendar date`);
}

function inspectSchema(schema, label = 'schema') {
  ensure(isObject(schema), `${label}: schemas must be objects`);
  for (const keyword of Object.keys(schema)) ensure(schemaKeywords.has(keyword), `${label}: unsupported schema keyword ${keyword}`);
  if (schema.$ref) ensure(/^#\/\$defs\/[A-Za-z0-9]+$/.test(schema.$ref), `${label}: only local $defs references are supported`);
  if (schema.format) ensure(['date', 'legacy-date'].includes(schema.format), `${label}: unsupported format`);
  for (const key of ['properties', '$defs']) for (const [name, child] of Object.entries(schema[key] ?? {})) inspectSchema(child, `${label}.${key}.${name}`);
  if (schema.items) inspectSchema(schema.items, `${label}.items`);
  if (isObject(schema.additionalProperties)) inspectSchema(schema.additionalProperties, `${label}.additionalProperties`);
  for (const key of ['anyOf', 'oneOf', 'allOf']) for (const child of schema[key] ?? []) inspectSchema(child, `${label}.${key}`);
}

function validateSchema(value, schema, label = 'value', root = schema) {
  if (schema.$ref) {
    const name = schema.$ref.split('/')[2];
    ensure(root.$defs && Object.hasOwn(root.$defs, name), `${label}: missing local schema reference ${name}`);
    validateSchema(value, root.$defs[name], label, root);
  }
  for (const keyword of ['anyOf', 'oneOf', 'allOf']) if (schema[keyword]) {
    let passed = 0;
    for (const candidate of schema[keyword]) {
      try { validateSchema(value, candidate, label, root); passed++; } catch { /* Try the remaining alternatives. */ }
    }
    ensure(keyword === 'allOf' ? passed === schema[keyword].length : keyword === 'oneOf' ? passed === 1 : passed > 0, `${label}: ${keyword} failed`);
  }
  if (schema.enum) ensure(schema.enum.some((candidate) => isDeepStrictEqual(candidate, value)), `${label}: unknown enum`);
  if (Object.hasOwn(schema, 'const')) ensure(isDeepStrictEqual(schema.const, value), `${label}: unexpected constant`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    ensure(types.some((type) => type === 'array' ? Array.isArray(value) : type === 'object' ? isObject(value)
      : type === 'null' ? value === null : type === 'integer' ? Number.isInteger(value)
      : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type), `${label}: expected ${types.join('/')}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined) ensure([...value].length >= schema.minLength, `${label}: string too short`);
    if (schema.maxLength !== undefined) ensure([...value].length <= schema.maxLength, `${label}: string too long`);
    if (schema.pattern) ensure(new RegExp(schema.pattern, 'u').test(value), `${label}: invalid pattern`);
    if (schema.format === 'date') validDate(value, label, false);
    if (schema.format === 'legacy-date') {
      const trimmed = value.trim();
      validDate(trimmed.slice(0, 10), label, false);
      ensure(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(trimmed) && Number.isFinite(Date.parse(value)), `${label}: invalid tagged date`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined) ensure(value >= schema.minimum, `${label}: below minimum`);
    if (schema.maximum !== undefined) ensure(value <= schema.maximum, `${label}: above maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) ensure(value.length >= schema.minItems, `${label}: too few items`);
    if (schema.maxItems !== undefined) ensure(value.length <= schema.maxItems, `${label}: too many items`);
    if (schema.uniqueItems) for (let i = 0; i < value.length; i++) ensure(!value.slice(0, i).some((item) => isDeepStrictEqual(item, value[i])), `${label}: duplicate item`);
    if (schema.items) value.forEach((item, i) => validateSchema(item, schema.items, `${label}[${i}]`, root));
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) ensure(Object.hasOwn(value, key), `${label}: missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      ensure(!reserved.has(key), `${label}: reserved JSON key ${key}`);
      if (schema.additionalProperties === false) ensure(Object.hasOwn(schema.properties ?? {}, key), `${label}: unknown schema field ${key}`);
      if (Object.hasOwn(schema.properties ?? {}, key)) validateSchema(item, schema.properties[key], `${label}.${key}`, root);
      else if (isObject(schema.additionalProperties)) validateSchema(item, schema.additionalProperties, `${label}.${key}`, root);
    }
  }
}

function walk(value, visit, label) {
  if (Array.isArray(value)) value.forEach((item, i) => walk(item, visit, `${label}[${i}]`));
  else if (isObject(value)) for (const [key, item] of Object.entries(value)) {
    ensure(!reserved.has(key), `${label}: reserved JSON key ${key}`);
    visit(key, item, `${label}.${key}`);
    walk(item, visit, `${label}.${key}`);
  }
}

function validateUrl(value, label) {
  if (value === null) return;
  ensure(typeof value === 'string' && /^(?:https?|hxxps?):\/\//i.test(value), `${label}: unsupported source protocol`);
  const url = new URL(value.replace(/^hxxp/i, 'http').replaceAll('[.]', '.'));
  ensure(url.hostname && !url.username && !url.password, `${label}: missing host or embedded credentials`);
}

function validateSource(source, label) {
  validateUrl(source.url, `${label}.url`);
  if (source.archived_url !== undefined) validateUrl(source.archived_url, `${label}.archived_url`);
  for (const key of ['published_at', 'accessed_at', 'date']) if (source[key] !== undefined) validDate(source[key], `${label}.${key}`);
  if (source.local_copy !== undefined) ensure(/^sources\/documents\//.test(source.local_copy) && !source.local_copy.includes('\\') && !source.local_copy.split('/').includes('..'), `${label}: unsafe local_copy`);
}

function uniqueIndex(rows, namespace) {
  const result = new Map();
  for (const row of rows) {
    ensure(!result.has(row.id), `Duplicate ${namespace} ID ${row.id}`);
    result.set(row.id, row);
  }
  return result;
}

function validateDataset(dataset, schemas, exceptions = []) {
  for (const [name, schema] of Object.entries(schemas)) inspectSchema(schema, name);
  const { entities, sources, roster, index } = dataset;
  const entityIndex = uniqueIndex(entities, 'entity');
  const sourceIndex = uniqueIndex(sources, 'source');
  const rosterIndex = uniqueIndex(roster, 'roster');
  validateSchema(index, { type: 'array', minItems: 1, uniqueItems: true, items: schemas.roster.properties.id }, 'roster/index.json');
  ensure(index.length === roster.length && index.every((id) => rosterIndex.has(id)), 'roster/index.json: incomplete or unknown roster IDs');
  const exceptionIndex = new Map();
  for (const exception of exceptions) {
    ensure(typeof exception.path === 'string' && typeof exception.source_id === 'string' && typeof exception.reason === 'string' && exception.reason.length > 0, 'Invalid reference exception');
    ensure(!exceptionIndex.has(exception.path), `Duplicate reference exception ${exception.path}`);
    exceptionIndex.set(exception.path, exception);
  }
  const usedExceptions = new Set();
  function reference(id, allowed, label) {
    ensure(typeof id === 'string', `${label}: reference must be a string`);
    if (allowed.has(id)) return;
    const exception = exceptionIndex.get(label);
    ensure(exception && exception.source_id === id, `${label}: unresolved source reference ${id}`);
    usedExceptions.add(label);
  }
  function references(row, allowed, label) {
    walk(row, (key, value, location) => {
      if (key === 'source_id') reference(value, allowed, location);
      if (key === 'source_ids') {
        ensure(Array.isArray(value), `${location}: source_ids must be an array`);
        value.forEach((id, i) => reference(id, allowed, `${location}[${i}]`));
      }
      if (['candidate_record_id', 'record_id'].includes(key)) ensure(typeof value === 'string' && entityIndex.has(value), `${location}: unresolved entity reference ${value}`);
    }, label);
  }
  for (const source of sources) {
    const label = `records/sources/${source.id}.json`;
    validateSchema(source, schemas.source, label);
    validateSource(source, label);
  }
  for (const entity of entities) {
    const label = `records/entities/${entity.type}/${entity.id}.json`;
    validateSchema(entity, schemas.entity, label);
    uniqueIndex(entity.claims ?? [], `${entity.id} claim`);
    for (const claim of entity.claims ?? []) if (claim.observed_at !== undefined) validDate(claim.observed_at, `${entity.id}.${claim.id}.observed_at`);
    for (const route of entity.lazarus_group_routes ?? []) ensure(route.length > 0, `${entity.id}: empty route hint`);
    references(entity, sourceIndex, label);
  }
  for (const profile of roster) {
    const label = `roster/${profile.id}.json`;
    validateSchema(profile, schemas.roster, label);
    if (profile.research_id !== undefined) ensure(entityIndex.has(profile.research_id), `${label}: unresolved research_id ${profile.research_id}`);
    const localSources = uniqueIndex(profile.sources ?? [], `${profile.id} source`);
    for (const source of profile.sources ?? []) validateSource(source, `${label}.sources.${source.id}`);
    uniqueIndex((profile.sourced_facts ?? []).map((fact) => ({ ...fact, id: fact.claim_id })), `${profile.id} sourced fact`);
    for (const fact of profile.sourced_facts ?? []) if (fact.observed !== undefined) validDate(fact.observed, `${label}.${fact.claim_id}.observed`);
    references(profile, new Map([...sourceIndex, ...localSources]), label);
    for (const item of [...profile.images, ...(profile.files ?? [])]) if (item.path !== undefined) {
      ensure(item.path.startsWith('/') && !item.path.includes('\\') && !item.path.split('/').some((part) => ['.', '..'].includes(part)), `${label}: unsafe media path`);
    }
  }
  for (const exception of exceptions) ensure(usedExceptions.has(exception.path), `Stale reference exception ${exception.path}; remove it when corrected`);
  return { entities: entities.length, sources: sources.length, roster: roster.length,
    analyst: roster.filter((row) => row.curation === 'analyst').length,
    ai_assisted: roster.filter((row) => row.curation === 'ai-assisted').length,
    reviewed_reference_exceptions: usedExceptions.size };
}

function readJson(filename) { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
function regularFiles(folder) {
  ensure(fs.lstatSync(folder).isDirectory(), 'Data folders must be regular directories, not symlinks');
  return fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap((entry) => {
    const filename = path.join(folder, entry.name);
    ensure(!entry.isSymbolicLink(), `Symlinks are not permitted in data: ${entry.name}`);
    if (entry.isDirectory()) return regularFiles(filename);
    ensure(entry.isFile() && entry.name.endsWith('.json'), `Unexpected data file ${entry.name}`);
    return [filename];
  });
}
function loadDataset(root) {
  const digest = crypto.createHash('sha256');
  const entities = [], sources = [];
  for (const filename of regularFiles(path.join(root, 'records'))) {
    const relative = path.relative(path.join(root, 'records'), filename).split(path.sep).join('/');
    const bytes = fs.readFileSync(filename);
    digest.update(`data/${relative}\0`); digest.update(bytes); digest.update('\0');
    const row = JSON.parse(bytes.toString('utf8'));
    ensure(path.basename(filename, '.json') === row.id, `Filename/ID mismatch ${relative}`);
    const parts = relative.split('/');
    if (parts[0] === 'entities') {
      ensure(parts.length === 3 && parts[1] === row.type, `Directory/type mismatch ${relative}`);
      entities.push(row);
    } else {
      ensure(parts[0] === 'sources' && parts.length === 2, `Unexpected record path ${relative}`);
      sources.push(row);
    }
  }
  const roster = [];
  for (const filename of regularFiles(path.join(root, 'roster'))) {
    ensure(path.dirname(filename) === path.join(root, 'roster'), 'Roster files must be directly under roster/');
    if (path.basename(filename) === 'index.json') continue;
    const row = readJson(filename);
    ensure(path.basename(filename, '.json') === row.id, `Roster filename/ID mismatch ${path.basename(filename)}`);
    roster.push(row);
  }
  return { entities, sources, roster, index: readJson(path.join(root, 'roster/index.json')), digest: digest.digest('hex') };
}
function validate(root = ROOT) {
  const schemas = Object.fromEntries(['entity', 'source', 'roster'].map((name) => [name, readJson(path.join(root, 'schema', `${name}.schema.json`))]));
  const dataset = loadDataset(root);
  const exceptions = readJson(path.join(root, 'reference-exceptions.json'));
  const result = validateDataset(dataset, schemas, exceptions);
  const provenance = readJson(path.join(root, 'provenance.json'));
  ensure(dataset.digest === provenance.data_sha256, `Record content digest differs from provenance.json: ${dataset.digest}`);
  ensure(dataset.entities.length === provenance.totals.entities, 'Entity count differs from provenance.json');
  ensure(dataset.sources.length === provenance.counts.sources, 'Source count differs from provenance.json');
  return { ...result, data_sha256: dataset.digest };
}

module.exports = { validate, validateDataset, validateSchema, inspectSchema, validDate, loadDataset };
if (require.main === module) {
  try { ensure(process.argv.length <= 3, 'Usage: node tools/validate.cjs [data-root]'); process.stdout.write(JSON.stringify(validate(process.argv[2]), null, 2) + '\n'); }
  catch (error) { process.stderr.write(`Validation failed: ${error.message}\n`); process.exitCode = 1; }
}
