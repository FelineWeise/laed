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
  tags?: string[];
  archived_at?: string | null;
};

export type MentionSnapshot = {
  user_id: string;
  display_name: string;
};

export type ReplyPreview = {
  id: string;
  content: string;
  sender_label: string;
};

export type ChatMessage = {
  id: string;
  project_id: string;
  content: string;
  is_anonymous: boolean;
  message_type?: string;
  topic_node_id: string | null;
  thread_session_id?: string | null;
  sender_label: string | null;
  user_id: string | null;
  created_at: string;
  source_chunks?: SourceChunk[] | null;
  reply_to_id?: string | null;
  mentions?: MentionSnapshot[];
  reply_preview?: ReplyPreview | null;
};

export type InboxMention = {
  id: string;
  message_id: string;
  project_id: string;
  project_name: string;
  topic_node_id: string | null;
  thread_session_id: string | null;
  thread_title: string;
  sender_label: string;
  excerpt: string;
  created_at: string;
  read_at: string | null;
};

export type ThreadSession = {
  id: string;
  project_id: string;
  topic_node_id: string | null;
  title: string;
  ai_enabled: boolean;
  created_by: string;
  created_at: string;
};

export type GridSection = {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  tag_filters: string[];
  bounds: { x: number; y: number; w: number; h: number } | null;
  created_at: string;
};

export type ExplicitContextItem = {
  type: "file" | "folder" | "thread" | "ai_conversation" | "project" | "topic" | "harness_excerpt";
  ref_id: string;
  label: string;
};

export type CaptureSession = {
  id: string;
  user_id: string;
  kind: "spoken" | "camera";
  title: string;
  status: string;
  project_id: string | null;
  topic_node_id: string | null;
  transcript: string;
  is_private: boolean;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
  ended_at: string | null;
};

export type CaptureAsset = {
  id: string;
  session_id: string;
  file_id: string | null;
  filename: string | null;
  content_type: string | null;
  asset_kind: "image" | "video" | "audio" | "transcript";
  download_url: string | null;
  transcoded: boolean;
  project_id: string | null;
  is_private: boolean;
  created_at: string;
};

export type ProjectFile = {
  id: string;
  project_id: string;
  folder_id?: string;
  filename: string;
  file_type: string | null;
  file_size_bytes: number | null;
  minio_key: string;
  ingestion_status: string;
  is_private?: boolean;
  shared_with_user_ids?: string[];
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
  project_id: string | null;
  user_id: string;
  is_private: boolean;
  title?: string | null;
  topic_node_id?: string | null;
  linked_thread_session_id?: string | null;
  created_at: string;
};

export type ConversationPatch = {
  title?: string;
  topic_node_id?: string | null;
  is_private?: boolean;
  project_id?: string | null;
};

export type UserSearchResult = {
  id: string;
  email: string;
  display_name: string;
};

export type Member = {
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string | null;
  email: string | null;
};

export type ProjectInvitation = {
  id: string;
  project_id: string;
  inviter_id: string;
  invitee_email: string;
  invitee_user_id: string | null;
  role: string;
  status: string;
  created_at: string;
  responded_at: string | null;
  project_name: string | null;
};
