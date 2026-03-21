import { useState } from "react";

const COLORS = {
  bg: "#0a0e17",
  surface: "#111827",
  surfaceHover: "#1a2235",
  border: "#1e293b",
  borderActive: "#3b82f6",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#475569",
  accent: "#3b82f6",
  accentGlow: "rgba(59, 130, 246, 0.15)",
  green: "#22c55e",
  greenGlow: "rgba(34, 197, 94, 0.15)",
  amber: "#f59e0b",
  amberGlow: "rgba(245, 158, 11, 0.15)",
  purple: "#a855f7",
  purpleGlow: "rgba(168, 85, 247, 0.15)",
  red: "#ef4444",
  redGlow: "rgba(239, 68, 68, 0.15)",
  cyan: "#06b6d4",
  cyanGlow: "rgba(6, 182, 212, 0.15)",
};

const layerData = [
  {
    id: "clients",
    label: "Client Layer",
    color: COLORS.accent,
    glow: COLORS.accentGlow,
    y: 0,
    description: "What users interact with — web app + mobile PWA",
    components: [
      {
        name: "Web App (React/Next.js)",
        detail: "Main interface — project spaces, file drop, chat panels. Hosted as static build on your server. PWA-enabled so it works on mobile without an app store.",
        tech: "Next.js, Tailwind, PWA manifest",
      },
      {
        name: "Real-time Connection",
        detail: "WebSocket connection for live chat between team members. Every message is end-to-end encrypted before it leaves the client.",
        tech: "Socket.io or native WebSockets",
      },
    ],
  },
  {
    id: "api",
    label: "API Gateway",
    color: COLORS.green,
    glow: COLORS.greenGlow,
    y: 1,
    description: "Single entry point — auth, routing, rate limiting",
    components: [
      {
        name: "Auth & Access Control",
        detail: "Token-based authentication. Each user gets a project-scoped 'key' (JWT with project claims). This is where your role-based bubble logic lives — who can see what, who can talk to whom.",
        tech: "FastAPI + JWT tokens, or Express.js",
      },
      {
        name: "API Routes",
        detail: "REST endpoints for file upload/download, project CRUD, user management. WebSocket upgrade for real-time chat. All requests validated against project scope.",
        tech: "FastAPI (Python) recommended — you're fastest in Python",
      },
    ],
  },
  {
    id: "services",
    label: "Core Services",
    color: COLORS.amber,
    glow: COLORS.amberGlow,
    y: 2,
    description: "The business logic — chat, files, projects",
    components: [
      {
        name: "Project Service",
        detail: "Creates/manages project spaces. Each project is an isolated container — its own file storage, its own chat history, its own AI context. This is the 'bubble' from your brainstorm.",
        tech: "Python service + PostgreSQL",
      },
      {
        name: "Chat Service",
        detail: "Handles real-time messaging within a project. Stores message history. Supports team chat (visible to project members) and private AI chat (only you + AI).",
        tech: "WebSocket handler + PostgreSQL for persistence",
      },
      {
        name: "File Service",
        detail: "Handles drag-and-drop uploads. Encrypts files at rest. Stores metadata (who uploaded, when, which project). Triggers the ingestion pipeline when a new file lands.",
        tech: "MinIO (self-hosted S3-compatible) + encryption layer",
      },
    ],
  },
  {
    id: "ai",
    label: "AI / RAG Pipeline",
    color: COLORS.purple,
    glow: COLORS.purpleGlow,
    y: 3,
    description: "This is where the vector DB fits — document ingestion → embeddings → AI chat",
    components: [
      {
        name: "Document Ingestion",
        detail: "When a file is uploaded, this service extracts text (PDF, DOCX, XLSX, etc.), chunks it into passages, and generates embeddings. Those embeddings go into the vector DB. This is the step that makes 'AI knows about your files' possible.",
        tech: "LangChain or LlamaIndex, unstructured.io for parsing",
      },
      {
        name: "Vector Database ⭐",
        detail: "Stores document embeddings scoped per project. When you ask the AI a question, it first searches here for relevant document chunks, then passes those to the LLM as context. This is your RAG retrieval layer. ChromaDB runs locally, no GPU needed, lightweight enough for MVP.",
        tech: "ChromaDB (local, open-source) or Qdrant",
      },
      {
        name: "LLM Service (Local)",
        detail: "Your private language model. Runs on CPU via Ollama. No data leaves your server. Takes the retrieved document context from ChromaDB + the user's question and generates a response. Mistral 7B or Llama 3.1 8B quantized (Q4_K_M) — both run fine on CPU with ~8GB RAM.",
        tech: "Ollama + Mistral 7B or Llama 3.1 8B (GGUF)",
      },
    ],
  },
  {
    id: "storage",
    label: "Storage Layer",
    color: COLORS.red,
    glow: COLORS.redGlow,
    y: 4,
    description: "Everything persistent — database, files, vectors",
    components: [
      {
        name: "PostgreSQL",
        detail: "Your main database. Users, projects, chat messages, file metadata, access logs, role assignments. The source of truth for everything except file content and vector embeddings.",
        tech: "PostgreSQL 16",
      },
      {
        name: "Encrypted File Storage",
        detail: "Where actual files live. MinIO gives you S3-compatible object storage that runs on your own server. Each file encrypted at rest with AES-256. Project-scoped buckets.",
        tech: "MinIO (self-hosted) + AES-256 encryption",
      },
      {
        name: "ChromaDB Storage",
        detail: "Persistent vector storage. Each project gets its own collection, so document searches are always scoped — you never accidentally retrieve chunks from a different project. This is what makes the 'closed loop' work for AI.",
        tech: "ChromaDB persistent mode (SQLite backend)",
      },
    ],
  },
  {
    id: "infra",
    label: "Infrastructure",
    color: COLORS.cyan,
    glow: COLORS.cyanGlow,
    y: 5,
    description: "Where it all runs — European sovereign hosting",
    components: [
      {
        name: "European VPS",
        detail: "Single server to start. Hetzner (Falkenstein/Nuremberg, Germany), Infomaniak (Geneva, Switzerland), or Luxcloud (Luxembourg). No US cloud dependencies. GDPR-compliant by architecture. Start with a dedicated server: 32GB RAM, 8 cores, 500GB SSD — roughly €50-80/month.",
        tech: "Hetzner Dedicated or Infomaniak",
      },
      {
        name: "Docker Compose",
        detail: "All services run as Docker containers orchestrated by docker-compose. One command to spin everything up, one command to tear it down. Makes it reproducible and portable — if you want to move to a different host later, you just copy the compose file.",
        tech: "Docker + docker-compose",
      },
      {
        name: "Reverse Proxy + TLS",
        detail: "Caddy or Nginx as reverse proxy with automatic HTTPS via Let's Encrypt. All traffic encrypted in transit. This is your public-facing entry point — everything behind it is internal network only.",
        tech: "Caddy (auto-TLS) or Nginx + Certbot",
      },
    ],
  },
];

