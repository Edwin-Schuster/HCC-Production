-- Published SOP versions and their blocks are immutable. Enforced here as well as in the service layer.
CREATE OR REPLACE FUNCTION hcc_prevent_published_version_change() RETURNS trigger AS $$
BEGIN
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
CREATE TRIGGER sop_versions_immutable
  BEFORE UPDATE OR DELETE ON sop_versions
  FOR EACH ROW EXECUTE FUNCTION hcc_prevent_published_version_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hcc_prevent_published_block_change() RETURNS trigger AS $$
BEGIN
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
--> statement-breakpoint
CREATE TRIGGER blocks_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON blocks
  FOR EACH ROW EXECUTE FUNCTION hcc_prevent_published_block_change();
