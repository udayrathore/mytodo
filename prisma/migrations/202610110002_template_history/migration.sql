-- Template definitions are revisioned rather than mutating already-used shapes.
CREATE FUNCTION protect_template_shape() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE template uuid;
BEGIN
 IF TG_OP='INSERT' THEN template=NEW.template_id; ELSE template=OLD.template_id; END IF;
 IF EXISTS(SELECT 1 FROM tasks WHERE template_id=template) THEN
  RAISE EXCEPTION 'Create a template revision to preserve historical fields';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_template_shape BEFORE INSERT OR DELETE ON task_template_fields FOR EACH ROW EXECUTE FUNCTION protect_template_shape();
CREATE FUNCTION protect_task_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.template_id IS DISTINCT FROM NEW.template_id THEN RAISE EXCEPTION 'Task template is fixed at capture; create a new task for a new template'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_task_template BEFORE UPDATE OF template_id ON tasks FOR EACH ROW EXECUTE FUNCTION protect_task_template();
