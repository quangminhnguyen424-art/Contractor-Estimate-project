// Loads the sample jobs (store/demo/workspace.json) into the demo account Apple's reviewers sign in with.
//
//   node scripts/demo-account.mjs reviewer@example.com > demo.sql
//
// It prints one SQL statement; run it in Supabase (SQL Editor). The account must already exist: its owner creates it
// in the app and sets the password. The statement fills an empty account and leaves alone any account that already
// has estimates or jobs, so a mistyped email can never wipe a real customer's work.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TAG = '$demo$';

/** The statement that loads `data` (a saved workspace) into the account with this email. */
export function demoSql(email, data) {
  const mail = String(email ?? '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(mail)) throw new Error(`"${email}" is not an email address`);
  const json = JSON.stringify(data);
  if (json.includes(TAG)) throw new Error('the sample data holds the text that ends the statement; change the sample data');
  return `insert into public.workspaces (user_id, data, updated_at, device)
select u.id, ${TAG}${json}${TAG}::jsonb, now(), 'demo-seed'
from auth.users u
where lower(u.email) = '${mail}'
on conflict (user_id) do update
  set data = excluded.data, updated_at = excluded.updated_at, device = excluded.device
  where jsonb_array_length(coalesce(public.workspaces.data->'estimates', '[]'::jsonb)) = 0
    and jsonb_array_length(coalesce(public.workspaces.data->'projects', '[]'::jsonb)) = 0
returning user_id;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL('../store/demo/workspace.json', import.meta.url);
  try {
    process.stdout.write(demoSql(process.argv[2], JSON.parse(readFileSync(file, 'utf8'))));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
