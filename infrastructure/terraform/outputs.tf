# =============================================================================
# Network
# =============================================================================

output "base_public_ip" {
  description = "Public IPv4 of the base server (for DNS and SSH)"
  value       = scaleway_instance_ip.base.address
}

output "base_private_ip" {
  description = "Private IP of the base server on the VPC"
  value       = data.scaleway_ipam_ip.base_private.address
}

output "gpu_public_ip" {
  description = "Public IPv4 of the GPU server (empty if GPU disabled)"
  value       = local.gpu_public_ip
}

output "gpu_private_ip" {
  description = "Private IP of the GPU server — used for OLLAMA_URL wiring (empty if GPU disabled)"
  value       = local.gpu_private_ip
}

# =============================================================================
# Registry
# =============================================================================

output "registry_endpoint" {
  description = "Docker registry endpoint for image push/pull"
  value       = "rg.${var.scw_region}.scw.cloud/${scaleway_registry_namespace.main.name}"
}

# =============================================================================
# SSH convenience commands
# =============================================================================

output "ssh_command_base" {
  description = "SSH into the base server"
  value       = "ssh root@${scaleway_instance_ip.base.address}"
}

output "ssh_command_gpu" {
  description = "SSH into the GPU server via jump host (empty if GPU disabled)"
  value       = var.gpu_enabled ? "ssh -J root@${scaleway_instance_ip.base.address} root@${local.gpu_private_ip}" : ""
}

# =============================================================================
# Generated configuration
# =============================================================================

output "rendered_env" {
  description = "Full .env file content for the base server (contains secrets)"
  value       = local.rendered_env
  sensitive   = true
}

output "rendered_litellm_config" {
  description = "LiteLLM config YAML for the base server"
  value       = local.rendered_litellm_config
  sensitive   = true
}

# =============================================================================
# Data directory path on the server
# =============================================================================

output "data_dir" {
  description = "Path where project data, .env, and compose files live on the base server"
  value       = "/opt/${var.project_name}-data"
}
