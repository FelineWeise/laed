export type Position = { x: number; y: number };

export type TopologyNode = {
  id: string;
  scope_type: string;
  scope_id: string | null;
  node_type: string;
  ref_id: string | null;
  label: string;
  position: Position;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
};

export type TopologyEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
  scope_type: string;
  scope_id: string | null;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
};

export type TopologyGraph = {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  ownership_model: string;
  created_by: string;
};

export type ChatMessage = {
  id: string;
  project_id: string;
  content: string;
  is_anonymous: boolean;
  topic_node_id: string | null;
  sender_label: string | null;
  user_id: string | null;
  created_at: string;
};

export type ProjectFile = {
  id: string;
  project_id: string;
  filename: string;
  file_type: string | null;
  file_size_bytes: number | null;
  minio_key: string;
  ingestion_status: string;
  metadata: Record<string, string | null>;
  created_at: string;
};

export type InsightsResponse = {
  ai_highlights: { id: string; text: string }[];
  recent_documents: {
    id: string;
    filename: string;
    ingestion_status: string;
    created_at: string;
  }[];
};

export type SourceChunk = {
  document_id: string | null;
  filename: string;
  excerpt: string;
  distance: number | null;
  topic_node_id: string | null;
};

export type AiMessage = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  source_chunks: SourceChunk[] | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  project_id: string;
  user_id: string;
  is_private: boolean;
  created_at: string;
};
