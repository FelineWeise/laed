variable "environment" {
  description = "Environment name suffix."
  type        = string
  default     = "prod"
}

variable "region" {
  description = "Scaleway region."
  type        = string
  default     = "fr-par"
}

variable "zone" {
  description = "Scaleway zone for GPU resources."
  type        = string
  default     = "fr-par-2"
}

variable "base_zone" {
  description = "Scaleway zone where laed-base exists."
  type        = string
  default     = "fr-par-1"
}

variable "scw_access_key" {
  description = "Scaleway access key."
  type        = string
  sensitive   = true
}

variable "scw_secret_key" {
  description = "Scaleway secret key."
  type        = string
  sensitive   = true
}

variable "scw_project_id" {
  description = "Scaleway project ID."
  type        = string
}

variable "laed_base_instance_id" {
  description = "Existing laed-base instance ID to import/manage."
  type        = string
}

variable "base_server_private_ip_cidr" {
  description = "laed-base IPv4 on the same VPC private network as the GPU (laed-private), as /32 — e.g. 172.16.20.3/32. Not the laed-internal (172.16.16.x) address; outbound packets to the GPU use this source."
  type        = string
}

variable "feline_ssh_pubkey" {
  description = "SSH public key injected via cloud-init."
  type        = string
}

variable "ollama_model_list" {
  description = "Models to pre-pull via cloud-init."
  type        = list(string)
  default = [
    "qwen3:14b-instruct",
    "qwen3:4b-instruct",
    "gpt-oss:20b",
    "qwen2.5vl:7b",
    "qwen3-embedding:8b",
    "nomic-embed-text"
  ]
}

variable "idle_timeout_seconds" {
  description = "Layer 1 idle timeout."
  type        = number
  default     = 900
}

variable "max_uptime_seconds" {
  description = "Layer 2 max uptime cap."
  type        = number
  default     = 21600
}
