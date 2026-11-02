import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestOptions, onRequestPost } from '../functions/api/resend.js';
import { onRequestPost as createIssue } from '../functions/api/issues.js';

const bbs = 'https://www.bigbrain-studio.com';
const legacy = 'https://example.com';
const env = { RESEND_ALLOWED_ORIGINS: `${bbs},${legacy}`, RESEND_API_KEY: 'test', RESEND_FROM_EMAIL: 'Legacy <legacy@example.com>', RESEND_TO_EMAIL: 'legacy@example.com', ISSUE_NOTIFICATION_EMAIL: 'issues@example.com', BBS_CONTACT_FROM_EMAIL: 'BBS <www@example.com>', BBS_CONTACT_TO_EMAIL: 'contact@example.com' };
const form = { name: '<Name>', email: 'person@example.com', subject: 'Hello', message: '<script>hi</script>' };
function request(origin = bbs, body = JSON.stringify(form), extra = {}) {
    return new Request('https://issuedesk.example/api/resend', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra }, body });
}
test('CORS checks and preflight', async () => {
    const preflight = await onRequestOptions({ request: new Request('https://issuedesk.example/api/resend', { method: 'OPTIONS', headers: { Origin: bbs } }), env });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), bbs);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type');
    assert.equal(preflight.headers.get('vary'), 'Origin');
    assert.equal((await onRequestPost({ request: request('https://evil.example'), env })).status, 403);
});
test('validation and size limits', async () => {
    assert.equal((await onRequestPost({ request: request(bbs, JSON.stringify({ ...form, email: 'bad' })), env })).status, 400);
    assert.equal((await onRequestPost({ request: request(bbs, 'x'.repeat(24001)), env })).status, 413);
    assert.equal((await onRequestPost({ request: request(), env: { ...env, BBS_CONTACT_TO_EMAIL: '' } })).status, 503);
});
test('BBS and legacy routing; ticket notification stays unchanged', async () => {
    const originalFetch = globalThis.fetch;
    const sent = [];
    globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(options.body)); return Response.json({ id: 'sent' }); };
    try {
        const req = request(bbs, JSON.stringify({ ...form, to: 'attacker@example.com', from: 'attacker@example.com' }), { Referer: 'https://example.com/?a=<tag>', 'User-Agent': 'Mozilla/5.0 Chrome/123 Mobile' });
        Object.defineProperty(req, 'cf', { value: { country: 'TH', city: '<Bangkok>' } });
        const result = await onRequestPost({ request: req, env });
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), { success: true, id: 'sent' });
        assert.equal(sent[0].from, env.BBS_CONTACT_FROM_EMAIL);
        assert.deepEqual(sent[0].to, [env.BBS_CONTACT_TO_EMAIL]);
        assert.equal(sent[0].reply_to, form.email);
        assert.equal(sent[0].subject, '[Big Brain Studio Website] Hello');
        assert.match(sent[0].html, /&lt;Bangkok&gt;/);
        assert.match(sent[0].html, /&lt;script&gt;/);
        assert.match(sent[0].text, /Browser: Chrome/);
        assert.match(sent[0].text, /Device: Mobile/);
        assert.match(sent[0].text, /Timestamp: \d{4}-/);
        await onRequestPost({ request: request(), env });
        assert.match(sent[1].text, /Country: Not available/);
        await onRequestPost({ request: request(legacy), env });
        assert.equal(sent[2].from, env.RESEND_FROM_EMAIL);
        assert.deepEqual(sent[2].to, [env.RESEND_TO_EMAIL]);
        assert.equal(sent[2].subject, '[Website] Hello');
        assert.doesNotMatch(sent[2].text, /Submission details/);
        const issue = { ticket_number: 'IT-202611-0001', reporter_name: 'Test', title: 'Test', category: 'Other', priority: 'Medium', description: 'Problem', status: 'Open', created_at: 'now' };
        const issueEnv = { ...env, DB: { prepare: () => ({ bind: () => ({ first: async () => issue }) }) } };
        const issueRequest = new Request('https://issuedesk.example/api/issues', { method: 'POST', body: JSON.stringify({ reporter: 'Test', title: 'Test', category: 'Other', description: 'Problem' }) });
        assert.equal((await createIssue({ request: issueRequest, env: issueEnv })).status, 201);
        assert.equal(sent[3].from, env.RESEND_FROM_EMAIL);
        assert.deepEqual(sent[3].to, [env.ISSUE_NOTIFICATION_EMAIL]);
        assert.equal(sent[3].subject, '[IssueDesk] New Issue IT-202611-0001');
        globalThis.fetch = async () => new Response('failure', { status: 500 });
        const failedMailRequest = new Request('https://issuedesk.example/api/issues', { method: 'POST', body: JSON.stringify({ reporter: 'Test', title: 'Test', category: 'Other', description: 'Problem' }) });
        assert.equal((await createIssue({ request: failedMailRequest, env: issueEnv })).status, 201);
    } finally { globalThis.fetch = originalFetch; }
});
