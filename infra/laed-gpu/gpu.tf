resource "scaleway_instance_server" "gpu" {
  name  = "laed-gpu"
  type  = "L4-1-24G"
  image = "ubuntu_noble_gpu_os_12"
  zone  = var.zone

  security_group_id     = scaleway_instance_security_group.gpu.id
  additional_volume_ids = [scaleway_block_volume.models.id]

  private_network {
    pn_id = scaleway_vpc_private_network.laed.id
  }

  user_data = {
    cloud-init = templatefile("${path.module}/cloud-init.yaml.tftpl", {
      ssh_pubkey           = var.feline_ssh_pubkey
      models_bucket        = scaleway_object_bucket.models.name
      region               = var.region
      ollama_models        = var.ollama_model_list
      idle_timeout_seconds = var.idle_timeout_seconds
      max_uptime_seconds   = var.max_uptime_seconds
    })
  }

  lifecycle {
    ignore_changes = [state, additional_volume_ids]
  }
}
