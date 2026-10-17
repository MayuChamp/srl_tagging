-- Append-only review of macro episodes. Existing model output is never rewritten.
CREATE TABLE public.environment_macro_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.environment_runs(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  episode_id text NOT NULL CHECK (length(episode_id) BETWEEN 1 AND 120),
  verdict text NOT NULL CHECK (verdict IN ('accepted','needs_correction','rejected')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000)
);
CREATE INDEX environment_macro_reviews_run ON public.environment_macro_reviews(run_id, created_at DESC);
ALTER TABLE public.environment_macro_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.environment_macro_reviews FROM anon, authenticated;
GRANT SELECT ON public.environment_macro_reviews TO authenticated;
GRANT INSERT(run_id,reviewer_id,episode_id,verdict,notes) ON public.environment_macro_reviews TO authenticated;
GRANT ALL ON public.environment_macro_reviews TO service_role;
CREATE POLICY environment_macro_reviews_read ON public.environment_macro_reviews
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.environment_runs r WHERE r.id = run_id AND r.requested_by = auth.uid()
  ));
CREATE POLICY environment_macro_reviews_create ON public.environment_macro_reviews
  FOR INSERT TO authenticated WITH CHECK (reviewer_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.environment_runs r WHERE r.id = run_id AND r.requested_by = auth.uid()
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(r.summary->'macro'->'episodes') = 'array'
             THEN r.summary->'macro'->'episodes' ELSE '[]'::jsonb END
      ) e WHERE e->>'id' = episode_id)
  ));
