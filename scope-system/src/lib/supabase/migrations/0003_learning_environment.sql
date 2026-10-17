-- Independent, private pilot runs. Apply once with the project's migration role.
-- Existing direct-SRL analyses and their policies are not modified.
CREATE TABLE public.environment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_analysis_id uuid REFERENCES public.analyses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','completed_with_errors','failed')),
  protocol_version text NOT NULL DEFAULT 'indirect-srl-pilot-v1',
  config jsonb NOT NULL DEFAULT '{"interval_seconds":60,"frames_per_window":3,"adaptive_video":true}',
  models jsonb NOT NULL DEFAULT '{}',
  transcript_snapshot jsonb,
  progress jsonb NOT NULL DEFAULT '{}',
  summary jsonb NOT NULL DEFAULT '{}',
  error text,
  lease_token uuid,
  lease_expires_at timestamptz,
  CHECK (config->>'interval_seconds' IN ('60','180')),
  CHECK (config->>'frames_per_window' IN ('1','3')),
  CHECK (NOT (config->>'interval_seconds' = '180' AND config->>'frames_per_window' = '3'))
);
CREATE UNIQUE INDEX environment_one_active_run ON public.environment_runs(video_id, requested_by)
  WHERE status IN ('pending','processing');
CREATE INDEX environment_runs_owner_video ON public.environment_runs(requested_by, video_id, created_at DESC);

CREATE TABLE public.environment_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.environment_runs(id) ON DELETE CASCADE,
  window_index integer NOT NULL CHECK (window_index >= 0),
  start_time double precision NOT NULL CHECK (start_time >= 0),
  end_time double precision NOT NULL CHECK (end_time > start_time),
  status text NOT NULL CHECK (status IN ('completed','failed')),
  observation jsonb NOT NULL DEFAULT '{}',
  interpretation jsonb NOT NULL DEFAULT '{"findings":[],"limitations":[]}',
  evidence jsonb NOT NULL DEFAULT '[]',
  audit jsonb NOT NULL DEFAULT '{}',
  usage jsonb NOT NULL DEFAULT '[]',
  error text,
  UNIQUE(run_id, window_index)
);

-- Append-only human review: model output remains available for research comparison.
CREATE TABLE public.environment_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.environment_observations(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  verdict text NOT NULL CHECK (verdict IN ('accepted','needs_correction','rejected')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000)
);

ALTER TABLE public.environment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environment_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environment_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.environment_runs, public.environment_observations, public.environment_reviews FROM anon, authenticated;
GRANT SELECT ON public.environment_runs, public.environment_observations, public.environment_reviews TO authenticated;
GRANT INSERT(video_id,requested_by,config) ON public.environment_runs TO authenticated;
GRANT INSERT(observation_id,reviewer_id,verdict,notes) ON public.environment_reviews TO authenticated;
GRANT ALL ON public.environment_runs, public.environment_observations, public.environment_reviews TO service_role;

CREATE POLICY environment_runs_read ON public.environment_runs FOR SELECT TO authenticated
  USING (requested_by = auth.uid());
CREATE POLICY environment_runs_create ON public.environment_runs FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_id));
CREATE POLICY environment_observations_read ON public.environment_observations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.environment_runs r WHERE r.id = run_id AND r.requested_by = auth.uid()));
CREATE POLICY environment_reviews_read ON public.environment_reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.environment_observations o JOIN public.environment_runs r ON r.id = o.run_id
                WHERE o.id = observation_id AND r.requested_by = auth.uid()));
CREATE POLICY environment_reviews_create ON public.environment_reviews FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.environment_observations o JOIN public.environment_runs r ON r.id = o.run_id
    WHERE o.id = observation_id AND r.requested_by = auth.uid()));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES ('environment-evidence','environment-evidence',false,10485760,ARRAY['image/jpeg','video/mp4']);
CREATE POLICY environment_evidence_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'environment-evidence' AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (SELECT 1 FROM public.environment_runs r
                WHERE r.id::text = (storage.foldername(name))[2] AND r.requested_by = auth.uid()));

-- Atomic claims and fenced persistence prevent duplicate workers from overwriting a newer lease.
CREATE FUNCTION public.claim_environment_run() RETURNS SETOF public.environment_runs
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.environment_runs SET status='processing', lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '30 minutes', updated_at=now()
  WHERE id = (SELECT id FROM public.environment_runs
    WHERE status='pending' OR (status='processing' AND lease_expires_at < now())
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING *;
$$;
CREATE FUNCTION public.save_environment_window(p_run uuid, p_lease uuid, p_row jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.environment_runs WHERE id=p_run AND lease_token=p_lease AND status='processing' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Environment lease lost'; END IF;
  INSERT INTO public.environment_observations(run_id,window_index,start_time,end_time,status,observation,interpretation,evidence,audit,usage,error)
  VALUES (p_run,(p_row->>'window_index')::integer,(p_row->>'start_time')::double precision,
    (p_row->>'end_time')::double precision,p_row->>'status',p_row->'observation',p_row->'interpretation',
    p_row->'evidence',p_row->'audit',p_row->'usage',p_row->>'error')
  ON CONFLICT (run_id,window_index) DO NOTHING;
  UPDATE public.environment_runs SET updated_at=now(),lease_expires_at=now()+interval '30 minutes',
    progress=jsonb_set(progress,'{current}',to_jsonb((SELECT count(*) FROM public.environment_observations WHERE run_id=p_run)))
    WHERE id=p_run;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_environment_run() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_environment_window(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_environment_run() TO service_role;
GRANT EXECUTE ON FUNCTION public.save_environment_window(uuid,uuid,jsonb) TO service_role;
