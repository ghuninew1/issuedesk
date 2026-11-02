import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestOptions, onRequestPost } from '../functions/api/resend.js';
import { onRequestPost as createIssue } from '../functions/api/issues.js';
import { sendIssueNotification } from '../functions/api/resend/_utils.js';

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
        assert.match(sent[0].html, /&lt;Name&gt;/);
        assert.match(sent[0].html, /https:\/\/www\.bigbrain-studio\.com\/img\/logo-375x375\.png/);
        assert.match(sent[0].html, /alt="Big Brain Studio"/);
        assert.match(sent[0].html, /Contact information/);
        assert.match(sent[0].html, /Submission details/);
        assert.match(sent[0].html, /https:\/\/example\.com\/\?a=&lt;tag&gt;/);
        assert.doesNotMatch(sent[0].html, /<script>/);
        assert.match(sent[0].text, /Browser: Chrome/);
        assert.match(sent[0].text, /Device: Mobile/);
        assert.match(sent[0].text, /Timestamp: .*\(Asia\/Bangkok\)/);
        await onRequestPost({ request: request(), env });
        assert.match(sent[1].text, /Country: Not available/);
        await onRequestPost({ request: request(legacy), env });
        assert.equal(sent[2].from, env.RESEND_FROM_EMAIL);
        assert.deepEqual(sent[2].to, [env.RESEND_TO_EMAIL]);
        assert.equal(sent[2].subject, '[Website] Hello');
        assert.doesNotMatch(sent[2].html, /Contact information|logo-375x375/);
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

test('BBS timestamp uses Thai locale and Bangkok time in both email formats', async () => {
    const originalFetch = globalThis.fetch;
    const OriginalDate = globalThis.Date;
    const instant = '2026-11-02T14:35:22.886Z';
    const expected = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new OriginalDate(instant));
    let payload;
    globalThis.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : [instant])); }
    };
    globalThis.fetch = async (_url, options) => { payload = JSON.parse(options.body); return Response.json({ id: 'sent' }); };
    try {
        assert.equal((await onRequestPost({ request: request(), env })).status, 200);
        assert.match(expected, /21:35/);
        assert.match(expected, /2569/);
        assert.ok(payload.html.includes(`${expected} (Asia/Bangkok)`));
        assert.ok(payload.text.includes(`Timestamp: ${expected} (Asia/Bangkok)`));
        assert.doesNotMatch(payload.html, /2026-11-02T14:35:22/);
        assert.doesNotMatch(payload.text, /2026-11-02T14:35:22/);
    } finally { globalThis.fetch = originalFetch; globalThis.Date = OriginalDate; }
});

test('BBS template escapes fields and metadata and preserves message line breaks', async () => {
    const originalFetch = globalThis.fetch;
    let payload;
    globalThis.fetch = async (_url, options) => { payload = JSON.parse(options.body); return Response.json({ id: 'sent' }); };
    try {
        const req = request(bbs, JSON.stringify({ name: '<b>Jane</b>', email: 'person@example.com', subject: 'A & <B>', message: 'First\n<script>alert(1)</script>' }), { Referer: 'javascript:alert(1)' });
        Object.defineProperty(req, 'cf', { value: { country: '<TH>', city: '"City"' } });
        assert.equal((await onRequestPost({ request: req, env })).status, 200);
        assert.match(payload.html, /&lt;b&gt;Jane&lt;\/b&gt;/);
        assert.match(payload.html, /A &amp; &lt;B&gt;/);
        assert.match(payload.html, /First<br>&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
        assert.match(payload.html, /&lt;TH&gt;/);
        assert.match(payload.html, /&quot;City&quot;/);
        assert.doesNotMatch(payload.html, /href="javascript:/);
        assert.match(payload.text, /First\n<script>alert\(1\)<\/script>/);
    } finally { globalThis.fetch = originalFetch; }
});

test('IssueDesk notification renders escaped ticket details with its own logo', async () => {
    const originalFetch = globalThis.fetch;
    let payload;
    globalThis.fetch = async (_url, options) => { payload = JSON.parse(options.body); return Response.json({ id: 'sent' }); };
    const issue = { ticket_number: 'IT-202611-0001', reporter_name: '<Reporter>', title: 'Broken & <device>', category: 'Other', priority: 'Medium', status: 'Open', created_at: '2026-11-02T14:35:22Z', description: 'First line\n<script>alert(1)</script>' };
    try {
        await sendIssueNotification(issue, env);
        assert.equal(payload.from, env.RESEND_FROM_EMAIL);
        assert.deepEqual(payload.to, [env.ISSUE_NOTIFICATION_EMAIL]);
        assert.equal(payload.subject, '[IssueDesk] New Issue IT-202611-0001');
        assert.match(payload.html, /https:\/\/issuedesk\.bigbrain-studio\.com\/favicon\.png/);
        assert.match(payload.html, /alt="IssueDesk"/);
        assert.match(payload.html, /&lt;Reporter&gt;/);
        assert.match(payload.html, /Broken &amp; &lt;device&gt;/);
        assert.match(payload.html, /First line<br>&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
        assert.doesNotMatch(payload.html, /<script>/);
        assert.match(payload.text, /First line\n<script>alert\(1\)<\/script>/);
        assert.match(payload.text, /Submitted: 2026-11-02T14:35:22Z/);
    } finally { globalThis.fetch = originalFetch; }
});
