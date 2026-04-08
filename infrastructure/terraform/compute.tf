# =============================================================================
# Base Server
# =============================================================================

resource "scaleway_instance_ip" "base" {
  zone = var.scw_zone
  tags = ["terraform", var.project_name]
}

resource "scaleway_instance_server" "base" {
  name              = "${var.project_name}-base"
  type              = var.base_instance_type
  zone              = var.scw_zone
  image             = var.base_image
  ip_id             = scaleway_instance_ip.base.id
  security_group_id = scaleway_instance_security_group.base.id
  tags              = ["terraform", var.project_name, "base"]

  additional_volume_ids = [scaleway_block_volume.base_data.id]

  user_data = {
    cloud-init = templatefile("${path.module}/cloud-init/base.yaml.tftpl", {
      project_name       = var.project_name
      scw_region         = var.scw_region
      scw_access_key     = var.scw_access_key
      scw_secret_key     = var.scw_secret_key
      repo_url           = var.repo_url
      tailscale_auth_key = var.tailscale_auth_key
      env_content        = local.rendered_env
      litellm_config     = local.rendered_litellm_config
    })
  }

  private_network {
    pn_id = scaleway_vpc_private_network.main.id
  }
}

data "scaleway_ipam_ip" "base_private" {
  resource {
    id   = scaleway_instance_server.base.id
    type = "instance_server"
  }
  type = "ipv4"
}

# =============================================================================
# GPU Server (conditional)
# =============================================================================

resource "scaleway_instance_ip" "gpu" {
  count = var.gpu_enabled ? 1 : 0
  zone  = var.gpu_zone
  tags  = ["terraform", var.project_name]
}

resource "scaleway_instance_server" "gpu" {
  count = var.gpu_enabled ? 1 : 0

  name              = "${var.project_name}-gpu"
  type              = var.gpu_instance_type
  zone              = var.gpu_zone
  image             = var.gpu_image
  ip_id             = scaleway_instance_ip.gpu[0].id
  security_group_id = scaleway_instance_security_group.gpu[0].id
  tags              = ["terraform", var.project_name, "gpu"]

  additional_volume_ids = [scaleway_block_volume.gpu_models[0].id]

  user_data = {
    cloud-init = templatefile("${path.module}/cloud-init/gpu.yaml.tftpl", {
      project_name    = var.project_name
      llm_model       = var.llm_model
      embedding_model = var.embedding_model
      private_cidr    = "172.16.0.0/22"
    })
  }

  private_network {
    pn_id = scaleway_vpc_private_network.main.id
  }
}

data "scaleway_ipam_ip" "gpu_private" {
  count = var.gpu_enabled ? 1 : 0

  resource {
    id   = scaleway_instance_server.gpu[0].id
    type = "instance_server"
  }
  type = "ipv4"
}

# =============================================================================
# Locals for cross-file references
# =============================================================================

locals {
  base_public_ip  = scaleway_instance_ip.base.address
  gpu_private_ip  = var.gpu_enabled ? data.scaleway_ipam_ip.gpu_private[0].address : ""
  gpu_public_ip   = var.gpu_enabled ? scaleway_instance_ip.gpu[0].address : ""

  rendered_env = templatefile("${path.module}/templates/env.tftpl", {
    project_name       = var.project_name
    domain             = var.domain
    db_password        = random_password.db_password.result
    jwt_secret         = random_password.jwt_secret.result
    minio_access_key   = random_password.minio_access_key.result
    minio_secret_key   = random_password.minio_secret_key.result
    litellm_master_key = random_password.litellm_master_key.result
    ollama_url         = var.gpu_enabled ? "http://${data.scaleway_ipam_ip.gpu_private[0].address}:11434" : "http://PLACEHOLDER_GPU_NOT_ENABLED:11434"
    anthropic_api_key  = var.anthropic_api_key
    llm_model          = "${var.project_name}-chat"
    embedding_model    = "${var.project_name}-embed"
  })

  rendered_litellm_config = templatefile("${path.module}/templates/litellm-config.tftpl", {
    project_name      = var.project_name
    ollama_url        = var.gpu_enabled ? "http://${data.scaleway_ipam_ip.gpu_private[0].address}:11434" : "http://PLACEHOLDER_GPU_NOT_ENABLED:11434"
    llm_model_tag     = var.llm_model
    embedding_tag     = var.embedding_model
    anthropic_api_key = var.anthropic_api_key
  })
}
