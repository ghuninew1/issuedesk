CREATE TABLE IF NOT EXISTS storage_objects (
  object_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('file', 'folder')),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  provider_reference TEXT,
  content_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  trash_root_id TEXT,
  UNIQUE (project_id, object_id),
  UNIQUE (project_id, provider_reference),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, parent_id) REFERENCES storage_objects(project_id, object_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((type = 'folder' AND provider_reference IS NULL AND size_bytes IS NULL) OR (type = 'file' AND provider_reference IS NOT NULL)),
  CHECK (parent_id IS NULL OR parent_id <> object_id)
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_children
  ON storage_objects(project_id, parent_id, deleted_at, normalized_name, object_id);
CREATE INDEX IF NOT EXISTS idx_storage_objects_trash
  ON storage_objects(project_id, deleted_at, trash_root_id, normalized_name, object_id);

CREATE TABLE IF NOT EXISTS storage_operations (
  operation_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('upload', 'copy', 'trash', 'permanent_delete')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  source_object_id TEXT,
  target_parent_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  error_code TEXT,
  completed_items INTEGER NOT NULL DEFAULT 0 CHECK (completed_items >= 0),
  total_items INTEGER NOT NULL DEFAULT 0 CHECK (total_items >= 0),
  details_json TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_storage_operations_project_created
  ON storage_operations(project_id, created_at DESC, operation_id DESC);

INSERT INTO storage_objects (
  object_id, project_id, parent_id, type, name, normalized_name, provider_reference,
  content_type, size_bytes, created_at, updated_at
)
SELECT
  f.id, f.project_id, NULL, 'file', f.original_name, lower(trim(f.original_name)),
  f.object_key, f.content_type, f.size, f.created_at, f.created_at
FROM files f
WHERE NOT EXISTS (
  SELECT 1 FROM storage_objects o WHERE o.object_id = f.id
);


CREATE TABLE IF NOT EXISTS storage_name_reservations (
  reservation_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  normalized_name TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_name_reservations_name
  ON storage_name_reservations(project_id, ifnull(parent_id, ''), normalized_name);
