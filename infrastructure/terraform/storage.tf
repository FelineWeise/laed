# =============================================================================
# Block Storage — Base Server
# =============================================================================

resource "scaleway_block_volume" "base_data" {
  name       = "${var.project_name}-base-data"
  iops       = var.base_volume_iops
  size_in_gb = var.base_volume_size_gb
  zone       = var.scw_zone
  tags       = ["terraform", var.project_name, "base"]
}

# =============================================================================
# Block Storage — GPU Server (conditional)
# =============================================================================

resource "scaleway_block_volume" "gpu_models" {
  count = var.gpu_enabled ? 1 : 0

  name       = "${var.project_name}-gpu-models"
  iops       = var.gpu_volume_iops
  size_in_gb = var.gpu_volume_size_gb
  zone       = var.gpu_zone
  tags       = ["terraform", var.project_name, "gpu"]
}
