// PreToolUse hook: GitHub MCP-ийг зөвхөн энэ төслийн repo (Munkh-Erdene8989/LMS) руу хязгаарлана.
// Fine-grained PAT нь public repo-г уншиж чаддаг тул энд давхар хамгаална.
const OWNER = 'munkh-erdene8989';
const REPO = 'lms';
const ALLOW_NO_REPO = new Set(['get_me']);

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return deny('hook input уншиж чадсангүй');
  }
  const tool = String(input.tool_name || '').replace(/^mcp__github__/, '');
  const args = input.tool_input || {};

  if (ALLOW_NO_REPO.has(tool)) return allow();

  if ('owner' in args || 'repo' in args) {
    const ok =
      String(args.owner || '').toLowerCase() === OWNER && String(args.repo || '').toLowerCase() === REPO;
    return ok ? allow() : deny(`зөвхөн ${OWNER}/${REPO} repo-д хандах эрхтэй`);
  }

  // search_* хэрэгслүүд: query-д зөвхөн энэ repo-ийн qualifier байх ёстой.
  if (typeof args.query === 'string') {
    const q = args.query.toLowerCase();
    const repos = [...q.matchAll(/repo:(\S+)/g)].map((m) => m[1]);
    const hasOther = /\b(org|user|owner):/.test(q);
    const ok = repos.length > 0 && repos.every((r) => r === `${OWNER}/${REPO}`) && !hasOther;
    return ok ? allow() : deny(`query-д "repo:${OWNER}/${REPO}" заавал, өөр repo/org хориотой`);
  }

  deny(`"${tool}" нь тодорхой repo заадаггүй тул хориглов`);
});

function allow() {
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `GitHub MCP guard: ${reason}`,
      },
    }),
  );
  process.exit(0);
}
