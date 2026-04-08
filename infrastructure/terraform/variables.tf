# =============================================================================
# Identity
# =============================================================================

variable "project_name" {
  description = "Short lowercase name used for resource naming (VPC, registry, volumes, hostnames)"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-32 lowercase alphanumeric characters or hyphens, starting with a letter."
  }
}

variable "domain" {
  description = "Primary domain for Caddy TLS and DNS records (e.g. laed.eu)"
  type        = string
}

# =============================================================================
# Scaleway credentials
# =============================================================================

variable "scw_access_key" {
  description = "Scaleway API access key"
  type        = string
  sensitive   = true
}

variable "scw_secret_key" {
  description = "Scaleway API secret key"
  type        = string
  sensitive   = true
}

variable "scw_project_id" {
  description = "Scaleway project ID (UUID)"
  type        = string
}

variable "scw_region" {
  description = "Scaleway region for regional resources (VPC, registry)"
  type        = string
  default     = "fr-par"
}

variable "scw_zone" {
  description = "Scaleway availability zone for the base instance"
  type        = string
  default     = "fr-par-1"
}

# =============================================================================
# Base instance
# =============================================================================

variable "base_instance_type" {
  description = "Scaleway instance type for the base server"
  type        = string
  default     = "GP1-XS"
}

variable "base_image" {
  description = "OS image label or UUID for the base server"
  type        = string
  default     = "ubuntu_noble"
}

variable "base_volume_size_gb" {
  description = "Block storage size in GB for the base server data volume"
  type        = number
  default     = 100
}

variable "base_volume_iops" {
  description = "Max IOPS for the base server block volume"
  type        = number
  default     = 5000
}

# =============================================================================
# GPU instance (conditional)
# =============================================================================

variable "gpu_enabled" {
  description = "Set to true to provision the GPU instance for self-hosted LLM"
  type        = bool
  default     = false
}

variable "gpu_instance_type" {
  description = "Scaleway instance type for the GPU server"
  type        = string
  default     = "L4-1-24G"
}

variable "gpu_image" {
  description = "OS image label or UUID for the GPU server (must include NVIDIA drivers)"
  type        = string
  default     = "ubuntu_noble_gpu"
}

variable "gpu_zone" {
  description = "Availability zone for the GPU instance (may differ from base if GPU type is zone-restricted)"
  type        = string
  default     = "fr-par-1"
}

variable "gpu_volume_size_gb" {
  description = "Block storage size in GB for Ollama models on the GPU server"
  type        = number
  default     = 125
}

variable "gpu_volume_iops" {
  description = "Max IOPS for the GPU server block volume"
  type        = number
  default     = 5000
}

# =============================================================================
# Self-hosted models
# =============================================================================

variable "llm_model" {
  description = "Ollama model tag for the default chat LLM"
  type        = string
  default     = "qwen2.5:14b-instruct-q4_K_M"
}

variable "embedding_model" {
  description = "Ollama model tag for the embedding model"
  type        = string
  default     = "nomic-embed-text"
}

# =============================================================================
# SSH & access
# =============================================================================

variable "ssh_key_ids" {
  description = "List of Scaleway SSH key IDs to inject into instances"
  type        = list(string)
}

variable "tailscale_auth_key" {
  description = "Tailscale auth key for mesh VPN setup (leave empty to skip)"
  type        = string
  default     = ""
  sensitive   = true
}

# =============================================================================
# DNS (optional — only if domain NS points to Scaleway)
# =============================================================================

variable "manage_dns" {
  description = "Set to true to create a Scaleway DNS A record for the domain"
  type        = bool
  default     = false
}

# =============================================================================
# Application wiring
# =============================================================================

variable "repo_url" {
  description = "Git repository URL to clone on the base server (leave empty to skip)"
  type        = string
  default     = ""
}

variable "anthropic_api_key" {
  description = "Anthropic API key for LiteLLM paid-provider passthrough (leave empty to skip)"
  type        = string
  default     = ""
  sensitive   = true
}
