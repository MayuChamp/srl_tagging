// Optional integration suite: PGLITE_MODULE may point to a temporary PGlite install.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("migration, RLS, private evidence, atomic queue and append-only review", async t => {
  const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const video = "33333333-3333-4333-8333-333333333333";
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      GRANT USAGE ON SCHEMA auth,storage TO authenticated,service_role;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${owner}'),('${other}');
      CREATE TABLE public.videos(id uuid PRIMARY KEY);
      CREATE TABLE public.analyses(id uuid PRIMARY KEY);
      INSERT INTO public.videos VALUES ('${video}');
      GRANT SELECT ON public.videos TO authenticated;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON storage.objects TO authenticated;
      CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
        $$SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
    `);
    await db.exec(await readFile(new URL("../src/lib/supabase/migrations/0003_learning_environment.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../src/lib/supabase/migrations/0004_environment_macro_reviews.sql", import.meta.url), "utf8"));
    const role = async (name, user = owner) => {
      await db.exec(`RESET ROLE; SET ROLE ${name};`);
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
    };
    let run, lease, observation;
    await t.test("owner can queue only as self and cannot forge worker status", async () => {
      await role("authenticated");
      const result = await db.query("INSERT INTO environment_runs(video_id,requested_by,config) VALUES ($1,$2,$3) RETURNING id",
        [video, owner, { interval_seconds: 60, frames_per_window: 3, adaptive_video: true }]);
      run = result.rows[0].id;
      await assert.rejects(db.query("INSERT INTO environment_runs(video_id,requested_by) VALUES ($1,$2)", [video, other]), /row-level security/);
      await assert.rejects(db.query("UPDATE environment_runs SET status='completed' WHERE id=$1", [run]), /permission denied/);
      await assert.rejects(db.query("INSERT INTO environment_runs(video_id,requested_by,status) VALUES ($1,$2,'completed')", [video, owner]), /permission denied/);
      await assert.rejects(db.query("SELECT claim_environment_run()"), /permission denied/);
    });
    await t.test("duplicate active runs are rejected", async () => {
      await assert.rejects(db.query("INSERT INTO environment_runs(video_id,requested_by) VALUES ($1,$2)", [video, owner]), /duplicate key/);
    });
    await t.test("another user cannot read the run", async () => {
      await role("authenticated", other);
      assert.equal((await db.query("SELECT * FROM environment_runs")).rows.length, 0);
    });
    await t.test("service worker claims a job once and fences window writes", async () => {
      await role("service_role");
      const claimed = await db.query("SELECT * FROM claim_environment_run()");
      lease = claimed.rows[0].lease_token;
      assert.equal(claimed.rows[0].id, run);
      assert.equal((await db.query("SELECT * FROM claim_environment_run()")).rows.length, 0);
      const row = { window_index: 0, start_time: 0, end_time: 60, status: "completed",
        observation: {}, interpretation: { findings: [], limitations: [] }, evidence: [], audit: {}, usage: [], error: null };
      await assert.rejects(db.query("SELECT save_environment_window($1,$2,$3)", [run, owner, row]), /lease lost/);
      await db.query("SELECT save_environment_window($1,$2,$3)", [run, lease, row]);
      await db.query("SELECT save_environment_window($1,$2,$3)", [run, lease, row]);
      const rows = (await db.query("SELECT * FROM environment_observations")).rows;
      assert.equal(rows.length, 1); observation = rows[0].id;
      assert.equal((await db.query("SELECT progress FROM environment_runs WHERE id=$1", [run])).rows[0].progress.current, 1);
    });
    await t.test("expired jobs are reclaimed with a new token", async () => {
      await db.query("UPDATE environment_runs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [run]);
      const claimed = (await db.query("SELECT * FROM claim_environment_run()")).rows[0];
      assert.notEqual(claimed.lease_token, lease);
      await assert.rejects(db.query("SELECT save_environment_window($1,$2,$3)", [run, lease, {}]), /lease lost/);
    });
    await t.test("evidence is private and can be read only by the run owner", async () => {
      await db.exec("RESET ROLE");
      assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='environment-evidence'")).rows[0].public, false);
      await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('environment-evidence',$1)", [`${owner}/${run}/frame.jpg`]);
      await role("authenticated", other);
      assert.equal((await db.query("SELECT * FROM storage.objects")).rows.length, 0);
      assert.equal((await db.query("SELECT * FROM environment_observations")).rows.length, 0);
      await role("authenticated");
      assert.equal((await db.query("SELECT * FROM storage.objects")).rows.length, 1);
      assert.equal((await db.query("SELECT * FROM environment_observations")).rows.length, 1);
    });
    await t.test("review is owner-only and append-only", async () => {
      await role("authenticated", other);
      await assert.rejects(db.query("INSERT INTO environment_reviews(observation_id,reviewer_id,verdict) VALUES ($1,$2,'accepted')",
        [observation, other]), /row-level security/);
      await role("authenticated");
      await db.query("INSERT INTO environment_reviews(observation_id,reviewer_id,verdict,notes) VALUES ($1,$2,'needs_correction','בדיקה')", [observation, owner]);
      await assert.rejects(db.query("UPDATE environment_reviews SET verdict='accepted'"), /permission denied/);
      await assert.rejects(db.query("DELETE FROM environment_reviews"), /permission denied/);
      await assert.rejects(db.query("UPDATE environment_observations SET observation='{}'"), /permission denied/);
    });
    await t.test("macro reviews require an owned existing episode and preserve model output", async () => {
      await role("service_role");
      await db.query("UPDATE environment_runs SET summary=$1 WHERE id=$2", [{ macro: { episodes: [{ id: "episode-1" }] } }, run]);
      await role("authenticated", other);
      await assert.rejects(db.query("INSERT INTO environment_macro_reviews(run_id,reviewer_id,episode_id,verdict) VALUES ($1,$2,'episode-1','accepted')", [run, other]), /row-level security/);
      await role("authenticated");
      await assert.rejects(db.query("INSERT INTO environment_macro_reviews(run_id,reviewer_id,episode_id,verdict) VALUES ($1,$2,'invented','accepted')", [run, owner]), /row-level security/);
      await assert.rejects(db.query("INSERT INTO environment_macro_reviews(run_id,reviewer_id,episode_id,verdict) VALUES ($1,$2,'episode-1','accepted')", [run, other]), /row-level security/);
      await db.query("INSERT INTO environment_macro_reviews(run_id,reviewer_id,episode_id,verdict,notes) VALUES ($1,$2,'episode-1','needs_correction','גבולות האפיזודה דורשים תיקון')", [run, owner]);
      assert.equal((await db.query("SELECT * FROM environment_macro_reviews")).rows.length, 1);
      await assert.rejects(db.query("UPDATE environment_macro_reviews SET verdict='accepted'"), /permission denied/);
      await assert.rejects(db.query("DELETE FROM environment_macro_reviews"), /permission denied/);
      await role("authenticated", other);
      assert.equal((await db.query("SELECT * FROM environment_macro_reviews")).rows.length, 0);
    });
  } finally { await db.close(); }
});