const DataFlowArrow = ({ from, to, label, x, color }) => {
  const fromY = from * 120 + 100;
  const toY = to * 120 + 20;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: fromY,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 5,
      }}
    >
      <div
        style={{
          width: 2,
          height: toY - fromY - 20,
          background: `linear-gradient(to bottom, ${color}, transparent)`,
          opacity: 0.4,
        }}
      />
      <div style={{ fontSize: 9, color: COLORS.textDim, marginTop: 2, whiteSpace: "nowrap" }}>
        {label}
      </div>
    </div>
  );
};

export default function ArchitectureDiagram() {
  const [activeLayer, setActiveLayer] = useState(null);
  const [activeComponent, setActiveComponent] = useState(null);

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100vh",
        color: COLORS.text,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        padding: "32px 24px",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 3,
              color: COLORS.textDim,
              marginBottom: 8,
            }}
          >
            Backend Architecture
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              margin: 0,
              background: `linear-gradient(135deg, ${COLORS.text}, ${COLORS.accent})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Secure Project Space — MVP Stack
          </h1>
          <p
            style={{
              color: COLORS.textMuted,
              fontSize: 13,
              marginTop: 8,
              lineHeight: 1.5,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            Click any layer or component to see implementation details. Everything runs on a single European server — no external API calls, no GPU required.
          </p>
        </div>

        {/* Architecture Layers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {layerData.map((layer) => {
            const isActive = activeLayer === layer.id;
            return (
              <div key={layer.id}>
                {/* Layer Header */}
                <div
                  onClick={() => {
                    setActiveLayer(isActive ? null : layer.id);
                    setActiveComponent(null);
                  }}
                  style={{
                    background: isActive ? layer.glow : COLORS.surface,
                    border: `1px solid ${isActive ? layer.color : COLORS.border}`,
                    borderRadius: 8,
                    padding: "14px 20px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = COLORS.surfaceHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = COLORS.surface;
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: layer.color,
                        boxShadow: `0 0 8px ${layer.color}`,
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{layer.label}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: COLORS.textMuted,
                          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                        }}
                      >
                        {layer.description}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: COLORS.textDim,
                      transform: isActive ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    ▶
                  </div>
                </div>

                {/* Expanded Components */}
                {isActive && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        layer.components.length === 2 ? "1fr 1fr" : "1fr 1fr 1fr",
                      gap: 8,
                      padding: "8px 0 0 0",
                    }}
                  >
                    {layer.components.map((comp, i) => {
                      const isCompActive =
                        activeComponent === `${layer.id}-${i}`;
                      return (
                        <div
                          key={i}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveComponent(
                              isCompActive ? null : `${layer.id}-${i}`
                            );
                          }}
                          style={{
                            background: isCompActive
                              ? COLORS.surfaceHover
                              : COLORS.surface,
                            border: `1px solid ${
                              isCompActive ? layer.color : COLORS.border
                            }`,
                            borderRadius: 6,
                            padding: 14,
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: layer.color,
                              marginBottom: 6,
                            }}
                          >
                            {comp.name}
                          </div>
                          {isCompActive && (
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: COLORS.textMuted,
                                  lineHeight: 1.6,
                                  marginBottom: 10,
                                  fontFamily:
                                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                                }}
                              >
                                {comp.detail}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: COLORS.textDim,
                                  background: "rgba(0,0,0,0.3)",
                                  padding: "4px 8px",
                                  borderRadius: 4,
                                  display: "inline-block",
                                }}
                              >
                                {comp.tech}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Data Flow Summary */}
        <div
          style={{
            marginTop: 32,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: 24,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 16,
              color: COLORS.accent,
            }}
          >
            How a file upload flows through the system
          </div>
          <div
            style={{
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontSize: 13,
              lineHeight: 2,
              color: COLORS.textMuted,
            }}
          >
            {[
              { step: "1", color: COLORS.accent, text: "User drags file into project space (Web App)" },
              { step: "2", color: COLORS.green, text: "API Gateway validates auth + project scope" },
              { step: "3", color: COLORS.amber, text: "File Service encrypts and stores in MinIO" },
              { step: "4", color: COLORS.purple, text: "Ingestion Service extracts text, chunks it, generates embeddings" },
              { step: "5", color: COLORS.red, text: "Embeddings stored in ChromaDB under project collection" },
              { step: "6", color: COLORS.purple, text: "AI chat can now retrieve relevant chunks when you ask questions about this file" },
            ].map((item) => (
              <div
                key={item.step}
                style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
              >
                <span
                  style={{
                    color: item.color,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    minWidth: 20,
                  }}
                >
                  {item.step}.
                </span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Server Specs */}
        <div
          style={{
            marginTop: 16,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: 24,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 16,
              color: COLORS.cyan,
            }}
          >
            Minimum Server Specs for MVP
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 16,
            }}
          >
            {[
              { label: "RAM", value: "32 GB", note: "~8GB for LLM, rest for services" },
              { label: "CPU", value: "8 cores", note: "LLM inference on CPU" },
              { label: "Storage", value: "500 GB SSD", note: "Files + DB + vectors" },
              { label: "Cost", value: "~€60/mo", note: "Hetzner dedicated" },
            ].map((spec) => (
              <div key={spec.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text }}>
                  {spec.value}
                </div>
                <div style={{ fontSize: 11, color: COLORS.cyan, marginTop: 2 }}>
                  {spec.label}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: COLORS.textDim,
                    marginTop: 4,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  {spec.note}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Docker Compose Preview */}
        <div
          style={{
            marginTop: 16,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: 24,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 12,
              color: COLORS.green,
            }}
          >
            docker-compose.yml — Your entire stack
          </div>
          <pre
            style={{
              fontSize: 11,
              lineHeight: 1.7,
              color: COLORS.textMuted,
              background: "rgba(0,0,0,0.3)",
              padding: 16,
              borderRadius: 6,
              overflow: "auto",
              margin: 0,
            }}
          >
{`services:
  # Reverse proxy + auto-HTTPS
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]

  # Your app (API + WebSocket)
  app:
    build: ./app
    environment:
      - DATABASE_URL=postgres://...
      - OLLAMA_URL=http://ollama:11434
      - CHROMA_URL=http://chromadb:8000
      - MINIO_URL=http://minio:9000

  # Database
  postgres:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]

  # File storage (encrypted at rest)
  minio:
    image: minio/minio
    volumes: [filedata:/data]
    command: server /data

  # Vector database for RAG
  chromadb:
    image: chromadb/chroma
    volumes: [vectordata:/chroma/chroma]

  # Local LLM (no GPU required)
  ollama:
    image: ollama/ollama
    volumes: [models:/root/.ollama]
    # After first start: docker exec ollama ollama pull mistral

volumes:
  pgdata:
  filedata:
  vectordata:
  models:`}
          </pre>
        </div>

        <div
          style={{
            marginTop: 24,
            padding: "16px 20px",
            background: COLORS.purpleGlow,
            border: `1px solid rgba(168, 85, 247, 0.3)`,
            borderRadius: 8,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontSize: 13,
            color: COLORS.textMuted,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: COLORS.purple }}>The key insight for your vector DB question:</strong>{" "}
          ChromaDB runs as just another Docker container alongside everything else. When a file gets uploaded, the ingestion service chunks it and pushes embeddings into ChromaDB, scoped to that project's collection. When the AI chat gets a question, it queries ChromaDB first to find relevant chunks, then passes those to Ollama as context. The whole RAG loop stays on your server — closed loop, no external calls.
        </div>
      </div>
    </div>
  );
}
