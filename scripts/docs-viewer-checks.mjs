import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDocLink, assetUrl } from '../src/components/documentation/paths.js';

test('resolves document and asset paths relative to the current document', () => {
    assert.deepEqual(resolveDocLink('01-Network/sub/guide.md', '../images/diagram.png'), { path: '01-Network/images/diagram.png', fragment: '' });
    assert.deepEqual(resolveDocLink('01-Network/a.md', './other%20file.md#setup'), { path: '01-Network/other file.md', fragment: 'setup' });
    assert.deepEqual(resolveDocLink('01-Network/a.md', '/02-Servers/start.md'), { path: '02-Servers/start.md', fragment: '' });
    assert.equal(assetUrl('01-Network/a b.svg'), '/api/docs/asset?path=01-Network%2Fa%20b.svg');
});
test('rejects unsafe or unsupported targets', () => {
    for (const link of ['../../../secret.md', 'javascript:alert(1)', '//evil.test/a.png', 'x%2fy%252ez', 'a\\b.md', '.hidden/a.md', 'a.md?ref=other']) assert.equal(resolveDocLink('01-Network/a.md', link), null, link);
});
