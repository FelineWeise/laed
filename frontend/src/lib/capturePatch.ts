export type CaptureSessionPatch = {
  title?: string;
  status?: string;
  project_id?: string | null;
  topic_node_id?: string | null;
  is_private?: boolean;
  transcript?: string;
  capture_mode?: "photo" | "scan" | "video" | "audio";
};
