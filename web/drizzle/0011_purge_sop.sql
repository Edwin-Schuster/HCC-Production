-- Published versions stay immutable, except when an admin deletes the whole SOP. The service marks that
-- transaction with set_config('hcc.purge_sop', <sop id>, true), and only rows of that SOP may then be deleted.
CREATE OR REPLACE FUNCTION hcc_prevent_published_version_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.sop_id = current_setting('hcc.purge_sop', true) THEN
    RETURN OLD;
  END IF;
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published SOP version % is immutable', OLD.id USING ERRCODE = 'P0001', HINT = 'immutable_version';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hcc_prevent_published_block_change() RETURNS trigger AS $$
BEGIN
  -- During a purge the version row may already be gone (cascade order), so only refuse blocks of another SOP.
  IF TG_OP = 'DELETE' AND coalesce(current_setting('hcc.purge_sop', true), '') <> '' AND NOT EXISTS (
    SELECT 1 FROM sop_versions v WHERE v.id = OLD.version_id AND v.sop_id <> current_setting('hcc.purge_sop', true)
  ) THEN
    RETURN OLD;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT 1 FROM sop_versions v WHERE v.id = OLD.version_id AND v.published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Blocks of published SOP version % are immutable', OLD.version_id USING ERRCODE = 'P0001', HINT = 'immutable_version';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
    SELECT 1 FROM sop_versions v WHERE v.id = NEW.version_id AND v.published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Blocks of published SOP version % are immutable', NEW.version_id USING ERRCODE = 'P0001', HINT = 'immutable_version';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
